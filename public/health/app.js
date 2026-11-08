"use strict";
// Blood pressure & weight log. All data stays on this device (localStorage).

const KEY = "health-log-v1";
const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const sheet = $("#sheet");

// ---------- Storage ----------
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      bp: Array.isArray(d.bp) ? d.bp : [],
      weight: Array.isArray(d.weight) ? d.weight : [],
      settings: d.settings || {},
      lastBackup: d.lastBackup || 0,
    };
  } catch {
    return { bp: [], weight: [], settings: {}, lastBackup: 0 };
  }
}
let db = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    toast("השמירה נכשלה – אין מספיק מקום במכשיר");
  }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const byTime = (a, b) => b.t - a.t;

// Ask the browser not to clear our data when space runs low.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- Helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (t) => new Date(t).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "2-digit" });
const fmtTime = (t) => new Date(t).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (t) => new Date(t).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const toLocalInput = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const num = (v) => {
  const n = parseFloat(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
};
const round1 = (n) => Math.round(n * 10) / 10;
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
const DAY = 86400000;

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 2200);
}

// Blood pressure categories (based on common adult guidelines; not a diagnosis).
function bpLevel(sys, dia) {
  if (sys > 180 || dia > 120) return { cls: "lvl-bad", label: "גבוה מאוד" };
  if (sys >= 140 || dia >= 90) return { cls: "lvl-high", label: "גבוה – דרגה 2" };
  if (sys >= 130 || dia >= 80) return { cls: "lvl-warn", label: "גבוה – דרגה 1" };
  if (sys < 90 || dia < 60) return { cls: "lvl-warn", label: "נמוך" };
  if (sys >= 120) return { cls: "lvl-warn", label: "מעט מוגבר" };
  return { cls: "lvl-ok", label: "תקין" };
}

function bmi(kg) {
  const h = num(db.settings.height) / 100;
  if (!h || !kg) return null;
  const v = kg / (h * h);
  let label = "תקין", cls = "lvl-ok";
  if (v < 18.5) { label = "תת-משקל"; cls = "lvl-warn"; }
  else if (v >= 30) { label = "השמנה"; cls = "lvl-high"; }
  else if (v >= 25) { label = "עודף משקל"; cls = "lvl-warn"; }
  return { v: round1(v), label, cls };
}

// ---------- Navigation ----------
let tab = "home";
const titles = { home: "לחץ דם ומשקל", charts: "גרפים", history: "היסטוריה", settings: "הגדרות" };
document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => go(b.dataset.tab))
);
function go(t) {
  tab = t;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  $("#title").textContent = titles[t];
  render();
  window.scrollTo(0, 0);
}
function render() {
  ({ home: renderHome, charts: renderCharts, history: renderHistory, settings: renderSettings })[tab]();
}

