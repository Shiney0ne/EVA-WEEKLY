// Eva's calendar view (runs on the kiosk tablet)
(() => {
  const C = APP_CONFIG;
  const KANJI = ["日", "月", "火", "水", "木", "金", "土"];
  const PREFS_KEY = "wk_kiosk_prefs";
  const $ = (id) => document.getElementById(id);
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

  // Eva's choices on this tablet: day or week view, and which kinds to show
  const prefs = (() => {
    const base = { view: C.DEFAULT_VIEW || "week", show: { lesson: true, homework: true, event: true } };
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY));
      return saved ? { view: saved.view || base.view, show: { ...base.show, ...saved.show } } : base;
    } catch { return base; }
  })();
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} };

  let focus = startDay();      // the day shown in day view; its week is shown in week view
  let entries = [];
  let todayIso = U.iso(new Date());
  let idleTimer = null;

  function startDay() {
    const now = new Date();
    if (C.SHOW_WEEKENDS || !isWeekend(now)) return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return U.currentWeek(); // weekends hidden: the coming Monday
  }
  const weekStart = () => U.weekStart(focus);

  function screen(name) {
    ["loading", "login", "app"].forEach((s) => U.show(s, s === name));
  }

  function tick() {
    const now = new Date();
    $("clock").textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    $("todayLabel").textContent = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const h = now.getHours();
    $("greeting").textContent = `${h < 12 ? "Ohayō" : h < 18 ? "Konnichiwa" : "Konbanwa"}, ${C.CHILD_NAME}!`;
    // New day: jump to it and redraw the highlight
    if (U.iso(now) !== todayIso) {
      todayIso = U.iso(now);
      focus = startDay();
      load();
    }
  }

  // Speech-bubble message based on what's due
  function updateMessage() {
    const now = new Date();
    const tomorrowIso = U.iso(U.addDays(now, 1));
    const open = (iso) => entries.filter((e) => e.day === iso && e.kind === "homework" && !e.done).length;
    const events = entries.filter((e) => e.day === todayIso && e.kind === "event").length;
    const today = open(todayIso), tomorrow = open(tomorrowIso);
    const plural = (n) => `${n} homework task${n > 1 ? "s" : ""}`;
    let msg;
    if (today) msg = `${plural(today)} due today. Ganbatte! 💪`;
    else if (events) msg = `Something special today! ⭐`;
    else if (tomorrow) msg = `${plural(tomorrow)} due tomorrow. You've got this!`;
    else if (isWeekend(now)) msg = "It's the weekend! Time to relax ✿";
    else msg = "All clear! Sugoi! ✨";
    $("message").textContent = msg;
  }

  const visible = (list) => list.filter((e) => prefs.show[e.kind] !== false);

  function itemHtml(e, big) {
    const body = `<div class="tag">${U.tagText(e)}</div>
      ${e.subject ? `<div class="subject">${U.esc(e.subject)}</div>` : ""}
      <div class="title">${U.esc(e.title)}</div>
      ${big && e.details ? `<div class="details">${U.esc(e.details)}</div>` : ""}`;
    if (e.kind === "homework") {
      return `<button class="item homework ${e.done ? "done" : ""} ${big ? "big" : ""}" data-id="${e.id}" aria-pressed="${e.done}">
        <span class="check" aria-hidden="true">${e.done ? "✓" : ""}</span><span class="item-body">${body}</span>
        ${e.done ? `<span class="stamp" aria-hidden="true">DONE!</span>` : ""}</button>`;
    }
    return `<div class="item ${e.kind} ${big ? "big" : ""}"><span class="item-body">${body}</span></div>`;
  }

  function dayHead(d, compact, shortDay) {
    return `<span class="kanji" aria-hidden="true">${KANJI[d.getDay()]}</span>
      <span class="dow">${d.toLocaleDateString(undefined, { weekday: shortDay ? "short" : "long" })}</span>
      <span class="date">${d.toLocaleDateString(undefined, { day: "numeric", month: compact ? "short" : "long" })}</span>`;
  }

  function renderWeek() {
    const start = weekStart();
    $("weekLabel").textContent = U.weekLabel(start);
    U.show("thisWeek", U.iso(start) !== U.iso(U.weekStart(startDay())));
    const days = U.weekDays(start);
    const week = $("week");
    week.className = "week";
    week.style.gridTemplateColumns = days.map((d) => (isWeekend(d) ? "0.8fr" : "1fr")).join(" ");
    week.innerHTML = days.map((d) => {
      const iso = U.iso(d);
      const list = visible(entries.filter((e) => e.day === iso));
      const cls = [isWeekend(d) ? "weekend" : "", iso === todayIso ? "today" : iso < todayIso ? "past" : ""].join(" ");
      const empty = isWeekend(d)
        ? `<div class="empty weekend-empty"><img src="${C.MASCOT_SLEEPING}" alt=""><span>Free day!</span></div>`
        : `<p class="empty">Nothing planned ✿</p>`;
      return `<section class="day ${cls}" data-day="${iso}">
        <button class="day-head" aria-label="Open ${d.toLocaleDateString(undefined, { weekday: "long" })}">
          ${dayHead(d, true, isWeekend(d))}<span class="zoom" aria-hidden="true">⤢</span>
        </button>
        ${iso === todayIso ? `<span class="today-badge">Today!</span>` : ""}
        <div class="items">${list.length ? list.map((e) => itemHtml(e, false)).join("") : empty}</div>
      </section>`;
    }).join("");
  }

  function renderDay() {
    const d = focus;
    const iso = U.iso(d);
    $("weekLabel").textContent = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    U.show("thisWeek", iso !== U.iso(startDay()));
    const list = visible(entries.filter((e) => e.day === iso));
    // One column per kind that has something, so empty sections don't take up space
    const cols = ["lesson", "event", "homework"]
      .map((k) => ({ k, items: list.filter((e) => e.kind === k) }))
      .filter((c) => c.items.length);
    const week = $("week");
    week.className = "dayview-wrap";
    week.style.gridTemplateColumns = "";
    const cls = [isWeekend(d) ? "weekend" : "", iso === todayIso ? "today" : ""].join(" ");
    const hidden = list.length < entries.filter((e) => e.day === iso).length;
    week.innerHTML = `<section class="day dayview ${cls}">
      <header class="day-head">${dayHead(d, false, false)}
        <button class="back-week" data-view-go="week">← Whole week</button>
      </header>
      ${iso === todayIso ? `<span class="today-badge">Today!</span>` : ""}
      ${cols.length
        ? `<div class="dayview-cols" style="grid-template-columns: repeat(${cols.length}, minmax(0, 1fr))">${cols.map((c) =>
            `<div class="dayview-col"><h3 class="col-title ${c.k}">${U.KINDS[c.k].icon} ${U.KINDS[c.k].label}</h3>
              <div class="items">${c.items.map((e) => itemHtml(e, true)).join("")}</div></div>`).join("")}</div>`
        : `<div class="dayview-empty"><img src="${hidden ? C.MASCOT : C.MASCOT_SLEEPING}" alt="">
            <span>${hidden ? "Some things are hidden" : isWeekend(d) ? "Free day!" : "Nothing planned!"}</span>
            ${hidden ? `<small>Tap the buttons at the top to show them</small>` : ""}</div>`}
    </section>`;
  }

  function render() {
    document.querySelectorAll(".viewswitch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === prefs.view)));
    document.querySelectorAll(".filters .chip").forEach((b) => b.setAttribute("aria-pressed", String(prefs.show[b.dataset.kind] !== false)));
    $("prev").setAttribute("aria-label", prefs.view === "day" ? "Previous day" : "Previous week");
    $("next").setAttribute("aria-label", prefs.view === "day" ? "Next day" : "Next week");
    if (prefs.view === "day") renderDay(); else renderWeek();
    updateMessage();
  }

  async function load() {
    const days = U.weekDays(weekStart());
    try {
      entries = await Store.listRange(U.iso(days[0]), U.iso(days[days.length - 1]));
      $("status").textContent = "";
    } catch (err) {
      console.error(err);
      if (err.signedOut) { await Store.logout(); return location.reload(); }
      $("status").textContent = navigator.onLine === false ? "Offline: showing the last saved view" : err.message;
    }
    render();
  }

  // Move focus by n days (day view) or weeks (week view); reload only if the week changed
  function step(n) {
    const before = U.iso(weekStart());
    if (prefs.view === "day") {
      let d = U.addDays(focus, n);
      while (!C.SHOW_WEEKENDS && isWeekend(d)) d = U.addDays(d, n);
      focus = d;
    } else {
      focus = U.addDays(focus, n * 7);
    }
    if (U.iso(weekStart()) !== before) load(); else render();
  }

  function goToday() {
    const before = U.iso(weekStart());
    focus = startDay();
    if (U.iso(weekStart()) !== before) load(); else render();
  }

  function setView(view, day) {
    prefs.view = view;
    savePrefs();
    if (day) focus = U.parse(day);
    render();
  }

  // After a while untouched, go back to today (keeping Eva's chosen view)
  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (U.iso(focus) !== U.iso(startDay())) goToday();
    }, C.IDLE_RETURN_SECONDS * 1000);
  }

  function celebrate() {
    const b = $("burst");
    b.classList.remove("go");
    void b.offsetWidth; // restart the animation
    b.classList.add("go");
  }

  function startApp() {
    screen("app");
    $("mascot").src = C.MASCOT;
    tick();
    setInterval(tick, 15000);
    load();
    setInterval(load, C.REFRESH_MINUTES * 60000);
    Bus.start($("bus"));

    $("prev").onclick = () => step(-1);
    $("next").onclick = () => step(1);
    $("thisWeek").onclick = goToday;
    ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, resetIdle));

    document.querySelector(".viewswitch").addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b || b.dataset.view === prefs.view) return;
      // Day view opens on today when looking at this week, otherwise on the same weekday
      const thisWeek = U.iso(weekStart()) === U.iso(U.weekStart(startDay()));
      setView(b.dataset.view, b.dataset.view === "day" && thisWeek ? U.iso(startDay()) : null);
    });
    document.querySelector(".filters").addEventListener("click", (ev) => {
      const b = ev.target.closest(".chip");
      if (!b) return;
      prefs.show[b.dataset.kind] = prefs.show[b.dataset.kind] === false;
      savePrefs();
      render();
    });

    let swiped = false;
    $("week").addEventListener("click", async (ev) => {
      if (swiped) { swiped = false; return; }
      const hw = ev.target.closest(".item.homework");
      if (hw) {
        const e = entries.find((x) => x.id === hw.dataset.id);
        if (!e) return;
        e.done = !e.done;
        render();
        if (e.done) celebrate();
        try { await Store.setDone(e.id, e.done); }
        catch (err) { console.error(err); e.done = !e.done; render(); }
        return;
      }
      if (ev.target.closest("[data-view-go]")) return setView("week");
      // Tap a day (its header or anywhere in it) to see just that day
      const day = ev.target.closest("[data-day]");
      if (day && prefs.view === "week") setView("day", day.dataset.day);
    });

    // Swipe left/right to move between days or weeks
    let sx = null, sy = null;
    $("week").addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
    $("week").addEventListener("pointerup", (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; step(dx < 0 ? 1 : -1); }
    });

    // Hidden sign-out: hold the clock for 3 seconds
    let hold;
    $("clockPanel").addEventListener("pointerdown", () => {
      hold = setTimeout(async () => { await Store.logout(); location.reload(); }, 3000);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
      $("clockPanel").addEventListener(ev, () => clearTimeout(hold)));
  }

  async function init() {
    await Store.init("kiosk");
    U.show("demoBanner", Store.demo);
    $("loginHello").textContent = `Hi ${C.CHILD_NAME}!`;
    const role = await Store.currentRole();
    if (role) return startApp();

    screen("login");
    createKeypad($("keypad"), async (code) => {
      $("loginError").textContent = "";
      try {
        const r = await Store.login("child", code);
        if (!r) throw new Error("This login has no role set up yet");
        startApp();
      } catch (err) {
        $("loginError").textContent = err.message;
      }
    });
  }

  init();
})();
