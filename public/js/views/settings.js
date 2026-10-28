import { h, toast } from "../render.js";
import { store } from "../store.js";
import { checkGeminiKey } from "../api.js";

export function settingsView() {
  const S = store.settings;
  const name = h("input", { class: "input", value: S.name, "aria-label": "שם" });
  const pen = h("input", { type: "checkbox", checked: S.penOnly });

  // --- AI provider ---
  const provider = h("select", { class: "select" },
    h("option", { value: "gemini" }, "Gemini של גוגל (חינם)"),
    h("option", { value: "claude" }, "Claude (דרך שרת Netlify, בתשלום)"));
  provider.value = S.provider || "gemini";

  const key = h("input", { class: "input", type: "password", value: S.geminiKey, autocomplete: "off", placeholder: "AIza…", dir: "ltr", "aria-label": "מפתח Gemini" });
  const model = h("select", { class: "select", dir: "ltr", "aria-label": "מודל" });
  const status = h("p", { class: "small" });
  const fillModels = (list, chosen) => {
    model.replaceChildren(...(list.length ? list : ["gemini-2.5-flash"]).map((m) => h("option", { value: m }, m)));
    if (chosen && list.includes(chosen)) model.value = chosen;
  };
  fillModels(S.geminiModels || [], S.geminiModel);

  const check = h("button", { class: "btn", type: "button", onclick: async () => {
    const k = key.value.trim();
    if (!k) return toast("הדביקי קודם את המפתח");
    check.disabled = true;
    status.textContent = "בודקת…";
    try {
      const list = await checkGeminiKey(k);
      if (!list.length) throw new Error("המפתח תקין אבל אין מודלים זמינים");
      store.setSetting("geminiKey", k);
      store.setSetting("geminiModels", list.slice(0, 8));
      store.setSetting("geminiModel", list[0]);
      fillModels(list.slice(0, 8), list[0]);
      status.textContent = `✓ מחובר! נבחר המודל ${list[0]}`;
      status.className = "small ok-text";
    } catch (e) {
      status.textContent = `⚠️ ${e.message}`;
      status.className = "small bad-text";
    } finally {
      check.disabled = false;
    }
  } }, "בדיקת חיבור");

  const geminiBox = h("div", { class: "box" },
    h("label", { class: "field col" }, h("span", {}, "מפתח Gemini API"), key),
    h("div", { class: "row" }, check, h("label", { class: "field" }, h("span", {}, "מודל"), model)),
    status,
    h("details", {},
      h("summary", {}, "איך משיגים מפתח חינמי? (2 דקות)"),
      h("ol", {},
        h("li", {}, "נכנסים ל-", h("a", { href: "https://aistudio.google.com/apikey", target: "_blank", rel: "noopener" }, "aistudio.google.com/apikey"), " עם חשבון גוגל (של ההורה)."),
        h("li", {}, "לוחצים Create API key ומעתיקים את המפתח."),
        h("li", {}, "מדביקים כאן ולוחצים \"בדיקת חיבור\".")),
      h("p", { class: "muted small" }, "המפתח נשמר רק במכשיר הזה. במסלול החינמי יש מגבלה של מספר בקשות לדקה וליום, וגוגל רשאית להשתמש בתוכן לשיפור המודלים שלה – לא לשלוח פרטים אישיים.")));

  const code = h("input", { class: "input", type: "password", value: S.accessCode, autocomplete: "off", "aria-label": "קוד גישה" });
  const claudeBox = h("div", { class: "box" },
    h("label", { class: "field col" }, h("span", {}, "קוד גישה לשרת"), code),
    h("p", { class: "muted small" }, "עובד רק אם האפליקציה מותקנת ב-Netlify עם מפתח Claude (ראו README)."));

  const syncBoxes = () => { geminiBox.hidden = provider.value !== "gemini"; claudeBox.hidden = provider.value !== "claude"; };
  provider.addEventListener("change", syncBoxes);
  syncBoxes();

  const el = h("section", { class: "settings" },
    h("div", { class: "view-head" }, h("h2", {}, "הגדרות")),
    h("label", { class: "field col" }, h("span", {}, "שם התלמידה"), name),
    h("label", { class: "field" }, pen, h("span", {}, "עט בלבד – כף היד והאצבע לא כותבות על המשטח (מומלץ עם Apple Pencil)")),
    themeSwitch(),
    h("h3", {}, "המורה (בינה מלאכותית)"),
    h("label", { class: "field" }, h("span", {}, "ספק"), provider),
    geminiBox, claudeBox,
    h("div", { class: "row" },
      h("button", { class: "btn primary", onclick: () => {
        store.setSetting("name", name.value.trim() || "ליה");
        store.setSetting("penOnly", pen.checked);
        store.setSetting("provider", provider.value);
        store.setSetting("geminiKey", key.value.trim());
        if (model.value) store.setSetting("geminiModel", model.value);
        store.setSetting("accessCode", code.value.trim());
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
        h("a", { href: URL.createObjectURL(blob), download: "liya-progress.json" }).click();
      } }, "ייצוא גיבוי"),
      h("button", { class: "btn ghost danger", onclick: () => {
        if (confirm("למחוק את כל נתוני ההתקדמות?")) { store.resetProgress(); toast("נמחק"); }
      } }, "איפוס התקדמות")),
  );
  return { el };
}

// Dark-mode switch. Saved immediately; "follow device" clears the choice.
function themeSwitch() {
  const sysDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = () => (store.settings.theme || (sysDark() ? "dark" : "light")) === "dark";
  const input = h("input", { type: "checkbox", role: "switch", "aria-label": "מצב כהה" });
  const note = h("span", { class: "muted small" });
  const reset = h("button", { type: "button", class: "link-btn" }, "לפי הגדרות המכשיר");
  const apply = (theme) => {
    store.setSetting("theme", theme);
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    sync();
  };
  const sync = () => {
    input.checked = isDark();
    note.textContent = store.settings.theme ? "" : "(כרגע לפי המכשיר)";
    reset.hidden = !store.settings.theme;
  };
  input.addEventListener("change", () => apply(input.checked ? "dark" : "light"));
  reset.addEventListener("click", () => apply(""));
  sync();
  return h("div", { class: "switch-row" },
    h("span", {}, "🌙 מצב כהה ", note, " ", reset),
    h("label", { class: "switch" }, input, h("span", { class: "track" })));
}