// ---------- Home ----------
function renderHome() {
  const bp = [...db.bp].sort(byTime);
  const w = [...db.weight].sort(byTime);
  const lastBp = bp[0];
  const lastW = w[0];
  const now = Date.now();

  let html = "";
  const total = db.bp.length + db.weight.length;
  if (total >= 10 && now - db.lastBackup > 30 * DAY) {
    html += `<div class="banner">כדאי לשמור גיבוי של הנתונים. <button data-act="backup">לגיבוי עכשיו</button></div>`;
  }

  html += `<div class="add-row">
    <button class="btn big" data-act="add-bp">＋ לחץ דם</button>
    <button class="btn big alt" data-act="add-w">＋ משקל</button>
  </div>`;

  // Latest blood pressure
  html += `<section class="card"><h2>❤️ לחץ דם אחרון</h2>`;
  if (lastBp) {
    const l = bpLevel(lastBp.sys, lastBp.dia);
    html += `<div class="latest"><span class="num">${lastBp.sys}/${lastBp.dia}</span><span class="unit">mmHg</span>
      <span class="badge ${l.cls}">${l.label}</span></div>
      <div class="meta">${lastBp.pulse ? `דופק ${lastBp.pulse} · ` : ""}${fmtDate(lastBp.t)} ${fmtTime(lastBp.t)}</div>`;
    if (lastBp.sys > 180 || lastBp.dia > 120) {
      html += `<p class="banner" style="margin:10px 0 0">ערך גבוה מאוד. כדאי למדוד שוב אחרי 5 דקות מנוחה. אם הוא נשאר גבוה או שיש תסמינים (כאב בחזה, קוצר נשימה, כאב ראש חזק, חולשה) – לפנות מיד למוקד רפואי או למד״א 101.</p>`;
    }
    const recent = bp.filter((r) => r.t >= now - 7 * DAY);
    if (recent.length > 1) {
      const s = Math.round(avg(recent.map((r) => r.sys)));
      const d = Math.round(avg(recent.map((r) => r.dia)));
      const p = recent.filter((r) => r.pulse).map((r) => r.pulse);
      html += `<div class="stats" style="margin-top:12px">
        <div><b>${s}/${d}</b><span>ממוצע 7 ימים</span></div>
        <div><b>${p.length ? Math.round(avg(p)) : "–"}</b><span>דופק ממוצע</span></div>
        <div><b>${recent.length}</b><span>מדידות</span></div></div>`;
    }
  } else {
    html += `<div class="empty">עדיין אין מדידות. לחצו על „＋ לחץ דם״.</div>`;
  }
  html += `</section>`;

  // Latest weight
  html += `<section class="card"><h2>⚖️ משקל אחרון</h2>`;
  if (lastW) {
    const b = bmi(lastW.kg);
    html += `<div class="latest"><span class="num">${lastW.kg}</span><span class="unit">ק״ג</span>
      ${b ? `<span class="badge ${b.cls}">BMI ${b.v} · ${b.label}</span>` : ""}</div>
      <div class="meta">${fmtDate(lastW.t)} ${fmtTime(lastW.t)}</div>`;
    const stats = [];
    const ref30 = w.find((r) => r.t <= now - 30 * DAY) || w[w.length - 1];
    if (ref30 && ref30 !== lastW) {
      const diff = round1(lastW.kg - ref30.kg);
      stats.push(`<div><b>${diff > 0 ? "+" : ""}${diff}</b><span>שינוי ב-30 יום</span></div>`);
    }
    const first = w[w.length - 1];
    if (first && first !== lastW) {
      const diff = round1(lastW.kg - first.kg);
      stats.push(`<div><b>${diff > 0 ? "+" : ""}${diff}</b><span>מההתחלה</span></div>`);
    }
    const goal = num(db.settings.goal);
    if (goal) {
      const left = round1(lastW.kg - goal);
      stats.push(`<div><b>${left === 0 ? "✓" : Math.abs(left)}</b><span>${left === 0 ? "הגעת ליעד!" : "ק״ג ליעד"}</span></div>`);
    }
    if (stats.length) html += `<div class="stats" style="margin-top:12px">${stats.join("")}</div>`;
  } else {
    html += `<div class="empty">עדיין אין שקילות. לחצו על „＋ משקל״.</div>`;
  }
  html += `</section>`;

  if (bp.length > 1) {
    html += `<section class="card"><h2>לחץ דם – 30 ימים אחרונים</h2>${bpChart(bp.filter((r) => r.t >= now - 30 * DAY))}</section>`;
  }
  view.innerHTML = html;
}

