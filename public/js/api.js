import { store } from "./store.js";

// Streams the tutor's answer. onText(fullTextSoFar) is called as text arrives.
export async function askTutor({ mode, subject, messages, onText, signal }) {
  const res = await fetch("api/tutor", {
    method: "POST",
    headers: { "content-type": "application/json", "x-access-code": store.settings.accessCode || "" },
    body: JSON.stringify({ mode, subject, messages }),
    signal,
  });
  if (!res.ok) {
    let msg = `שגיאה ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    if (res.status === 401) msg += " – הכניסי קוד גישה בהגדרות";
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const ev = JSON.parse(line);
      if (ev.error) throw new Error(ev.error);
      if (ev.t) { full += ev.t; onText?.(full); }
    }
  }
  return full;
}

// Build a Claude user message from text + images ({data, mediaType}).
export function userContent(text, images = []) {
  const parts = images.map((im) => ({
    type: "image",
    source: { type: "base64", media_type: im.mediaType, data: im.data },
  }));
  if (text) parts.push({ type: "text", text });
  return parts.length === 1 && parts[0].type === "text" ? text : parts;
}

// Pull a JSON object out of the model's reply, repairing un-doubled LaTeX backslashes.
export function extractJSON(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let s = fence ? fence[1] : text;
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("לא התקבלה תשובה תקינה מהמורה");
  s = repairBackslashes(s.slice(a, b + 1));
  return JSON.parse(s);
}

function repairBackslashes(s) {
  let out = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inStr) { if (c === '"') inStr = true; out += c; continue; }
    if (c === '"') { inStr = false; out += c; continue; }
    if (c !== "\\") { out += c; continue; }
    const n = s[i + 1] ?? "";
    const nn = s[i + 2] ?? "";
    if (n === "\\" || n === '"' || n === "/") { out += c + n; i++; continue; }
    if (n === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) { out += c + n; i++; continue; }
    // \frac, \theta, \neq, \beta, \rho, \times ... are LaTeX, not JSON escapes.
    if ("bfnrt".includes(n) && n !== "" && /[a-z]/.test(nn)) { out += "\\\\" + n; i++; continue; }
    if ("bfnrt".includes(n) && n !== "") { out += c + n; i++; continue; }
    out += "\\\\"; // any other backslash (\sqrt, \cdot, \alpha, \left ...)
  }
  return out;
}

// Downscale a photo/file to JPEG for upload.
export async function fileToImage(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = bad;
      im.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    return { mediaType: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
