import { h } from "../render.js";
import { store } from "../store.js";
import { SUBJECTS } from "../curriculum.js";

const CARDS = [
  { href: "#/tutor", icon: "🎓", title: "שיעור פרטי", text: "הסבר נושא, שאלות, ללמוד חומר חדש – צעד אחר צעד" },
  { href: "#/homework", icon: "📒", title: "עזרה בשיעורי בית", text: "צלמי את הדף או כתבי בעט – רמזים, בדיקה ופתרון" },
  { href: "#/practice", icon: "🎯", title: "תרגול", text: "שאלות שמתאימות את עצמן לרמה שלך, עם משוב מיידי" },
  { href: "#/quiz", icon: "⏱️", title: "בוחן", text: "5 שאלות, 20 דקות, ציון ומשוב" },
  { href: "#/exam", icon: "📝", title: "מבחן בגרות", text: "מבחן מלא בסגנון בגרות 5 יח״ל, 90 דקות" },
  { href: "#/progress", icon: "📈", title: "ההתקדמות שלי", text: "ציונים, נושאים חזקים ונושאים לחיזוק" },
  { href: "#/syllabus", icon: "🗂️", title: "הסילבוס", text: "כל החומר של 5 יח״ל – מסמנים מה כבר למדנו" },
];

function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? "בוקר טוב" : hr < 17 ? "צהריים טובים" : hr < 21 ? "ערב טוב" : "לילה טוב";
}

export function homeView() {
  const subj = SUBJECTS[store.subject];
  const recent = store.practice.filter((p) => p.subject === store.subject && Date.now() - p.ts < 7 * 864e5);
  const avg = recent.length ? Math.round(recent.reduce((a, p) => a + p.score, 0) / recent.length) : null;

  const el = h("section", { class: "home" },
    h("div", { class: "hero" },
      h("h1", {}, `${greeting()}, ${store.settings.name}!`),
      h("p", { class: "muted" }, `${subj.full} · מה עושים היום?`),
      recent.length ? h("p", { class: "stat-line" }, `השבוע: ${recent.length} שאלות תרגול · ממוצע ${avg}`) : null,
    ),
    h("div", { class: "cards" },
      ...CARDS.map((c) => h("a", { class: "card", href: c.href },
        h("span", { class: "card-icon", "aria-hidden": "true" }, c.icon),
        h("span", { class: "card-title" }, c.title),
        h("span", { class: "card-text" }, c.text)))),
    store.settings.provider === "gemini" && !store.settings.geminiKey ? h("a", { class: "callout setup", href: "#/settings" },
      "👋 פעם ראשונה? צריך לחבר את המורה – הכניסי מפתח Gemini חינמי בהגדרות ←") : null,
  );
  return { el };
}
