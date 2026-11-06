// Builds the plain-language coach notes from live app state (see stats.js for the rules).
import { S, X, byId, targets, foodDates, workoutDates, plannedDays, sum } from "./lib.js";
import { insights, stalledLifts } from "./stats.js";
import { loggedVolume } from "./routine.js";
import { weeklyCheck } from "./targets.js";
import { dayNum } from "./util.js";

export function coach() {
  const rows = (S.rangeSets ?? []).filter((r) => dayNum(S.today) - dayNum(r.date) < 7);
  const foodByDate = Object.fromEntries(S.overview.food.map((r) => [r.date, { kcal: r.kcal, protein: r.protein }]));
  if (S.food.length) foodByDate[S.today] = { kcal: sum(S.food, "kcal"), protein: sum(S.food, "protein") };
  return insights({
    today: S.today, volume: loggedVolume(rows, byId), byId, groups: X.groups, workoutDates: workoutDates(), plannedDays: plannedDays(),
    foodByDate, target: targets(), check: weeklyCheck(S.body, S.today, S.profile.phase, S.profile.lastAdjust), stalled: stalledLifts(S.rangeSets ?? []),
  });
}
export const insightCard = (i) => `<div class="card ins ${i.tone}"><div class="ico">${i.icon}</div><div><b>${i.title}</b><div class="dim">${i.text}</div></div></div>`;
