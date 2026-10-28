import { allTopics } from "./curriculum.js";
import { store } from "./store.js";

// Topics marked in the syllabus screen as learned / learning now.
export function focusTopics(subject) {
  return allTopics(subject).filter((t) => store.topicState(t.id)).map((t) => t.name);
}

// Topics offered in practice / quiz / exam pickers.
export function pickerTopics(subject) {
  const focus = focusTopics(subject);
  if (focus.length) return focus;
  return allTopics(subject).filter((t) => t.grade === "י").map((t) => t.name);
}
