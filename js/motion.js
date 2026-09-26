// Shared UI motion: closed-form springs, a liquid tab indicator, a blur swap
// for content that changes in place, scroll reveals, and the theme wipe.
//
// Springs here are step responses you can evaluate at any time t, not
// simulations stepped frame by frame. A value that is retargeted several
// times is the sum of one spring per change (each starting where its change
// happened), so a retarget mid-flight keeps the motion's momentum instead of
// restarting it, and the value stays a pure function of time.

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Unit step response of a damped spring: 0 at t=0, settling to 1. */
function step(t, omega, zeta) {
  if (t <= 0) return 0;
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-omega * t) * (1 + omega * t);
}

// zeta 0.8 overshoots by ~1.5%: "a tiny overshoot at most".
const ZETA = 0.8;

/**
 * A number that springs to each new target. value(now) is a pure function
 * of the change history; settled changes fold into the base so the list
 * never grows.
 */
class SpringValue {
  constructor(v) {
    this.base = v;
    this.target = v;
    this.changes = []; // { t0, delta, omega }
  }
  set(target, now, omega) {
    const delta = target - this.target;
    if (!delta) return;
    this.target = target;
    this.changes.push({ t0: now, delta, omega });
  }
  snap(v) {
    this.base = this.target = v;
    this.changes = [];
  }
  value(now) {
    let v = this.base;
    this.changes = this.changes.filter((c) => {
      const t = (now - c.t0) / 1000;
      // ~0.1% left of the step: fold it in.
      if (t * c.omega * ZETA > 7) {
        this.base += c.delta;
        v += c.delta;
        return false;
      }
      v += c.delta * step(t, c.omega, ZETA);
      return true;
    });
    return v;
  }
  get settled() {
    return this.changes.length === 0;
  }
}

// The leading edge (the side the pill is travelling toward) rides a stiffer
// spring than the trailing one, so the pill stretches ahead and then
// catches up: a liquid slide rather than a rigid one.
const LEAD = 30; // rad/s
const TRAIL = 17;

/**
 * Puts a single pill behind the active item of a row of tabs and springs it
 * between them. The row keeps its markup and its own active-class logic;
 * this only watches for the active item to change (or the row to be
 * re-rendered) and follows it. Colour and corner come from CSS
 * (--pill-bg on the row) and the active item's own radius.
 */
export function liquidTabs(row, activeSelector) {
  if (!row) return;
  row.classList.add("has-liquid");
  // The pill is placed against the row, so the row has to be its
  // containing block. Rows that are already sticky/fixed keep that.
  if (getComputedStyle(row).position === "static") row.style.position = "relative";
  let pill = null;
  const edges = { l: new SpringValue(0), r: new SpringValue(0), t: new SpringValue(0), b: new SpringValue(0) };
  let placed = false;
  let raf = 0;

  function ensurePill() {
    if (pill && pill.parentElement === row) return;
    pill = document.createElement("span");
    pill.className = "liquid-pill";
    pill.setAttribute("aria-hidden", "true");
    row.prepend(pill);
    paint(performance.now());
  }

  function paint(now) {
    const l = edges.l.value(now), r = edges.r.value(now);
    const t = edges.t.value(now), b = edges.b.value(now);
    pill.style.transform = `translate(${l}px, ${t}px)`;
    pill.style.width = `${Math.max(0, r - l)}px`;
    pill.style.height = `${Math.max(0, b - t)}px`;
  }

  function frame(now) {
    paint(now);
    const moving = Object.values(edges).some((e) => !e.settled);
    raf = moving ? requestAnimationFrame(frame) : 0;
  }

  function place() {
    ensurePill();
    const active = row.querySelector(activeSelector);
    if (!active || !active.offsetWidth) {
      pill.style.opacity = "0";
      return;
    }
    pill.style.opacity = "1";
    pill.style.borderRadius = getComputedStyle(active).borderRadius;
    const box = {
      l: active.offsetLeft,
      r: active.offsetLeft + active.offsetWidth,
      t: active.offsetTop,
      b: active.offsetTop + active.offsetHeight,
    };
    const now = performance.now();
    if (!placed || reducedMotion.matches) {
      Object.entries(box).forEach(([k, v]) => edges[k].snap(v));
      placed = true;
      paint(now);
      return;
    }
    const goingRight = box.l > edges.l.target;
    edges.l.set(box.l, now, goingRight ? TRAIL : LEAD);
    edges.r.set(box.r, now, goingRight ? LEAD : TRAIL);
    edges.t.set(box.t, now, TRAIL);
    edges.b.set(box.b, now, TRAIL);
    if (!raf) raf = requestAnimationFrame(frame);
  }

  new MutationObserver(place).observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  // Layout changes (fonts landing, the row being shown, a resize) move the
  // tabs without any class changing: re-place without animating.
  new ResizeObserver(() => {
    placed = false;
    place();
  }).observe(row);
  place();
}

