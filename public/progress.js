import { $, esc, r1, avg, S, X, byId, api, apiQ, outbox, cache, ACTIONS, CHANGES, toast, header, seg, lineSvg, e1rm, dayNum, shiftDay, loadRange, currentWeight, targets, sum, fmt, workoutDates, plannedDays } from "./lib.js";
import { loggedVolume, volumeClass, VOLUME_TARGET } from "./routine.js";
import { weeklyCheck, PHASES } from "./targets.js";
import { coach, insightCard } from "./coach.js";
import { weeklySummary, prs } from "./stats.js";
import { haptic } from "./fx.js";

// weigh-ins saved with no signal are laid over the saved rows until they sync
function withPending(rows) {
  const out = rows.map((r) => ({ ...r }));
  for (const o of outbox().filter((x) => x.path === "/api/body")) {
    let r = out.find((x) => x.date === o.body.date);
    if (!r) out.push(r = { date: o.body.date, weight: null, waist: null, extra: null });
    if (o.body.weight != null) r.weight = o.body.weight;
    if (o.body.waist != null) r.waist = o.body.waist;
    if (o.body.extra) r.extra = JSON.stringify(o.body.extra);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
export async function loadBody() {
  try { const [b, p] = await Promise.all([api("/api/body"), api("/api/photos")]); S.body = b; S.photos = p; cache.set("body", { b, p }); }
  catch (e) { if (!e.offline) throw e; const c = cache.get("body", { b: S.body, p: S.photos }); S.body = c.b; S.photos = c.p; }
  S.body = withPending(S.body);
}
const poseOf = (p) => p.pose ?? "front";
const POSES = [["front", "Front"], ["side", "Side"], ["back", "Back"]];
const MEASURES = [["chest", "Chest", "in"], ["arm", "Arm", "in"], ["thigh", "Thigh", "in"], ["hips", "Hips", "in"], ["neck", "Neck", "in"], ["bodyfat", "Body fat", "%"]];
const extraOf = (row) => { try { return JSON.parse(row.extra ?? "{}"); } catch { return {}; } };

function resetCompare() {
  const list = S.photos.filter((p) => poseOf(p) === S.cmpPose);
  S.cmpA = list[0]?.id ?? null; S.cmpB = list.at(-1)?.id ?? null;
}

async function compress(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.7, 0.5, 0.35]) { const d = c.toDataURL("image/jpeg", q); if (d.length < 650000) return d; }
  throw new Error("That photo is too large. Try another.");
}

function summaryCard() {
  const foodByDate = Object.fromEntries(S.overview.food.map((r) => [r.date, { kcal: r.kcal, protein: r.protein }]));
  if (S.food.length) foodByDate[S.today] = { kcal: sum(S.food, "kcal"), protein: sum(S.food, "protein") };
  const t = targets(), w = weeklySummary({ today: S.today, workoutDates: workoutDates(), plannedDays: plannedDays(), foodByDate, proteinGoal: t.protein, body: S.body });
  const stat = (v, l) => `<div><b>${v}</b><span class="dim">${l}</span></div>`, dash = "–";
  return `<div class="card"><h2>🗓️ Weekly summary</h2><p class="dim">The last 7 days, today included.</p>
    <div class="stats">${stat(`${w.workouts}${w.planned ? ` / ${w.planned}` : ""}`, "workouts")}${stat(w.daysLogged ? `${w.proteinDays} / ${w.daysLogged}` : dash, "days protein hit")}${stat(w.weight ? r1(w.weight) : dash, "avg lb")}</div>
    <div class="stats">${stat(w.avgKcal ? fmt(w.avgKcal) : dash, "avg calories")}${stat(w.avgProtein ? Math.round(w.avgProtein) : dash, "avg protein g")}${stat(w.weightChange != null ? `${w.weightChange >= 0 ? "+" : ""}${r1(w.weightChange)}` : dash, "lb vs last week")}</div>
    <p class="dim">${w.daysLogged < 4 ? "Log food on 4 or more days for the averages to mean much. " : ""}Goal: ${fmt(t.kcal)} calories and ${t.protein} g protein.</p></div>`;
}

