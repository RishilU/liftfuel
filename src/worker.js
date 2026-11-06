// Single-user API. Auth = one shared passphrase (env.PASSPHRASE) sent as X-Pass.
import { usdaSearch, makeLookup, suggestRecipes, suggestDish, MICRO_KEYS } from "./nutrition.js";

const enc = new TextEncoder();

async function authed(req, env) {
  if (!env.PASSPHRASE) return false;
  const [a, b] = await Promise.all(
    [req.headers.get("x-pass") ?? "", env.PASSPHRASE].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s)))
  );
  return crypto.subtle.timingSafeEqual(a, b);
}

const json = (data, status = 200) => Response.json(data, { status });
const bad = (msg) => json({ error: msg }, 400);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (x, max) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max;
const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const POSES = ["front", "side", "back"];
const MEALS = ["breakfast", "lunch", "dinner", "snack"];
const MEASURES = ["chest", "arm", "thigh", "hips", "neck", "bodyfat"];
const setOk = (b) => num(b.weight, 2000) && Number.isInteger(b.reps) && b.reps >= 1 && b.reps <= 200 && (b.note == null || (typeof b.note === "string" && b.note.length <= 120));
const foodOk = (b) => typeof b.name === "string" && b.name.trim() && b.name.length <= 120
  && (b.grams == null || num(b.grams, 10000)) && num(b.kcal, 5000) && num(b.protein, 1000) && num(b.carbs, 1000) && num(b.fat, 1000)
  && (b.fiber == null || num(b.fiber, 1000)) && (b.meal == null || MEALS.includes(b.meal))
  && (b.micro == null || (typeof b.micro === "object" && Object.entries(b.micro).every(([k, v]) => MICRO_KEYS.includes(k) && num(v, 100000))));
const microJson = (b) => (b.micro && Object.keys(b.micro).length ? JSON.stringify(b.micro) : null);
const words = (a, max) => Array.isArray(a) && a.length <= max && a.every((s) => typeof s === "string" && s.trim() && s.length <= 30);

// D1-backed store so USDA matches survive between requests (free plan: 50 subrequests per request)
const usdaStore = (db) => ({
  get: async (k) => { const r = await db.prepare("SELECT food FROM usda_cache WHERE query = ?").bind(k).first(); return r ? JSON.parse(r.food) : null; },
  set: (k, f) => db.prepare("INSERT OR REPLACE INTO usda_cache (query, food) VALUES (?,?)").bind(k, JSON.stringify(f)).run(),
});

