import { h } from "../render.js";
import { store } from "../store.js";
import { SUBJECTS, allTopics } from "../curriculum.js";
import { pickerTopics } from "../topics.js";
import { weakTopics } from "./test.js";

export function progressView() {
  const subject = store.subject;
  const practice = store.practice.filter((p) => p.subject === subject);
  const tests = store.tests.filter((t) => t.subject === subject);

  const by = {};
  for (const p of practice) (by[p.topic] ||= []).push(p);
  const shown = new Set([...pickerTopics(subject), ...Object.keys(by)]);
  const rows = allTopics(subject).map((t) => t.name).filter((t) => shown.has(t)).map((t) => {
    const list = by[t] || [];
    const recent = list.slice(-10);
    const avg = recent.length ? Math.round(recent.reduce((a, p) => a + p.score, 0) / recent.length) : null;
    return { t, n: list.length, avg };
  });

  const days = new Set(practice.map((p) => new Date(p.ts).toDateString()));
  const weak = weakTopics(subject);
  const avgAll = practice.length ? Math.round(practice.slice(-30).reduce((a, p) => a + p.score, 0) / Math.min(30, practice.length)) : null;

  const el = h("section", { class: "progress" },
    h("div", { class: "view-head" }, h("h2", {}, "ההתקדמות שלי ", h("span", { class: "muted" }, `· ${SUBJECTS[subject].name}`))),
    h("div", { class: "stats" },
      stat(practice.length, "שאלות תרגול"),
      stat(avgAll ?? "–", "ממוצע אחרון"),
      stat(tests.length, "בחנים ומבחנים"),
      stat(days.size, "ימי תרגול")),
    weak.length ? h("div", { class: "callout" }, h("b", {}, "כדאי לחזק: "), ...weak.map((t) =>
      h("a", { class: "tag warn", href: "#/practice" }, t))) : null,
    h("h3", {}, "לפי נושא"),
    h("div", { class: "bars" }, ...rows.map((r) => h("div", { class: "bar-row" },
      h("span", { class: "bar-label" }, r.t),
      h("span", { class: "bar-track", role: "img", "aria-label": r.avg == null ? "אין נתונים" : `ממוצע ${r.avg}` },
        h("span", { class: `bar-fill ${r.avg >= 80 ? "good" : r.avg >= 60 ? "mid" : "bad"}`, style: `width:${r.avg ?? 0}%` })),
      h("span", { class: "bar-val" }, r.avg == null ? "–" : `${r.avg}`, r.n ? h("small", { class: "muted" }, ` (${r.n})`) : null)))),
    h("h3", {}, "בחנים ומבחנים"),
    tests.length
      ? h("ul", { class: "plain tests" }, ...tests.slice().reverse().map((t) => h("li", {},
          h("b", { class: "grade" }, t.grade), h("span", {}, ` ${t.kind === "exam" ? "📝" : "⏱️"} ${t.title}`),
          h("span", { class: "muted" }, ` · ${new Date(t.ts).toLocaleDateString("he-IL")}`))))
      : h("p", { class: "muted" }, "עוד אין. אפשר להתחיל ב", h("a", { href: "#/quiz" }, "בוחן קצר"), "."),
  );
  return { el };
}

function stat(v, label) {
  return h("div", { class: "stat" }, h("b", {}, String(v)), h("span", {}, label));
}