function weekSummary() {
  const from = shiftDay(-6), rows = S.rangeSets.filter((r) => r.date >= from);
  const days = new Set(rows.map((r) => r.date)).size, v = loggedVolume(rows, byId), vol = rows.reduce((a, r) => a + r.weight * r.reps, 0);
  return `<div class="card"><h2>📅 This week</h2>
    <div class="stats"><div><b>${days}</b><span class="dim">workouts</span></div><div><b>${rows.length}</b><span class="dim">sets</span></div><div><b>${fmt(vol)}</b><span class="dim">lb lifted</span></div></div>
    <h3>Sets per muscle (last 7 days)</h3>
    ${X.groups.map((g) => { const n = v[g.id] ?? 0; return `<div class="row between"><span>${g.name}</span><b>${r1(n)}</b></div><div class="bar vol-${volumeClass(n)}"><i style="width:${Math.min(100, (n / VOLUME_TARGET) * 100)}%"></i></div>`; }).join("")}
    <p class="dim">Goal: about ${VOLUME_TARGET} hard sets per muscle a week. Indirect work counts half.</p></div>`;
}

// 14 days of calories; green bar = protein goal (90%+) reached, orange = logged but under
function nutritionCard() {
  const t = targets(), by = Object.fromEntries(S.overview.food.map((r) => [r.date, r]));
  if (S.food.length) by[S.today] = { date: S.today, kcal: sum(S.food, "kcal"), protein: sum(S.food, "protein") };
  const days = Array.from({ length: 14 }, (_, i) => shiftDay(i - 13)), logged = days.map((d) => by[d]).filter((r) => r?.kcal > 0);
  const top = Math.max(t.kcal * 1.25, ...logged.map((r) => r.kcal));
  return `<div class="card"><h2>🍽️ Last 14 days</h2>
    ${logged.length ? `<div class="stats"><div><b>${fmt(avg(logged.map((r) => r.kcal)))}</b><span class="dim">avg calories</span></div><div><b>${Math.round(avg(logged.map((r) => r.protein)))}</b><span class="dim">avg protein g</span></div><div><b>${logged.length}</b><span class="dim">days logged</span></div></div>` : ""}
    <div class="bars" role="img" aria-label="Calories per day for the last 14 days">${days.map((d) => { const r = by[d], h = r?.kcal > 0 ? Math.max(6, (r.kcal / top) * 100) : 4;
      return `<div class="${r?.kcal > 0 ? (r.protein >= t.protein * 0.9 ? "hit" : "some") : ""} ${d === S.today ? "today" : ""}" style="height:${h}%" title="${d}: ${Math.round(r?.kcal ?? 0)} cal"></div>`; }).join("")}</div>
    <div class="bars-l">${days.map((d) => `<span>${["S", "M", "T", "W", "T", "F", "S"][new Date(d + "T12:00:00").getDay()]}</span>`).join("")}</div>
    <p class="dim">Green: protein goal reached. Orange: logged, protein low. Goal ${fmt(t.kcal)} calories.</p></div>`;
}

