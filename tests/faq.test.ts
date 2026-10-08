import { createHarness } from "./harness";
import { FAQ_CATEGORIES, FAQ_LIBRARY } from "../src/marketing/faq-data";

const h = createHarness();
h.eq(FAQ_LIBRARY.length, 504, "the public knowledge base has exactly 504 questions and answers");
h.eq(new Set(FAQ_LIBRARY.map((entry) => entry.id)).size, 504, "every FAQ id is unique");
h.eq(new Set(FAQ_LIBRARY.map((entry) => entry.question)).size, 504, "every FAQ question is distinct");
h.ok(FAQ_CATEGORIES.length >= 20, "the complete workflow is divided into useful categories");
for (const entry of FAQ_LIBRARY) {
  h.ok(entry.question.length >= 20, `${entry.id}: question is descriptive`);
  h.ok(entry.answer.length >= 45, `${entry.id}: answer gives useful detail`);
  h.ok(entry.category.length > 2, `${entry.id}: category is present`);
  h.ok(!/guarantee|go viral|instant success/i.test(entry.answer), `${entry.id}: answer makes no exaggerated claim`);
}
for (const term of ["panning", "cropping", "audio visualiser", "bitrate", "codec", "aspect ratio", "ducking", "keyframes", "rendering", "captions"]) {
  h.ok(FAQ_LIBRARY.some((entry) => `${entry.question} ${entry.answer}`.toLowerCase().includes(term)), `terminology includes ${term}`);
}
const performanceEntries = FAQ_LIBRARY.filter((entry) => entry.keywords.includes("computer performance"));
h.eq(performanceEntries.length, 5, "computer performance receives five direct, searchable answers");
h.ok(performanceEntries.some((entry) => entry.question === "Can Scenering run on a low-spec computer?"), "FAQ reassures visitors about low-spec computers");
h.ok(performanceEntries.some((entry) => /Celeron/i.test(entry.answer)), "performance FAQ states the tested low-spec system");
h.ok(performanceEntries.some((entry) => /persistent render engine/i.test(entry.answer)), "performance FAQ explains the persistent render engine");
h.ok(performanceEntries.some((entry) => /faster modern PC/i.test(entry.answer)), "performance FAQ recommends faster modern hardware for smoother work");
h.done("faq knowledge base");
