import { h, setRich, toast } from "../render.js";
import { store } from "../store.js";
import { askTutor, userContent, extractJSON } from "../api.js";
import { Composer } from "../composer.js";
import { SUBJECTS, DIFFICULTY } from "../curriculum.js";
import { openChatWith, topicOptions } from "./chat.js";
import { pickerTopics } from "../topics.js";

export function practiceView(params = {}) {
  const subject = store.subject;
  const topics = pickerTopics(subject);
  const asked = []; // questions asked this session, to avoid repeats
  let current = null;
  let ctrl = null;
  let streak = 0;

  const last = store.practice.filter((p) => p.subject === subject).at(-1);
  let difficulty = last?.nextDifficulty || 3;

  const topicSel = h("select", { class: "select" },
    h("option", { value: "" }, "🔀 מעורב – מהנושאים שלמדנו"),
    ...topicOptions(subject));
  if (params.topic) topicSel.value = params.topic;
  else if (last?.topicChoice) topicSel.value = last.topicChoice;

  const diffLabel = h("span", { class: "diff-label" });
  const diff = h("input", { type: "range", min: 1, max: 5, step: 1, value: difficulty, class: "range", "aria-label": "דרגת קושי" });
  const syncDiff = () => { difficulty = +diff.value; diffLabel.textContent = `${difficulty} · ${DIFFICULTY[difficulty]}`; };
  diff.addEventListener("input", syncDiff);
  syncDiff();

  const stage = h("div", { class: "stage" });
  const streakEl = h("span", { class: "streak" });

  function setStreak() { streakEl.textContent = streak > 1 ? `🔥 ${streak} ברצף` : ""; }

  async function next() {
    ctrl?.abort();
    ctrl = new AbortController();
    const topic = topicSel.value || topics[Math.floor(Math.random() * topics.length)];
    stage.replaceChildren(loading("מכינה לך שאלה…"));
    const prev = asked.slice(-8).map((q, i) => `${i + 1}. ${q.slice(0, 160)}`).join("\n");
    try {
      const raw = await askTutor({
        mode: "practice-make", subject, signal: ctrl.signal,
        messages: [{ role: "user", content: `נושא: ${topic}\nדרגת קושי: ${difficulty} (${DIFFICULTY[difficulty]})${prev ? `\n\nשאלות שכבר נשאלו (אל תחזרי עליהן):\n${prev}` : ""}` }],
      });
      current = { ...extractJSON(raw), topic };
      asked.push(current.question);
      showQuestion();
    } catch (e) {
      if (e.name !== "AbortError") stage.replaceChildren(errorBox(e.message, next));
    }
  }

  function showQuestion() {
    const q = h("div", { class: "q-text" });
    setRich(q, current.question);
    const composer = new Composer({ placeholder: "התשובה שלך (אפשר גם בעט ✏️)…", padOpen: true });
    const checkBtn = h("button", { class: "btn primary", onclick: () => grade(composer, checkBtn) }, "בדקי את התשובה ✓");
    stage.replaceChildren(
      h("article", { class: "q-card" },
        h("div", { class: "q-meta" }, h("span", { class: "tag" }, current.topic), h("span", { class: "tag soft" }, `קושי ${difficulty}`)),
        q),
      composer.el,
      h("div", { class: "row" },
        checkBtn,
        h("button", { class: "btn ghost", onclick: () => openChatWith("homework", `אני עובדת על שאלת תרגול ואני תקועה:\n\n${current.question}`) }, "💬 צריכה עזרה"),
        h("button", { class: "btn ghost", onclick: () => { showSolution(); } }, "הראי פתרון"),
        h("button", { class: "btn ghost", onclick: next }, "דלגי ↻")),
    );
  }

  async function grade(composer, btn) {
    const v = composer.value();
    if (!v.text && !v.images.length) return toast("כתבי תשובה קודם");
    btn.disabled = true;
    btn.textContent = "בודקת…";
    ctrl = new AbortController();
    const prompt = `השאלה:\n${current.question}\n\nתשובה סופית רשמית: ${current.final_answer}\n\nפתרון רשמי:\n${current.solution}\n\nהתשובה של ליה${v.images.length ? " (כולל תמונה של כתב יד)" : ""}:\n${v.text || "(ראי תמונה)"}`;
    try {
      const raw = await askTutor({ mode: "practice-grade", subject, signal: ctrl.signal, messages: [{ role: "user", content: userContent(prompt, v.images) }] });
      const r = extractJSON(raw);
      const score = Math.max(0, Math.min(100, Math.round(+r.score || 0)));
      const nextD = Math.max(1, Math.min(5, Math.round(+r.next_difficulty || difficulty)));
      store.addPractice({ subject, topic: current.topic, topicChoice: topicSel.value, difficulty, score, nextDifficulty: nextD });
      streak = score >= 80 ? streak + 1 : 0;
      setStreak();
      const fb = h("div", { class: "feedback-body" });
      setRich(fb, r.feedback || "");
      stage.append(h("div", { class: `feedback ${score >= 80 ? "good" : score >= 50 ? "mid" : "bad"}` },
        h("div", { class: "score" }, `${score}`, h("small", {}, "/100")),
        fb,
        h("div", { class: "row" },
          h("button", { class: "btn primary", onclick: () => { diff.value = nextD; syncDiff(); next(); } }, `שאלה הבאה (קושי ${nextD}) ←`),
          score < 100 ? h("button", { class: "btn ghost", onclick: () => { btn.disabled = false; btn.textContent = "בדקי שוב ✓"; } }, "אנסה לתקן") : null,
          h("button", { class: "btn ghost", onclick: showSolution }, "פתרון מלא"))));
      stage.lastChild.scrollIntoView({ behavior: "smooth", block: "start" });
      btn.textContent = "נבדק";
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "בדקי את התשובה ✓";
      if (e.name !== "AbortError") toast(e.message, 5000);
    }
  }

  function showSolution() {
    if (stage.querySelector(".solution")) return;
    const s = h("div", { class: "solution" });
    setRich(s, `### פתרון\n${current.solution}\n\n**תשובה סופית:** ${current.final_answer}`);
    stage.append(s);
    s.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const el = h("section", { class: "practice" },
    h("div", { class: "view-head" }, h("h2", {}, "תרגול ", h("span", { class: "muted" }, `· ${SUBJECTS[subject].name}`)), streakEl),
    h("div", { class: "controls" },
      h("label", { class: "field" }, h("span", {}, "נושא"), topicSel),
      h("label", { class: "field" }, h("span", {}, "קושי "), diffLabel, diff),
      h("button", { class: "btn primary", onclick: next }, "שאלה חדשה ←")),
    stage);
  stage.append(h("p", { class: "muted center" }, "בחרי נושא וקושי ולחצי על \"שאלה חדשה\". הקושי מתעדכן אוטומטית לפי ההצלחה שלך."));
  return { el, cleanup: () => ctrl?.abort() };
}

export function loading(text) {
  return h("div", { class: "loading" }, h("span", { class: "spinner" }), text);
}

export function errorBox(msg, retry) {
  return h("div", { class: "bubble error" }, `⚠️ ${msg} `, retry && h("button", { class: "btn small", onclick: retry }, "נסי שוב"));
}
