const express = require("express");
const pool = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { forecastSlot } = require("../services/forecast");

const router = express.Router();

// Staff and admin only. Everything here is an aggregate - no student is ever named (NFR-1).
router.use(requireAuth, requireRole("staff", "admin"));

// Forecast as stored, in the same shape forecastSlot returns
async function storedForecast(slotId) {
  const { rows } = await pool.query(
    `SELECT m.slot_id, to_char(m.slot_date, 'YYYY-MM-DD') AS date, m.slot_type AS type, m.state,
            p.stage, p.yes_count, p.no_count, p.none_count, p.yes_part, p.no_part, p.none_part,
            p.rule_based_estimate, p.ml_estimate, p.safety_buffer, p.recommended_qty,
            p.actual_attendance, p.forecast_error, p.computed_at
     FROM meal_slots m JOIN attendance_predictions p ON p.slot_id = m.slot_id
     WHERE m.slot_id = $1`,
    [slotId]
  );
  const p = rows[0];
  if (!p) return null;

  const { rows: dishes } = await pool.query(
    `SELECT d.dish_id, d.name, d.unit, sd.recommended_qty, sd.first_batch_qty, sd.held_back_cooked
     FROM slot_dishes sd JOIN dishes d ON d.dish_id = sd.dish_id
     WHERE sd.slot_id = $1 ORDER BY d.dish_id`,
    [slotId]
  );

  return {
    slot_id: p.slot_id,
    date: p.date,
    type: p.type,
    stage: p.stage,
    yesCount: p.yes_count,
    noCount: p.no_count,
    noneCount: p.none_count,
    yesPart: Number(p.yes_part),
    noPart: Number(p.no_part),
    nonePart: Number(p.none_part),
    expected: Number(p.rule_based_estimate),
    mlEstimate: p.ml_estimate === null ? null : Number(p.ml_estimate),
    buffer: Number(p.safety_buffer),
    headcount: Number(p.recommended_qty),
    actual: p.actual_attendance,
    error: p.forecast_error === null ? null : Number(p.forecast_error),
    computedAt: p.computed_at,
    dishes: dishes.map((d) => {
      const total = Number(d.recommended_qty);
      const firstBatch = Number(d.first_batch_qty);
      return {
        dish_id: d.dish_id,
        name: d.name,
        unit: d.unit,
        total,
        firstBatch,
        heldBack: Math.round((total - firstBatch) * 10) / 10,
        heldBackCooked: d.held_back_cooked,
      };
    }),
  };
}

// GET /api/predictions/:slotId
router.get("/:slotId", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT state, NOW() < marking_closes_at AS open FROM meal_slots WHERE slot_id = $1",
    [req.params.slotId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Meal not found" });

  // while students can still change their minds, always recompute
  if (rows[0].open) {
    await forecastSlot(req.params.slotId);
  } else if (!(await storedForecast(req.params.slotId))) {
    await forecastSlot(req.params.slotId);
  }

  const forecast = await storedForecast(req.params.slotId);
  res.json({ ...forecast, state: rows[0].state, markingOpen: rows[0].open });
});

module.exports = router;
