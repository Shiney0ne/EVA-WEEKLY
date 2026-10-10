// Supabase Edge Function "ptv": signs requests to the PTV Timetable API.
// PTV_DEV_ID and PTV_API_KEY are Supabase secrets, so they never reach the browser or GitHub.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BASE = "https://timetableapi.ptv.vic.gov.au";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// PTV signature: HMAC-SHA1 of the path + query (including devid), keyed with the API key
async function ptv(path: string) {
  // Trim in case a space or line break was pasted along with the secret
  const devId = Deno.env.get("PTV_DEV_ID")?.trim();
  const key = Deno.env.get("PTV_API_KEY")?.trim();
  if (!devId || !key) throw new Error("PTV_DEV_ID / PTV_API_KEY secrets are not set");
  const request = `${path}${path.includes("?") ? "&" : "?"}devid=${encodeURIComponent(devId)}`;
  const enc = new TextEncoder();
  const hmac = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, enc.encode(request)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const res = await fetch(`${BASE}${request}&signature=${hex}`);
  if (!res.ok) throw new Error(`PTV returned ${res.status}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Only signed-in family logins may use this
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json({ error: "Not signed in" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const routeType = Number(body.route_type ?? 2);
    if (!Number.isInteger(routeType)) return json({ error: "Bad route_type" }, 400);

    if (body.action === "search") {
      const term = String(body.term ?? "").trim();
      if (term.length < 3) return json({ stops: [] });
      const data = await ptv(`/v3/search/${encodeURIComponent(term)}?route_types=${routeType}&include_outlets=false`);
      return json({
        stops: (data.stops ?? []).slice(0, 20).map((s: any) => ({
          id: s.stop_id, name: s.stop_name, suburb: s.stop_suburb,
        })),
      });
    }

    // The stops are secrets too, so the public site never reveals where Eva catches the bus
    const stopId = Number(Deno.env.get("PTV_STOP_ID"));
    const destId = Number(Deno.env.get("PTV_DEST_STOP_ID"));
    const destName = Deno.env.get("PTV_DEST_NAME")?.trim() ?? "";
    const stopType = Number(Deno.env.get("PTV_ROUTE_TYPE") ?? 2);
    if (!Number.isInteger(stopId) || stopId <= 0) return json({ error: "PTV_STOP_ID secret is not set" }, 500);
    const max = Math.min(Math.max(Number(body.max_results) || 3, 1), 10);
    const data = await ptv(`/v3/departures/route_type/${stopType}/stop/${stopId}?max_results=${max}&expand=Route&expand=Direction`);
    const now = Date.now();
    let departures = (data.departures ?? [])
      .map((d: any) => {
        const route = data.routes?.[d.route_id];
        return {
          run_ref: d.run_ref,
          route: route?.route_number || route?.route_name || String(d.route_id),
          route_name: route?.route_name ?? "",
          direction: data.directions?.[d.direction_id]?.direction_name ?? "",
          scheduled: d.scheduled_departure_utc,
          estimated: d.estimated_departure_utc, // null when there's no live tracking
          disrupted: (d.disruption_ids ?? []).length > 0,
          arrival: null as string | null,
        };
      })
      .filter((d: any) => Date.parse(d.estimated ?? d.scheduled) > now - 60_000)
      .sort((a: any, b: any) => Date.parse(a.estimated ?? a.scheduled) - Date.parse(b.estimated ?? b.scheduled));

    // Optional destination: keep only trips that stop there after this stop, and add the arrival time
    if (Number.isInteger(destId) && destId > 0) {
      const checked = await Promise.all(departures.slice(0, 8).map(async (d: any) => {
        try {
          const pattern = await ptv(`/v3/pattern/run/${encodeURIComponent(d.run_ref)}/route_type/${stopType}`);
          const stops = pattern.departures ?? [];
          const from = stops.findIndex((s: any) => s.stop_id === stopId);
          const to = stops.findIndex((s: any, i: number) => s.stop_id === destId && i > from);
          if (from < 0 || to < 0) return null;
          return { ...d, arrival: stops[to].estimated_departure_utc ?? stops[to].scheduled_departure_utc };
        } catch {
          return null;
        }
      }));
      departures = checked.filter(Boolean);
    }
    return json({ departures, dest_name: destName, route_type: stopType });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
