// Shared helpers: dates, escaping, the code keypad.
const U = {
  iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  parse(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  },
  addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  },
  // Monday of the week containing d
  weekStart(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return U.addDays(x, -((x.getDay() + 6) % 7));
  },
  // The week to show by default: on a weekend with weekends hidden, the coming week
  currentWeek() {
    const now = new Date();
    const start = U.weekStart(now);
    return !APP_CONFIG.SHOW_WEEKENDS && (now.getDay() === 0 || now.getDay() === 6) ? U.addDays(start, 7) : start;
  },
  weekDays(start) {
    const n = APP_CONFIG.SHOW_WEEKENDS ? 7 : 5;
    return Array.from({ length: n }, (_, i) => U.addDays(start, i));
  },
  weekLabel(start) {
    const days = U.weekDays(start);
    const a = days[0], b = days[days.length - 1];
    const m = (d) => d.toLocaleDateString(undefined, { month: "short" });
    return a.getMonth() === b.getMonth()
      ? `${m(a)} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
      : `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}, ${b.getFullYear()}`;
  },
  fmtTime(t) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  },
  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  // Lessons first (by time), then homework
  sortEntries(list) {
    return list.slice().sort((a, b) =>
      a.day.localeCompare(b.day) ||
      (a.kind === b.kind ? 0 : a.kind === "lesson" ? -1 : 1) ||
      (a.start_time || "99").localeCompare(b.start_time || "99") ||
      (a.subject || "").localeCompare(b.subject || ""));
  },
  show(id, on = true) {
    document.getElementById(id).classList.toggle("hidden", !on);
  }
};

// Numeric keypad for entering a login code
function createKeypad(el, onSubmit, { minLength = 6, maxLength = 12 } = {}) {
  let code = "";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "ok"];
  el.classList.add("keypad");
  el.innerHTML = `<div class="dots" aria-label="Code"></div><div class="keys">${keys.map((k) =>
    k === "back" ? `<button type="button" data-k="back" aria-label="Delete">⌫</button>`
    : k === "ok" ? `<button type="button" data-k="ok" class="ok" aria-label="Enter">✓</button>`
    : `<button type="button" data-k="${k}">${k}</button>`).join("")}</div>`;
  const dots = el.querySelector(".dots");
  const draw = () => {
    dots.innerHTML = Array.from({ length: Math.max(minLength, code.length) }, (_, i) =>
      `<span class="${i < code.length ? "on" : ""}"></span>`).join("");
  };
  const press = (k) => {
    if (k === "back") code = code.slice(0, -1);
    else if (k === "ok") {
      if (code.length >= minLength) { const c = code; code = ""; draw(); onSubmit(c); }
      return;
    } else if (code.length < maxLength) code += k;
    draw();
  };
  el.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) press(b.dataset.k); });
  document.addEventListener("keydown", (e) => {
    if (!el.offsetParent) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === "Backspace") press("back");
    else if (e.key === "Enter") press("ok");
  });
  draw();
  return { clear() { code = ""; draw(); } };
}
