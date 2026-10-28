import { h, toast } from "../render.js";
import { store } from "../store.js";

export function settingsView() {
  const name = h("input", { class: "input", value: store.settings.name, "aria-label": "שם" });
  const code = h("input", { class: "input", type: "password", value: store.settings.accessCode, autocomplete: "off", "aria-label": "קוד גישה" });
  const pen = h("input", { type: "checkbox", checked: store.settings.penOnly });

  const el = h("section", { class: "settings" },
    h("div", { class: "view-head" }, h("h2", {}, "הגדרות")),
    h("label", { class: "field col" }, h("span", {}, "שם התלמידה"), name),
    h("label", { class: "field col" }, h("span", {}, "קוד גישה (מההורה)"), code),
    h("label", { class: "field" }, pen, h("span", {}, "עט בלבד – כף היד והאצבע לא כותבות על המשטח (מומלץ עם Apple Pencil)")),
    h("div", { class: "row" },
      h("button", { class: "btn primary", onclick: () => {
        store.setSetting("name", name.value.trim() || "ליה");
        store.setSetting("accessCode", code.value.trim());
        store.setSetting("penOnly", pen.checked);
        toast("נשמר ✓");
      } }, "שמירה")),
    h("hr"),
    h("h3", {}, "התקנה על האייפד / האייפון"),
    h("ol", {},
      h("li", {}, "פותחים את האתר ב-Safari."),
      h("li", {}, "לוחצים על כפתור השיתוף ⬆︎ ואז \"הוספה למסך הבית\"."),
      h("li", {}, "האפליקציה תופיע עם אייקון ותיפתח במסך מלא.")),
    h("p", { class: "muted small" }, "טיפ: עם Apple Pencil אפשר גם לכתוב ישירות בתיבות הטקסט (Scribble) – הכתב יהפוך להקלדה."),
    h("hr"),
    h("h3", {}, "נתונים"),
    h("p", { class: "muted small" }, "כל ההתקדמות נשמרת רק במכשיר הזה."),
    h("div", { class: "row" },
      h("button", { class: "btn ghost", onclick: () => {
        const blob = new Blob([store.exportData()], { type: "application/json" });
        const a = h("a", { href: URL.createObjectURL(blob), download: "liya-progress.json" });
        a.click();
      } }, "ייצוא גיבוי"),
      h("button", { class: "btn ghost danger", onclick: () => {
        if (confirm("למחוק את כל נתוני ההתקדמות?")) { store.resetProgress(); toast("נמחק"); }
      } }, "איפוס התקדמות")),
  );
  return { el };
}
