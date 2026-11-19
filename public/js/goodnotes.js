// GoodNotes (and any notes app) via the iPad share sheet:
//   exportPDF()  – turns lessons, questions and exams into an A4 PDF and opens "Share",
//                  where she picks GoodNotes (or "Save to Files").
//   fileToAttachment() – reads a photo or a PDF exported from GoodNotes, for the tutor.
import { h, renderRich, toast } from "./render.js";
import { fileToImage } from "./api.js";

const A4 = { w: 595.28, h: 841.89 };   // PDF points
const PAGE_W = 794;                    // CSS px of the page we draw (A4 at 96 dpi)
const PAGE_H = Math.round(PAGE_W * A4.h / A4.w);
const SCALE = 2;                       // render sharper than the screen
const MARGIN = 40;                     // px of white at the top/bottom of each page

let h2cLoading = null;
function loadRenderer() {
  if (window.html2canvas) return Promise.resolve();
  h2cLoading ||= new Promise((ok, bad) => {
    const s = document.createElement("script");
    s.src = "vendor/html2canvas-pro.min.js";
    s.onload = ok;
    s.onerror = () => { h2cLoading = null; bad(new Error("load")); };
    document.head.append(s);
  });
  return h2cLoading;
}

// ---------- building the printable page ----------
// blocks: [{ title?, md?, html?, answerSpace?: number (px of empty lines), meta? }]
function buildDoc(title, blocks) {
  const date = new Date().toLocaleDateString("he-IL");
  const doc = h("div", { class: "pdf-doc", dir: "rtl" },
    h("header", { class: "pdf-head pdf-block" },
      h("h1", {}, title),
      h("div", { class: "pdf-sub" }, `${date} · המורה של ליה`)));
  for (const b of blocks) {
    const el = h("section", { class: "pdf-block" + (b.boxed ? " pdf-box" : "") });
    if (b.title) el.append(h("h2", {}, b.title));
    if (b.meta) el.append(h("div", { class: "pdf-meta" }, b.meta));
    if (b.md) el.append(h("div", { class: "pdf-md", html: renderRich(b.md) }));
    if (b.html) el.append(h("div", { class: "pdf-md", html: b.html }));
    if (b.answerSpace) el.append(h("div", { class: "pdf-lines", style: `height:${b.answerSpace}px` }));
    doc.append(el);
  }
  return doc;
}

// Where it is safe to cut a page: between blocks, paragraphs, list items, formulas.
function breakPoints(doc) {
  const top = doc.getBoundingClientRect().top;
  const ys = new Set([0]);
  doc.querySelectorAll(".pdf-block, .pdf-md > *, .pdf-md li, .math-block, figure, .pdf-lines").forEach((el) => {
    const r = el.getBoundingClientRect();
    ys.add(Math.round(r.bottom - top));
    ys.add(Math.round(r.top - top));
  });
  return [...ys].sort((a, b) => a - b);
}

function pageSlices(totalH, points) {
  const slices = [];
  let start = 0;
  while (start < totalH - 2) {
    // page 1 already has the document's own top padding; later pages get a top margin
    const room = PAGE_H - MARGIN - (slices.length ? MARGIN : 0);
    const limit = start + room;
    if (limit >= totalH) { slices.push([start, totalH]); break; }
    // last safe cut in the lower half of the page; otherwise a hard cut
    const cut = points.filter((y) => y > start + room * 0.5 && y <= limit).pop() ?? limit;
    slices.push([start, cut]);
    start = cut;
  }
  return slices;
}

// ---------- a tiny PDF writer: one JPEG per page ----------
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function makePDF(pages) { // pages: [{ jpeg: Uint8Array, w, h (px), fill and top (0..1 of page height) }]
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let len = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };

  push("%PDF-1.4\n%âã\n");
  const n = pages.length;
  // 1 catalog, 2 pages, then per page: page, content, image
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
  pages.forEach((p, i) => {
    const pageN = 3 + i * 3, contN = pageN + 1, imgN = pageN + 2;
    const drawH = (A4.h * p.fill).toFixed(2);
    const y = (A4.h - A4.h * (p.top + p.fill)).toFixed(2);
    const content = `q ${A4.w.toFixed(2)} 0 0 ${drawH} 0 ${y} cm /Im0 Do Q`;
    obj(pageN, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${contN} 0 R >>`));
    obj(contN, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(imgN, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push("\nendstream");
    });
  });
  const xref = len;
  const total = 3 + n * 3;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

// ---------- public: export + share ----------
export async function exportPDF(title, blocks, { fileName } = {}) {
  toast("מכינה PDF…", 6000);
  await loadRenderer();
  const doc = buildDoc(title, blocks);
  const host = h("div", { class: "pdf-host", "aria-hidden": "true" }, doc);
  document.body.append(host);
  try {
    await document.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const totalH = Math.ceil(doc.scrollHeight);
    const canvas = await window.html2canvas(doc, { scale: SCALE, backgroundColor: "#ffffff", width: PAGE_W, windowWidth: PAGE_W, logging: false, useCORS: true });
    const pages = pageSlices(totalH, breakPoints(doc)).map(([a, b], i) => {
      const c = document.createElement("canvas");
      c.width = PAGE_W * SCALE;
      c.height = Math.max(1, Math.round((b - a) * SCALE));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(canvas, 0, a * SCALE, c.width, c.height, 0, 0, c.width, c.height);
      const jpeg = b64ToBytes(c.toDataURL("image/jpeg", 0.88).split(",")[1]);
      return { jpeg, w: c.width, h: c.height, fill: (b - a) / PAGE_H, top: i ? MARGIN / PAGE_H : 0 };
    });
    const blob = makePDF(pages);
    const name = (fileName || title).replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) + ".pdf";
    await sharePDF(blob, name, title);
    return blob;
  } catch (e) {
    if (e?.name !== "AbortError") { console.error(e); toast("לא הצלחתי ליצור את ה-PDF – נסי שוב", 5000); }
  } finally {
    host.remove();
  }
}

async function sharePDF(blob, name, title) {
  const file = new File([blob], name, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // she closed the share sheet
    }
  }
  // Fallback: download / open the PDF (from there: Share → GoodNotes).
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast("ה-PDF הורד. פתחי אותו ובחרי שיתוף ← GoodNotes", 6000);
}

// Button used across the app.
export function goodnotesButton(label, build) {
  const b = h("button", { type: "button", class: "btn small ghost gn-btn", title: "שליחה ל-GoodNotes כ-PDF" }, label || "📤 ל-GoodNotes");
  b.addEventListener("click", async () => {
    if (b.disabled) return;
    b.disabled = true;
    try {
      const { title, blocks, fileName } = build();
      await exportPDF(title, blocks, { fileName });
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

// ---------- import: photo or PDF (e.g. a page exported from GoodNotes) ----------
const MAX_PDF = 15 * 1024 * 1024;

export async function fileToAttachment(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF) throw new Error("הקובץ גדול מדי (עד 15MB). ייצאי רק את הדפים הרלוונטיים");
    const data = await new Promise((ok, bad) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = bad;
      r.readAsDataURL(file);
    });
    return { mediaType: "application/pdf", data, name: file.name, pdf: true };
  }
  return fileToImage(file);
}

export const ATTACH_ACCEPT = "image/*,application/pdf,.pdf";
