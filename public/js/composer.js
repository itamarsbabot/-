// Answer box: keyboard text + quick math symbols + Apple Pencil pad + photo.
import { h, toast } from "./render.js";
import { PencilPad } from "./pad.js";
import { fileToImage } from "./api.js";

const SYMBOLS = [
  ["√", "√"], ["²", "²"], ["³", "³"], ["^", "^"], ["π", "π"], ["°", "°"],
  ["≤", "≤"], ["≥", "≥"], ["≠", "≠"], ["±", "±"], ["·", "·"], ["÷", "÷"],
  ["∞", "∞"], ["Δ", "Δ"], ["α", "α"], ["β", "β"], ["θ", "θ"], ["μ", "μ"],
  ["→", "→"], ["⇐", "⇐"], ["⇔", "⇔"], ["∈", "∈"], ["∪", "∪"], ["½", "½"],
];

export class Composer {
  constructor({ placeholder = "כתבי כאן…", sendLabel = null, onSend = null, padOpen = false, compact = false } = {}) {
    this.images = [];
    this.pad = null;
    this.onSend = onSend;

    this.text = h("textarea", { class: "comp-text", rows: compact ? 2 : 3, placeholder, dir: "auto" });
    this.text.addEventListener("input", () => this.autosize());
    this.text.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && this.onSend) { e.preventDefault(); this.send(); }
    });

    this.symBar = h("div", { class: "sym-bar", hidden: true },
      ...SYMBOLS.map(([label, ins]) => h("button", { type: "button", class: "sym", onclick: () => this.insert(ins) }, label)));

    this.thumbs = h("div", { class: "thumbs" });
    this.padHolder = h("div", { class: "pad-holder" });

    this.file = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: (e) => this.addFiles(e.target.files) });

    this.padBtn = h("button", { type: "button", class: "chip", onclick: () => this.togglePad() }, "✏️ כתב יד");
    const actions = h("div", { class: "comp-actions" },
      this.padBtn,
      h("button", { type: "button", class: "chip", onclick: () => this.file.click() }, "📷 צילום / תמונה"),
      h("button", { type: "button", class: "chip", onclick: () => { this.symBar.hidden = !this.symBar.hidden; } }, "∑ סימנים"),
      h("span", { class: "spacer" }),
      sendLabel && h("button", { type: "button", class: "btn primary", onclick: () => this.send() }, sendLabel),
    );

    this.el = h("div", { class: "composer" + (compact ? " compact" : "") }, this.padHolder, this.thumbs, this.text, this.symBar, actions, this.file);
    if (padOpen) queueMicrotask(() => this.togglePad(true));
  }

  autosize() {
    this.text.style.height = "auto";
    this.text.style.height = Math.min(320, this.text.scrollHeight + 2) + "px";
  }

  insert(s) {
    const t = this.text;
    const a = t.selectionStart ?? t.value.length, b = t.selectionEnd ?? a;
    t.value = t.value.slice(0, a) + s + t.value.slice(b);
    t.selectionStart = t.selectionEnd = a + s.length;
    t.focus();
  }

  togglePad(force) {
    const open = force ?? !this.pad;
    if (open && !this.pad) {
      this.pad = new PencilPad({ height: 340 });
      this.padHolder.append(this.pad.el);
    } else if (!open && this.pad) {
      if (!this.pad.isEmpty() && !confirm("לסגור את משטח הכתיבה? מה שכתבת יימחק.")) return;
      this.pad.destroy();
      this.pad.el.remove();
      this.pad = null;
    }
    this.padBtn.classList.toggle("on", !!this.pad);
  }

  async addFiles(files) {
    for (const f of files) {
      try {
        const im = await fileToImage(f);
        this.images.push(im);
      } catch {
        toast("לא הצלחתי לקרוא את התמונה");
      }
    }
    this.file.value = "";
    this.renderThumbs();
  }

  renderThumbs() {
    this.thumbs.replaceChildren(...this.images.map((im, i) =>
      h("div", { class: "thumb" }, h("img", { src: im.preview, alt: "תמונה מצורפת" }),
        h("button", { type: "button", "aria-label": "הסר", onclick: () => { this.images.splice(i, 1); this.renderThumbs(); } }, "×"))));
  }

  // {text, images:[{mediaType,data,preview}]} including the handwriting as an image.
  value() {
    const images = [...this.images];
    const ink = this.pad?.toImage();
    if (ink) images.push({ ...ink, handwriting: true });
    return { text: this.text.value.trim(), images };
  }

  isEmpty() {
    const v = this.value();
    return !v.text && !v.images.length;
  }

  clear() {
    this.text.value = "";
    this.images = [];
    this.renderThumbs();
    this.pad?.clear();
    this.autosize();
  }

  send() {
    if (!this.onSend) return;
    if (this.isEmpty()) { toast("כתבי משהו, צרפי תמונה או כתבי בעט"); return; }
    this.onSend(this.value());
  }
}
