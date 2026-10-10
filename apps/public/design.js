/* Locally served Motion; pause control and system preferences govern decorative movement. */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const motion = window.Motion;
  const toggle = document.querySelector("#motion-toggle");
  if (!motion) {
    toggle.hidden = true;
    return;
  }
  let paused = false;
  const floating = [];
  const entering = new Set();
  const seen = new WeakSet();
  function enter() {
    if (reduced.matches || document.hidden || paused) return;
    [...document.querySelector("#poll").children].forEach((element, i) => {
      if (seen.has(element) || element.hidden) return;
      seen.add(element);
      const control = motion.animate(
        element,
        { y: [12, 0] },
        { duration: 0.55, delay: Math.min(i * 0.04, 0.24), ease: "easeOut" },
      );
      entering.add(control);
      Promise.resolve(control).finally(() => entering.delete(control));
    });
  }
  new MutationObserver(enter).observe(document.querySelector("#poll"), {
    childList: true,
  });
  enter();
  function sync() {
    const disabled = paused || reduced.matches || document.hidden;
    if (!floating.length && !disabled) {
      document
        .querySelectorAll(".orbit,.star,.hologram,.float-tile,.light-trail")
        .forEach((element, i) => {
          floating.push(
            motion.animate(
              element,
              { y: [0, i % 2 ? -14 : 18, 0], x: [0, i % 2 ? 5 : -5, 0] },
              { duration: 10 + i * 0.8, repeat: Infinity, ease: "easeInOut" },
            ),
          );
        });
    }
    for (const control of floating) disabled ? control.pause() : control.play();
    if (disabled) {
      for (const control of entering) control.complete();
      entering.clear();
    }
    toggle.disabled = reduced.matches;
    toggle.setAttribute("aria-pressed", String(paused || reduced.matches));
    toggle.textContent = reduced.matches
      ? "Bewegung reduziert"
      : paused
        ? "Bewegung fortsetzen"
        : "Bewegung pausieren";
  }
  toggle.onclick = () => {
    paused = !paused;
    sync();
  };
  reduced.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  sync();
})();
