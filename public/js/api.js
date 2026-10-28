import { store } from "./store.js";

import { buildSystemPrompt, JSON_MODES } from "./prompts.js";
import { focusTopics } from "./topics.js";

// Streams the tutor's answer. onText(fullTextSoFar) is called as text arrives.
// messages use one shape everywhere: {role: "user"|"assistant", content: string | [{type:"text"|"image", ...}]}
export async function askTutor({ mode, subject, messages, onText, signal }) {
  const focus = focusTopics(subject);
  if (store.settings.provider === "claude") return askClaudeServer({ mode, subject, messages, focus, onText, signal });
  return askGemini({ mode, subject, messages, focus, onText, signal });
}

// ---------- Gemini (free tier, called straight from the device) ----------
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content).map((p) =>
      p.type === "image"
        ? { inlineData: { mimeType: p.source.media_type, data: p.source.data } }
        : { text: p.text || " " }),
  }));
}

function geminiCandidates() {
  const { geminiModel, geminiModels } = store.settings;
  const list = [geminiModel, ...(geminiModels || []), ...FALLBACK_MODELS].filter(Boolean);
  return [...new Set(list)].slice(0, 4);
}

async function askGemini({ mode, subject, messages, focus, onText, signal }) {
  const key = store.settings.geminiKey;
  if (!key) throw new Error("חסר מפתח Gemini – הכניסי אותו בהגדרות ⚙︎");
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: buildSystemPrompt(mode, subject, focus) }] },
    contents: toGeminiContents(messages),
    generationConfig: {
      maxOutputTokens: 32768,
      ...(JSON_MODES.has(mode) ? { responseMimeType: "application/json" } : {}),
    },
  });

  let lastErr;
  // If one model is out of free quota or missing, try the next one (each has its own quota).
  for (const model of geminiCandidates()) {
    const res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body,
      signal,
    });
    if (!res.ok) {
      lastErr = await geminiError(res);
      if ([404, 429, 500, 503].includes(res.status)) continue;
      throw lastErr;
    }
    return readGeminiStream(res, onText);
  }
  throw lastErr || new Error("אין מודל זמין");
}

async function geminiError(res) {
  let msg = "", status = "";
  try { const j = await res.json(); msg = j.error?.message || ""; status = j.error?.status || ""; } catch {}
  const he =
    res.status === 400 && /API key/i.test(msg) ? "מפתח Gemini לא תקין – בדקי אותו בהגדרות" :
    res.status === 402 ? "לפרויקט של המפתח הזה בגוגל אין יתרה (מסלול Prepaid). צריך מפתח מפרויקט חינמי בלי חיוב, או להטעין קרדיט ב-AI Studio" :
    res.status === 403 ? "למפתח אין הרשאה ל-Gemini API" :
    res.status === 429 && /prepay/i.test(msg) ? "לפרויקט של המפתח הזה בגוגל אין יתרה. צריך מפתח מפרויקט חינמי בלי חיוב" :
    res.status === 429 ? "נגמרה המכסה החינמית של Gemini כרגע – נסי שוב בעוד דקה (או מחר)" :
    res.status === 404 ? "המודל לא נמצא – לחצי \"בדיקת חיבור\" בהגדרות" :
    res.status >= 500 ? "Gemini עמוס כרגע – נסי שוב" :
    `שגיאה מ-Gemini (${res.status}${status ? " " + status : ""})`;
  const e = new Error(he);
  e.status = res.status;
  return e;
}

async function readGeminiStream(res, onText) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "", finish = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const ev = JSON.parse(line.slice(5));
      if (ev.error) throw new Error(ev.error.message || "שגיאה מ-Gemini");
      if (ev.promptFeedback?.blockReason) throw new Error("Gemini חסם את הבקשה – נסי לנסח אחרת");
      const c = ev.candidates?.[0];
      for (const p of c?.content?.parts || []) {
        if (p.text && !p.thought) { full += p.text; onText?.(full); }
      }
      if (c?.finishReason) finish = c.finishReason;
    }
  }
  if (!full && finish === "SAFETY") throw new Error("Gemini חסם את התשובה – נסי לנסח אחרת");
  if (!full) throw new Error("לא התקבלה תשובה מ-Gemini – נסי שוב");
  return full;
}

// Lists the models this key can use and picks the best free one.
export async function checkGeminiKey(key) {
  const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  if (!res.ok) throw await geminiError(res);
  const { models = [] } = await res.json();
  const ids = models
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((id) => /^gemini-/.test(id) && !/(image|tts|audio|live|embedding|vision|robotics|computer|native|exp-\d|learnlm)/.test(id));
  const score = (id) => {
    const v = parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    // Flash first (free tier), then Flash-Lite, then Pro (often paid-only); newest version within each.
    const kind = /flash-lite/.test(id) ? 2 : /flash/.test(id) ? 3 : /pro/.test(id) ? 1 : 0;
    const stable = /preview|exp/.test(id) ? 0 : 0.5;
    const alias = /latest/.test(id) ? -0.2 : 0;
    return kind * 1000 + v * 10 + stable + alias;
  };
  return ids.sort((a, b) => score(b) - score(a));
}

// ---------- Claude (optional, through the Netlify server) ----------
async function askClaudeServer({ mode, subject, messages, focus, onText, signal }) {
  const res = await fetch("api/tutor", {
    method: "POST",
    headers: { "content-type": "application/json", "x-access-code": store.settings.accessCode || "" },
    body: JSON.stringify({ mode, subject, messages, focus }),
    signal,
  });
  if (!res.ok) {
    let msg = `שגיאה ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    if (res.status === 401) msg += " – הכניסי קוד גישה בהגדרות";
    if (res.status === 404) msg = "שרת Claude לא מותקן באתר הזה – בהגדרות בחרי Gemini";
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

// Build a user message from text + images ({data, mediaType}).
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

// LaTeX commands that start like a JSON escape (\frac looks like \f + "rac").
const LATEX_AFTER_ESCAPE = /^(?:frac|forall|flat|theta|tan|tanh|times|text|textbf|tau|to|tfrac|top|triangle|tilde|therefore|neq|ne|nabla|nu|not|ni|newline|beta|bar|binom|bmod|bot|boxed|bf|big|Big|because|rho|right|rightarrow|Rightarrow|rangle|rm|rfloor|rceil)(?![a-zA-Z])/;

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
    if ("bfnrt".includes(n) && n !== "" && LATEX_AFTER_ESCAPE.test(s.slice(i + 1, i + 12))) { out += "\\\\" + n; i++; continue; }
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
