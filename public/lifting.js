// Barbell math: plates per side, warm-up sets, rep-max table. No DOM here.

// Plates for one side of a barbell. leftover = pounds (both sides together) that these plates can't make up.
export function plateSplit(total, bar = 45, avail = [45, 35, 25, 10, 5, 2.5]) {
  if (!(total >= bar)) return null;
  let side = (total - bar) / 2;
  const perSide = [];
  for (const p of avail) while (side + 1e-9 >= p) { perSide.push(p); side -= p; }
  return { perSide, leftover: Math.round(side * 2 * 100) / 100 };
}

// Common practice (not from a study): a few lighter sets before your first heavy exercise.
export const warmups = (w) => [[0.5, 8], [0.7, 5], [0.85, 2]].map(([p, reps]) => ({ weight: Math.max(0, Math.round((w * p) / 5) * 5), reps }));

// Epley formula run backwards: the weight you could lift for each rep count at a given estimated 1RM.
export const repMax = (e) => Array.from({ length: 12 }, (_, i) => ({ reps: i + 1, weight: i === 0 ? e : e / (1 + (i + 1) / 30) }));
