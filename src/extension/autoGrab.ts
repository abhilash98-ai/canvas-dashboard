import { readPage } from "./readers.js";
import { addPending } from "./pending.js";

// Runs on every PrairieTest page by itself. On the home page it re-reads your
// tests, so after you book one, landing back home updates What's Due.
const grab = readPage(document, window.location.href, new Date());
if (grab?.kind === "exams") {
  addPending(grab);
}
