import { allTopics, SUBJECT_IDS } from "./curriculum.js";
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

// First time a subject is used: mark the topics the class already learned
// (flagged "learned" in curriculum.js). Runs once per subject, so later
// changes in the syllabus screen are kept.
export function seedLearnedTopics() {
  const seeded = { ...(store.settings.seeded || {}) };
  for (const subject of SUBJECT_IDS) {
    if (seeded[subject]) continue;
    const topics = allTopics(subject);
    if (!topics.some((t) => store.topicState(t.id))) {
      for (const t of topics) if (t.learned) store.setTopicState(t.id, "done");
    }
    seeded[subject] = true;
  }
  store.setSetting("seeded", seeded);
}
