// Eva's calendar view (runs on the kiosk tablet)
(() => {
  const C = APP_CONFIG;
  const KANJI = ["日", "月", "火", "水", "木", "金", "土"];
  let weekStart = U.currentWeek();
  let entries = [];
  let todayIso = U.iso(new Date());
  let idleTimer = null;
  const $ = (id) => document.getElementById(id);
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

  function screen(name) {
    ["loading", "login", "app"].forEach((s) => U.show(s, s === name));
  }

  function tick() {
    const now = new Date();
    $("clock").textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    $("todayLabel").textContent = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const h = now.getHours();
    $("greeting").textContent = `${h < 12 ? "Ohayō" : h < 18 ? "Konnichiwa" : "Konbanwa"}, ${C.CHILD_NAME}!`;
    // New day: move to the new week if needed and redraw the highlight
    if (U.iso(now) !== todayIso) {
      todayIso = U.iso(now);
      weekStart = U.currentWeek();
      load();
    }
  }

  // Speech-bubble message based on what's due
  function updateMessage() {
    const now = new Date();
    const tomorrowIso = U.iso(U.addDays(now, 1));
    const open = (iso) => entries.filter((e) => e.day === iso && e.kind === "homework" && !e.done).length;
    const today = open(todayIso), tomorrow = open(tomorrowIso);
    const plural = (n) => `${n} homework task${n > 1 ? "s" : ""}`;
    let msg;
    if (today) msg = `${plural(today)} due today. Ganbatte! 💪`;
    else if (tomorrow) msg = `${plural(tomorrow)} due tomorrow. You've got this!`;
    else if (isWeekend(now)) msg = "It's the weekend! Time to relax ✿";
    else msg = "All clear! Sugoi! ✨";
    $("message").textContent = msg;
  }

  function itemHtml(e) {
    const meta = e.kind === "lesson"
      ? `Lesson${e.start_time ? " · " + U.fmtTime(e.start_time) : ""}`
      : "Homework due";
    const body = `<div class="tag">${meta}</div>
      ${e.subject ? `<div class="subject">${U.esc(e.subject)}</div>` : ""}
      <div class="title">${U.esc(e.title)}</div>
      ${e.details ? `<div class="details">${U.esc(e.details)}</div>` : ""}`;
    if (e.kind === "homework") {
      return `<button class="item homework ${e.done ? "done" : ""}" data-id="${e.id}" aria-pressed="${e.done}">
        <span class="check" aria-hidden="true">${e.done ? "✓" : ""}</span><span class="item-body">${body}</span>
        ${e.done ? `<span class="stamp" aria-hidden="true">DONE!</span>` : ""}</button>`;
    }
    return `<div class="item lesson"><span class="item-body">${body}</span></div>`;
  }

  function render() {
    $("weekLabel").textContent = U.weekLabel(weekStart);
    U.show("thisWeek", U.iso(weekStart) !== U.iso(U.currentWeek()));
    const days = U.weekDays(weekStart);
    $("week").style.gridTemplateColumns = days.map((d) => (isWeekend(d) ? "0.8fr" : "1fr")).join(" ");
    $("week").innerHTML = days.map((d) => {
      const iso = U.iso(d);
      const list = entries.filter((e) => e.day === iso);
      const cls = [isWeekend(d) ? "weekend" : "", iso === todayIso ? "today" : iso < todayIso ? "past" : ""].join(" ");
      const empty = isWeekend(d)
        ? `<div class="empty weekend-empty"><img src="${C.MASCOT_SLEEPING}" alt=""><span>Free day!</span></div>`
        : `<p class="empty">Nothing planned ✿</p>`;
      return `<section class="day ${cls}">
        <header class="day-head">
          <span class="kanji" aria-hidden="true">${KANJI[d.getDay()]}</span>
          <span class="dow">${d.toLocaleDateString(undefined, { weekday: isWeekend(d) ? "short" : "long" })}</span>
          <span class="date">${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
        </header>
        ${iso === todayIso ? `<span class="today-badge">Today!</span>` : ""}
        <div class="items">${list.length ? list.map(itemHtml).join("") : empty}</div>
      </section>`;
    }).join("");
    updateMessage();
  }

  async function load() {
    const days = U.weekDays(weekStart);
    try {
      entries = await Store.listRange(U.iso(days[0]), U.iso(days[days.length - 1]));
      $("status").textContent = "";
    } catch (err) {
      console.error(err);
      $("status").textContent = "Offline: showing the last saved view";
    }
    render();
  }

  function goWeek(delta) {
    weekStart = delta === 0 ? U.currentWeek() : U.addDays(weekStart, delta * 7);
    load();
  }

  // After a while untouched, go back to the current week
  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (U.iso(weekStart) !== U.iso(U.currentWeek())) goWeek(0);
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

    $("prev").onclick = () => goWeek(-1);
    $("next").onclick = () => goWeek(1);
    $("thisWeek").onclick = () => goWeek(0);
    ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, resetIdle));

    $("week").addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".item.homework");
      if (!btn) return;
      const e = entries.find((x) => x.id === btn.dataset.id);
      if (!e) return;
      e.done = !e.done;
      render();
      if (e.done) celebrate();
      try { await Store.setDone(e.id, e.done); }
      catch (err) { console.error(err); e.done = !e.done; render(); }
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
