const express = require("express");
const pool = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { forecastSlot, storedForecast } = require("../services/forecast");

const router = express.Router();

// Staff and admin only. Everything here is an aggregate - no student is ever named (NFR-1).
router.use(requireAuth, requireRole("staff", "admin"));

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
