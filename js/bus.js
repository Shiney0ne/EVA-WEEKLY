// Live PTV departures for the kiosk header, fetched through the Supabase "ptv" function
const Bus = (() => {
  const B = APP_CONFIG.BUS;
  const ICONS = { 0: "🚆", 1: "🚋", 2: "🚌", 3: "🚆", 4: "🚌" };
  let icon = "🚌";
  let destName = "";
  const norm = (s) => String(s).trim().toLowerCase();
  const allowed = (list, v) => !list.length || list.map(norm).includes(norm(v));

  async function fetchDepartures() {
    if (Store.demo) {
      // Sample data so the panel can be seen in demo mode
      const t = (m) => new Date(Date.now() + m * 60000).toISOString();
      destName = "School";
      return [
        { route: "200", direction: "City", scheduled: t(4), estimated: t(4), arrival: t(16) },
        { route: "200", direction: "City", scheduled: t(14), estimated: t(17), arrival: t(29) },
        { route: "207", direction: "City", scheduled: t(25), estimated: null, arrival: t(38) }
      ];
    }
    // The stops themselves are Supabase secrets, read by the function
    const data = await Store.invoke("ptv", { max_results: 5 });
    destName = data.dest_name || "";
    icon = ICONS[data.route_type] || "🚌";
    return data.departures || [];
  }

  function activeNow() {
    if (!B.ACTIVE_HOURS.length) return true;
    const now = new Date();
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return B.ACTIVE_HOURS.some(([a, b]) => hm >= a && hm <= b);
  }

  function render(el, deps) {
    const rows = deps.length ? deps.map((d) => {
      const est = new Date(d.estimated || d.scheduled);
      const mins = Math.max(0, Math.round((est - Date.now()) / 60000));
      const late = d.estimated ? Math.round((new Date(d.estimated) - new Date(d.scheduled)) / 60000) : 0;
      const status = d.disrupted ? `<span class="late">Disruption</span>`
        : !d.estimated ? `<span class="sched">Timetable</span>`
        : late >= 2 ? `<span class="late">${late} min late</span>`
        : `<span class="ontime">On time</span>`;
      return `<div class="bus-line"><b class="route">${U.esc(d.route)}</b>
        <span class="headsign">${d.arrival ? `arr ${U.fmtTime(new Date(d.arrival).toTimeString().slice(0, 5))}` : U.esc(d.direction)}</span>
        <span class="eta">${mins === 0 ? "Now!" : `${mins}<small>min</small>`}</span>${status}</div>`;
    }).join("") : `<div class="bus-line">No departures soon</div>`;
    const to = destName ? `<div class="bus-to">To ${U.esc(destName)}</div>` : "";
    el.innerHTML = `<div class="bus-icon">${icon}</div><div class="bus-body">${to}${rows}</div>`;
  }

  async function refresh(el) {
    if (!activeNow()) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    try {
      const deps = (await fetchDepartures())
        .filter((d) => allowed(B.ROUTES, d.route) && allowed(B.DIRECTIONS, d.direction))
        .slice(0, B.MAX_DEPARTURES);
      el.classList.remove("error");
      render(el, deps);
    } catch (err) {
      console.warn("Departures failed:", err);
      el.classList.add("error");
      el.innerHTML = `<div class="bus-icon">${icon}</div><div class="bus-body"><div class="bus-line">Bus info unavailable</div></div>`;
    }
  }

  return {
    start(el) {
      if (!B.ENABLED) return;
      refresh(el);
      setInterval(() => refresh(el), B.REFRESH_SECONDS * 1000);
    }
  };
})();
