// Theme, colour and motion helpers. Everything here degrades to "no animation" for reduced-motion users or when you switch animations off.
import { S, $ } from "./lib.js";

export const DEFAULT_UI = { theme: "auto", accent: "green", text: "normal", motion: "on", haptics: "on" };
export const ACCENTS = { green: 150, blue: 215, purple: 268, orange: 24, pink: 330, teal: 183 };
const SHIFT = { green: 38, blue: 38, purple: 34, orange: 20, pink: 28, teal: 30 }; // second gradient colour: how far the hue travels
const SCALE = { normal: 1, large: 1.15, xl: 1.3 };
export const ui = () => ({ ...DEFAULT_UI, ...S.profile.ui });

let base = null; // the phone's own text size (Dynamic Type), read once, then scaled by the in-app setting
export function applyTheme() {
  const u = ui(), root = document.documentElement;
  root.dataset.theme = u.theme; root.dataset.motion = u.motion;
  root.style.setProperty("--h", ACCENTS[u.accent] ?? 150);
  root.style.setProperty("--dh", SHIFT[u.accent] ?? 38);
  if (base == null) { root.style.fontSize = ""; base = parseFloat(getComputedStyle(root).fontSize) || 17; }
  root.style.fontSize = base * (SCALE[u.text] ?? 1) + "px";
  try { localStorage.setItem("ui", JSON.stringify(S.profile.ui ?? null)); } catch {}
}

export const motionOn = () => document.documentElement.dataset.motion !== "off" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
export const haptic = (ms = 12) => { if (ui().haptics !== "off") navigator.vibrate?.(ms); };

let enterTimer;
export function enterAnim() {
  const v = $("#view");
  if (!motionOn()) return;
  v.classList.remove("enter"); void v.offsetWidth; v.classList.add("enter");
  clearTimeout(enterTimer); enterTimer = setTimeout(() => v.classList.remove("enter"), 1000);
}

// numbers with data-count="1234" tick up from 0
export function countUps(root = document) {
  if (!motionOn()) return;
  for (const el of root.querySelectorAll("[data-count]")) {
    const to = Number(el.dataset.count), t0 = performance.now(), fmt = (n) => Math.round(n).toLocaleString();
    if (!(to > 0)) continue;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - (1 - k) ** 3;
      el.textContent = fmt(to * e);
      if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
    };
    requestAnimationFrame(step);
  }
}

export function confetti(n = 70) {
  if (!motionOn()) return;
  const box = document.createElement("div");
  box.id = "fx"; box.setAttribute("aria-hidden", "true");
  const h = ACCENTS[ui().accent] ?? 150, hues = [h, h + 40, h + 180, 45, 340, 200];
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.style.cssText = `left:${Math.random() * 100}%;background:hsl(${hues[i % hues.length]} 85% 58%);animation-delay:${Math.random() * 0.5}s;animation-duration:${1.4 + Math.random() * 1.2}s;width:${6 + Math.random() * 6}px;height:${8 + Math.random() * 8}px;--r:${Math.random() * 720 - 360}deg;--x:${Math.random() * 120 - 60}px`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3200);
  haptic(25);
}
