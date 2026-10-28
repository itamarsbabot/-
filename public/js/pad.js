// Handwriting pad for Apple Pencil (pressure-sensitive) with palm rejection.
import { h } from "./render.js";
import { store } from "./store.js";

const COLORS = [
  ["#111827", "שחור"],
  ["#2563eb", "כחול"],
  ["#dc2626", "אדום"],
  ["#059669", "ירוק"],
];

export class PencilPad {
  constructor({ height = 360 } = {}) {
    this.strokes = [];
    this.redoStack = [];
    this.color = COLORS[0][0];
    this.size = 2.4;
    this.eraser = false;
    this.penOnly = store.settings.penOnly;
    this.height = height;
    this.current = null;

    this.canvas = h("canvas", { class: "pad-canvas", "aria-label": "משטח כתיבה בעט" });
    this.wrap = h("div", { class: "pad-wrap grid" }, this.canvas);
    this.el = h("div", { class: "pad" }, this.toolbar(), this.wrap,
      h("button", { class: "pad-more", type: "button", onclick: () => this.grow() }, "＋ עוד מקום לכתיבה"));

    this.ctx = this.canvas.getContext("2d");
    this.bind();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.wrap);
  }

  toolbar() {
    const colorBtns = COLORS.map(([c, name]) => {
      const b = h("button", { type: "button", class: "swatch", style: `--c:${c}`, "aria-label": name, title: name,
        onclick: () => { this.color = c; this.eraser = false; this.syncTools(); } });
      b.dataset.color = c;
      return b;
    });
    this.eraserBtn = h("button", { type: "button", class: "tool", title: "מחק", onclick: () => { this.eraser = !this.eraser; this.syncTools(); } }, "⌫ מחק");
    this.sizeBtn = h("button", { type: "button", class: "tool", title: "עובי", onclick: () => {
      this.size = this.size < 2 ? 2.4 : this.size < 3 ? 4 : 1.4; this.syncTools(); } }, "");
    this.penOnlyBtn = h("button", { type: "button", class: "tool", title: "כשמופעל – רק העט כותב, כף היד לא מלכלכת",
      onclick: () => { this.penOnly = !this.penOnly; store.setSetting("penOnly", this.penOnly); this.syncTools(); } }, "");
    this.colorBtns = colorBtns;
    const bar = h("div", { class: "pad-bar" },
      ...colorBtns, this.sizeBtn, this.eraserBtn,
      h("button", { type: "button", class: "tool", title: "בטל", onclick: () => this.undo() }, "↶"),
      h("button", { type: "button", class: "tool", title: "בצע שוב", onclick: () => this.redo() }, "↷"),
      h("button", { type: "button", class: "tool", title: "משבצות", onclick: () => this.wrap.classList.toggle("grid") }, "▦"),
      h("button", { type: "button", class: "tool danger", title: "נקה הכל", onclick: () => { if (!this.isEmpty() && confirm("למחוק את כל הכתוב?")) this.clear(); } }, "נקה"),
      this.penOnlyBtn,
    );
    queueMicrotask(() => this.syncTools());
    return bar;
  }

  syncTools() {
    for (const b of this.colorBtns) b.classList.toggle("on", !this.eraser && b.dataset.color === this.color);
    this.eraserBtn.classList.toggle("on", this.eraser);
    this.sizeBtn.textContent = this.size < 2 ? "✎ דק" : this.size < 3 ? "✎ רגיל" : "✎ עבה";
    this.penOnlyBtn.textContent = this.penOnly ? "✋ עט בלבד" : "☝︎ גם אצבע";
    this.penOnlyBtn.classList.toggle("on", this.penOnly);
    // Pen-only: fingers scroll the page, the pencil writes. Otherwise everything writes.
    this.canvas.style.touchAction = this.penOnly ? "pan-x pan-y" : "none";
  }

  bind() {
    const c = this.canvas;
    // Stop iOS text-selection loupe / scribble while writing.
    c.addEventListener("touchstart", (e) => { if (!this.penOnly || [...e.touches].some((t) => t.touchType === "stylus")) e.preventDefault(); }, { passive: false });
    c.addEventListener("pointerdown", (e) => this.down(e));
    c.addEventListener("pointermove", (e) => this.move(e));
    c.addEventListener("pointerup", (e) => this.up(e));
    c.addEventListener("pointercancel", (e) => this.up(e));
    c.addEventListener("pointerleave", (e) => this.up(e));
  }

  accept(e) {
    if (e.pointerType === "pen" || e.pointerType === "mouse") return true;
    return !this.penOnly;
  }

  pt(e) {
    const r = this.canvas.getBoundingClientRect();
    const p = e.pointerType === "pen" ? (e.pressure || 0.5) : 0.5;
    return { x: e.clientX - r.left, y: e.clientY - r.top, p };
  }

  down(e) {
    if (!this.accept(e)) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.current = { id: e.pointerId, color: this.color, size: this.eraser ? 18 : this.size, eraser: this.eraser, points: [this.pt(e)] };
    this.strokes.push(this.current);
    this.redoStack = [];
    this.drawStroke(this.current);
  }

  move(e) {
    if (!this.current || e.pointerId !== this.current.id) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const s = this.current;
    for (const ev of evs.length ? evs : [e]) s.points.push(this.pt(ev));
    this.drawTail(s, evs.length || 1);
  }

  up(e) {
    if (!this.current || e.pointerId !== this.current.id) return;
    this.current = null;
    this.el.dispatchEvent(new Event("change"));
  }

  width(s, p) {
    return s.eraser ? s.size : s.size * (0.55 + p.p * 0.9);
  }

  segment(s, a, b) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = s.eraser ? "destination-out" : "source-over";
    ctx.strokeStyle = s.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = this.width(s, b);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  drawStroke(s) {
    const pts = s.points;
    if (pts.length === 1) this.segment(s, pts[0], { ...pts[0], x: pts[0].x + 0.01 });
    for (let i = 1; i < pts.length; i++) this.segment(s, pts[i - 1], pts[i]);
  }

  drawTail(s, n) {
    const pts = s.points;
    for (let i = Math.max(1, pts.length - n); i < pts.length; i++) this.segment(s, pts[i - 1], pts[i]);
  }

  redrawAll() {
    const dpr = window.devicePixelRatio || 1;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of this.strokes) this.drawStroke(s);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.wrap.clientWidth;
    if (!w) return;
    this.wrap.style.height = this.height + "px";
    this.canvas.style.width = w + "px";
    this.canvas.style.height = this.height + "px";
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.redrawAll();
  }

  grow() { this.height += 280; this.resize(); }
  undo() { if (this.strokes.length) { this.redoStack.push(this.strokes.pop()); this.redrawAll(); } }
  redo() { if (this.redoStack.length) { this.strokes.push(this.redoStack.pop()); this.redrawAll(); } }
  clear() { this.strokes = []; this.redoStack = []; this.redrawAll(); this.el.dispatchEvent(new Event("change")); }
  isEmpty() { return !this.strokes.some((s) => !s.eraser); }

  // Export only the written area, on white, as PNG base64.
  toImage(maxW = 1400) {
    if (this.isEmpty()) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of this.strokes) if (!s.eraser) for (const p of s.points) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    const m = 24;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
    x1 = Math.min(this.canvas.clientWidth, x1 + m); y1 = Math.min(this.height, y1 + m);
    const w = x1 - x0, hgt = y1 - y0;
    const scale = Math.min(2, maxW / w);
    const out = document.createElement("canvas");
    out.width = Math.round(w * scale);
    out.height = Math.round(hgt * scale);
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    const dpr = window.devicePixelRatio || 1;
    ctx.drawImage(this.canvas, x0 * dpr, y0 * dpr, w * dpr, hgt * dpr, 0, 0, out.width, out.height);
    const url = out.toDataURL("image/png");
    return { mediaType: "image/png", data: url.split(",")[1], preview: url };
  }

  destroy() { this.ro.disconnect(); }
}
