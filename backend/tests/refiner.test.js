const { pool, resetDb } = require("./helpers");
const { refineEstimate } = require("../src/services/refiner");

// n finished lunches where the formula always says `estimate` and `actual` came
async function addHistory(n, estimateFor, actualFor) {
  for (let i = 1; i <= n; i++) {
    const { rows } = await pool.query(
      `INSERT INTO meal_slots (slot_date, slot_type, marking_closes_at, service_starts_at, service_ends_at, state)
       VALUES (CURRENT_DATE - $1::int, 'lunch', NOW() - $1 * INTERVAL '1 day',
               NOW() - $1 * INTERVAL '1 day', NOW() - $1 * INTERVAL '1 day' + INTERVAL '2 hours', 'model_updated')
       RETURNING slot_id`,
      [i]
    );
    const est = estimateFor(i);
    await pool.query(
      `INSERT INTO attendance_predictions
         (slot_id, stage, yes_count, no_count, none_count, yes_part, no_part, none_part,
          rule_based_estimate, safety_buffer, recommended_qty, actual_attendance)
       VALUES ($1, 2, 100, 50, 250, 0, 0, 0, $2, 0.08, $2, $3)`,
      [rows[0].slot_id, est, actualFor(i, est)]
    );
  }
}

const current = { expected: 230, yesCount: 100, noCount: 50, noneCount: 250, type: "lunch", dow: 3, special: false };

beforeEach(resetDb);
afterAll(() => pool.end());

test("stays off until there are 90 finished meals (FR-13)", async () => {
  await addHistory(89, (i) => 200 + (i % 40), (i, e) => e);
  expect(await refineEstimate(current)).toBeNull();
});

test("learns a steady under-estimate and corrects for it", async () => {
  // the formula always comes in 5 short
  await addHistory(95, (i) => 200 + (i % 40), (i, e) => e + 5);
  const refined = await refineEstimate(current);
  expect(refined).toBeGreaterThan(232);
  expect(refined).toBeLessThan(238);
});
