import { $, esc, r1, S, X, byId, api, hooks, cache, ACTIONS, CHANGES, toast, openSheet, closeSheet, header, seg, stepper, badge, saveSetting, saveRoutine, e1rm, dayNum, lineSvg, go, loadRange, shiftDay, workoutDates, fmt } from "./lib.js";
import { TEMPLATES, defaultRoutine, plannedVolume, loggedVolume, setsByGroup, volumeClass, VOLUME_TARGET, nextLoad, primary } from "./routine.js";
import { plateSplit, warmups, repMax } from "./lifting.js";
import { mondayOf } from "./stats.js";
import { coach, insightCard } from "./coach.js";
import { confetti, haptic } from "./fx.js";
import { cardioCard } from "./extras.js";

export const dayIdx = () => { const [d, i] = S.settings.anchor.split("|"); return (((Number(i) + dayNum(S.today) - dayNum(d)) % 7) + 7) % 7; };
// ---------- offline: sets logged with no signal wait in the phone's storage, then sync ----------
const QK = "setq";
const queue = () => cache.get(QK, []);
const pendingToday = () => queue().filter((q) => q.date === S.today).map((q) => ({ id: "q" + q.t, date: q.date, exercise_id: q.exercise_id, weight: q.weight, reps: q.reps, note: q.note ?? null, pending: true }));
export const loadToday = async () => {
  let rows;
  try { rows = await api("/api/sets?date=" + S.today); cache.set("setsToday", { date: S.today, rows }); }
  catch (e) { if (!e.offline) throw e; const c = cache.get("setsToday", null); rows = c?.date === S.today ? c.rows : S.sets.filter((r) => !r.pending); }
  S.sets = [...rows, ...pendingToday()];
};
async function loadHist(id) {
  try { S.hist[id] = await api("/api/sets?exercise=" + encodeURIComponent(id)); cache.set("hist:" + id, S.hist[id].slice(0, 40)); }
  catch (e) { if (!e.offline) throw e; S.hist[id] ??= cache.get("hist:" + id, []); }
}
// sends queued sets in order; stops at the first failure and keeps the rest.
// One run at a time: "online", app resume and boot can all fire together, and two runs would post every set twice.
let flushing = null;
export const flushQueue = () => (flushing ??= sendQueue().finally(() => { flushing = null; }));
async function sendQueue() {
  let n = 0;
  for (const r of queue()) {
    try { await api("/api/sets", { method: "POST", body: { date: r.date, exercise_id: r.exercise_id, weight: r.weight, reps: r.reps, note: r.note } }); }
    catch { break; }
    cache.set(QK, queue().filter((x) => x.t !== r.t)); n++;
  }
  if (n) { await loadToday(); S.rangeSets = null; toast(`Synced ${n} set${n > 1 ? "s" : ""} ✓`); }
}
const groupName = (id) => X.groups.find((g) => g.id === id).name;
const exOptions = () => X.groups.map((g) => `<optgroup label="${g.name}">${X.exercises.filter((e) => primary(e) === g.id).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</optgroup>`).join("");
const PRESETS = ["3-5", "5-8", "6-10", "8-12", "10-15", "12-20"];
const prevBest = (id) => Math.max(0, ...(S.hist[id] || []).filter((s) => s.date < S.today).map((s) => e1rm(s.weight, s.reps)));

// ---------- today ----------
function todayCards() {
  const day = S.routine.days[dayIdx()];
  const planned = day.ex.map((s, i) => ({ ...s, i }));
  const known = new Set(planned.map((s) => s.id));
  const others = [...new Set([...S.sets.map((s) => s.exercise_id), ...S.extra])].filter((id) => byId[id] && !known.has(id)).map((id) => ({ id, sets: 3, reps: [8, 12], i: -1 }));
  const order = cache.get("order:" + S.today, []); // today-only order from the Reorder screen
  return [...planned, ...others].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
}

function weekStrip() {
  const start = mondayOf(S.today, S.profile.weekStart ?? 1), done = new Set(workoutDates());
  return `<div class="week" aria-label="This week">${Array.from({ length: 7 }, (_, k) => {
    const date = new Date((dayNum(start) + k) * 864e5).toISOString().slice(0, 10), off = dayNum(date) - dayNum(S.today);
    const plan = S.routine.days[(((dayIdx() + off) % 7) + 7) % 7].ex.length > 0, isDone = done.has(date);
    return `<div class="d ${isDone ? "done" : ""} ${plan ? "plan" : ""} ${date === S.today ? "now" : ""}"><span>${["S", "M", "T", "W", "T", "F", "S"][new Date(date + "T12:00:00").getDay()]}</span><b>${isDone ? "✓" : Number(date.slice(8))}</b></div>`;
  }).join("")}</div>`;
}

