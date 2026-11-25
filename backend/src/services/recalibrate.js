// After a meal: compare what each student said with what they did and update
// their profile (FR-10), then record how far off the forecast was.
const pool = require("../db/pool");
const { loadSettings, segmentRates } = require("./forecast");

async function recalibrateSlot(slotId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT slot_id, slot_type, EXTRACT(DOW FROM slot_date)::int AS dow,
              service_starts_at, recalibrated_at
       FROM meal_slots WHERE slot_id = $1 FOR UPDATE`,
      [slotId]
    );
    const slot = rows[0];
    if (!slot || slot.recalibrated_at) {
      await client.query("ROLLBACK");
      return false; // already done
    }

    // segment baseline as it was before this meal, for the "expected" counter
    const settings = await loadSettings(client);
    const defaults = {
      r: settings.default_reliability,
      f: settings.default_flip_rate,
      b: settings.flat_attendance_rate,
    };
    const segment = await segmentRates(slot, slot.service_starts_at, defaults, client);
    const segmentB = segment ? segment.b : defaults.b;

    await client.query(
      `UPDATE reliability_profiles p SET
         yes_total     = yes_total     + (c.intent IS TRUE)::int,
         yes_attended  = yes_attended  + (c.intent IS TRUE AND c.attended)::int,
         no_total      = no_total      + (c.intent IS FALSE)::int,
         no_attended   = no_attended   + (c.intent IS FALSE AND c.attended)::int,
         none_total    = none_total    + (c.intent IS NULL)::int,
         none_attended = none_attended + (c.intent IS NULL AND c.attended)::int,
         none_expected = none_expected + CASE WHEN c.intent IS NULL THEN $2::decimal ELSE 0 END,
         sample_size   = sample_size + 1,
         updated_at    = NOW()
       FROM (
         SELECT u.user_id, mm.intent_to_eat AS intent, (a.user_id IS NOT NULL) AS attended
         FROM users u
         LEFT JOIN meal_marks mm ON mm.user_id = u.user_id AND mm.slot_id = $1
         LEFT JOIN attendance_records a ON a.user_id = u.user_id AND a.slot_id = $1
         WHERE u.role = 'student'
       ) c
       WHERE p.user_id = c.user_id`,
      [slotId, segmentB]
    );

    // plain rates, kept for reference (the forecast uses the counts)
    await client.query(
      `UPDATE reliability_profiles SET
         reliability_score = yes_attended::decimal / NULLIF(yes_total, 0),
         flip_rate         = no_attended::decimal / NULLIF(no_total, 0),
         baseline_rate     = none_attended::decimal / NULLIF(none_total, 0)`
    );

    // forecast error (FR-21): positive means we planned for more than came
    await client.query(
      `UPDATE attendance_predictions p SET
         actual_attendance = a.n,
         forecast_error = CASE WHEN a.n > 0 THEN (p.recommended_qty - a.n)::decimal / a.n END
       FROM (SELECT COUNT(*)::int AS n FROM attendance_records WHERE slot_id = $1) a
       WHERE p.slot_id = $1`,
      [slotId]
    );

    await client.query(
      `UPDATE meal_slots SET recalibrated_at = NOW(),
         state = CASE WHEN state IN ('waste_logged', 'model_updated') THEN state ELSE 'completed' END
       WHERE slot_id = $1`,
      [slotId]
    );

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { recalibrateSlot };
