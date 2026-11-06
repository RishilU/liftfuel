// Pure helpers shared by the app and the Node tests (no DOM here).
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const r1 = (n) => Math.round(n * 10) / 10;
export const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
export const ymd = (d = new Date()) => d.toLocaleDateString("en-CA");
export const dayNum = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
export const e1rm = (w, r) => (r === 1 ? w : w * (1 + r / 30)); // Epley estimate
