import { $, esc, r1, S, ACTIONS, header, loadOverview, foodDates, workoutDates, plannedDays, currentWeight, targets, fmt, initials, go } from "./lib.js";
import { dayStreak, weekStreak, xp, level, achievements } from "./stats.js";
import { PHASES } from "./targets.js";

export async function renderProfile() {
  await loadOverview();
  const o = S.overview, t = targets(), fd = foodDates(), wd = workoutDates();
  const food = o.food.filter((r) => r.kcal > 0), per = Math.max(2, Math.floor(plannedDays() * 0.6));
  const stats = { workouts: wd.length, sets: o.sets, volume: o.volume, foodDays: fd.length, foodStreak: dayStreak(fd, S.today),
    proteinDays: food.filter((r) => r.protein >= t.proteinRange[0]).length, weighIns: o.weighIns, photos: o.photos, hasPlan: !!S.plan };
  const lv = level(xp(stats)), badges = achievements(stats), got = badges.filter((b) => b.done).length, wk = weekStreak(wd, S.today, per);
  const w = currentWeight();
  $("#view").innerHTML = `<header class="top"><div><h1>You</h1></div><button class="btn" data-act="closeProfile">Back</button></header>
    <div class="card hero profile-hero"><div class="avatar" aria-hidden="true">${esc(initials())}</div>
      <h2 class="big">${esc(S.profile.name || "Athlete")}</h2>
      <div>Level <b data-count="${lv.level}">${lv.level}</b> · <b>${fmt(lv.xp)}</b> XP</div>
      <div class="xp" role="progressbar" aria-valuenow="${lv.into}" aria-valuemax="${lv.need}" aria-label="Progress to next level"><i style="width:${(lv.into / lv.need) * 100}%"></i></div>
      <div class="dim">${fmt(lv.need - lv.into)} XP to level ${lv.level + 1}. Earn XP by training, logging food, weighing in and taking photos.</div></div>
    <div class="card"><h2>🔥 Streaks</h2><div class="stats">
      <div><b>${stats.foodStreak}</b><span class="dim">day food streak</span></div>
      <div><b>${wk}</b><span class="dim">weeks on plan</span></div>
      <div><b>${stats.workouts}</b><span class="dim">total workouts</span></div></div>
      <p class="dim">A "week on plan" means ${per}+ workouts that week.</p></div>
    <div class="card"><h2>📊 All-time</h2><div class="stats">
      <div><b>${fmt(stats.sets)}</b><span class="dim">sets</span></div>
      <div><b>${fmt(stats.volume)}</b><span class="dim">lb lifted</span></div>
      <div><b>${stats.foodDays}</b><span class="dim">days of food</span></div></div></div>
    <div class="card"><h2>🎯 Your goal</h2>
      <div class="row between item"><span>Phase</span><b>${PHASES[S.profile.phase].label}</b></div>
      <div class="row between item"><span>Weight</span><b>${w ? r1(w) + " lb" : "not logged"}</b></div>
      <div class="row between item"><span>Daily calories</span><b>${fmt(t.kcal)}</b></div>
      <div class="row between item"><span>Daily protein</span><b>${t.protein} g</b></div>
      <div class="row between item"><span>Training days</span><b>${plannedDays()} a week</b></div>
      <button class="btn wide" data-act="settings">Edit in Settings</button></div>
    <div class="card"><div class="meal-h"><h2>🏅 Badges</h2><span class="dim">${got} of ${badges.length}</span></div>
      <div class="achs">${badges.map((b) => `<div class="ach ${b.done ? "done" : "locked"}"><span class="e">${b.icon}</span><b>${esc(b.name)}</b><div class="dim">${esc(b.desc)}</div>
        ${b.done ? `<div class="ok"><b>Earned ✓</b></div>` : `<div class="dim">${fmt(b.have)} / ${fmt(b.need)}</div><div class="bar"><i style="width:${(b.have / b.need) * 100}%"></i></div>`}</div>`).join("")}</div></div>`;
}

ACTIONS.profile = () => { go("profile"); };
ACTIONS.closeProfile = () => { S.tab = S.prevTab ?? "eat"; };
