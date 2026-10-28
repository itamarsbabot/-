import { store } from "./store.js";
import { homeView } from "./views/home.js";
import { chatView } from "./views/chat.js";
import { practiceView } from "./views/practice.js";
import { testView } from "./views/test.js";
import { progressView } from "./views/progress.js";
import { settingsView } from "./views/settings.js";
import { guard } from "./guard.js";
import { syllabusView } from "./views/syllabus.js";

const routes = {
  "": homeView,
  tutor: (p) => chatView("tutor", p),
  homework: (p) => chatView("homework", p),
  practice: practiceView,
  quiz: (p) => testView("quiz", p),
  exam: (p) => testView("exam", p),
  progress: progressView,
  settings: settingsView,
  syllabus: syllabusView,
};

let cleanup = null;

function parse() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return { name: path, params: Object.fromEntries(new URLSearchParams(query)) };
}

async function render() {
  const { name, params } = parse();
  const view = routes[name] || homeView;
  cleanup?.();
  cleanup = null;
  const main = document.getElementById("view");
  main.replaceChildren();
  const result = await view(params);
  if (result?.el) main.append(result.el);
  cleanup = result?.cleanup || null;
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

let lastHash = location.hash;
window.addEventListener("hashchange", () => {
  if (guard.leave && !guard.leave()) {
    history.replaceState(null, "", lastHash);
    return;
  }
  guard.leave = null;
  lastHash = location.hash;
  render();
});

window.addEventListener("beforeunload", (e) => {
  if (guard.leave) { e.preventDefault(); e.returnValue = ""; }
});

// Subject switch in the top bar.
function syncSubject() {
  for (const b of document.querySelectorAll("[data-subject]")) {
    b.classList.toggle("on", b.dataset.subject === store.subject);
    b.setAttribute("aria-selected", b.dataset.subject === store.subject);
  }
  document.documentElement.dataset.subject = store.subject;
}
document.querySelectorAll("[data-subject]").forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.subject === store.subject) return;
    if (guard.leave && !guard.leave()) return;
    guard.leave = null;
    store.setSetting("subject", b.dataset.subject);
    syncSubject();
    render();
  }));
syncSubject();

// Wait for KaTeX/marked (deferred scripts) before the first render.
window.addEventListener("load", render);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
