import { createHarness } from "./harness";
import { FAQ_CATEGORIES, FAQ_LIBRARY } from "../src/marketing/faq-data";

const h = createHarness();
h.eq(FAQ_LIBRARY.length, 500, "the public knowledge base has exactly 500 questions and answers");
h.eq(new Set(FAQ_LIBRARY.map((entry) => entry.id)).size, 500, "every FAQ id is unique");
h.eq(new Set(FAQ_LIBRARY.map((entry) => entry.question)).size, 500, "every FAQ question is distinct");
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
h.done("faq knowledge base");
