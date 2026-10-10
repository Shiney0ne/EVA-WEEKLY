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
      { id: uid(), day: d(4), kind: "homework", subject: "Science", title: "Plant diary entry", details: "", start_time: null, done: false }
    ]);
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
      const { data, error } = await sb.from("entries").select("*").gte("day", fromIso).lte("day", toIso);
      if (error) throw error;
      return U.sortEntries(data);
    },

    async listSubjects() {
      if (demo) return [...new Set(dLoad().map((e) => e.subject).filter(Boolean))].sort();
      const { data } = await sb.from("entries").select("subject").order("created_at", { ascending: false }).limit(500);
      return [...new Set((data || []).map((e) => e.subject).filter(Boolean))].sort();
    },

    async add(entries) {
      if (demo) { dSave(dLoad().concat(entries.map((e) => ({ id: uid(), done: false, ...e })))); return; }
      const { error } = await sb.from("entries").insert(entries);
      if (error) throw error;
    },

    async update(id, patch) {
      if (demo) { dSave(dLoad().map((e) => (e.id === id ? { ...e, ...patch } : e))); return; }
      const { error } = await sb.from("entries").update(patch).eq("id", id);
      if (error) throw error;
    },

    async remove(id) {
      if (demo) { dSave(dLoad().filter((e) => e.id !== id)); return; }
      const { error } = await sb.from("entries").delete().eq("id", id);
      if (error) throw error;
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
