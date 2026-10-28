// Markdown + LaTeX rendering. Math is cut out before Markdown so marked can't mangle it.
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function renderRich(text = "") {
  const math = [];
  const keep = (tex, display) => {
    math.push({ tex, display });
    return `\u0000M${math.length - 1}\u0000`;
  };
  let s = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => keep(t, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => keep(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => keep(t, false))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, pre, t) => pre + keep(t, false));

  // While streaming, an unclosed $$ would show raw – hide it until it closes.
  s = s.replace(/\$\$[\s\S]*$/, "…");

  let html = window.marked ? window.marked.parse(s, { breaks: true }) : esc(s).replace(/\n/g, "<br>");
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
