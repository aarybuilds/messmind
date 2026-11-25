// Loads everything the estimator needs from the database, runs it and stores the result.
// This is the single entry point the rest of the app uses for forecasting (NFR-9).
const pool = require("../db/pool");
const { expectedAttendance, applyBuffer, dishPlan, round1 } = require("./estimator");
const { globalStage, weightsFor, forecastStage, smoothedRate } = require("./parameters");
const { refineEstimate, SPECIAL_DISHES } = require("./refiner");

async function loadSettings(db = pool) {
  const { rows } = await db.query("SELECT key, value FROM settings");
  const s = {};
  for (const r of rows) s[r.key] = Number(r.value);
  return s;
}

// asOf = null means "now" (database clock), otherwise a point in the past when replaying
async function completedSlotCount(asOf, db = pool) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM meal_slots
     WHERE recalibrated_at IS NOT NULL AND service_ends_at <= COALESCE($1::timestamptz, NOW())`,
    [asOf]
  );
  return rows[0].n;
}

// Attendance rates for each group across all completed slots of the same
// meal type and day of week. Falls back to the meal type, then the defaults.
async function segmentRates(slot, asOf, defaults, db = pool) {
  const { rows } = await db.query(
    `WITH done AS (
       SELECT slot_id, EXTRACT(DOW FROM slot_date)::int AS dow
       FROM meal_slots
       WHERE slot_type = $1 AND recalibrated_at IS NOT NULL
         AND service_ends_at <= COALESCE($2::timestamptz, NOW())
     )
     SELECT d.dow,
       COUNT(*) FILTER (WHERE mm.intent_to_eat)                                 AS yes_total,
       COUNT(*) FILTER (WHERE mm.intent_to_eat AND a.user_id IS NOT NULL)       AS yes_att,
       COUNT(*) FILTER (WHERE NOT mm.intent_to_eat)                             AS no_total,
       COUNT(*) FILTER (WHERE NOT mm.intent_to_eat AND a.user_id IS NOT NULL)   AS no_att,
       COUNT(*) FILTER (WHERE mm.mark_id IS NULL)                               AS none_total,
       COUNT(*) FILTER (WHERE mm.mark_id IS NULL AND a.user_id IS NOT NULL)     AS none_att
     FROM done d
     CROSS JOIN users u
     LEFT JOIN meal_marks mm ON mm.slot_id = d.slot_id AND mm.user_id = u.user_id
     LEFT JOIN attendance_records a ON a.slot_id = d.slot_id AND a.user_id = u.user_id
     WHERE u.role = 'student' AND u.is_active
     GROUP BY d.dow`,
    [slot.slot_type, asOf]
  );
  if (rows.length === 0) return null;

  const add = (key) => rows.reduce((t, r) => t + Number(r[key]), 0);
  const typeRates = {
    r: smoothedRate(add("yes_att"), add("yes_total"), defaults.r),
    f: smoothedRate(add("no_att"), add("no_total"), defaults.f),
    b: smoothedRate(add("none_att"), add("none_total"), defaults.b),
  };

  const day = rows.find((r) => r.dow === slot.dow);
  if (!day) return typeRates;
  return {
    r: smoothedRate(Number(day.yes_att), Number(day.yes_total), typeRates.r),
    f: smoothedRate(Number(day.no_att), Number(day.no_total), typeRates.f),
    b: smoothedRate(Number(day.none_att), Number(day.none_total), typeRates.b),
  };
}

async function loadSlot(slotId, db = pool) {
  const { rows } = await db.query(
    `SELECT slot_id, to_char(slot_date, 'YYYY-MM-DD') AS date, slot_type,
            EXTRACT(DOW FROM slot_date)::int AS dow, marking_closes_at, service_starts_at,
            service_ends_at, state
     FROM meal_slots WHERE slot_id = $1`,
    [slotId]
  );
  return rows[0];
}

// Forecast one slot. asOf lets the history be replayed without seeing the future.
async function forecastSlot(slotId, { asOf = null, save = true, db = pool } = {}) {
  const slot = await loadSlot(slotId, db);
  if (!slot) return null;

  const settings = await loadSettings(db);
  const defaults = {
    r: settings.default_reliability,
    f: settings.default_flip_rate,
    b: settings.flat_attendance_rate,
  };

  const stage = globalStage(await completedSlotCount(asOf, db));
  const segment = stage === 0 ? null : await segmentRates(slot, asOf, defaults, db);

  const { rows: students } = await db.query(
    `SELECT p.*, mm.intent_to_eat
     FROM users u
     JOIN reliability_profiles p ON p.user_id = u.user_id
     LEFT JOIN meal_marks mm ON mm.user_id = u.user_id AND mm.slot_id = $1
       AND mm.marked_at <= COALESCE($2::timestamptz, NOW())
     WHERE u.role = 'student' AND u.is_active`,
    [slotId, asOf]
  );

  const weights = { yes: [], no: [], none: [] };
  let personal = 0;
  for (const s of students) {
    const w = weightsFor(s, segment, stage, defaults);
    if (w.personal) personal++;
    if (s.intent_to_eat === true) weights.yes.push(w.r);
    else if (s.intent_to_eat === false) weights.no.push(w.f);
    else weights.none.push(w.b);
  }

  const result = expectedAttendance(weights);
  const buffer = settings.safety_buffer;
  const headcount = applyBuffer(result.expected, buffer);

  const { rows: dishes } = await db.query(
    `SELECT d.dish_id, d.name, d.unit, d.consumption_rate::float AS consumption_rate
     FROM slot_dishes sd JOIN dishes d ON d.dish_id = sd.dish_id
     WHERE sd.slot_id = $1 ORDER BY d.dish_id`,
    [slotId]
  );
  const plans = dishes.map((d) => dishPlan(headcount, d, settings.first_batch_split));

  // stage 3: show the regression estimate alongside, never instead of, the formula
  let mlEstimate = null;
  if (stage === 3) {
    try {
      mlEstimate = await refineEstimate(
        {
          ...result,
          type: slot.slot_type,
          dow: slot.dow,
          special: dishes.some((d) => SPECIAL_DISHES.includes(d.name)),
        },
        { asOf, db }
      );
    } catch (err) {
      mlEstimate = null; // the formula keeps working without it (CON-4)
    }
  }

  const forecast = {
    slot_id: slot.slot_id,
    date: slot.date,
    type: slot.slot_type,
    stage: forecastStage(stage, students.length ? personal / students.length : 0),
    ...result,
    mlEstimate,
    buffer,
    headcount,
    firstBatchSplit: settings.first_batch_split,
    dishes: plans,
    computedAt: asOf || new Date(),
  };

  if (save) await saveForecast(forecast, db);
  return forecast;
}

async function saveForecast(f, db = pool) {
  await db.query(
    `INSERT INTO attendance_predictions
       (slot_id, stage, yes_count, no_count, none_count, yes_part, no_part, none_part,
        rule_based_estimate, ml_estimate, safety_buffer, recommended_qty, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (slot_id) DO UPDATE SET
       stage = EXCLUDED.stage, yes_count = EXCLUDED.yes_count, no_count = EXCLUDED.no_count,
       none_count = EXCLUDED.none_count, yes_part = EXCLUDED.yes_part, no_part = EXCLUDED.no_part,
       none_part = EXCLUDED.none_part, rule_based_estimate = EXCLUDED.rule_based_estimate,
       ml_estimate = EXCLUDED.ml_estimate, safety_buffer = EXCLUDED.safety_buffer,
       recommended_qty = EXCLUDED.recommended_qty, computed_at = EXCLUDED.computed_at`,
    [
      f.slot_id, f.stage, f.yesCount, f.noCount, f.noneCount, f.yesPart, f.noPart, f.nonePart,
      f.expected, f.mlEstimate === null ? null : round1(f.mlEstimate), f.buffer, f.headcount, f.computedAt,
    ]
  );
  for (const d of f.dishes) {
    await db.query(
      "UPDATE slot_dishes SET recommended_qty = $3, first_batch_qty = $4 WHERE slot_id = $1 AND dish_id = $2",
      [f.slot_id, d.dish_id, d.total, d.firstBatch]
    );
  }
}

module.exports = { loadSettings, segmentRates, forecastSlot, completedSlotCount };