const quickSteps = () => `<div class="row chips">${[-10, -2.5, 2.5, 10].map((d) => `<button class="chip sm" data-act="wstep" data-d="${d}" aria-label="${d > 0 ? "Add" : "Take off"} ${Math.abs(d)} pounds">${d > 0 ? "+" : "−"}${Math.abs(d)}</button>`).join("")}</div>`;

function exCard(spec, n) {
  const e = byId[spec.id];
  const done = S.sets.filter((s) => s.exercise_id === spec.id);
  const prev = (S.hist[spec.id] || []).filter((s) => s.date < S.today);
  const last = prev.filter((s) => s.date === prev[0]?.date).reverse();
  const nl = nextLoad(last, spec), best = prevBest(spec.id);
  const full = done.length >= spec.sets;
  const w = done.length ? done.at(-1).weight : nl.weight ?? last[0]?.weight ?? "";
  const reps = done.length ? done.at(-1).reps : nl.up ? spec.reps[0] : last[0]?.reps ?? spec.reps[0];
  const work = nl.weight ?? last[0]?.weight;
  const warm = n === 0 && !done.length && work >= 45 ? `<details><summary class="dim">🔥 Warm-up sets</summary><p class="small">${warmups(work).map((x) => `<b>${x.weight} lb</b> × ${x.reps}`).join(" → ")} <span class="dim">(common practice, not from a study)</span></p></details>` : "";
  return `<div class="card ex ${full ? "complete" : ""}" data-ex="${spec.id}" data-ei="${spec.i}">
    <div class="row between top"><div><h2><button data-act="exinfo" data-id="${spec.id}" aria-label="Details for ${esc(e.name)}">${esc(e.name)} ›</button></h2><div class="dim">${spec.sets} sets × ${spec.reps[0]}-${spec.reps[1]} reps</div></div>
      <div>${full ? `<span class="ok"><b>Done ✓</b></span>` : `<span class="dim">${done.length} of ${spec.sets}</span>`}</div></div>
    ${S.chart === spec.id ? chart(spec.id) : ""}
    <div class="tip ${nl.up ? "up" : ""}">${nl.up ? "📈 " : ""}${esc(nl.note)}</div>
    ${warm}
    ${last.length ? `<div class="dim">Last time: ${last.map((s) => `${s.weight}×${s.reps}`).join(", ")}</div>` : ""}
    ${done.length ? `<div class="row chips">${done.map((s, k) => { const pr = best > 0 && e1rm(s.weight, s.reps) > best;
      return `<span class="logged ${pr ? "pr" : ""}" role="button" tabindex="0" data-act="editset" data-id="${s.id}" aria-label="Edit set ${k + 1}: ${s.weight} pounds, ${s.reps} reps">${pr ? "🏆 " : ""}${s.pending ? "⏳ " : ""}${k + 1}. ${s.weight} lb × ${s.reps}${s.note ? `<span class="note" title="${esc(s.note)}">📝</span>` : ""}</span>`; }).join("")}</div><div class="dim small">Tap a set to change or remove it.</div>` : ""}
    <div class="inputs"><div><label>Weight (lb)</label>${stepper("w", w, 5, "weight in pounds")}</div><div><label>Reps</label>${stepper("r", reps, 1, "reps")}</div></div>
    ${quickSteps()}
    <button class="btn primary wide" data-act="add">${full ? "Add an extra set" : `Log set ${done.length + 1}`}</button>
    <div class="row between sub"><button class="link" data-act="chart">${S.chart === spec.id ? "Hide progress" : "See progress"}</button>
      ${spec.i >= 0 ? `<button class="link" data-act="swapToday">Swap exercise</button>` : ""}</div></div>`;
}

function reorderCard(cards) {
  return `<div class="card"><h2>↕ Reorder today</h2><p class="dim">Hold ⠿ and drag. This only changes today. To change your plan, use My plan.</p>
    ${cards.map((c) => `<div class="card ered" data-drag="today" data-id="${c.id}"><div class="row nowrap"><button class="grip" aria-label="Hold and drag to reorder ${esc(byId[c.id].name)}">⠿</button><b>${esc(byId[c.id].name)}</b></div></div>`).join("")}
    <button class="btn primary wide" data-act="reorder">Done</button></div>`;
}

function chart(id) {
  const best = {};
  for (const r of S.hist[id] || []) best[r.date] = Math.max(best[r.date] ?? 0, e1rm(r.weight, r.reps));
  return `<div class="chartbox">${lineSvg(Object.entries(best).sort().slice(-20).map(([d, v]) => [d, Math.round(v)]), "estimated best lift, lb")}</div>`;
}

