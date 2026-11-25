// Optional regression layer on top of the formula (FR-13, SRS stage 3).
// It learns how the formula's estimate relates to what actually happened,
// using a few slot features. The formula stays the basis for the kitchen plan;
// this number is only shown alongside it.
const pool = require("../db/pool");
const { fitRidge, predict } = require("./ridge");
const { STAGE3_MIN_SLOTS } = require("./parameters");

const SPECIAL_DISHES = ["Paneer Curry"];

function features(f) {
  const total = f.yesCount + f.noCount + f.noneCount || 1;
  const weekend = f.dow === 0 || f.dow === 6;
  return [
    1,
    f.expected / 100,
    f.type === "breakfast" ? 1 : 0,
    f.type === "lunch" ? 1 : 0,
    weekend ? 1 : 0,
    f.special ? 1 : 0,
    f.yesCount / total,
    f.noCount / total,
  ];
}

// returns null when there isn't enough history to trust a model
async function refineEstimate(current, { asOf = null, db = pool } = {}) {
  const { rows } = await db.query(
    `SELECT p.rule_based_estimate, p.yes_count, p.no_count, p.none_count, p.actual_attendance,
            m.slot_type, EXTRACT(DOW FROM m.slot_date)::int AS dow,
            EXISTS (
              SELECT 1 FROM slot_dishes sd JOIN dishes d ON d.dish_id = sd.dish_id
              WHERE sd.slot_id = m.slot_id AND d.name = ANY($2)
            ) AS special
     FROM attendance_predictions p
     JOIN meal_slots m ON m.slot_id = p.slot_id
     WHERE p.actual_attendance IS NOT NULL
       AND m.service_ends_at <= COALESCE($1::timestamptz, NOW())`,
    [asOf, SPECIAL_DISHES]
  );
  if (rows.length < STAGE3_MIN_SLOTS) return null;

  const X = rows.map((r) =>
    features({
      expected: Number(r.rule_based_estimate),
      yesCount: r.yes_count,
      noCount: r.no_count,
      noneCount: r.none_count,
      type: r.slot_type,
      dow: r.dow,
      special: r.special,
    })
  );
  const y = rows.map((r) => r.actual_attendance / 100);

  // intercept and the formula's estimate are free; only the corrections are penalised
  const weights = fitRidge(X, y, 0.5, 2);
  const estimate = predict(weights, features(current)) * 100;
  return Math.max(0, Math.round(estimate * 10) / 10);
}

module.exports = { refineEstimate, features, SPECIAL_DISHES };
