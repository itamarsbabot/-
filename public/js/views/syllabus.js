import { h, toast } from "../render.js";
import { store } from "../store.js";
import { SYLLABUS } from "../curriculum.js";
import { openChatWith } from "./chat.js";

const STATES = [
  ["", "○ עוד לא"],
  ["learning", "📖 לומדים עכשיו"],
  ["done", "✓ למדנו"],
];

export function syllabusView() {
  const subject = store.subject;
  const s = SYLLABUS[subject];

  const stateBtn = (t) => {
    const b = h("button", { type: "button", class: "state-btn" });
    const sync = () => {
      const st = store.topicState(t.id);
      b.textContent = STATES.find(([k]) => k === st)[1];
      b.dataset.state = st;
    };
    b.addEventListener("click", () => {
      const i = STATES.findIndex(([k]) => k === store.topicState(t.id));
      store.setTopicState(t.id, STATES[(i + 1) % STATES.length][0]);
      sync();
    });
    sync();
    return b;
  };

  const grades = [...new Set(s.units.map((u) => u.grade))];
  const el = h("section", { class: "syllabus" },
    h("div", { class: "view-head" }, h("h2", {}, "הסילבוס ", h("span", { class: "muted" }, `· ${s.full}`))),
    h("p", { class: "muted" },
      "סמני מה כבר למדתם ומה לומדים עכשיו. המורה, התרגולים והמבחנים ישתמשו רק בנושאים המסומנים (אם לא סימנת כלום – בנושאי כיתה י׳)."),
    ...grades.map((g) => h("div", { class: "grade-block" },
      h("h3", { class: "grade-title" }, `כיתה ${g}`),
      ...s.units.filter((u) => u.grade === g).map((u) => h("details", { class: "unit", open: g === "י" },
        h("summary", {}, h("b", {}, u.title), h("span", { class: "muted small" }, ` · ${u.topics.length} נושאים`)),
        h("div", { class: "row small-row" },
          h("button", { class: "btn small ghost", onclick: (e) => {
            for (const t of u.topics) store.setTopicState(t.id, "done");
            e.target.closest("details").querySelectorAll(".state-btn").forEach((b) => { b.textContent = STATES[2][1]; b.dataset.state = "done"; });
            toast("כל היחידה סומנה כנלמדה");
          } }, "סמני הכל כנלמד")),
        ...u.topics.map((t) => h("div", { class: "topic" },
          h("div", { class: "topic-main" },
            h("b", {}, t.name),
            h("ul", { class: "subs" }, ...t.subs.map((x) => h("li", {}, x)))),
          h("div", { class: "topic-actions" },
            stateBtn(t),
            h("button", { class: "btn small ghost", onclick: () => openChatWith("tutor", `אני רוצה ללמוד את הנושא: ${t.name} (${t.subs.join(", ")}). תתחילי מהבסיס ותבני לי הבנה עמוקה.`) }, "🎓 ללמוד"),
            h("a", { class: "btn small ghost", href: `#/practice?topic=${encodeURIComponent(t.name)}` }, "🎯 לתרגל")))))))),
    h("hr"),
    h("h3", {}, "מקורות רשמיים"),
    h("ul", {},
      h("li", {}, h("a", { href: "https://meyda.education.gov.il/files/Pop/0files/matmatika/Chativa-Elyona/new-curriculum/5-units.pdf", target: "_blank", rel: "noopener" }, "מתמטיקה 5 יח״ל – פריסת הוראה (משרד החינוך)")),
      h("li", {}, h("a", { href: "https://pop.education.gov.il/tchumey_daat/physics/high-school/pedagogy/curriculum/", target: "_blank", rel: "noopener" }, "פיזיקה – תוכנית לימודים (המרחב הפדגוגי)"))),
    h("p", { class: "muted small" }, "בכיתה מדעית הסדר יכול להיות שונה – הכי מדויק לסמן לפי פריסת החומר שהמורה נתן/ה."),
  );
  return { el };
}