async function today() {
  if (!S.rangeSets) await loadRange(120);
  const day = S.routine.days[dayIdx()], cards = todayCards();
  await Promise.all(cards.filter((c) => !S.hist[c.id]).map((c) => loadHist(c.id)));
  const plan = cards.reduce((a, c) => a + c.sets, 0), done = cards.reduce((a, c) => a + Math.min(c.sets, S.sets.filter((s) => s.exercise_id === c.id).length), 0);
  const next = S.routine.days[(dayIdx() + 1) % 7], notes = coach().filter((i) => i.area === "train").slice(0, 2);
  return `<div class="card hero"><div class="row between"><div><div class="dim">Today</div><h2 class="huge">${esc(day.name)}</h2></div>
      ${plan ? `<div class="right"><b class="big">${done}</b> of ${plan}<div class="dim">sets</div></div>` : ""}</div>
    ${plan ? `<div class="bar" role="progressbar" aria-valuenow="${done}" aria-valuemax="${plan}" aria-label="Sets done"><i style="width:${(done / plan) * 100}%"></i></div>` : ""}
    ${weekStrip()}
    <details><summary class="dim">Not the right day?</summary><select data-change="setday" aria-label="Today is">${S.routine.days.map((d, i) => `<option value="${i}" ${i === dayIdx() ? "selected" : ""}>${esc(d.name)}${d.ex.length ? "" : " (rest)"} - day ${i + 1}</option>`).join("")}</select></details></div>
    ${day.ex.length ? "" : `<div class="card"><h2>😴 Rest day</h2><p>Muscles grow while you rest. Tomorrow: <b>${esc(next.name)}</b>.</p><p class="dim">Want to train anyway? Add an exercise below.</p></div>`}
    ${notes.map(insightCard).join("")}
    ${S.reorder && cards.length > 1 ? reorderCard(cards) : `${cards.length > 1 ? `<button class="btn wide" data-act="reorder">↕ Reorder today's exercises</button>` : ""}${cards.map(exCard).join("")}`}
    <div class="card"><label class="dim" for="addex">Add another exercise</label><select id="addex" data-change="addex"><option value="">Choose…</option>${exOptions()}</select></div>
    ${cardioCard()}
    ${S.sets.length ? `<button class="btn primary wide" data-act="finish">🏁 Finish workout</button>` : ""}`;
}