// ---------- Charts ----------
let range = 30;
function renderCharts() {
  const now = Date.now();
  const from = range ? now - range * DAY : 0;
  const bp = db.bp.filter((r) => r.t >= from).sort(byTime);
  const w = db.weight.filter((r) => r.t >= from).sort(byTime);
  const ranges = [[7, "שבוע"], [30, "חודש"], [90, "3 חודשים"], [365, "שנה"], [0, "הכל"]];

  let html = `<div class="seg">${ranges.map(([v, l]) => `<button data-range="${v}" class="${v === range ? "on" : ""}">${l}</button>`).join("")}</div>`;

  html += `<section class="card"><h2>❤️ לחץ דם</h2>${bp.length ? bpChart(bp) : `<div class="empty">אין מדידות בתקופה הזו</div>`}`;
  if (bp.length) {
    const s = bp.map((r) => r.sys), d = bp.map((r) => r.dia);
    html += `<div class="stats" style="margin-top:12px">
      <div><b>${Math.round(avg(s))}/${Math.round(avg(d))}</b><span>ממוצע</span></div>
      <div><b>${Math.max(...s)}/${Math.max(...d)}</b><span>הכי גבוה</span></div>
      <div><b>${Math.min(...s)}/${Math.min(...d)}</b><span>הכי נמוך</span></div></div>`;
  }
  html += `</section>`;

  const withPulse = bp.filter((r) => r.pulse);
  if (withPulse.length > 1) {
    html += `<section class="card"><h2>💓 דופק</h2>${lineChart([{ pts: withPulse.map((r) => [r.t, r.pulse]), color: "var(--pulse)" }], { refs: [] })}</section>`;
  }

  html += `<section class="card"><h2>⚖️ משקל</h2>`;
  if (w.length) {
    const goal = num(db.settings.goal);
    html += lineChart([{ pts: w.map((r) => [r.t, r.kg]), color: "var(--weight)" }], {
      refs: goal ? [{ v: goal, color: "var(--ok)", label: "יעד" }] : [],
      pad: 1,
    });
    const k = w.map((r) => r.kg);
    const change = round1(w[0].kg - w[w.length - 1].kg);
    html += `<div class="stats" style="margin-top:12px">
      <div><b>${round1(avg(k))}</b><span>ממוצע</span></div>
      <div><b>${Math.min(...k)}–${Math.max(...k)}</b><span>טווח</span></div>
      <div><b>${change > 0 ? "+" : ""}${change}</b><span>שינוי</span></div></div>`;
  } else {
    html += `<div class="empty">אין שקילות בתקופה הזו</div>`;
  }
  html += `</section>`;
  view.innerHTML = html;
}

function bpChart(rows) {
  return (
    lineChart(
      [
        { pts: rows.map((r) => [r.t, r.sys]), color: "var(--sys)" },
        { pts: rows.map((r) => [r.t, r.dia]), color: "var(--dia)" },
      ],
      { refs: [{ v: 130, color: "var(--sys)" }, { v: 80, color: "var(--dia)" }], pad: 5 }
    ) +
    `<div class="legend"><span><i style="background:var(--sys)"></i>עליון (סיסטולי)</span><span><i style="background:var(--dia)"></i>תחתון (דיאסטולי)</span><span>קווים מקווקווים: 130/80</span></div>`
  );
}