// [method, path regex, handler(ctx, match)] where ctx = { env, q, body() }
const routes = [
  ["GET", /^\/api\/sets$/, async ({ env, q }) => {
    if (q.get("date")) {
      if (!DATE.test(q.get("date"))) return bad("date");
      return json((await env.DB.prepare("SELECT * FROM sets WHERE date = ? ORDER BY id").bind(q.get("date")).all()).results);
    }
    if (q.get("from")) {
      if (!DATE.test(q.get("from")) || !DATE.test(q.get("to") ?? "")) return bad("from/to");
      // note: capped at 5000 sets (about 6 months of training)
      return json((await env.DB.prepare("SELECT * FROM sets WHERE date >= ? AND date <= ? ORDER BY date, id LIMIT 5000")
        .bind(q.get("from"), q.get("to")).all()).results);
    }
    if (q.get("exercise")) {
      // note: last 500 sets per exercise, plenty for a chart; paginate if ever needed
      return json((await env.DB.prepare("SELECT * FROM sets WHERE exercise_id = ? ORDER BY date DESC, id DESC LIMIT 500")
        .bind(q.get("exercise")).all()).results);
    }
    return bad("date, from/to or exercise required");
  }],
  ["POST", /^\/api\/sets$/, async ({ env, body }) => {
    const b = await body();
    const ok = DATE.test(b.date) && typeof b.exercise_id === "string" && b.exercise_id.length <= 64 && setOk(b);
    if (!ok) return bad("invalid set");
    const r = await env.DB.prepare("INSERT INTO sets (date, exercise_id, weight, reps, note) VALUES (?,?,?,?,?)")
      .bind(b.date, b.exercise_id, b.weight, b.reps, b.note?.trim() || null).run();
    return json({ id: r.meta.last_row_id }, 201);
  }],
  ["PATCH", /^\/api\/sets\/(\d+)$/, async ({ env, body }, m) => {
    const b = await body();
    if (!setOk(b)) return bad("invalid set");
    const r = await env.DB.prepare("UPDATE sets SET weight = ?, reps = ?, note = ? WHERE id = ?").bind(b.weight, b.reps, b.note?.trim() || null, Number(m[1])).run();
    return r.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
  }],
  ["DELETE", /^\/api\/sets\/(\d+)$/, async ({ env }, m) => {
    await env.DB.prepare("DELETE FROM sets WHERE id = ?").bind(Number(m[1])).run();
    return json({ ok: true });
  }],

  ["GET", /^\/api\/settings$/, async ({ env }) => {
    const r = await env.DB.prepare("SELECT key, value FROM settings").all();
    return json(Object.fromEntries(r.results.map((x) => [x.key, x.value])));
  }],
  ["PUT", /^\/api\/settings$/, async ({ env, body }) => {
    const b = await body();
    if (typeof b.key !== "string" || typeof b.value !== "string" || b.key.length > 64 || b.value.length > 200000) return bad("invalid setting");
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(b.key, b.value).run();
    return json({ ok: true });
  }],

  ["GET", /^\/api\/foods$/, async ({ env, q }) => {
    const term = (q.get("q") ?? "").trim();
    if (term.length < 2 || term.length > 60) return bad("query 2-60 chars");
    if (!env.USDA_KEY) return json({ error: "USDA_KEY not configured" }, 503);
    return json(await usdaSearch(term, env.USDA_KEY, 8));
  }],
  ["GET", /^\/api\/food\/summary$/, async ({ env, q }) => {
    if (!DATE.test(q.get("from") ?? "") || !DATE.test(q.get("to") ?? "")) return bad("from/to");
    return json((await env.DB.prepare(
      "SELECT date, SUM(kcal) AS kcal, SUM(protein) AS protein FROM food_log WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date"
    ).bind(q.get("from"), q.get("to")).all()).results);
  }],
  ["GET", /^\/api\/food$/, async ({ env, q }) => {
    if (!DATE.test(q.get("date") ?? "")) return bad("date");
    return json((await env.DB.prepare("SELECT * FROM food_log WHERE date = ? ORDER BY id").bind(q.get("date")).all()).results);
  }],
  ["POST", /^\/api\/food$/, async ({ env, body }) => {
    const b = await body();
    if (!DATE.test(b.date) || !foodOk(b)) return bad("invalid food");
    const r = await env.DB.prepare("INSERT INTO food_log (date, name, grams, kcal, protein, carbs, fat, meal, fiber, micro) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(b.date, b.name.trim(), b.grams ?? null, b.kcal, b.protein, b.carbs, b.fat, b.meal ?? null, b.fiber ?? null, microJson(b)).run();
    return json({ id: r.meta.last_row_id }, 201);
  }],
  ["PATCH", /^\/api\/food\/(\d+)$/, async ({ env, body }, m) => {
    const b = await body();
    if (!foodOk(b)) return bad("invalid food");
    const r = await env.DB.prepare("UPDATE food_log SET name = ?, grams = ?, kcal = ?, protein = ?, carbs = ?, fat = ?, meal = ?, fiber = ?, micro = ? WHERE id = ?")
      .bind(b.name.trim(), b.grams ?? null, b.kcal, b.protein, b.carbs, b.fat, b.meal ?? null, b.fiber ?? null, microJson(b), Number(m[1])).run();
    return r.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
  }],
  ["DELETE", /^\/api\/food\/(\d+)$/, async ({ env }, m) => {
    await env.DB.prepare("DELETE FROM food_log WHERE id = ?").bind(Number(m[1])).run();
    return json({ ok: true });
  }],
  ["GET", /^\/api\/recent$/, async ({ env }) => json((await env.DB.prepare(
    "SELECT name, grams, kcal, protein, carbs, fat, fiber, meal, micro FROM food_log WHERE id IN (SELECT MAX(id) FROM food_log GROUP BY name) ORDER BY id DESC LIMIT 12"
  ).all()).results)],

  ["POST", /^\/api\/recipes$/, async ({ env, body }) => {
    const b = await body();
    b.kind ??= "dinner";
    b.pantry ??= [];
    for (const k of ["never", "avoid", "love"]) b[k] ??= [];
    const ok = ["dinner", "lunch", "breakfast"].includes(b.kind)
      && words(b.pantry, 40) && (b.kind !== "dinner" || b.pantry.length >= 1)
      && words(b.never, 80) && words(b.avoid, 80) && words(b.love, 80)
      && ["vegetarian", "chicken_ok"].includes(b.diet)
      && Number.isInteger(b.max_minutes) && b.max_minutes >= 5 && b.max_minutes <= 240
      && num(b.min_protein, 200) && num(b.max_kcal, 3000) && (b.min_kcal == null || num(b.min_kcal, 3000));
    if (!ok) return bad("invalid recipe request");
    if (!env.AI || !env.USDA_KEY) return json({ error: "AI or USDA_KEY not configured" }, 503);
    try {
      return json(await suggestRecipes(env.AI, makeLookup(env.USDA_KEY, usdaSearch, usdaStore(env.DB)), b));
    } catch (e) { return json({ error: e.message }, 502); }
  }],

  ["POST", /^\/api\/dish$/, async ({ env, body }) => {
    const b = await body();
    if (typeof b.text !== "string" || b.text.trim().length < 2 || b.text.length > 80 || !(b.servings >= 1 && b.servings <= 12)) return bad("invalid dish");
    if (!env.AI || !env.USDA_KEY) return json({ error: "AI or USDA_KEY not configured" }, 503);
    try {
      return json(await suggestDish(env.AI, makeLookup(env.USDA_KEY, usdaSearch, usdaStore(env.DB)), b.text.trim(), Math.round(b.servings)));
    } catch (e) { return json({ error: e.message }, 502); }
  }],

  ["GET", /^\/api\/body$/, async ({ env }) => json((await env.DB.prepare("SELECT * FROM body ORDER BY date").all()).results)],
  ["PUT", /^\/api\/body$/, async ({ env, body }) => {
    const b = await body();
    const w = b.weight ?? null, wa = b.waist ?? null, ex = b.extra ?? null;
    const exOk = ex == null || (typeof ex === "object" && Object.entries(ex).every(([k, v]) => MEASURES.includes(k) && num(v, 300)));
    const ok = DATE.test(b.date) && (w != null || wa != null || (ex && Object.keys(ex).length))
      && (w == null || (num(w, 1000) && w >= 30)) && (wa == null || (num(wa, 100) && wa >= 10)) && exOk;
    if (!ok) return bad("invalid body entry");
    await env.DB.prepare(
      "INSERT INTO body (date, weight, waist, extra) VALUES (?,?,?,?) ON CONFLICT(date) DO UPDATE SET weight = COALESCE(excluded.weight, weight), waist = COALESCE(excluded.waist, waist), extra = COALESCE(excluded.extra, extra)"
    ).bind(b.date, w, wa, ex && Object.keys(ex).length ? JSON.stringify(ex) : null).run();
    return json({ ok: true });
  }],

  ["GET", /^\/api\/photos$/, async ({ env }) => json((await env.DB.prepare("SELECT id, date, pose FROM photos ORDER BY date, id").all()).results)],
  ["POST", /^\/api\/photos$/, async ({ env, body }) => {
    const b = await body();
    // D1 rows max 2 MB; client compresses to ~100 KB
    if (!DATE.test(b.date) || typeof b.data !== "string" || b.data.length > 700000 || !PHOTO.test(b.data)) return bad("invalid photo");
    if (b.pose != null && !POSES.includes(b.pose)) return bad("invalid pose");
    const r = await env.DB.prepare("INSERT INTO photos (date, data, pose) VALUES (?,?,?)").bind(b.date, b.data, b.pose ?? null).run();
    return json({ id: r.meta.last_row_id }, 201);
  }],
  ["GET", /^\/api\/photos\/(\d+)$/, async ({ env }, m) => {
    const row = await env.DB.prepare("SELECT data FROM photos WHERE id = ?").bind(Number(m[1])).first();
    return row ? json(row) : json({ error: "not found" }, 404);
  }],
  ["DELETE", /^\/api\/photos\/(\d+)$/, async ({ env }, m) => {
    await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(Number(m[1])).run();
    return json({ ok: true });
  }],

  // everything the Profile screen needs in one call: streak dates, lifetime totals, per-lift bests
  ["GET", /^\/api\/overview$/, async ({ env }) => {
    const all = (sql) => env.DB.prepare(sql).all().then((r) => r.results);
    const [workoutDates, totals, bests, food, counts] = await Promise.all([
      all("SELECT DISTINCT date FROM sets ORDER BY date LIMIT 3000"),
      all("SELECT COUNT(*) AS sets, COALESCE(SUM(weight * reps), 0) AS volume FROM sets"),
      all("SELECT exercise_id, MAX(CASE WHEN reps = 1 THEN weight ELSE weight * (1 + reps / 30.0) END) AS best FROM sets GROUP BY exercise_id"),
      all("SELECT date, SUM(kcal) AS kcal, SUM(protein) AS protein FROM food_log GROUP BY date ORDER BY date DESC LIMIT 1500"),
      all("SELECT (SELECT COUNT(*) FROM body WHERE weight IS NOT NULL) AS weighIns, (SELECT COUNT(*) FROM photos) AS photos"),
    ]);
    return json({ workoutDates: workoutDates.map((r) => r.date), sets: totals[0].sets, volume: totals[0].volume,
      bests: Object.fromEntries(bests.map((r) => [r.exercise_id, r.best])), food, ...counts[0] });
  }],

  ["GET", /^\/api\/export$/, async ({ env }) => {
    const all = async (t) => (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
    return json({ exported: new Date().toISOString(), sets: await all("sets"), food_log: await all("food_log"),
      body: await all("body"), settings: await all("settings"), photos: await all("photos") });
  }],
];

export default {
  async fetch(req, env) {
    if (!(await authed(req, env))) return json({ error: "unauthorized" }, 401);
    const url = new URL(req.url);
    for (const [method, re, fn] of routes) {
      const m = url.pathname.match(re);
      if (m && method === req.method) {
        try {
          return await fn({ env, q: url.searchParams, body: () => req.json().catch(() => ({})) }, m);
        } catch (e) { return json({ error: e.message }, 502); }
      }
    }
    return json({ error: "not found" }, 404);
  },
};