// ---------- exercise details ----------
const platesHtml = (w) => { const p = plateSplit(w); return !p ? `<span class="dim">Bar is 45 lb. Type a weight of 45 or more.</span>` : p.perSide.length ? `${p.perSide.map((x) => `<span class="plate">${x}</span>`).join(" ")} <span class="dim">on each side</span>${p.leftover ? ` <span class="warn">(${p.leftover} lb can't be made)</span>` : ""}` : `<span class="dim">Just the empty bar.</span>`; };

async function exSheet(id) {
  if (!S.hist[id]) await loadHist(id);
  const e = byId[id], rows = S.hist[id], work = rows[0]?.weight ?? 95;
  const bestSet = rows.reduce((b, r) => (!b || e1rm(r.weight, r.reps) > e1rm(b.weight, b.reps) ? r : b), null);
  const days = {}; for (const r of rows) (days[r.date] ??= []).push(r);
  const dates = Object.keys(days).sort().reverse().slice(0, 5), vol = rows.reduce((a, r) => a + r.weight * r.reps, 0);
  const est = bestSet ? e1rm(bestSet.weight, bestSet.reps) : 0;
  openSheet(`<h2>${esc(e.name)}</h2>
    <div class="row chips">${Object.keys(e.roles).map((g, i) => `<span class="badge ${i === 0 ? "direct" : ""}">${groupName(g)}${i === 0 ? " (main)" : ""}</span>`).join("")}${badge(e.ev)}</div>
    <div class="dim">${esc(e.equip)}</div><p class="small">${esc(e.why)}</p>
    ${e.src.map((k) => `<div class="small"><a href="${esc(X.sources[k].url)}" target="_blank" rel="noopener">${esc(X.sources[k].label)}</a></div>`).join("")}
    <div class="card"><h2>Your stats</h2>${rows.length ? `<div class="stats"><div><b>${bestSet.weight}×${bestSet.reps}</b><span class="dim">best set</span></div><div><b>${Math.round(est)}</b><span class="dim">est. 1-rep max</span></div><div><b>${fmt(vol)}</b><span class="dim">lb lifted</span></div></div>
      ${chart(id)}${dates.map((d) => `<div class="item"><b>${new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</b> <span class="dim">${days[d].slice().reverse().map((s) => `${s.weight}×${s.reps}`).join(", ")}</span></div>`).join("")}` : `<p class="dim">No sets logged yet.</p>`}</div>
    ${est ? `<details class="card"><summary><b>Rep-max table</b> <span class="dim">(estimate)</span></summary><table class="rm">${repMax(est).filter((r) => [1, 3, 5, 8, 10, 12].includes(r.reps)).map((r) => `<tr><td>${r.reps} rep${r.reps > 1 ? "s" : ""}</td><td>${Math.round(r.weight)} lb</td></tr>`).join("")}</table></details>` : ""}
    ${/barbell/i.test(e.equip) ? `<div class="card"><h2>Plate calculator</h2><label class="dim" for="pw">Total weight (lb), 45 lb bar</label><input id="pw" type="number" inputmode="decimal" value="${work}" data-change="plates"><div id="plates" style="margin-top:8px">${platesHtml(work)}</div></div>` : ""}`);
}

// ---------- finish workout ----------
function finishSheet() {
  const rows = S.sets, vol = rows.reduce((a, r) => a + r.weight * r.reps, 0), by = {};
  for (const r of rows) (by[r.exercise_id] ??= []).push(r);
  const prs = Object.entries(by).filter(([id, rs]) => prevBest(id) > 0 && Math.max(...rs.map((r) => e1rm(r.weight, r.reps))) > prevBest(id)).map(([id]) => byId[id].name);
  const groups = setsByGroup(rows.map((r) => ({ id: r.exercise_id, sets: 1 })), byId);
  const text = `Workout done: ${rows.length} sets, ${fmt(vol)} lb lifted${prs.length ? `, new bests: ${prs.join(", ")}` : ""}. 💪`;
  S.share = text;
  openSheet(`<div class="center"><div style="font-size:3rem">🏁</div><h2>Workout complete!</h2></div>
    <div class="stats"><div><b>${rows.length}</b><span class="dim">sets</span></div><div><b>${Object.keys(by).length}</b><span class="dim">exercises</span></div><div><b>${fmt(vol)}</b><span class="dim">lb lifted</span></div></div>
    <div class="row chips">${Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<span class="badge direct">${groupName(g)} · ${r1(n)}</span>`).join("")}</div>
    ${prs.length ? `<div class="card note"><b>🏆 New personal bests</b><p>${prs.map(esc).join(", ")}</p></div>` : ""}
    <p class="center dim">Nice work. Eat well and sleep well: that is when you grow.</p>
    ${navigator.share ? `<button class="btn" data-act="shareWorkout">Share</button>` : ""}`);
  confetti(prs.length ? 110 : 60);
}

// ---------- routine ----------
function volumePanel() {
  const v = plannedVolume(S.routine.days, byId);
  return `<div class="card"><h2>Sets per muscle each week</h2>
    <p class="dim">Aim for about ${VOLUME_TARGET}. Studies found more weekly sets gave more growth; they could not say if going past about ${VOLUME_TARGET} adds more. <a href="${X.sources.volume_meta.url}" target="_blank" rel="noopener">Source</a></p>
    ${X.groups.map((g) => { const n = v[g.id] ?? 0, c = volumeClass(n);
      return `<div class="row between"><span>${g.name}</span><b>${r1(n)}</b></div><div class="bar vol-${c}"><i style="width:${Math.min(100, (n / VOLUME_TARGET) * 100)}%"></i></div>`; }).join("")}
    <p class="dim">Muscles an exercise also works count half a set.</p></div>`;
}

function dayEditor(i) {
  const d = S.routine.days[i];
  return `<div class="editor" data-di="${i}">
    <label class="dim" for="dn${i}">Day name</label><input id="dn${i}" class="wide" value="${esc(d.name)}" data-change="rname" data-di="${i}" maxlength="30">
    ${d.ex.map((s, j) => { const opts = PRESETS.includes(s.reps.join("-")) ? PRESETS : [s.reps.join("-"), ...PRESETS];
      return `<div class="card ered" data-drag="plan" data-di="${i}" data-ei="${j}"><div class="row between"><span class="row nowrap"><button class="grip" aria-label="Hold and drag to reorder ${esc(byId[s.id].name)}">⠿</button><b>${esc(byId[s.id].name)}</b></span>
        <span class="row"><button class="icon sm" data-act="mv" data-d="-1" aria-label="Move up" ${j === 0 ? "disabled" : ""}>▲</button><button class="icon sm" data-act="mv" data-d="1" aria-label="Move down" ${j === d.ex.length - 1 ? "disabled" : ""}>▼</button></span></div>
        <div class="row"><span class="stepper compact"><button class="step" data-act="rsets" data-d="-1" aria-label="Fewer sets">−</button><span class="val">${s.sets} sets</span><button class="step" data-act="rsets" data-d="1" aria-label="More sets">+</button></span>
          <select data-change="rreps" aria-label="Rep range">${opts.map((o) => `<option value="${o}" ${o === s.reps.join("-") ? "selected" : ""}>${o.replace("-", "–")} reps</option>`).join("")}</select></div>
        <div class="row"><button class="btn" data-act="rswap">Swap</button><button class="btn danger" data-act="rrm">Remove</button></div></div>`; }).join("")}
    <label class="dim" for="ra${i}">Add an exercise</label><select id="ra${i}" data-change="radd" data-di="${i}"><option value="">Choose…</option>${exOptions()}</select>
    ${d.ex.length ? `<button class="btn wide" data-act="mkrest" data-di="${i}">Make this a rest day</button>` : ""}
    <button class="btn primary wide" data-act="editday" data-di="${i}">Done</button></div>`;
}

function routineView() {
  const t = TEMPLATES[S.routine.template];
  return `<div class="card"><h2>Your plan</h2><p class="dim">${esc(t?.label ?? "Custom")}. Tap a day to change it.</p>
    <details><summary class="dim">Start from a different plan</summary>
      <select id="tmpl" aria-label="Plan">${Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}" ${k === S.routine.template ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select>
      <button class="btn wide" data-act="applyTemplate">Use this plan (replaces your current one)</button></details>
    ${t?.note ? `<p class="dim">${esc(t.note)}</p>` : ""}</div>
    ${S.routine.days.map((d, i) => `<div class="card day ${i === dayIdx() ? "today" : ""}">
      <div class="row between"><div><b>${esc(d.name)}</b>${i === dayIdx() ? ` <span class="badge direct">today</span>` : ""}<div class="dim">${d.ex.length ? `${d.ex.length} exercises · ${d.ex.reduce((a, s) => a + s.sets, 0)} sets` : "Rest day"}</div></div>
        <button class="btn" data-act="editday" data-di="${i}">${S.editDay === i ? "Close" : "Edit"}</button></div>
      ${S.editDay === i ? dayEditor(i) : d.ex.length ? `<div class="dim">${d.ex.map((s) => esc(byId[s.id].name)).join(" · ")}</div>` : ""}</div>`).join("")}
    ${volumePanel()}
    <div class="card"><h2>How this plan is built</h2><ul class="tight">
      <li>Each muscle is trained about twice a week. With equal weekly sets, training frequency made no meaningful difference to growth. <a href="${X.sources.freq_meta.url}" target="_blank" rel="noopener">Source</a></li>
      <li>Exercise picks favour stretched positions where research supports it (see the Muscles tab).</li>
      <li>Stop most sets with 1-3 reps left. A review found no evidence that going to failure is better for growth, and an 8-week trial found similar growth with 1-2 reps left. <a href="${X.sources.failure_meta.url}" target="_blank" rel="noopener">Review</a> · <a href="${X.sources.failure_rir.url}" target="_blank" rel="noopener">Trial</a></li>
      <li>Light and heavy loads grew muscle fibres similarly; heavier loads gave greater strength gains. <a href="${X.sources.load_fiber.url}" target="_blank" rel="noopener">Growth</a> · <a href="${X.sources.load_meta.url}" target="_blank" rel="noopener">Strength</a></li>
      <li>Add weight when you hit the top of the rep range on every set (a common rule, not from a study).</li></ul>
      <p class="dim">I read abstracts, not full papers.</p></div>`;
}

// ---------- muscles ----------
const EV = { direct: "Tested in a study", principle: "Inferred from related research", limited: "Practical pick, no direct trial" };
async function muscles() {
  if (!S.rangeSets) await loadRange(120);
  const g = S.group, week = loggedVolume(S.rangeSets.filter((r) => dayNum(S.today) - dayNum(r.date) < 7), byId);
  const list = X.exercises.filter((e) => e.roles[g]).sort((a, b) => (b.roles[g] === "preferred") - (a.roles[g] === "preferred"));
  return `<div class="grid">${X.groups.map((x) => `<button class="${x.id === g ? "on" : volumeClass(week[x.id] ?? 0)}" data-act="group" data-g="${x.id}">${x.name}<span class="v">${r1(week[x.id] ?? 0)} sets this week</span></button>`).join("")}</div>
    <p class="dim">The line under each muscle shows this week: green is about ${VOLUME_TARGET} sets or more, amber is 6-9, red is under 6. Tap one to see the best exercises for it.</p>
    ${list.map((e) => `<div class="card ${e.roles[g] === "preferred" ? "pref" : ""}">
      <div class="row between"><h2>${esc(e.name)}</h2>${badge(e.ev)}</div>
      ${e.roles[g] === "preferred" ? `<div class="ok"><b>⭐ Best pick</b></div>` : ""}
      <div class="dim">${esc(e.equip)} · ${EV[e.ev]}</div><p>${esc(e.why)}</p>
      ${e.src.map((k) => `<div><a href="${esc(X.sources[k].url)}" target="_blank" rel="noopener">${esc(X.sources[k].label)}</a></div>`).join("")}
      <div class="row" style="margin-top:8px"><button class="btn primary" data-act="addtoday" data-id="${e.id}">Add to today</button><button class="btn" data-act="addtoroutine" data-id="${e.id}">Add to my plan</button><button class="btn" data-act="exinfo" data-id="${e.id}">Details</button></div></div>`).join("")}`;
}

// ---------- history ----------
async function history() {
  if (!S.rangeSets) await loadRange(120);
  const by = {};
  for (const r of S.rangeSets) ((by[r.date] ??= {})[r.exercise_id] ??= []).push(r);
  const dates = Object.keys(by).sort().reverse().slice(0, 60);
  if (!dates.length) return `<div class="card center"><div style="font-size:2.5rem">📒</div><p><b>No workouts yet.</b></p><p class="dim">Your sessions will show up here.</p></div>`;
  return dates.map((d) => { const vol = Object.values(by[d]).flat().reduce((a, r) => a + r.weight * r.reps, 0);
    return `<div class="card"><div class="meal-h"><h2>${new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</h2><span class="dim">${fmt(vol)} lb</span></div>
    ${Object.entries(by[d]).map(([id, rows]) => `<div class="item"><b>${esc(byId[id]?.name ?? id)}</b><div class="row chips">${rows.map((r) => `<span class="logged" role="button" tabindex="0" data-act="editset" data-id="${r.id}" aria-label="Edit ${r.weight} pounds, ${r.reps} reps">${r.weight} × ${r.reps}${r.note ? `<span class="note" title="${esc(r.note)}">📝</span>` : ""}</span>`).join("")}</div></div>`).join("")}</div>`; }).join("");
}

export async function renderTrain() {
  const body = S.trainTab === "today" ? await today() : S.trainTab === "routine" ? routineView() : S.trainTab === "muscles" ? await muscles() : await history();
  $("#view").innerHTML = `${header("Train")}${seg([["today", "Today"], ["routine", "My plan"], ["muscles", "Muscles"], ["history", "History"]], S.trainTab, "traintab")}${body}`;
}

// ---------- swap / add sheets ----------
function openSwap(di, ei) {
  const cur = byId[S.routine.days[di].ex[ei].id], g = primary(cur), inDay = S.routine.days[di].ex.map((s) => s.id);
  const alts = X.exercises.filter((e) => e.roles[g] && e.id !== cur.id && !inDay.includes(e.id)).sort((a, b) => (b.roles[g] === "preferred") - (a.roles[g] === "preferred"));
  openSheet(`<h2>Swap ${esc(cur.name)}</h2><p class="dim">Other ${groupName(g).toLowerCase()} exercises. This changes your plan.</p>
    ${alts.map((e) => `<div class="card ${e.roles[g] === "preferred" ? "pref" : ""}"><div class="row between"><b>${esc(e.name)}</b>${badge(e.ev)}</div>
      <div class="dim">${esc(e.equip)}</div><p class="small">${esc(e.why)}</p>
      <button class="btn" data-act="doswap" data-di="${di}" data-ei="${ei}" data-id="${e.id}">Use this</button></div>`).join("") || "<p>No other options for this muscle.</p>"}`);
}

const findSet = (id) => [...S.sets, ...(S.rangeSets ?? [])].find((s) => String(s.id) === String(id));
// remove a set (saved, or still waiting in the offline queue); returns what was removed so it can be put back
async function removeSet(id) {
  id = String(id);
  const row = findSet(id);
  if (id.startsWith("q")) cache.set(QK, queue().filter((q) => "q" + q.t !== id));
  else await api("/api/sets/" + id, { method: "DELETE" });
  await Promise.all([loadToday(), row && loadHist(row.exercise_id)]); S.rangeSets = null;
  return row;
}
async function restoreSet(r) {
  const row = { date: r.date, exercise_id: r.exercise_id, weight: r.weight, reps: r.reps, note: r.note ?? undefined };
  if (r.pending) cache.set(QK, [...queue(), { ...row, t: Number(String(r.id).slice(1)) }]);
  else await api("/api/sets", { method: "POST", body: row });
  await Promise.all([loadToday(), loadHist(r.exercise_id)]); S.rangeSets = null;
}
async function logSet(id, weight, reps) {
  const best = prevBest(id), row = { date: S.today, exercise_id: id, weight, reps };
  let queued = false, undo;
  try { const r = await api("/api/sets", { method: "POST", body: row }); undo = () => removeSet(r.id); }
  catch (e) {
    if (!e.offline) throw e;
    queued = true; const t = Date.now(); cache.set(QK, [...queue(), { ...row, t }]); undo = () => removeSet("q" + t);
    toast("No signal: saved on your phone, it will sync later 📶");
  }
  await Promise.all([loadToday(), loadHist(id)]);
  S.rangeSets = null; haptic();
  if (best > 0 && e1rm(weight, reps) > best) { toast("New personal best! 🏆", undo); confetti(80); } else if (!queued) toast("Set logged ✓", undo);
  S.rest = { end: Date.now() + (S.profile.restSec || 120) * 1000, total: S.profile.restSec || 120 };
  // finished this exercise: bring the next unfinished one into view
  setTimeout(() => {
    const c = document.querySelector(`[data-ex="${id}"]`);
    if (!c?.classList.contains("complete")) return;
    [...document.querySelectorAll(".ex:not(.complete)")].find((x) => x.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_PRECEDING)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, 450);
}

Object.assign(ACTIONS, {
  traintab: (t) => { S.trainTab = t.dataset.v; },
  group: (t) => { S.group = t.dataset.g; S.trainTab = "muscles"; go("train"); },
  addtoday: (t) => { if (!S.extra.includes(t.dataset.id)) S.extra.push(t.dataset.id); S.trainTab = "today"; go("train"); toast("Added to today"); },
  addtoroutine: (t) => {
    openSheet(`<h2>Add to which day?</h2>${S.routine.days.map((d, i) => `<button class="btn wide" data-act="pickday" data-di="${i}" data-id="${t.dataset.id}">${esc(d.name)}${d.ex.length ? "" : " (rest day)"} - day ${i + 1}</button>`).join("")}`);
    return false;
  },
  pickday: async (t) => {
    S.routine.days[t.dataset.di].ex.push({ id: t.dataset.id, sets: 3, reps: [8, 12] });
    if (S.routine.days[t.dataset.di].name === "Rest") S.routine.days[t.dataset.di].name = "Day " + (+t.dataset.di + 1);
    await saveRoutine(); closeSheet(); toast("Added to your plan");
  },
  chart: (t, card) => { S.chart = S.chart === card.dataset.ex ? null : card.dataset.ex; },
  exinfo: async (t) => { await exSheet(t.dataset.id); return false; },
  reorder: () => { S.reorder = !S.reorder; },
  wstep: (t) => { const inp = $("[name=w]", t.closest("[data-ex], .sheet-card")); inp.value = Math.max(0, r1((parseFloat(inp.value) || 0) + Number(t.dataset.d))); return false; },
  editset: (t) => {
    const s = findSet(t.dataset.id);
    if (!s) return false;
    openSheet(`<h2>Edit set</h2><div class="dim">${esc(byId[s.exercise_id]?.name ?? s.exercise_id)} · ${new Date(s.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
      <div class="inputs"><div><label>Weight (lb)</label>${stepper("w", s.weight, 5, "weight in pounds")}</div><div><label>Reps</label>${stepper("r", s.reps, 1, "reps")}</div></div>
      ${quickSteps()}
      <input name="note" maxlength="120" value="${esc(s.note ?? "")}" placeholder="Note (optional), like seat 4 or left shoulder tight" aria-label="Note">
      <button class="btn primary wide" data-act="saveset" data-id="${s.id}">Save</button>
      <button class="btn danger wide" data-act="delset" data-id="${s.id}">Remove this set</button>`);
    return false;
  },
  saveset: async (t) => {
    const id = String(t.dataset.id), s = findSet(id), weight = parseFloat($("#sheet [name=w]").value), reps = parseInt($("#sheet [name=r]").value, 10), note = $("#sheet [name=note]").value.trim().slice(0, 120);
    if (!(weight >= 0) || !(reps >= 1)) throw new Error("Type the weight and the number of reps.");
    if (id.startsWith("q")) cache.set(QK, queue().map((q) => ("q" + q.t === id ? { ...q, weight, reps, note } : q)));
    else await api("/api/sets/" + id, { method: "PATCH", body: { weight, reps, note } });
    closeSheet(); await Promise.all([loadToday(), loadHist(s.exercise_id)]); S.rangeSets = null; haptic(); toast("Set updated ✓");
  },
  delset: async (t) => {
    closeSheet();
    const row = await removeSet(t.dataset.id);
    toast("Set removed", () => restoreSet(row));
  },
  add: async (t, card) => {
    const weight = parseFloat($("[name=w]", card).value), reps = parseInt($("[name=r]", card).value, 10);
    if (!(weight >= 0) || !(reps >= 1)) throw new Error("Type the weight and the number of reps.");
    await logSet(card.dataset.ex, weight, reps);
  },
  finish: () => { finishSheet(); return false; },
  shareWorkout: async () => { try { await navigator.share({ text: S.share }); } catch {} return false; },
  swapToday: (t, card) => { openSwap(dayIdx(), Number(card.dataset.ei)); return false; },
  doswap: async (t) => { S.routine.days[t.dataset.di].ex[t.dataset.ei].id = t.dataset.id; await saveRoutine(); closeSheet(); toast("Swapped"); },

  editday: (t) => { const i = Number(t.dataset.di); S.editDay = S.editDay === i ? null : i; },
  mv: async (t) => {
    const c = t.closest("[data-ei]"), di = +c.dataset.di, ei = +c.dataset.ei, d = +t.dataset.d, a = S.routine.days[di].ex;
    [a[ei], a[ei + d]] = [a[ei + d], a[ei]]; await saveRoutine();
  },
  rsets: async (t) => {
    const c = t.closest("[data-ei]"), s = S.routine.days[c.dataset.di].ex[c.dataset.ei];
    s.sets = Math.min(10, Math.max(1, s.sets + Number(t.dataset.d))); await saveRoutine();
  },
  rrm: async (t) => { const c = t.closest("[data-ei]"); S.routine.days[c.dataset.di].ex.splice(c.dataset.ei, 1); await saveRoutine(); },
  rswap: (t) => { const c = t.closest("[data-ei]"); openSwap(+c.dataset.di, +c.dataset.ei); return false; },
  mkrest: async (t) => { const d = S.routine.days[t.dataset.di]; if (!confirm("Remove all exercises from this day?")) return false; d.ex = []; d.name = "Rest"; S.editDay = null; await saveRoutine(); },
  applyTemplate: async () => {
    if (!confirm("This replaces your whole plan. Your logged workouts stay.")) return false;
    S.routine = defaultRoutine($("#tmpl").value); S.editDay = null; await saveRoutine(); toast("Plan updated");
  },
});

Object.assign(CHANGES, {
  setday: async (el) => { S.settings.anchor = `${S.today}|${el.value}`; await api("/api/settings", { method: "PUT", body: { key: "anchor", value: S.settings.anchor } }); },
  addex: (el) => { if (el.value && !S.extra.includes(el.value)) S.extra.push(el.value); },
  plates: (el) => { $("#plates").innerHTML = platesHtml(parseFloat(el.value) || 0); },
  rname: async (el) => { S.routine.days[el.dataset.di].name = el.value.trim() || "Day"; await saveRoutine(); },
  rreps: async (el) => { const c = el.closest("[data-ei]"); S.routine.days[c.dataset.di].ex[c.dataset.ei].reps = el.value.split("-").map(Number); await saveRoutine(); },
  radd: async (el) => {
    if (!el.value) return;
    const d = S.routine.days[el.dataset.di];
    d.ex.push({ id: el.value, sets: 3, reps: [8, 12] });
    if (d.name === "Rest") d.name = "Day " + (+el.dataset.di + 1);
    await saveRoutine();
  },
});

// Drag any [data-drag] card by its ⠿ handle (pointer events: finger or mouse). Cards slide aside as you pass them; the page scrolls near the screen edge.
const DROPS = {
  plan: async (card, from, to) => { const a = S.routine.days[card.dataset.di].ex; a.splice(to, 0, a.splice(from, 1)[0]); await saveRoutine(); },
  today: (card, from, to) => { const ids = [...card.parentElement.querySelectorAll(":scope > [data-drag]")].map((c) => c.dataset.id); ids.splice(to, 0, ids.splice(from, 1)[0]); cache.set("order:" + S.today, ids); },
};
document.addEventListener("pointerdown", (ev) => {
  const grip = ev.target.closest(".grip");
  if (!grip) return;
  const card = grip.closest("[data-drag]"), cards = [...card.parentElement.querySelectorAll(":scope > [data-drag]")], from = cards.indexOf(card);
  const y0 = window.scrollY, top = (c) => c.getBoundingClientRect().top + y0, startY = ev.clientY + y0;
  const tops = cards.map(top), hs = cards.map((c) => c.offsetHeight), gap = cards[1] ? tops[1] - tops[0] - hs[0] : 8, step = hs[from] + gap;
  let to = from, lastY = ev.clientY, raf = 0;
  grip.setPointerCapture(ev.pointerId); card.classList.add("drag"); cards.forEach((c) => c !== card && c.classList.add("slide"));
  const update = () => {
    const dy = lastY + window.scrollY - startY, mid = tops[from] + hs[from] / 2 + dy;
    card.style.transform = `translateY(${dy}px)`;
    // new slot = number of other cards whose centre is above the dragged card's centre
    to = cards.filter((_, i) => i !== from && tops[i] + hs[i] / 2 < mid).length;
    cards.forEach((c, i) => { if (i !== from) c.style.transform = from < to && i > from && i <= to ? `translateY(${-step}px)` : to < from && i >= to && i < from ? `translateY(${step}px)` : ""; });
  };
  const tick = () => {
    if (lastY < 90) window.scrollBy(0, -12); else if (lastY > innerHeight - 90) window.scrollBy(0, 12);
    update(); raf = requestAnimationFrame(tick);
  };
  const move = (e) => { lastY = e.clientY; };
  const end = async (e) => {
    grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", end); grip.removeEventListener("pointercancel", end); cancelAnimationFrame(raf);
    if (e.type === "pointerup" && to !== from) { await DROPS[card.dataset.drag](card, from, to); haptic(8); }
    hooks.render();
  };
  grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", end); grip.addEventListener("pointercancel", end);
  tick();
});
