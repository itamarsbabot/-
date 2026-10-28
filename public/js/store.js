// Everything is saved on the device (localStorage). Wrapped in try/catch for private mode.
const KEY = "liya-tutor.v1";

const DEFAULTS = {
  settings: { name: "ליה", accessCode: "", subject: "math", penOnly: true, theme: "", provider: "gemini", geminiKey: "", geminiModel: "", geminiModels: [] },
  syllabus: {}, // topicId -> "learning" | "done"
  practice: [], // {ts, subject, topic, difficulty, score}
  tests: [],    // {ts, subject, kind, title, total, max, summary, weak_topics}
  chats: {},    // "tutor:math" -> [{role, text}]
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings, ...s.settings }, syllabus: s.syllabus || {} };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded: drop oldest chat messages and retry once.
    for (const k of Object.keys(state.chats)) state.chats[k] = state.chats[k].slice(-20);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* give up quietly */ }
  }
}

export const store = {
  get settings() { return state.settings; },
  setSetting(k, v) { state.settings[k] = v; save(); },
  get subject() { return state.settings.subject; },

  addPractice(r) { state.practice.push({ ts: Date.now(), ...r }); save(); },
  addTest(r) { state.tests.push({ ts: Date.now(), ...r }); save(); },
  get practice() { return state.practice; },
  get tests() { return state.tests; },

  getChat(key) { return state.chats[key] || []; },
  setChat(key, msgs) {
    // Images are not stored (too big) – only a marker.
    state.chats[key] = msgs.slice(-60).map((m) => ({ role: m.role, text: m.text, hadImage: m.hadImage || !!(m.images && m.images.length) }));
    save();
  },
  clearChat(key) { delete state.chats[key]; save(); },

  topicState(id) { return state.syllabus[id] || ""; },
  setTopicState(id, v) { if (v) state.syllabus[id] = v; else delete state.syllabus[id]; save(); },

  resetProgress() { state.practice = []; state.tests = []; save(); },
  exportData() { return JSON.stringify({ ...state, settings: { ...state.settings, geminiKey: "", accessCode: "" } }, null, 2); },
};
