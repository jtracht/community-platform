/* One interpolation loop preserves velocity instead of restarting a spring on every event. */
(() => {
  const scene = document.querySelector(".depth-scene");
  if (!scene) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  let target = { x: 0, y: 0 },
    position = { x: 0, y: 0 },
    frame = 0,
    last = 0;
  window.Motion?.animate(
    scene,
    { opacity: [0, 1] },
    { duration: reduced.matches ? 0 : 0.7 },
  );
  function enabled() {
    return !reduced.matches && fine.matches && !document.hidden;
  }
  function draw(time) {
    const dt = Math.min(50, last ? time - last : 16.7);
    last = time;
    const smoothing = 1 - Math.exp(-dt / 110);
    position.x += (target.x - position.x) * smoothing;
    position.y += (target.y - position.y) * smoothing;
    scene.style.transform = `rotateX(${-position.y * 12}deg) rotateY(${position.x * 18}deg) translate3d(${position.x * 22}px,${position.y * 14}px,0)`;
    scene.style.setProperty("--light-x", 45 + position.x * 18 + "%");
    scene.style.setProperty("--light-y", 32 + position.y * 15 + "%");
    if (
      enabled() &&
      (Math.abs(target.x - position.x) > 0.0005 ||
        Math.abs(target.y - position.y) > 0.0005)
    )
      frame = requestAnimationFrame(draw);
    else {
      frame = 0;
      last = 0;
    }
  }
  function schedule() {
    if (!frame && enabled()) frame = requestAnimationFrame(draw);
  }
  document.addEventListener(
    "pointermove",
    (event) => {
      if (!enabled() || event.pointerType === "touch") return;
      target = {
        x: (event.clientX / innerWidth) * 2 - 1,
        y: (event.clientY / innerHeight) * 2 - 1,
      };
      schedule();
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    target = { x: 0, y: 0 };
    schedule();
  });
  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    target = position = { x: 0, y: 0 };
    scene.style.transform = "";
    scene.style.removeProperty("--light-x");
    scene.style.removeProperty("--light-y");
  }
  reduced.addEventListener("change", reset);
  fine.addEventListener("change", reset);
  document.addEventListener("visibilitychange", reset);
})();
