// Markdown + LaTeX rendering. Math and visuals are cut out before Markdown so marked can't mangle them.
import { renderVisual } from "./visual.js";
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function renderRich(text = "") {
  const math = [];
  const keep = (tex, display) => {
    math.push({ tex, display });
    return `\u0000M${math.length - 1}\u0000`;
  };
  const visuals = [];
  let s = text
    // finished ```plot / ```svg blocks → placeholders; an unfinished one (still streaming) → "drawing…"
    .replace(/```(plot|svg)\s*\n?([\s\S]*?)```/g, (_, kind, body) => { visuals.push({ kind, body }); return `\n\n\u0000V${visuals.length - 1}\u0000\n\n`; })
    .replace(/```(plot|svg)[\s\S]*$/, "\n\n\u0000DRAWING\u0000")
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => keep(t, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => keep(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => keep(t, false))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, pre, t) => pre + keep(t, false));

  // While streaming, an unclosed $$ would show raw – hide it until it closes.
  s = s.replace(/\$\$[\s\S]*$/, "…");

  let html = window.marked ? window.marked.parse(s, { breaks: true }) : esc(s).replace(/\n/g, "<br>");
  html = html
    .replace(/(?:<p>)?\u0000V(\d+)\u0000(?:<\/p>)?/g, (_, i) => renderVisual(visuals[+i].kind, visuals[+i].body))
    .replace(/(?:<p>)?\u0000DRAWING\u0000(?:<\/p>)?/g, '<div class="visual-loading">✏️ מציירת שרטוט…</div>');
  html = html.replace(/\u0000M(\d+)\u0000/g, (_, i) => {
    const { tex, display } = math[+i];
    if (!window.katex) return `<code dir="ltr">${esc(tex)}</code>`;
    const out = window.katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore" });
    return display ? `<div class="math-block" dir="ltr">${out}</div>` : `<span class="math" dir="ltr">${out}</span>`;
  });
  return html;
}

export function setRich(el, text) {
  el.innerHTML = renderRich(text);
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(msg, ms = 3000) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), ms);
}
