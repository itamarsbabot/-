// Visual explanations inside tutor answers:
//   ```plot  {JSON}  ```  → accurate function graph drawn here (safe expression parser, no eval)
//   ```svg   <svg>…  ```  → diagram drawn by the tutor (sanitized)

// ---------- safe math expression parser ----------
const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp,
  floor: Math.floor, ceil: Math.ceil, sign: Math.sign,
};
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const s = src.replace(/\*\*/g, "^").replace(/π/g, "pi").replace(/·|×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/²/g, "^2").replace(/³/g, "^3").replace(/√/g, "sqrt");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^\d*\.?\d+(?:e[+-]?\d+)?/i);
      if (!m) throw new Error("bad number");
      out.push({ t: "num", v: parseFloat(m[0]) }); i += m[0].length; continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      const m = s.slice(i).match(/^[a-zA-Z]+/)[0];
      // split things like "xsin" or "pix" greedily into known names
      let rest = m;
      while (rest) {
        const name = Object.keys(FUNCS).concat(Object.keys(CONSTS)).sort((a, b) => b.length - a.length).find((n) => rest.startsWith(n));
        if (name) { out.push({ t: FUNCS[name] ? "fn" : "const", v: name }); rest = rest.slice(name.length); }
        else { out.push({ t: "var", v: rest[0] }); rest = rest.slice(1); }
      }
      i += m.length; continue;
    }
    if ("+-*/^(),|".includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error("bad char " + c);
  }
  // implicit multiplication: 2x, 2(x), x(x), )( , )x, x pi
  const res = [];
  for (const tk of out) {
    const prev = res[res.length - 1];
    const prevEnds = prev && (prev.t === "num" || prev.t === "var" || prev.t === "const" || prev.t === ")");
    const curStarts = tk.t === "num" || tk.t === "var" || tk.t === "const" || tk.t === "fn" || tk.t === "(";
    if (prevEnds && curStarts && !(prev.t === "num" && tk.t === "num")) res.push({ t: "*" });
    res.push(tk);
  }
  return res;
}

