import { h, setRich, toast } from "../render.js";
import { store } from "../store.js";
import { askTutor, userContent } from "../api.js";
import { Composer } from "../composer.js";
import { SUBJECTS, allTopics } from "../curriculum.js";
import { pickerTopics } from "../topics.js";

let handoff = null;
// Open a chat with a first message already sent (e.g. from a practice question).
export function openChatWith(mode, text) {
  handoff = { mode, text };
  location.hash = `#/${mode}`;
}

const INTRO = {
  tutor: "היי {name}! אני המורה הפרטי שלך ב{subj}. אפשר לבקש שאסביר נושא, לשאול שאלה, או לבחור נושא מהרשימה למטה. אפשר להקליד, לכתוב בעט או לצלם.",
  homework: "שולחים לי את השאלה – צילום של הדף, כתב יד בעט או הקלדה. אני לא אפתור במקומך 😉 – אכוון אותך עד שתגיעי לבד. כשתצטרכי: **רמז**, **הצעד הבא**, **בדיקה** של מה שכתבת, או **פתרון מלא**.",
};

const HW_CHIPS = [
  ["💡 רמז", "תני לי רמז אחד, בלי לגלות את התשובה."],
  ["👣 הצעד הבא", "מה הצעד הבא שאני צריכה לעשות?"],
  ["✅ בדקי את הפתרון שלי", "בדקי בבקשה את הפתרון שלי שורה-שורה ותגידי איפה טעיתי, בלי לתקן במקומי."],
  ["📖 פתרון מלא", "אני רוצה לראות פתרון מלא ומסודר, בבקשה."],
];

export function chatView(mode) {
  const subject = store.subject;
  const key = `${mode}:${subject}`;
  let msgs = store.getChat(key).map((m) => ({ ...m }));
  let busy = false;
  let ctrl = null;

  const list = h("div", { class: "chat-list", "aria-live": "polite" });
  const title = mode === "tutor" ? "שיעור פרטי" : "עזרה בשיעורי בית";

  const composer = new Composer({
    placeholder: mode === "homework" ? "הקלידי את השאלה, או צלמי / כתבי בעט…" : "שאלי אותי כל דבר…",
    sendLabel: "שליחה ←",
    onSend: (v) => send(v),
  });

  function bubble(m) {
    const body = h("div", { class: "bubble-body" });
    if (m.role === "assistant") setRich(body, m.text || "");
    else {
      if (m.text) setRich(body, m.text);
      for (const im of m.images || []) body.append(h("img", { class: "msg-img", src: im.preview, alt: im.handwriting ? "כתב יד" : "תמונה" }));
      if (m.hadImage && !(m.images || []).length) body.append(h("div", { class: "muted small" }, "📎 תמונה"));
    }
    return h("div", { class: `bubble ${m.role}` }, body);
  }

  function renderAll() {
    const intro = INTRO[mode].replace("{name}", store.settings.name).replace("{subj}", SUBJECTS[subject].name);
    list.replaceChildren(bubble({ role: "assistant", text: intro }), ...msgs.map(bubble));
  }

  function apiMessages() {
    // Keep the last ~30 turns; must start with a user turn.
    let recent = msgs.slice(-30);
    while (recent.length && recent[0].role !== "user") recent = recent.slice(1);
    return recent.map((m) => ({
      role: m.role,
      content: m.role === "user"
        ? userContent((m.text || "") + (m.hadImage && !(m.images || []).length ? "\n[בהודעה זו צורפה תמונה שכבר לא זמינה]" : ""), m.images || [])
        : m.text || "…",
    }));
  }

  async function send({ text, images }) {
    if (busy) return;
    busy = true;
    msgs.push({ role: "user", text, images });
    composer.clear();
    list.append(bubble(msgs.at(-1)));
    const a = { role: "assistant", text: "" };
    const b = bubble(a);
    b.classList.add("typing");
    const body = b.querySelector(".bubble-body");
    body.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    list.append(b);
    b.scrollIntoView({ behavior: "smooth", block: "end" });

    let raf = 0;
    ctrl = new AbortController();
    try {
      a.text = await askTutor({
        mode, subject, messages: apiMessages(), signal: ctrl.signal,
        onText: (t) => {
          a.text = t;
          if (!raf) raf = requestAnimationFrame(() => { raf = 0; setRich(body, a.text); });
        },
      });
      cancelAnimationFrame(raf);
      setRich(body, a.text);
      msgs.push(a);
      store.setChat(key, msgs);
    } catch (e) {
      if (e.name === "AbortError") return;
      b.remove();
      // Leave her message in place so she can retry.
      const retry = h("div", { class: "bubble error" }, `⚠️ ${e.message} `,
        h("button", { class: "btn small", onclick: () => { retry.remove(); const last = msgs.pop(); list.lastChild?.remove(); send({ text: last.text, images: last.images || [] }); } }, "נסי שוב"));
      list.append(retry);
    } finally {
      b.classList.remove("typing");
      busy = false;
    }
  }

  const chips = mode === "homework"
    ? h("div", { class: "chips" }, ...HW_CHIPS.map(([label, text]) =>
        h("button", { class: "chip", type: "button", onclick: () => {
          const v = composer.value();
          send({ text: v.text ? `${v.text}\n\n${text}` : text, images: v.images });
        } }, label)))
    : topicPicker((topic) => send({ text: `אני רוצה ללמוד את הנושא: ${topic}. תתחילי מהבסיס ותבני לי הבנה עמוקה.`, images: [] }));

  const el = h("section", { class: "chat" },
    h("div", { class: "view-head" },
      h("h2", {}, title, h("span", { class: "muted" }, ` · ${SUBJECTS[subject].name}`)),
      h("button", { class: "btn ghost small", onclick: () => {
        if (!msgs.length || confirm("להתחיל שיחה חדשה? השיחה הנוכחית תימחק.")) { ctrl?.abort(); msgs = []; store.clearChat(key); renderAll(); }
      } }, "שיחה חדשה")),
    list,
    h("div", { class: "chat-input" }, chips, composer.el),
  );

  renderAll();
  if (handoff && handoff.mode === mode) {
    const t = handoff.text;
    handoff = null;
    queueMicrotask(() => send({ text: t, images: [] }));
  }
  return { el, cleanup: () => ctrl?.abort() };
}

function topicPicker(onPick) {
  const sel = h("select", { class: "select", "aria-label": "בחרי נושא ללמידה" },
    h("option", { value: "" }, "📚 בחרי נושא ללמוד…"),
    ...topicOptions(store.subject));
  sel.addEventListener("change", () => { if (sel.value) { onPick(sel.value); sel.value = ""; } });
  return h("div", { class: "chips" }, sel);
}

// <option>s: current topics first, then the rest of the syllabus.
export function topicOptions(subject) {
  const main = pickerTopics(subject);
  const rest = allTopics(subject).map((t) => t.name).filter((n) => !main.includes(n));
  return [
    ...main.map((t) => h("option", { value: t }, t)),
    rest.length ? h("optgroup", { label: "עוד נושאים מהסילבוס" }, ...rest.map((t) => h("option", { value: t }, t))) : null,
  ];
}