// Simple SVG line chart. series: [{pts:[[t,v]...], color}]
function lineChart(series, { refs = [], pad = 2 } = {}) {
  const W = 340, H = 180, L = 34, R = 8, T = 10, B = 24;
  const all = series.flatMap((s) => s.pts);
  if (!all.length) return "";
  const vals = all.map((p) => p[1]).concat(refs.map((r) => r.v));
  let minV = Math.min(...vals) - pad, maxV = Math.max(...vals) + pad;
  if (maxV - minV < 4) { minV -= 2; maxV += 2; }
  let minT = Math.min(...all.map((p) => p[0])), maxT = Math.max(...all.map((p) => p[0]));
  if (maxT === minT) { minT -= DAY / 2; maxT += DAY / 2; }
  const x = (t) => L + ((t - minT) / (maxT - minT)) * (W - L - R);
  const y = (v) => T + (1 - (v - minV) / (maxV - minV)) * (H - T - B);

  let g = "";
  // Horizontal grid + labels
  const step = niceStep((maxV - minV) / 4);
  for (let v = Math.ceil(minV / step) * step; v <= maxV; v += step) {
    g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${round1(v)}</text>`;
  }
  // Date labels
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const t = minT + ((maxT - minT) * i) / n;
    const d = new Date(t);
    g += `<text x="${x(t)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n ? "end" : "middle"}">${d.getDate()}/${d.getMonth() + 1}</text>`;
  }
  for (const r of refs) {
    g += `<line class="ref" stroke="${r.color}" x1="${L}" x2="${W - R}" y1="${y(r.v)}" y2="${y(r.v)}"/>`;
  }
  for (const s of series) {
    const pts = [...s.pts].sort((a, b) => a[0] - b[0]);
    if (pts.length > 1) {
      g += `<polyline fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")}"/>`;
    }
    const rad = pts.length > 60 ? 1.8 : 3;
    for (const p of pts) g += `<circle cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="${rad}" fill="${s.color}"/>`;
  }
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="גרף">${g}</svg></div>`;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

// ---------- History ----------
let histFilter = "all";
function renderHistory() {
  const items = [
    ...(histFilter !== "w" ? db.bp.map((r) => ({ ...r, kind: "bp" })) : []),
    ...(histFilter !== "bp" ? db.weight.map((r) => ({ ...r, kind: "w" })) : []),
  ].sort(byTime);

  let html = `<div class="seg">
    <button data-filter="all" class="${histFilter === "all" ? "on" : ""}">הכל</button>
    <button data-filter="bp" class="${histFilter === "bp" ? "on" : ""}">לחץ דם</button>
    <button data-filter="w" class="${histFilter === "w" ? "on" : ""}">משקל</button></div>`;

  if (!items.length) {
    view.innerHTML = html + `<div class="card empty">אין רשומות עדיין</div>`;
    return;
  }
  html += `<section class="card">`;
  let lastDay = "";
  for (const r of items) {
    const day = fmtDay(r.t);
    if (day !== lastDay) {
      if (lastDay) html += `</ul>`;
      html += `<p class="day">${day}</p><ul class="list">`;
      lastDay = day;
    }
    if (r.kind === "bp") {
      const l = bpLevel(r.sys, r.dia);
      html += `<li><span class="ico">❤️</span><div class="main">
        <div class="val"><bdi>${r.sys}/${r.dia}</bdi> <span class="badge ${l.cls}">${l.label}</span></div>
        <div class="note">${fmtTime(r.t)}${r.pulse ? ` · דופק ${r.pulse}` : ""}${r.note ? ` · ${esc(r.note)}` : ""}</div></div>
        <button class="edit" data-edit-bp="${r.id}" aria-label="עריכה">✎</button></li>`;
    } else {
      html += `<li><span class="ico">⚖️</span><div class="main">
        <div class="val"><bdi>${r.kg}</bdi> ק״ג</div>
        <div class="note">${fmtTime(r.t)}${r.note ? ` · ${esc(r.note)}` : ""}</div></div>
        <button class="edit" data-edit-w="${r.id}" aria-label="עריכה">✎</button></li>`;
    }
  }
  html += `</ul></section>`;
  view.innerHTML = html;
}

// ---------- Settings ----------
function renderSettings() {
  const s = db.settings;
  const last = db.lastBackup ? `גיבוי אחרון: ${fmtDate(db.lastBackup)}` : "עוד לא נשמר גיבוי";
  view.innerHTML = `
  <section class="card"><h2>פרטים אישיים</h2>
    <form id="prefs">
      <div class="row2">
        <div class="field"><label for="height">גובה (ס״מ)</label><input id="height" inputmode="numeric" value="${esc(s.height || "")}" placeholder="170"></div>
        <div class="field"><label for="goal">משקל יעד (ק״ג)</label><input id="goal" inputmode="decimal" value="${esc(s.goal || "")}" placeholder="לא חובה"></div>
      </div>
      <p class="info">הגובה משמש לחישוב BMI.</p>
      <button class="btn block" type="submit">שמירה</button>
    </form>
  </section>

  <section class="card settings-list"><h2>גיבוי ושיתוף</h2>
    <p class="info">${last}. הנתונים נשמרים רק בטלפון הזה, לכן כדאי לשמור גיבוי מדי פעם (למשל ב-iCloud Drive דרך „שמירה בקבצים״).</p>
    <button class="btn block" data-act="backup">💾 שמירת גיבוי</button>
    <button class="btn block alt" data-act="restore">📂 שחזור מגיבוי</button>
    <button class="btn block ghost" data-act="csv">📄 ייצוא לאקסל (לרופא)</button>
    <input type="file" id="restoreFile" accept=".json,application/json" hidden>
  </section>

  <section class="card info"><h2>איך מודדים נכון</h2>
    <p>• לשבת בשקט 5 דקות לפני המדידה, גב נשען ורגליים על הרצפה.</p>
    <p>• היד נשענת על שולחן, השרוול בגובה הלב, על עור חשוף.</p>
    <p>• לא לעשן, לשתות קפה או להתאמן חצי שעה לפני.</p>
    <p>• למדוד פעמיים בהפרש של דקה, בבוקר ובערב באותן שעות.</p>
    <p>• להישקל בבוקר, אחרי שירותים ולפני אוכל.</p>
  </section>

  <section class="card"><h2>טווחי לחץ דם (מבוגרים)</h2>
    <table class="legend-table">
      <tr><td><span class="badge lvl-ok">תקין</span></td><td>&lt;120 / &lt;80</td></tr>
      <tr><td><span class="badge lvl-warn">מעט מוגבר</span></td><td>120–129 / &lt;80</td></tr>
      <tr><td><span class="badge lvl-warn">גבוה – דרגה 1</span></td><td>130–139 / 80–89</td></tr>
      <tr><td><span class="badge lvl-high">גבוה – דרגה 2</span></td><td>≥140 / ≥90</td></tr>
      <tr><td><span class="badge lvl-bad">גבוה מאוד</span></td><td>&gt;180 / &gt;120</td></tr>
      <tr><td><span class="badge lvl-warn">נמוך</span></td><td>&lt;90 / &lt;60</td></tr>
    </table>
    <p class="info" style="margin-top:10px">המידע כללי ואינו תחליף לייעוץ רפואי. היעדים האישיים נקבעים עם הרופא.</p>
  </section>

  <section class="card settings-list"><h2>פרטיות</h2>
    <p class="info">האפליקציה לא שולחת שום מידע לאף שרת. אין חשבון, אין פרסומות ואין מעקב. כל הנתונים נשארים בטלפון.</p>
    <button class="btn block danger" data-act="wipe">מחיקת כל הנתונים</button>
  </section>`;

  $("#prefs").addEventListener("submit", (e) => {
    e.preventDefault();
    const h = num($("#height").value), g = num($("#goal").value);
    if ($("#height").value && !(h >= 100 && h <= 230)) return toast("גובה לא תקין");
    if ($("#goal").value && !(g >= 20 && g <= 350)) return toast("משקל יעד לא תקין");
    db.settings.height = $("#height").value ? h : "";
    db.settings.goal = $("#goal").value ? g : "";
    save();
    toast("נשמר ✓");
  });
  $("#restoreFile").addEventListener("change", restoreFrom);
}

// ---------- Forms ----------
function openSheet(html, onSubmit) {
  sheet.innerHTML = html;
  const form = $("form", sheet);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const err = onSubmit(form);
    if (err) { $(".err", sheet).textContent = err; return; }
    sheet.close();
    render();
  });
  $("[data-cancel]", sheet).addEventListener("click", () => sheet.close());
  sheet.showModal();
  const first = $("input.bignum", sheet);
  if (first) setTimeout(() => first.focus(), 50);
}
sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });

