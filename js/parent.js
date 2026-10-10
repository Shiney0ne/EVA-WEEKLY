// Parent portal: add, edit and delete lessons, homework and events
(() => {
  let weekStart = U.currentWeek();
  let entries = [];
  let editing = null; // entry being edited, or null when adding
  const $ = (id) => document.getElementById(id);
  const form = $("form");

  function screen(name) {
    ["loading", "login", "app"].forEach((s) => U.show(s, s === name));
  }

  function render() {
    const todayIso = U.iso(new Date());
    $("weekLabel").textContent = U.weekLabel(weekStart);
    U.show("thisWeek", U.iso(weekStart) !== U.iso(U.currentWeek()));
    const days = U.weekDays(weekStart);
    const weekend = (d) => d.getDay() === 0 || d.getDay() === 6;
    $("week").style.gridTemplateColumns = days.map((d) => (weekend(d) ? "0.8fr" : "1fr")).join(" ");
    $("week").innerHTML = days.map((d) => {
      const iso = U.iso(d);
      const list = entries.filter((e) => e.day === iso);
      return `<section class="day ${weekend(d) ? "weekend" : ""} ${iso === todayIso ? "today" : ""}">
        <header class="day-head">
          <span class="kanji" aria-hidden="true">${"日月火水木金土"[d.getDay()]}</span>
          <span class="dow">${d.toLocaleDateString(undefined, { weekday: weekend(d) ? "short" : "long" })}</span>
          <span class="date">${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </header>
        <div class="items">
          ${list.map((e) => `<button class="item ${e.kind} ${e.done ? "done" : ""}" data-id="${e.id}">
            <span class="item-body">
              <div class="tag">${e.kind === "homework" ? `Homework${e.done ? " · done ✓" : ""}` : U.tagText(e)}</div>
              ${e.subject ? `<div class="subject">${U.esc(e.subject)}</div>` : ""}
              <div class="title">${U.esc(e.title)}</div>
            </span></button>`).join("")}
          <button class="add-day" data-day="${iso}">+ Add</button>
        </div>
      </section>`;
    }).join("");
  }

  async function load() {
    const days = U.weekDays(weekStart);
    try {
      entries = await Store.listRange(U.iso(days[0]), U.iso(days[days.length - 1]));
      $("status").textContent = "";
    } catch (err) {
      console.error(err);
      if (err.signedOut) { await Store.logout(); return location.reload(); }
      $("status").textContent = "Couldn't load: " + err.message;
    }
    render();
  }

  function syncKind() {
    const hw = form.kind.value === "homework";
    $("dayLabel").textContent = hw ? "Due date" : "Date";
    U.show("timeField", !hw);
  }

  async function openEditor(entry, day) {
    editing = entry || null;
    form.reset();
    $("formError").textContent = "";
    $("formTitle").textContent = entry ? "Edit" : "Add";
    form.kind.value = entry?.kind || "homework";
    form.subject.value = entry?.subject || "";
    form.title.value = entry?.title || "";
    form.day.value = entry?.day || day || U.iso(new Date());
    form.start_time.value = entry?.start_time || "";
    form.details.value = entry?.details || "";
    U.show("repeatField", !entry);
    U.show("deleteBtn", !!entry);
    syncKind();
    $("subjects").innerHTML = (await Store.listSubjects()).map((s) => `<option value="${U.esc(s)}">`).join("");
    $("editor").showModal();
    form.title.focus();
  }

  async function save(ev) {
    ev.preventDefault();
    const kind = form.kind.value;
    const data = {
      kind,
      subject: form.subject.value.trim(),
      title: form.title.value.trim(),
      day: form.day.value,
      start_time: kind !== "homework" && form.start_time.value ? form.start_time.value : null,
      details: form.details.value.trim()
    };
    if (!data.title || !data.day) return;
    try {
      if (editing) {
        await Store.update(editing.id, data);
      } else {
        const n = Number(form.repeat.value);
        const first = U.parse(data.day);
        await Store.add(Array.from({ length: n }, (_, i) => ({ ...data, day: U.iso(U.addDays(first, i * 7)) })));
      }
      $("editor").close();
      weekStart = U.weekStart(U.parse(data.day));
      load();
    } catch (err) {
      $("formError").textContent = "Couldn't save: " + err.message;
    }
  }

  // Look up PTV stop IDs through the Supabase function
  async function searchStops(ev) {
    ev.preventDefault();
    const f = $("stopForm");
    const out = $("stopResults");
    $("stopError").textContent = "";
    out.innerHTML = "<li>Searching…</li>";
    try {
      const { stops } = await Store.invoke(APP_CONFIG.PTV_FUNCTION, { action: "search", term: f.term.value, route_type: Number(f.route_type.value) });
      out.innerHTML = stops.length
        ? stops.map((s) => `<li><span>${U.esc(s.name)}<br><small class="muted">${U.esc(s.suburb)}</small></span><span>ID <code>${s.id}</code></span></li>`).join("")
        : "<li>No stops found</li>";
    } catch (err) {
      out.innerHTML = "";
      $("stopError").textContent = Store.demo ? "Stop search needs Supabase set up (not available in demo mode)." : "Search failed: " + err.message;
    }
  }

  function startApp() {
    $("findStopBtn").onclick = () => $("stopDialog").showModal();
    $("stopForm").addEventListener("submit", searchStops);
    $("stopClose").onclick = () => $("stopDialog").close();

    screen("app");
    $("childName").textContent = APP_CONFIG.CHILD_NAME;
    load();

    $("prev").onclick = () => { weekStart = U.addDays(weekStart, -7); load(); };
    $("next").onclick = () => { weekStart = U.addDays(weekStart, 7); load(); };
    $("thisWeek").onclick = () => { weekStart = U.currentWeek(); load(); };
    $("addBtn").onclick = () => openEditor(null);
    $("logout").onclick = async () => { await Store.logout(); location.reload(); };

    $("week").addEventListener("click", (ev) => {
      const add = ev.target.closest(".add-day");
      if (add) return openEditor(null, add.dataset.day);
      const item = ev.target.closest(".item");
      if (item) openEditor(entries.find((e) => e.id === item.dataset.id));
    });

    form.addEventListener("change", (ev) => { if (ev.target.name === "kind") syncKind(); });
    form.addEventListener("submit", save);
    $("cancelBtn").onclick = () => $("editor").close();
    $("deleteBtn").onclick = async () => {
      if (!editing || !confirm(`Delete "${editing.title}"?`)) return;
      try {
        await Store.remove(editing.id);
        $("editor").close();
        load();
      } catch (err) {
        $("formError").textContent = "Couldn't delete: " + err.message;
      }
    };
  }

  async function init() {
    await Store.init("parent");
    U.show("demoBanner", Store.demo);
    const role = await Store.currentRole();
    if (role === "parent") return startApp();
    if (role) await Store.logout();

    screen("login");
    createKeypad($("keypad"), async (code) => {
      $("loginError").textContent = "";
      try {
        const r = await Store.login("parent", code);
        if (r !== "parent") { await Store.logout(); throw new Error("This login isn't set up as a parent"); }
        startApp();
      } catch (err) {
        $("loginError").textContent = err.message;
      }
    });
  }

  init();
})();
