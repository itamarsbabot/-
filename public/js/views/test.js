// Quiz (5 questions, 20 min) and Bagrut-style exam (4 multi-part questions, 90 min).
import { h, setRich, toast, renderRich } from "../render.js";
import { store } from "../store.js";
import { askTutor, extractJSON } from "../api.js";
import { Composer } from "../composer.js";
import { SUBJECTS } from "../curriculum.js";
import { loading, errorBox } from "./practice.js";
import { guard } from "../guard.js";

const KIND = {
  quiz: { name: "בוחן", make: "quiz-make", minutes: 20, maxTopics: 3, desc: "5 שאלות קצרות בהדרגת קושי · 20 דקות" },
  exam: { name: "מבחן בגרות", make: "exam-make", minutes: 90, maxTopics: 5, desc: "4 שאלות עם סעיפים, בסגנון שאלון בגרות 5 יח״ל · 90 דקות" },
};

export function testView(kind) {
  const K = KIND[kind];
  const subject = store.subject;
  const topics = SUBJECTS[subject].topics;
  const chosen = new Set();
  let ctrl = null;
  let timer = null;

  const root = h("section", { class: "test" });

  // ---------- setup ----------
  function setup() {
    guard.leave = null;
    const weak = weakTopics(subject);
    const chips = h("div", { class: "chips wrap" }, ...topics.map((t) => {
      const b = h("button", { type: "button", class: "chip" + (weak.includes(t) ? " weak" : ""), onclick: () => {
        if (chosen.has(t)) chosen.delete(t);
        else if (chosen.size >= K.maxTopics) return toast(`עד ${K.maxTopics} נושאים`);
        else chosen.add(t);
        b.classList.toggle("on", chosen.has(t));
      } }, t);
      b.classList.toggle("on", chosen.has(t));
      return b;
    }));
    const minutes = h("select", { class: "select" },
      ...[K.minutes, Math.round(K.minutes * 1.25), Math.round(K.minutes * 1.5), 0].map((m) =>
        h("option", { value: m }, m ? `${m} דקות` : "בלי הגבלת זמן")));
    root.replaceChildren(
      h("div", { class: "view-head" }, h("h2", {}, K.name, h("span", { class: "muted" }, ` · ${SUBJECTS[subject].name}`))),
      h("p", { class: "muted" }, K.desc),
      h("h3", {}, `בחרי עד ${K.maxTopics} נושאים`, weak.length ? h("small", { class: "muted" }, " (מסומנים בכתום – נושאים לחיזוק)") : null),
      chips,
      h("div", { class: "row" },
        h("label", { class: "field" }, h("span", {}, "זמן"), minutes),
        h("button", { class: "btn primary", onclick: () => {
          if (!chosen.size) return toast("בחרי לפחות נושא אחד");
          start([...chosen], +minutes.value);
        } }, `צרי ${K.name} ←`)),
      history(kind, subject),
    );
  }

  // ---------- generate ----------
  async function start(topicList, mins) {
    ctrl = new AbortController();
    const prog = loading(`מכינה ${K.name}… זה לוקח כדקה`);
    root.replaceChildren(prog);
    try {
      const raw = await askTutor({
        mode: K.make, subject, signal: ctrl.signal,
        messages: [{ role: "user", content: `נושאים: ${topicList.join(", ")}\nמשך: ${mins || K.minutes} דקות` }],
        onText: (t) => { prog.lastChild.textContent = `מכינה ${K.name}… (${Math.min(99, Math.round(t.length / (kind === "exam" ? 90 : 40)))}%)`; },
      });
      const test = extractJSON(raw);
      if (!test.questions?.length) throw new Error("המבחן שהתקבל ריק");
      take(test, topicList, mins);
    } catch (e) {
      if (e.name !== "AbortError") root.replaceChildren(errorBox(e.message, () => start(topicList, mins)));
    }
  }

  // ---------- take ----------
  function take(test, topicList, mins) {
    const answers = new Map(); // "qid|label" -> Composer
    const clock = h("span", { class: "clock" });
    const started = Date.now();
    guard.leave = () => confirm(`לצאת מה${K.name}? התשובות לא יישמרו.`);

    if (mins) {
      const end = started + mins * 60000;
      const tick = () => {
        const left = Math.max(0, end - Date.now());
        const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
        clock.textContent = `⏱ ${m}:${String(s).padStart(2, "0")}`;
        clock.classList.toggle("low", left < 5 * 60000);
        if (left <= 0) { clearInterval(timer); toast("הזמן נגמר! שולחת לבדיקה", 4000); submit(); }
      };
      tick();
      timer = setInterval(tick, 1000);
    } else {
      timer = setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); clock.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 1000);
    }

    const qs = test.questions.map((q, qi) => {
      const stem = h("div", { class: "q-text" });
      if (q.stem) setRich(stem, q.stem);
      const parts = (q.parts || []).map((p) => {
        const c = new Composer({ placeholder: "תשובה (הקלדה או ✏️ כתב יד)…", compact: true });
        answers.set(`${q.id}|${p.label}`, c);
        const t = h("div", { class: "q-text" });
        setRich(t, p.text);
        return h("div", { class: "part" },
          h("div", { class: "part-head" }, p.label ? h("b", {}, `${p.label}. `) : null, h("span", { class: "tag soft" }, `${p.points} נק׳`)),
          t, c.el);
      });
      return h("article", { class: "q-card" },
        h("div", { class: "q-meta" }, h("b", {}, `שאלה ${qi + 1}`), q.topic ? h("span", { class: "tag" }, q.topic) : null),
        stem, ...parts);
    });

    const submitBtn = h("button", { class: "btn primary big", onclick: () => {
      const empty = [...answers.values()].filter((c) => c.isEmpty()).length;
      if (empty && !confirm(`יש ${empty} סעיפים בלי תשובה. להגיש בכל זאת?`)) return;
      submit();
    } }, `הגשה לבדיקה ✓`);

    root.replaceChildren(
      h("div", { class: "test-bar" }, h("b", {}, test.title || K.name), clock),
      ...qs,
      h("div", { class: "row center" }, submitBtn));

    async function submit() {
      clearInterval(timer);
      guard.leave = null;
      const used = Math.round((Date.now() - started) / 60000);
      const prog = loading("בודקת את המבחן… זה יכול לקחת כדקה-שתיים");
      root.replaceChildren(prog);

      // Exam with official solutions, then each answer (text + handwriting images).
      const content = [{ type: "text", text: `המבחן (כולל פתרונות רשמיים):\n${JSON.stringify(test)}\n\nזמן שנוצל: ${used} דקות.\n\nהתשובות של ליה:` }];
      for (const q of test.questions) for (const p of q.parts || []) {
        const v = answers.get(`${q.id}|${p.label}`).value();
        content.push({ type: "text", text: `\n— שאלה ${q.id}${p.label ? ` סעיף ${p.label}` : ""}: ${v.text || (v.images.length ? "(ראי תמונה)" : "(לא נענה)")}` });
        for (const im of v.images) content.push({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } });
      }

      ctrl = new AbortController();
      try {
        const raw = await askTutor({ mode: "exam-grade", subject, signal: ctrl.signal, messages: [{ role: "user", content }] });
        const r = extractJSON(raw);
        const grade = Math.round((100 * (+r.total || 0)) / (+r.max || 100));
        store.addTest({ subject, kind, title: test.title || K.name, total: +r.total || 0, max: +r.max || 100, grade, summary: r.summary, weak_topics: r.weak_topics || [], topics: topicList });
        results(test, r, grade, () => submit());
      } catch (e) {
        if (e.name !== "AbortError") root.replaceChildren(errorBox(`${e.message}. התשובות עדיין כאן.`, submit));
      }
    }
  }

  // ---------- results ----------
  function results(test, r, grade) {
    const byKey = new Map((r.items || []).map((it) => [`${it.id}|${it.label || ""}`, it]));
    const summary = h("div", { class: "feedback-body" });
    setRich(summary, r.summary || "");
    const cards = test.questions.map((q, qi) => h("article", { class: "q-card" },
      h("div", { class: "q-meta" }, h("b", {}, `שאלה ${qi + 1}`), q.topic ? h("span", { class: "tag" }, q.topic) : null),
      q.stem ? h("div", { class: "q-text", html: renderRich(q.stem) }) : null,
      ...(q.parts || []).map((p) => {
        const it = byKey.get(`${q.id}|${p.label || ""}`) || {};
        const fb = h("div", {}); setRich(fb, it.feedback || "");
        const sol = h("details", { class: "sol" }, h("summary", {}, "פתרון"));
        const solBody = h("div", {}); setRich(solBody, `${p.solution || ""}\n\n**תשובה:** ${p.answer || ""}`);
        sol.append(solBody);
        const full = (it.score ?? 0) >= (it.max ?? p.points);
        const qt = h("div", { class: "q-text muted" }); setRich(qt, p.text || "");
        return h("div", { class: "part" },
          h("div", { class: "part-head" }, p.label ? h("b", {}, `${p.label}. `) : null,
            h("span", { class: `tag ${full ? "ok" : "warn"}` }, `${it.score ?? 0}/${it.max ?? p.points}`)),
          qt, fb, sol);
      })));

    root.replaceChildren(
      h("div", { class: `feedback ${grade >= 85 ? "good" : grade >= 60 ? "mid" : "bad"}` },
        h("div", { class: "score" }, `${grade}`, h("small", {}, "/100")), summary,
        (r.weak_topics || []).length ? h("p", {}, "לחזק: ", ...(r.weak_topics).map((t) => h("span", { class: "tag warn" }, t))) : null),
      ...cards,
      h("div", { class: "row center" },
        h("button", { class: "btn primary", onclick: setup }, `${K.name} חדש`),
        h("a", { class: "btn ghost", href: "#/practice" }, "לתרגול"),
        h("a", { class: "btn ghost", href: "#/progress" }, "להתקדמות")));
    window.scrollTo(0, 0);
  }

  setup();
  return { el: root, cleanup: () => { ctrl?.abort(); clearInterval(timer); } };
}

function history(kind, subject) {
  const items = store.tests.filter((t) => t.kind === kind && t.subject === subject).slice(-5).reverse();
  if (!items.length) return null;
  return h("div", { class: "history" }, h("h3", {}, "אחרונים"),
    h("ul", { class: "plain" }, ...items.map((t) =>
      h("li", {}, h("b", {}, `${t.grade}`), ` · ${t.title} · `, h("span", { class: "muted" }, new Date(t.ts).toLocaleDateString("he-IL"))))));
}

export function weakTopics(subject) {
  const by = {};
  for (const p of store.practice.filter((p) => p.subject === subject).slice(-80)) {
    (by[p.topic] ||= []).push(p.score);
  }
  const weak = Object.entries(by).filter(([, s]) => s.length >= 2 && s.reduce((a, b) => a + b, 0) / s.length < 70).map(([t]) => t);
  for (const t of store.tests.filter((t) => t.subject === subject).slice(-3)) for (const w of t.weak_topics || []) {
    const match = SUBJECTS[subject].topics.find((x) => w.includes(x) || x.includes(w));
    if (match && !weak.includes(match)) weak.push(match);
  }
  return weak;
}
