// Voice: read answers aloud (speechSynthesis) and dictate questions (SpeechRecognition).
// Both are built into Safari on iPad/iPhone – no extra cost.

const synth = window.speechSynthesis;
let heVoice = null;
let current = null; // { button, onEnd }

function pickVoice() {
  if (!synth) return;
  const voices = synth.getVoices();
  heVoice = voices.find((v) => /^he/i.test(v.lang) && /premium|enhanced/i.test(v.name))
    || voices.find((v) => /^he/i.test(v.lang)) || null;
}
if (synth) {
  pickVoice();
  synth.addEventListener?.("voiceschanged", pickVoice);
}

export const canSpeak = !!synth;

// iOS only allows speech that starts from a tap. Call this inside a tap handler once.
export function unlockSpeech() {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  synth.speak(u);
}

// LaTeX + Markdown → something that sounds right in Hebrew.
const SAY = [
  [/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, " $1 חלקי $2 "],
  [/\\sqrt\[(\d+)\]\{([^{}]*)\}/g, " שורש מסדר $1 של $2 "],
  [/\\sqrt\{([^{}]*)\}/g, " שורש של $1 "],
  [/\^\{?2\}?/g, " בריבוע "], [/\^\{?3\}?/g, " בשלישית "],
  [/\^\{([^{}]*)\}/g, " בחזקת $1 "], [/\^(\w)/g, " בחזקת $1 "],
  [/_\{([^{}]*)\}/g, " $1 "], [/_(\w)/g, " $1 "],
  [/\\(?:cdot|times)/g, " כפול "], [/\\div/g, " חלקי "], [/\\pm/g, " פלוס מינוס "],
  [/\\(?:leq|le)\b/g, " קטן או שווה "], [/\\(?:geq|ge)\b/g, " גדול או שווה "], [/\\(?:neq|ne)\b/g, " שונה מ "],
  [/\\approx/g, " בערך "], [/\\infty/g, " אינסוף "], [/\\pi/g, " פאי "], [/\\theta/g, " תטא "],
  [/\\alpha/g, " אלפא "], [/\\beta/g, " בטא "], [/\\Delta/g, " דלתא "], [/\\mu/g, " מיו "], [/\\omega/g, " אומגה "],
  [/\\(?:Rightarrow|implies)/g, " ולכן "], [/\\(?:to|rightarrow)/g, " שואף ל "], [/\\vec\{([^{}]*)\}/g, " וקטור $1 "],
  [/\\(?:sin|cos|tan|log|ln)/g, (m) => " " + m.slice(1) + " "],
  [/\\text\{([^{}]*)\}/g, " $1 "], [/\\(?:left|right|,|;|!|quad|qquad)/g, " "],
  [/\\[a-zA-Z]+/g, " "], [/[{}]/g, " "],
  [/=/g, " שווה "], [/</g, " קטן מ "], [/>/g, " גדול מ "], [/\+/g, " פלוס "],
  [/(\d)\s*-\s*(\d)/g, "$1 מינוס $2"], [/(^|\s)-(\s*\w)/g, "$1 מינוס $2"],
  [/≤/g, " קטן או שווה "], [/≥/g, " גדול או שווה "], [/≠/g, " שונה מ "], [/√/g, " שורש "], [/²/g, " בריבוע "], [/π/g, " פאי "],
];

export function toSpeech(md) {
  let s = String(md)
    .replace(/```(?:plot|svg)[\s\S]*?(```|$)/g, " (ראי את השרטוט) ")
    .replace(/```[\s\S]*?(```|$)/g, " ");
  // only rewrite symbols inside math, so normal Hebrew text stays untouched
  s = s.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, a, b) => {
    let m = a ?? b;
    for (const [re, rep] of SAY) m = m.replace(re, rep);
    return ` ${m} `;
  });
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>#|~]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function stopSpeaking() {
  if (!synth) return;
  synth.cancel();
  if (current) { current.button?.classList.remove("on"); current.onEnd?.(); current = null; }
}

export function isSpeaking(button) {
  return current && current.button === button;
}

// Speak a Markdown answer. Long text is split into sentences (iOS cuts long utterances).
export function speak(md, { button, onEnd } = {}) {
  if (!synth) return false;
  stopSpeaking();
  const text = toSpeech(md);
  const chunks = text.match(/[^.!?\n:]+[.!?\n:]*/g)?.map((c) => c.trim()).filter(Boolean) || [];
  if (!chunks.length) return false;
  current = { button, onEnd };
  button?.classList.add("on");
  const me = current;
  chunks.forEach((c, i) => {
    const u = new SpeechSynthesisUtterance(c);
    u.lang = "he-IL";
    if (heVoice) u.voice = heVoice;
    u.rate = 1;
    if (i === chunks.length - 1) u.onend = () => { if (current === me) { button?.classList.remove("on"); current = null; onEnd?.(); } };
    synth.speak(u);
  });
  return true;
}

// ---------- dictation ----------
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!Rec;

// Starts listening; onText(text, final) gets the transcript. Returns a stop() function.
export function listen({ onText, onEnd, onError }) {
  const r = new Rec();
  r.lang = "he-IL";
  r.interimResults = true;
  r.continuous = false;
  let finalText = "";
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t; else interim += t;
    }
    onText?.(finalText + interim, false);
  };
  r.onerror = (e) => onError?.(e.error);
  r.onend = () => onEnd?.(finalText.trim());
  r.start();
  return () => { try { r.stop(); } catch {} };
}
