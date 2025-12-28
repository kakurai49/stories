import { initNarration } from "./narration.js";

function runWhenReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}

runWhenReady(() => initNarration({ reason: "ready" }));

window.addEventListener("pageshow", (e) => {
  if (e.persisted) initNarration({ reason: "bfcache", force: true });
});