export function compile(src) {
  const tk = tokenize(String(src));
  let p = 0;
  const peek = () => tk[p];
  const eat = (t) => { if (tk[p]?.t !== t) throw new Error("expected " + t); p++; };
  // expr := term (('+'|'-') term)*
  function expr() {
    let n = term();
    while (peek() && (peek().t === "+" || peek().t === "-")) { const op = tk[p++].t; const r = term(); const l = n; n = op === "+" ? (v) => l(v) + r(v) : (v) => l(v) - r(v); }
    return n;
  }
  function term() {
    let n = unary();
    while (peek() && (peek().t === "*" || peek().t === "/")) { const op = tk[p++].t; const r = unary(); const l = n; n = op === "*" ? (v) => l(v) * r(v) : (v) => l(v) / r(v); }
    return n;
  }
  function unary() {
    if (peek()?.t === "-") { p++; const n = unary(); return (v) => -n(v); }
    if (peek()?.t === "+") { p++; return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (peek()?.t === "^") { p++; const ex = unary(); return (v) => Math.pow(base(v), ex(v)); }
    return base;
  }
  function atom() {
    const t = tk[p++];
    if (!t) throw new Error("unexpected end");
    if (t.t === "num") return () => t.v;
    if (t.t === "const") return () => CONSTS[t.v];
    if (t.t === "var") return (v) => v[t.v] ?? v.x;
    if (t.t === "fn") {
      const f = FUNCS[t.v];
      if (peek()?.t === "(") { p++; const a = expr(); eat(")"); return (v) => f(a(v)); }
      const a = power(); return (v) => f(a(v));
    }
    if (t.t === "(") { const n = expr(); eat(")"); return n; }
    if (t.t === "|") { const n = expr(); eat("|"); return (v) => Math.abs(n(v)); }
    throw new Error("unexpected " + t.t);
  }
  const fn = expr();
  if (p !== tk.length) throw new Error("trailing input");
  return fn;
}

// ---------- function plotter ----------
const COLORS = ["#4f46e5", "#dc2626", "#059669", "#d97706", "#0e7490", "#9333ea"];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function niceStep(range) {
  const raw = range / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

export function plotSVG(spec) {
  const W = 560, H = 380, P = 34;
  const variable = spec.var || "x";
  const fns = (spec.functions || []).map((f, i) => {
    const o = typeof f === "string" ? { f } : f;
    return { ...o, color: o.color || COLORS[i % COLORS.length], fn: compile(o.f) };
  });
  let [x0, x1] = spec.x || [-6, 6];
  if (!(x1 > x0)) [x0, x1] = [-6, 6];

  // sample
  const N = 500;
  const series = fns.map((f) => {
    const pts = [];
    const lo = f.domain?.[0] ?? x0, hi = f.domain?.[1] ?? x1;
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N;
      if (x < lo || x > hi) { pts.push(null); continue; }
      let y;
      try { y = f.fn({ [variable]: x, x }); } catch { y = NaN; }
      pts.push(Number.isFinite(y) ? [x, y] : null);
    }
    return pts;
  });

  let [y0, y1] = spec.y || [NaN, NaN];
  if (!(y1 > y0)) {
    const ys = series.flat().filter(Boolean).map((p) => p[1]).concat((spec.points || []).map((p) => p.y)).sort((a, b) => a - b);
    if (ys.length) {
      const q = (k) => ys[Math.min(ys.length - 1, Math.max(0, Math.floor(k * (ys.length - 1))))];
      y0 = Math.min(q(0.02), 0); y1 = Math.max(q(0.98), 0);
      const pad = (y1 - y0 || 2) * 0.12; y0 -= pad; y1 += pad;
    } else { y0 = -6; y1 = 6; }
  }
  const X = (x) => P + ((x - x0) / (x1 - x0)) * (W - 2 * P);
  const Y = (y) => H - P - ((y - y0) / (y1 - y0)) * (H - 2 * P);

  const parts = [];
  // grid + ticks
  const sx = niceStep(x1 - x0), sy = niceStep(y1 - y0);
  const fmt = (v) => String(Math.round(v * 1000) / 1000);
  for (let gx = Math.ceil(x0 / sx) * sx; gx <= x1 + 1e-9; gx += sx) {
    parts.push(`<line class="g" x1="${X(gx)}" y1="${P}" x2="${X(gx)}" y2="${H - P}"/>`);
    if (Math.abs(gx) > 1e-9) parts.push(`<text class="tk" x="${X(gx)}" y="${Math.min(H - P, Math.max(P, Y(0))) + 14}" text-anchor="middle">${fmt(gx)}</text>`);
  }
  for (let gy = Math.ceil(y0 / sy) * sy; gy <= y1 + 1e-9; gy += sy) {
    parts.push(`<line class="g" x1="${P}" y1="${Y(gy)}" x2="${W - P}" y2="${Y(gy)}"/>`);
    if (Math.abs(gy) > 1e-9) parts.push(`<text class="tk" x="${Math.min(W - P, Math.max(P, X(0))) - 5}" y="${Y(gy) + 4}" text-anchor="end">${fmt(gy)}</text>`);
  }
  // axes
  if (y0 <= 0 && y1 >= 0) parts.push(`<line class="ax" x1="${P}" y1="${Y(0)}" x2="${W - P + 8}" y2="${Y(0)}" marker-end="url(#ah)"/>`);
  if (x0 <= 0 && x1 >= 0) parts.push(`<line class="ax" x1="${X(0)}" y1="${H - P}" x2="${X(0)}" y2="${P - 8}" marker-end="url(#ah)"/>`);
  parts.push(`<text class="axl" x="${W - P + 6}" y="${Math.min(H - 6, Math.max(14, Y(0) - 8))}" text-anchor="end">${esc(spec.xlabel || variable)}</text>`);
  parts.push(`<text class="axl" x="${Math.min(W - 10, Math.max(10, X(0) + 8))}" y="${P - 10}">${esc(spec.ylabel || "y")}</text>`);

  // curves (break on gaps and jumps)
  series.forEach((pts, i) => {
    let d = "", prev = null;
    const jump = (y1 - y0) * 1.5;
    for (const pt of pts) {
      if (!pt || pt[1] < y0 - jump || pt[1] > y1 + jump) { prev = null; continue; }
      const cmd = !prev || Math.abs(pt[1] - prev[1]) > jump ? "M" : "L";
      d += `${cmd}${X(pt[0]).toFixed(1)},${Y(pt[1]).toFixed(1)}`;
      prev = pt;
    }
    parts.push(`<path d="${d}" fill="none" stroke="${esc(fns[i].color)}" stroke-width="2.4" clip-path="url(#clip)"/>`);
  });

  // segments / vectors
  for (const s of spec.segments || []) {
    const [a, b] = [s.from || [0, 0], s.to || [0, 0]];
    parts.push(`<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="${esc(s.color || "#111827")}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="6 4"' : ""} ${s.arrow ? 'marker-end="url(#ah2)"' : ""}/>`);
    if (s.label) parts.push(`<text class="lb" x="${(X(a[0]) + X(b[0])) / 2 + 6}" y="${(Y(a[1]) + Y(b[1])) / 2 - 6}">${esc(s.label)}</text>`);
  }
  // points
  for (const pt of spec.points || []) {
    parts.push(`<circle cx="${X(pt.x)}" cy="${Y(pt.y)}" r="4.5" fill="${esc(pt.color || "#111827")}"/>`);
    if (pt.label) parts.push(`<text class="lb" x="${X(pt.x) + 7}" y="${Y(pt.y) - 8}">${esc(pt.label)}</text>`);
  }
  // legend
  fns.forEach((f, i) => {
    if (!f.label) return;
    parts.push(`<rect x="${P + 8}" y="${P + 6 + i * 20}" width="14" height="4" fill="${esc(f.color)}"/><text class="lg" x="${P + 28}" y="${P + 12 + i * 20}">${esc(f.label)}</text>`);
  });

  return `<svg class="plot" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(spec.title || "גרף")}" direction="ltr">
<defs><clipPath id="clip"><rect x="${P}" y="${P}" width="${W - 2 * P}" height="${H - 2 * P}"/></clipPath>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#374151"/></marker>
<marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#111827"/></marker></defs>
${parts.join("\n")}</svg>`;
}

// ---------- tutor-drawn SVG, sanitized ----------
const BAD_TAGS = new Set(["script", "foreignobject", "iframe", "object", "embed", "style", "image", "use", "animate", "set", "a"]);

export function sanitizeSVG(src) {
  const doc = new DOMParser().parseFromString(src, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("bad svg");
  const walk = (el) => {
    for (const child of [...el.children]) {
      if (BAD_TAGS.has(child.nodeName.toLowerCase())) { child.remove(); continue; }
      walk(child);
    }
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith("on") || ((n === "href" || n === "xlink:href") && !a.value.startsWith("#")) || /url\(\s*['"]?(?!#)/i.test(a.value) || /javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
  };
  walk(svg);
  if (!svg.getAttribute("viewBox")) {
    const w = parseFloat(svg.getAttribute("width")) || 400, hh = parseFloat(svg.getAttribute("height")) || 300;
    svg.setAttribute("viewBox", `0 0 ${w} ${hh}`);
  }
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("class", "drawn");
  return new XMLSerializer().serializeToString(svg);
}

export function renderVisual(kind, body) {
  try {
    if (kind === "plot") {
      const spec = JSON.parse(body);
      return `<figure class="visual">${plotSVG(spec)}${spec.title ? `<figcaption>${esc(spec.title)}</figcaption>` : ""}</figure>`;
    }
    return `<figure class="visual">${sanitizeSVG(body.trim())}</figure>`;
  } catch {
    return `<div class="visual-error">(השרטוט לא הצליח להיטען)</div>`;
  }
}