function bpForm(rec) {
  const r = rec || { t: Date.now() };
  openSheet(
    `<form novalidate>
      <h3>${rec ? "עריכת מדידה" : "מדידת לחץ דם"}</h3>
      <div class="row3">
        <div class="field"><label for="sys">עליון</label><input class="bignum" id="sys" inputmode="numeric" pattern="[0-9]*" value="${r.sys ?? ""}" placeholder="120"></div>
        <div class="field"><label for="dia">תחתון</label><input class="bignum" id="dia" inputmode="numeric" pattern="[0-9]*" value="${r.dia ?? ""}" placeholder="80"></div>
        <div class="field"><label for="pulse">דופק</label><input class="bignum" id="pulse" inputmode="numeric" pattern="[0-9]*" value="${r.pulse ?? ""}" placeholder="70"></div>
      </div>
      <div class="field"><label for="t">תאריך ושעה</label><input id="t" type="datetime-local" value="${toLocalInput(r.t)}"></div>
      <div class="field"><label for="note">הערה (לא חובה)</label><input id="note" maxlength="200" value="${esc(r.note || "")}" placeholder="למשל: אחרי תרופה, יד שמאל"></div>
      <p class="err"></p>
      <div class="actions">
        <button class="btn" type="submit">שמירה</button>
        <button class="btn ghost" type="button" data-cancel>ביטול</button>
      </div>
      ${rec ? `<button class="btn danger block" type="button" id="del" style="margin-top:10px">מחיקה</button>` : ""}
    </form>`,
    (f) => {
      const sys = num($("#sys", f).value), dia = num($("#dia", f).value);
      const pulseRaw = $("#pulse", f).value.trim();
      const pulse = pulseRaw ? num(pulseRaw) : null;
      const t = new Date($("#t", f).value).getTime();
      if (!(sys >= 50 && sys <= 300)) return "הערך העליון צריך להיות בין 50 ל-300";
      if (!(dia >= 30 && dia <= 200)) return "הערך התחתון צריך להיות בין 30 ל-200";
      if (dia >= sys) return "הערך התחתון צריך להיות נמוך מהעליון";
      if (pulseRaw && !(pulse >= 30 && pulse <= 250)) return "הדופק צריך להיות בין 30 ל-250";
      if (!Number.isFinite(t)) return "תאריך לא תקין";
      const data = { sys: Math.round(sys), dia: Math.round(dia), pulse: pulse ? Math.round(pulse) : null, t, note: $("#note", f).value.trim() };
      if (rec) Object.assign(db.bp.find((x) => x.id === rec.id), data);
      else db.bp.push({ id: uid(), ...data });
      save();
      toast("נשמר ✓");
    }
  );
  if (rec) $("#del", sheet).addEventListener("click", () => {
    if (!confirm("למחוק את המדידה?")) return;
    db.bp = db.bp.filter((x) => x.id !== rec.id);
    save(); sheet.close(); render(); toast("נמחק");
  });
}