function recordsCard() {
  const list = prs(S.rangeSets ?? []).filter((p) => byId[p.id]).slice(0, 6);
  return `<div class="card"><h2>🏆 Personal records</h2>${list.length ? list.map((p) => `<div class="row between item" data-act="exinfo" data-id="${p.id}" role="button" tabindex="0"><div><b>${esc(byId[p.id].name)}</b><div class="dim">${new Date(p.date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div></div>
      <div class="right"><b>${p.weight} × ${p.reps}</b><div class="ok">+${r1(p.gain)} lb est.</div></div></div>`).join("") + `<p class="dim">A record is a set whose estimated one-rep max beat everything you logged before. Tap a lift for its chart.</p>`
    : `<p class="dim">Records show up once you beat an earlier session on the same lift.</p>`}</div>`;
}

function strength() {
  const by = {};
  for (const r of S.rangeSets) ((by[r.exercise_id] ??= {})[r.date] ??= []).push(e1rm(r.weight, r.reps));
  const rows = Object.entries(by).map(([id, days]) => {
    const ds = Object.keys(days).sort(), best = (d) => Math.max(...days[d]);
    return { id, n: ds.length, first: best(ds[0]), last: best(ds.at(-1)), since: ds[0] };
  }).filter((x) => x.n >= 2 && byId[x.id]).sort((a, b) => b.n - a.n).slice(0, 8);
  return `<div class="card"><h2>💪 Strength</h2>${rows.length ? rows.map((x) => { const ch = ((x.last - x.first) / x.first) * 100;
    return `<div class="row between item" data-act="exinfo" data-id="${x.id}" role="button" tabindex="0" aria-label="Details for ${esc(byId[x.id].name)}"><div><b>${esc(byId[x.id].name)} ›</b><div class="dim">${x.n} sessions since ${x.since}</div></div>
      <div class="right"><b>${Math.round(x.last)} lb</b><div class="${ch >= 0 ? "ok" : "warn"}">${ch >= 0 ? "▲" : "▼"} ${Math.abs(r1(ch))}%</div></div></div>`; }).join("")
    : `<p class="dim">Log the same exercise on two different days to see your strength trend. The number is an estimate of the heaviest single lift you could do.</p>`}</div>`;
}

function bodyCard() {
  const w = S.body.filter((r) => r.weight != null), wa = S.body.filter((r) => r.waist != null);
  const trend = w.map((_, i) => avg(w.slice(Math.max(0, i - 6), i + 1).map((r) => r.weight)));
  const c = weeklyCheck(S.body, S.today, S.profile.phase, S.profile.lastAdjust);
  const todayRow = S.body.find((r) => r.date === S.today);
  const first = w[0], now = currentWeight();
  return `<div class="card"><h2>⚖️ Weight and waist</h2>
    ${todayRow?.weight ? `<p class="ok">Today: ${todayRow.weight} lb ✓</p>` : ""}
    ${first && now ? `<p class="dim">Since ${first.date}: <b>${now - first.weight >= 0 ? "+" : ""}${r1(now - first.weight)} lb</b></p>` : ""}
    <div class="inputs"><div><label for="bw">Weight (lb)</label><input id="bw" name="weight" type="number" inputmode="decimal" step="any" placeholder="${now ? r1(now) : "155"}"></div>
      <div><label for="bwa">Waist (in)</label><input id="bwa" name="waist" type="number" inputmode="decimal" step="any" placeholder="optional"></div></div>
    <input type="date" name="date" value="${S.today}" aria-label="Date" max="${S.today}">
    <button class="btn primary wide" data-act="savebody">Save</button>
    <p class="dim">Best: first thing in the morning, after the bathroom, before eating.</p>
    ${lineSvg(w.map((r) => [r.date, r.weight]), "lb; dashed = 7-entry average", w.length > 1 ? trend : null)}
    ${c ? `<p>7-day average <b>${r1(c.A)} lb</b> (${c.rate >= 0 ? "+" : ""}${r1(c.rate)} lb vs last week). Goal for ${PHASES[S.profile.phase].label.toLowerCase()}: <b>${r1(c.lbRange[0])} to ${r1(c.lbRange[1])} lb a week</b>.</p>` : `<p class="dim">Weigh in a few times a week. The weekly trend appears after two weeks.</p>`}
    ${wa.length ? `<h3>Waist</h3>${lineSvg(wa.map((r) => [r.date, r.waist]), "inches")}` : ""}</div>`;
}

function measuresCard() {
  const series = (k) => S.body.map((r) => [r.date, extraOf(r)[k]]).filter(([, v]) => v != null);
  const [, label, unit] = MEASURES.find((m) => m[0] === S.measure) ?? MEASURES[0];
  const pts = series(S.measure);
  return `<div class="card"><h2>📏 Measurements</h2><p class="dim">Optional. Measure at the same spot each time. Body fat % only if you have a reliable way to measure it.</p>
    <div class="inputs" id="mform">${MEASURES.map(([k, l, u]) => { const last = series(k).at(-1);
      return `<div><label for="m-${k}">${l} (${u})</label><input id="m-${k}" name="${k}" type="number" inputmode="decimal" step="any" placeholder="${last ? last[1] : ""}"></div>`; }).join("")}</div>
    <button class="btn wide" data-act="savemeasure">Save measurements</button>
    <div class="row chips" style="margin-top:12px">${MEASURES.map(([k, l]) => `<button class="chip sm ${k === S.measure ? "on" : ""}" aria-pressed="${k === S.measure}" data-act="measure" data-v="${k}">${l}</button>`).join("")}</div>
    ${pts.length ? `<p class="dim">${label}: latest <b>${pts.at(-1)[1]} ${unit}</b>${pts.length > 1 ? ` (${pts.at(-1)[1] - pts[0][1] >= 0 ? "+" : ""}${r1(pts.at(-1)[1] - pts[0][1])} ${unit} since ${pts[0][0]})` : ""}</p>${lineSvg(pts, `${label}, ${unit}`)}` : `<p class="dim">No ${label.toLowerCase()} entries yet.</p>`}</div>`;
}

function photos() {
  const list = S.photos.filter((p) => poseOf(p) === S.cmpPose);
  const opt = (sel) => list.map((p) => `<option value="${p.id}" ${String(p.id) === String(sel) ? "selected" : ""}>${p.date}</option>`).join("");
  const shown = (id) => id && S.pdata[id] ? `<div><img src="${S.pdata[id]}" alt="${S.cmpPose} progress photo"><button class="link warn" data-act="pdelphoto" data-id="${id}">Delete this photo</button></div>` : "<div></div>";
  return `<div class="card"><h2>📸 Photos</h2>
    <p class="dim">Use the same spot, light and pose each time. Photos are private. Nothing is estimated from them.</p>
    <div class="trio">${POSES.map(([v, l]) => `<label class="btn big">📷 ${l}<input type="file" accept="image/*" hidden data-change="photo" data-pose="${v}"></label>`).join("")}</div>
    <p class="dim">Tap a button, then choose Take Photo or Photo Library.</p>
    ${seg(POSES, S.cmpPose, "cmppose")}
    ${list.length ? `<div class="pair"><div><label class="dim" for="cA">Before</label><select id="cA" data-change="cmpA">${opt(S.cmpA)}</select></div>
      <div><label class="dim" for="cB">After</label><select id="cB" data-change="cmpB">${opt(S.cmpB)}</select></div></div>
      <div class="pair" style="margin-top:8px">${shown(S.cmpA)}${shown(S.cmpB)}</div>` : `<p class="dim center">No ${S.cmpPose} photos yet.</p>`}</div>`;
}

const GUIDE = () => `<details class="card"><summary><b>📚 Science behind this app</b></summary><ul class="tight">
  <li><b>Calories:</b> a review of off-season bodybuilding nutrition suggests a 10-20% surplus and gaining about 0.25-0.5% of bodyweight a week for novice and intermediate lifters, then adjusting from your real weight trend. <a href="https://pubmed.ncbi.nlm.nih.gov/31247944/" target="_blank" rel="noopener">Iraki 2019</a></li>
  <li><b>Protein:</b> same review: 1.6-2.2 g per kg a day (0.73-1.0 g per lb), about 0.4-0.55 g per kg per meal, over 3-6 meals. Fat 0.5-1.5 g per kg; carbs fill the rest, at least 3-5 g per kg.</li>
  <li><b>Volume:</b> ${X.sources.volume_meta.label}. <a href="${X.sources.volume_meta.url}" target="_blank" rel="noopener">Link</a></li>
  <li><b>Frequency:</b> ${X.sources.freq_meta.label}. <a href="${X.sources.freq_meta.url}" target="_blank" rel="noopener">Link</a></li>
  <li><b>Close to failure:</b> ${X.sources.failure_meta.label}. <a href="${X.sources.failure_meta.url}" target="_blank" rel="noopener">Link</a></li>
  <li><b>Range of motion:</b> some muscles grow best trained at long muscle lengths. <a href="https://pubmed.ncbi.nlm.nih.gov/36662126/" target="_blank" rel="noopener">Kassiano 2023</a></li>
  <li><b>Creatine:</b> the nutrition review lists 3-5 g a day as possibly helpful.</li></ul>
  <p class="dim">I read abstracts and summaries, not the full papers. Most studies are short and often use untrained people. Your maintenance calories are a formula estimate; trust your weight trend over it.</p></details>`;

export async function renderProgress() {
  if (!S.rangeSets) await loadRange(120);
  if (S.cmpA == null && S.photos.length) resetCompare();
  await Promise.all([S.cmpA, S.cmpB].filter((id) => id && !S.pdata[id]).map(async (id) => { S.pdata[id] = (await api("/api/photos/" + id).catch((e) => { if (!e.offline) throw e; return {}; })).data; }));
  const notes = coach().slice(0, 4);
  $("#view").innerHTML = `${header("Progress")}${notes.length ? `<h2 class="sect">🧠 Coach notes</h2>${notes.map(insightCard).join("")}` : ""}
    ${summaryCard()}${recordsCard()}${weekSummary()}${nutritionCard()}${strength()}${bodyCard()}${measuresCard()}${photos()}${GUIDE()}`;
}

Object.assign(ACTIONS, {
  savebody: async (t) => {
    const box = t.closest(".card"), v = Object.fromEntries(["date", "weight", "waist"].map((n) => [n, $(`[name=${n}]`, box).value]));
    const body = { date: v.date || S.today };
    if (v.weight) body.weight = +v.weight;
    if (v.waist) body.waist = +v.waist;
    if (!body.weight && !body.waist) throw new Error("Type your weight or your waist.");
    const r = await apiQ("/api/body", { method: "PUT", body });
    await loadBody(); haptic(); toast(r.queued ? "No signal: saved on your phone, it will sync later 📶" : "Saved");
  },
  savemeasure: async () => {
    const extra = {};
    for (const [k] of MEASURES) { const v = $(`#mform [name=${k}]`).value; if (v) extra[k] = +v; }
    if (!Object.keys(extra).length) throw new Error("Type at least one measurement.");
    const cur = extraOf(S.body.find((r) => r.date === S.today) ?? {});
    const r = await apiQ("/api/body", { method: "PUT", body: { date: S.today, extra: { ...cur, ...extra } } });
    await loadBody(); haptic(); toast(r.queued ? "No signal: saved on your phone, it will sync later 📶" : "Measurements saved");
  },
  measure: (t) => { S.measure = t.dataset.v; },
  cmppose: (t) => { S.cmpPose = t.dataset.v; resetCompare(); },
  pdelphoto: async (t) => {
    if (!confirm("Delete this photo?")) return false;
    await api("/api/photos/" + t.dataset.id, { method: "DELETE" }); await loadBody(); resetCompare();
  },
});

Object.assign(CHANGES, {
  cmpA: (el) => { S.cmpA = el.value; },
  cmpB: (el) => { S.cmpB = el.value; },
  photo: async (el) => {
    const file = el.files[0];
    if (!file) return;
    const pose = el.dataset.pose;
    await api("/api/photos", { method: "POST", body: { date: S.today, data: await compress(file), pose } });
    await loadBody(); S.cmpPose = pose; resetCompare(); haptic(); toast("Photo saved");
  },
});