/**
 * Changes an element's text with a short blur: out, swap, back in. A
 * number ticking or a label changing reads as the same thing updating,
 * not as a hard cut. Rapid calls just retarget to the newest text.
 */
export function swapText(el, text) {
  text = String(text);
  if (!el) return;
  // Compare against where the text is heading, not what's on screen: mid-
  // swap the old text is still showing, so a quick 1 → 2 → 1 saw "1" on
  // screen, returned early, and then landed on "2" — a quantity display
  // one off from the quantity Open would charge for.
  const heading = el._swapping ? el._swapTo : el.textContent;
  if (heading === text) return;
  if (reducedMotion.matches || !el.isConnected || !el.offsetParent || !el.animate) {
    el.textContent = text;
    return;
  }
  el._swapTo = text;
  if (el._swapping) return;
  el._swapping = true;
  const out = el.animate(
    [
      { filter: "blur(0px)", opacity: 1 },
      { filter: "blur(3px)", opacity: 0 },
    ],
    { duration: 90, easing: "ease-in", fill: "forwards" }
  );
  out.onfinish = () => {
    el.textContent = el._swapTo;
    el._swapping = false;
    el.animate(
      [
        { filter: "blur(3px)", opacity: 0 },
        { filter: "blur(0px)", opacity: 1 },
      ],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
    out.cancel();
  };
}


// ---- Scroll reveal ---------------------------------------------------------
// Sections marked [data-reveal] rise in the first time they come into view;
// [data-reveal="stagger"] does it to its children one after another.
//
// The hidden starting state only exists under html.motion-armed, and that is
// set either now (tab visible) or on the first frame the tab draws. A tab
// that never draws never arms, so nothing is ever held invisible waiting on
// an observer that won't fire — the page stays complete without any of this.

let revealObserver = null;

export function initReveal() {
  if (reducedMotion.matches || !("IntersectionObserver" in window)) return;
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      });
    },
    // Trip a little before the edge reaches the viewport, so the rise is
    // under way by the time you're looking at it.
    { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
  );
  const arm = () => {
    document.documentElement.classList.add("motion-armed");
    document.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => revealObserver.observe(el));
  };
  if (document.visibilityState === "visible") arm();
  else requestAnimationFrame(arm);
}

// ---- Theme change as a wipe --------------------------------------------------
// The new palette opens out of the toggle in a circle over the old one. The
// View Transitions API snapshots the page before and after `apply` and we
// animate between the two pictures, so nothing on the page has to know how
// to transition its own colours. Anywhere that can't (no API, reduced motion,
// a hidden tab) just swaps.

export function themeWipe(originEl, apply) {
  if (!document.startViewTransition || reducedMotion.matches || document.visibilityState !== "visible") {
    apply();
    return;
  }
  const r = originEl.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const transition = document.startViewTransition(apply);
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    })
    .catch(() => {});
}