function weightForm(rec) {
  const lastW = [...db.weight].sort(byTime)[0];
  const r = rec || { t: Date.now() };
  openSheet(
    `<form novalidate>
      <h3>${rec ? "עריכת שקילה" : "שקילה"}</h3>
      <div class="field"><label for="kg">משקל (ק״ג)</label><input class="bignum" id="kg" inputmode="decimal" value="${r.kg ?? ""}" placeholder="${lastW ? lastW.kg : "70.0"}"></div>
      <div class="field"><label for="t">תאריך ושעה</label><input id="t" type="datetime-local" value="${toLocalInput(r.t)}"></div>
      <div class="field"><label for="note">הערה (לא חובה)</label><input id="note" maxlength="200" value="${esc(r.note || "")}"></div>
      <p class="err"></p>
      <div class="actions">
        <button class="btn" type="submit">שמירה</button>
        <button class="btn ghost" type="button" data-cancel>ביטול</button>
      </div>
      ${rec ? `<button class="btn danger block" type="button" id="del" style="margin-top:10px">מחיקה</button>` : ""}
    </form>`,
    (f) => {
      const kg = num($("#kg", f).value);
      const t = new Date($("#t", f).value).getTime();
      if (!(kg >= 20 && kg <= 350)) return "המשקל צריך להיות בין 20 ל-350 ק״ג";
      if (!Number.isFinite(t)) return "תאריך לא תקין";
      const data = { kg: round1(kg), t, note: $("#note", f).value.trim() };
      if (rec) Object.assign(db.weight.find((x) => x.id === rec.id), data);
      else db.weight.push({ id: uid(), ...data });
      save();
      toast("נשמר ✓");
    }
  );
  if (rec) $("#del", sheet).addEventListener("click", () => {
    if (!confirm("למחוק את השקילה?")) return;
    db.weight = db.weight.filter((x) => x.id !== rec.id);
    save(); sheet.close(); render(); toast("נמחק");
  });
}

