// Data + login. Uses Supabase when configured, otherwise browser-only demo storage.
// Entry shape: { id, day: "YYYY-MM-DD", kind: "lesson"|"homework", subject, title, details, start_time: "HH:MM"|null, done }
const Store = (() => {
  const C = APP_CONFIG;
  const demo = !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY;
  let sb = null;
  let page = "kiosk";

  // ---------- demo ----------
  const DKEY = "wk_demo_entries";
  const dLoad = () => { try { return JSON.parse(localStorage.getItem(DKEY)) || []; } catch { return []; } };
  const dSave = (list) => localStorage.setItem(DKEY, JSON.stringify(list));
  const dRoleKey = () => `wk_demo_role_${page}`;
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

  function seedDemo() {
    if (localStorage.getItem(DKEY)) return;
    const mon = U.currentWeek();
    const d = (n) => U.iso(U.addDays(mon, n));
    dSave([
      { id: uid(), day: d(0), kind: "lesson", subject: "Piano", title: "Scales + recital piece", details: "", start_time: "16:00", done: false },
      { id: uid(), day: d(1), kind: "homework", subject: "Math", title: "Fractions worksheet p. 12", details: "Show your working", start_time: null, done: false },
      { id: uid(), day: d(2), kind: "lesson", subject: "Swimming", title: "Bring goggles", details: "", start_time: "17:30", done: false },
      { id: uid(), day: d(3), kind: "homework", subject: "Reading", title: "Chapter 4 of class book", details: "", start_time: null, done: false },
      { id: uid(), day: d(4), kind: "homework", subject: "Science", title: "Plant diary entry", details: "", start_time: null, done: false },
      { id: uid(), day: d(2), kind: "event", subject: "School", title: "Book Week dress-up", details: "Wear your costume", start_time: null, done: false },
      { id: uid(), day: d(5), kind: "event", subject: "Party", title: "Mia's birthday party", details: "Bring the present", start_time: "14:00", done: false }
    ]);
  }

  // ---------- Supabase helpers ----------
  async function requireSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw Object.assign(new Error("You've been signed out. Please enter your code again."), { signedOut: true });
  }
  // Turn database errors into plain words
  function dbError(error) {
    const msg = error.message || String(error);
    if (/entries_kind_check/.test(msg)) return new Error("The database doesn't accept events yet. Run supabase/add-events.sql in Supabase.");
    if (/row-level security|permission denied/i.test(msg)) return new Error("This login isn't allowed to do that. Check its app_roles row in Supabase.");
    if (/JWT|token/i.test(msg)) return Object.assign(new Error("You've been signed out. Please enter your code again."), { signedOut: true });
    return new Error(msg);
  }

  return {
    demo,

    async init(pageName) {
      page = pageName;
      if (demo) { seedDemo(); return; }
      // Separate sessions per page so the parent signing in on the same device doesn't replace the kiosk login
      sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: `wk-auth-${pageName}` }
      });
    },

    // Returns "parent" | "child" | null
    async currentRole() {
      if (demo) return localStorage.getItem(dRoleKey());
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;
      const { data, error } = await sb.rpc("my_role");
      return error ? null : data;
    },

    async login(who, code) {
      if (demo) {
        if (C.DEMO_CODES[who] !== code) throw new Error("That code isn't right");
        localStorage.setItem(dRoleKey(), who);
        return who;
      }
      const email = who === "parent" ? C.PARENT_EMAIL : C.CHILD_EMAIL;
      const { error } = await sb.auth.signInWithPassword({ email, password: code });
      if (error) throw new Error(/invalid/i.test(error.message) ? "That code isn't right" : error.message);
      return this.currentRole();
    },

    async logout() {
      if (demo) localStorage.removeItem(dRoleKey());
      else await sb.auth.signOut();
    },

    async listRange(fromIso, toIso) {
      if (demo) return U.sortEntries(dLoad().filter((e) => e.day >= fromIso && e.day <= toIso));
      // Without a session the database returns an empty list rather than an error, so check first
      await requireSession();
      const { data, error } = await sb.from("entries").select("*").gte("day", fromIso).lte("day", toIso);
      if (error) throw dbError(error);
      return U.sortEntries(data);
    },

    async listSubjects() {
      if (demo) return [...new Set(dLoad().map((e) => e.subject).filter(Boolean))].sort();
      const { data } = await sb.from("entries").select("subject").order("created_at", { ascending: false }).limit(500);
      return [...new Set((data || []).map((e) => e.subject).filter(Boolean))].sort();
    },

    async add(entries) {
      if (demo) { dSave(dLoad().concat(entries.map((e) => ({ id: uid(), done: false, ...e })))); return; }
      await requireSession();
      // Ask for the new rows back, so a save that this login can't see afterwards is reported
      const { data, error } = await sb.from("entries").insert(entries).select("id");
      if (error) throw dbError(error);
      if (!data || data.length !== entries.length) throw new Error("Saved, but this login can't read it back. Check the parent's app_roles row in Supabase.");
    },

    async update(id, patch) {
      if (demo) { dSave(dLoad().map((e) => (e.id === id ? { ...e, ...patch } : e))); return; }
      await requireSession();
      // A blocked update changes 0 rows without an error, so check the row count
      const { data, error } = await sb.from("entries").update(patch).eq("id", id).select("id");
      if (error) throw dbError(error);
      if (!data || !data.length) throw new Error("Nothing was changed. This login may not have permission (check app_roles).");
    },

    async remove(id) {
      if (demo) { dSave(dLoad().filter((e) => e.id !== id)); return; }
      await requireSession();
      const { data, error } = await sb.from("entries").delete().eq("id", id).select("id");
      if (error) throw dbError(error);
      if (!data || !data.length) throw new Error("Nothing was deleted. This login may not have permission (check app_roles).");
    },

    // Calls a Supabase Edge Function as the signed-in user
    async invoke(name, body) {
      if (demo) throw new Error("Not available in demo mode");
      const { data, error } = await sb.functions.invoke(name, { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },

    // The child can only tick homework done/undone, via a locked-down database function
    async setDone(id, done) {
      if (demo) return this.update(id, { done });
      const { error } = await sb.rpc("set_entry_done", { entry_id: id, is_done: done });
      if (error) throw error;
    }
  };
})();
