const express = require("express");
const pool = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { refreshSlotStates } = require("../services/slots");

const router = express.Router();

// A student only ever sees their own declarations here
router.use(requireAuth, requireRole("student"));

// GET /api/meal-marks/upcoming - meals for the next 3 days with my declaration
router.get("/upcoming", async (req, res) => {
  await refreshSlotStates();

  const { rows } = await pool.query(
    `SELECT m.slot_id, to_char(m.slot_date, 'YYYY-MM-DD') AS date, m.slot_type AS type,
            m.marking_closes_at, m.service_starts_at, m.service_ends_at,
            NOW() < m.marking_closes_at AS is_open,
            mm.intent_to_eat,
            (SELECT array_agg(d.name ORDER BY d.dish_id)
             FROM slot_dishes sd JOIN dishes d ON d.dish_id = sd.dish_id
             WHERE sd.slot_id = m.slot_id) AS menu
     FROM meal_slots m
     LEFT JOIN meal_marks mm ON mm.slot_id = m.slot_id AND mm.user_id = $1
     WHERE m.service_ends_at > NOW()
       AND m.slot_date <= (NOW() AT TIME ZONE 'Asia/Kolkata')::date + 2
     ORDER BY m.service_starts_at`,
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/meal-marks/reminders - open meals I haven't marked that close soon (FR-6)
router.get("/reminders", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.slot_id, to_char(m.slot_date, 'YYYY-MM-DD') AS date, m.slot_type AS type,
            m.marking_closes_at
     FROM meal_slots m
     LEFT JOIN meal_marks mm ON mm.slot_id = m.slot_id AND mm.user_id = $1
     WHERE mm.mark_id IS NULL
       AND NOW() < m.marking_closes_at
       AND m.marking_closes_at <= NOW() + (
         SELECT value FROM settings WHERE key = 'reminder_hours'
       ) * INTERVAL '1 hour'
     ORDER BY m.marking_closes_at`,
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/meal-marks/history - my last 30 days (FR-5). Only my own record.
router.get("/history", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.slot_id, to_char(m.slot_date, 'YYYY-MM-DD') AS date, m.slot_type AS type,
            mm.intent_to_eat,
            (a.user_id IS NOT NULL) AS attended
     FROM meal_slots m
     LEFT JOIN meal_marks mm ON mm.slot_id = m.slot_id AND mm.user_id = $1
     LEFT JOIN attendance_records a ON a.slot_id = m.slot_id AND a.user_id = $1
     WHERE m.service_ends_at < NOW()
       AND m.slot_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date - 30
     ORDER BY m.service_starts_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// cut-off check is part of the same query so a late request can never slip in (FR-4)
async function slotClosedResponse(slotId, res) {
  const { rows } = await pool.query(
    "SELECT marking_closes_at FROM meal_slots WHERE slot_id = $1",
    [slotId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Meal not found" });
  return res.status(409).json({ error: "Marking for this meal has closed" });
}

// PUT /api/meal-marks/:slotId  { eating: true | false }
router.put("/:slotId", async (req, res) => {
  const { eating } = req.body;
  if (typeof eating !== "boolean") {
    return res.status(400).json({ error: "eating must be true or false" });
  }

  const { rows } = await pool.query(
    `INSERT INTO meal_marks (user_id, slot_id, intent_to_eat)
     SELECT $1, slot_id, $3 FROM meal_slots WHERE slot_id = $2 AND NOW() < marking_closes_at
     ON CONFLICT (user_id, slot_id)
     DO UPDATE SET intent_to_eat = EXCLUDED.intent_to_eat, marked_at = NOW()
     RETURNING slot_id, intent_to_eat, marked_at`,
    [req.user.id, req.params.slotId, eating]
  );

  if (!rows[0]) return slotClosedResponse(req.params.slotId, res);
  res.json(rows[0]);
});

// DELETE /api/meal-marks/:slotId - go back to "not declared"
router.delete("/:slotId", async (req, res) => {
  const { rowCount } = await pool.query(
    `DELETE FROM meal_marks mm
     USING meal_slots m
     WHERE mm.slot_id = m.slot_id AND mm.user_id = $1 AND mm.slot_id = $2
       AND NOW() < m.marking_closes_at`,
    [req.user.id, req.params.slotId]
  );

  if (rowCount === 0) {
    const open = await pool.query(
      "SELECT 1 FROM meal_slots WHERE slot_id = $1 AND NOW() < marking_closes_at",
      [req.params.slotId]
    );
    // nothing to delete but still open is fine
    if (open.rows[0]) return res.json({ slot_id: Number(req.params.slotId), intent_to_eat: null });
    return slotClosedResponse(req.params.slotId, res);
  }
  res.json({ slot_id: Number(req.params.slotId), intent_to_eat: null });
});

module.exports = router;