// ---------- Backup / export ----------
async function shareOrDownload(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if (e && e.name === "AbortError") return false;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return true;
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

async function backup() {
  const data = JSON.stringify({ app: "health-log", version: 1, exported: Date.now(), bp: db.bp, weight: db.weight, settings: db.settings }, null, 1);
  if (await shareOrDownload(`גיבוי-לחץ-דם-ומשקל-${stamp()}.json`, data, "application/json")) {
    db.lastBackup = Date.now();
    save();
    render();
  }
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportCsv() {
  const rows = [["סוג", "תאריך", "שעה", "עליון (סיסטולי)", "תחתון (דיאסטולי)", "דופק", "משקל (ק״ג)", "הערה"]];
  const items = [...db.bp.map((r) => ({ ...r, kind: "bp" })), ...db.weight.map((r) => ({ ...r, kind: "w" }))].sort((a, b) => a.t - b.t);
  for (const r of items) {
    const d = new Date(r.t);
    const date = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    rows.push(r.kind === "bp"
      ? ["לחץ דם", date, time, r.sys, r.dia, r.pulse ?? "", "", r.note]
      : ["משקל", date, time, "", "", "", r.kg, r.note]);
  }
  if (rows.length === 1) return toast("אין נתונים לייצוא");
  // BOM so Excel opens Hebrew correctly.
  shareOrDownload(`לחץ-דם-ומשקל-${stamp()}.csv`, "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv");
}

function restoreFrom(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (d.app !== "health-log" || !Array.isArray(d.bp) || !Array.isArray(d.weight)) throw new Error();
      const okBp = (r) => r && typeof r.id === "string" && Number.isFinite(r.t) && Number.isFinite(r.sys) && Number.isFinite(r.dia);
      const okW = (r) => r && typeof r.id === "string" && Number.isFinite(r.t) && Number.isFinite(r.kg);
      const clean = (r) => ({ ...r, note: typeof r.note === "string" ? r.note.slice(0, 200) : "" });
      const ids = new Set([...db.bp, ...db.weight].map((r) => r.id));
      let added = 0;
      for (const r of d.bp.filter(okBp)) if (!ids.has(r.id)) { db.bp.push(clean({ id: r.id, t: r.t, sys: r.sys, dia: r.dia, pulse: Number.isFinite(r.pulse) ? r.pulse : null, note: r.note })); added++; }
      for (const r of d.weight.filter(okW)) if (!ids.has(r.id)) { db.weight.push(clean({ id: r.id, t: r.t, kg: r.kg, note: r.note })); added++; }
      if (d.settings && typeof d.settings === "object") {
        if (!db.settings.height && d.settings.height) db.settings.height = num(d.settings.height) || "";
        if (!db.settings.goal && d.settings.goal) db.settings.goal = num(d.settings.goal) || "";
      }
      save();
      render();
      toast(added ? `שוחזרו ${added} רשומות ✓` : "כל הרשומות כבר קיימות");
    } catch {
      toast("הקובץ לא תקין");
    }
  };
  reader.readAsText(file);
}

// ---------- Global click handling ----------
view.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "add-bp") bpForm();
  else if (act === "add-w") weightForm();
  else if (act === "backup") backup();
  else if (act === "csv") exportCsv();
  else if (act === "restore") $("#restoreFile").click();
  else if (act === "wipe") {
    if (confirm("למחוק את כל המדידות והשקילות? אי אפשר לבטל את זה.") && confirm("בטוח? מומלץ לשמור גיבוי קודם.")) {
      db = { bp: [], weight: [], settings: {}, lastBackup: 0 };
      save(); render(); toast("כל הנתונים נמחקו");
    }
  } else if (b.dataset.range !== undefined) { range = +b.dataset.range; renderCharts(); }
  else if (b.dataset.filter) { histFilter = b.dataset.filter; renderHistory(); }
  else if (b.dataset.editBp) bpForm(db.bp.find((x) => x.id === b.dataset.editBp));
  else if (b.dataset.editW) weightForm(db.weight.find((x) => x.id === b.dataset.editW));
});

// Keep data in sync if the app is open in two tabs.
window.addEventListener("storage", (e) => { if (e.key === KEY) { db = load(); render(); } });

render();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
}
