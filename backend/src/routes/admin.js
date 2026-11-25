const express = require("express");
const pool = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireRole("admin"));

// what the admin may change, and the allowed range for each (FR-24)
const EDITABLE = {
  safety_buffer: { min: 0, max: 0.3, label: "Safety buffer" },
  first_batch_split: { min: 0.5, max: 1, label: "First batch share" },
  reminder_hours: { min: 1, max: 12, label: "Reminder window (hours)" },
};

// GET /api/admin/settings
router.get("/settings", async (req, res) => {
  const { rows } = await pool.query("SELECT key, value FROM settings WHERE key = ANY($1)", [Object.keys(EDITABLE)]);
  const settings = {};
  for (const r of rows) settings[r.key] = Number(r.value);
  res.json({ settings, limits: EDITABLE });
});

// PUT /api/admin/settings  { safety_buffer: 0.1, ... }
router.put("/settings", async (req, res) => {
  const updates = Object.entries(req.body).filter(([key]) => EDITABLE[key]);
  if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });

  for (const [key, value] of updates) {
    const { min, max, label } = EDITABLE[key];
    if (typeof value !== "number" || value < min || value > max) {
      return res.status(400).json({ error: `${label} must be between ${min} and ${max}` });
    }
  }
  for (const [key, value] of updates) {
    await pool.query("UPDATE settings SET value = $2 WHERE key = $1", [key, value]);
  }

  const { rows } = await pool.query("SELECT key, value FROM settings WHERE key = ANY($1)", [Object.keys(EDITABLE)]);
  const settings = {};
  for (const r of rows) settings[r.key] = Number(r.value);
  res.json({ settings, limits: EDITABLE });
});

// GET /api/admin/dishes
router.get("/dishes", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT dish_id, name, unit, consumption_rate::float AS consumption_rate FROM dishes ORDER BY name"
  );
  res.json(rows);
});

// POST /api/admin/dishes  { name, unit, consumption_rate }
router.post("/dishes", async (req, res) => {
  const { name, unit, consumption_rate: rate } = req.body;
  if (!name || !["kg", "L", "pcs"].includes(unit)) {
    return res.status(400).json({ error: "Give a name and a unit of kg, L or pcs" });
  }
  if (typeof rate !== "number" || rate <= 0 || rate > 20) {
    return res.status(400).json({ error: "Per-head amount must be a positive number" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO dishes (name, unit, consumption_rate) VALUES ($1, $2, $3)
       RETURNING dish_id, name, unit, consumption_rate::float AS consumption_rate`,
      [name.trim(), unit, rate]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "A dish with this name already exists" });
    throw err;
  }
});

// GET /api/admin/slots - the coming week with timings and menu (FR-23)
router.get("/slots", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.slot_id, to_char(m.slot_date, 'YYYY-MM-DD') AS date, m.slot_type AS type, m.state,
            m.marking_closes_at, m.service_starts_at, m.service_ends_at,
            NOW() < m.marking_closes_at AS editable,
            COALESCE(array_agg(sd.dish_id ORDER BY sd.dish_id) FILTER (WHERE sd.dish_id IS NOT NULL), '{}') AS dish_ids
     FROM meal_slots m
     LEFT JOIN slot_dishes sd ON sd.slot_id = m.slot_id
     WHERE m.service_ends_at > NOW()
     GROUP BY m.slot_id
     ORDER BY m.service_starts_at`
  );
  res.json(rows);
});

// PUT /api/admin/slots/:id  { marking_closes_at, service_starts_at, service_ends_at, dish_ids }
router.put("/slots/:id", async (req, res) => {
  const { marking_closes_at: closes, service_starts_at: starts, service_ends_at: ends, dish_ids: dishIds } = req.body;

  const { rows } = await pool.query(
    "SELECT NOW() < marking_closes_at AS editable FROM meal_slots WHERE slot_id = $1",
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Meal not found" });
  if (!rows[0].editable) {
    return res.status(409).json({ error: "Marking has closed for this meal, so it can't be changed" });
  }

  const c = new Date(closes);
  const s = new Date(starts);
  const e = new Date(ends);
  if ([c, s, e].some((d) => Number.isNaN(d.getTime()))) {
    return res.status(400).json({ error: "Give all three times" });
  }
  if (!(c < s && s < e)) {
    return res.status(400).json({ error: "Marking must close before service starts, and service must start before it ends" });
  }
  if (!Array.isArray(dishIds) || dishIds.length === 0) {
    return res.status(400).json({ error: "Pick at least one dish" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE meal_slots SET marking_closes_at = $2, service_starts_at = $3, service_ends_at = $4
       WHERE slot_id = $1`,
      [req.params.id, c, s, e]
    );
    await client.query("DELETE FROM slot_dishes WHERE slot_id = $1 AND NOT (dish_id = ANY($2))", [req.params.id, dishIds]);
    await client.query(
      `INSERT INTO slot_dishes (slot_id, dish_id)
       SELECT $1, dish_id FROM dishes WHERE dish_id = ANY($2)
       ON CONFLICT DO NOTHING`,
      [req.params.id, dishIds]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ ok: true });
});

// GET /api/admin/analytics?days=30 - aggregates only, no student appears anywhere (FR-25)
router.get("/analytics", async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));

  const { rows: meals } = await pool.query(
    `SELECT m.slot_id, to_char(m.slot_date, 'YYYY-MM-DD') AS date, m.slot_type AS type,
            p.yes_count, p.rule_based_estimate::float AS expected, p.ml_estimate::float AS ml,
            p.recommended_qty::int AS planned, p.actual_attendance AS actual
     FROM meal_slots m JOIN attendance_predictions p ON p.slot_id = m.slot_id
     WHERE p.actual_attendance IS NOT NULL
       AND m.slot_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date - $1::int
     ORDER BY m.service_starts_at`,
    [days]
  );

  const mae = (pick) => {
    const rows = meals.filter((m) => pick(m) !== null);
    if (rows.length === 0) return null;
    return Math.round((rows.reduce((t, m) => t + Math.abs(pick(m) - m.actual), 0) / rows.length) * 10) / 10;
  };
  const avgActual = meals.length ? meals.reduce((t, m) => t + m.actual, 0) / meals.length : 0;

  const summary = {
    meals: meals.length,
    averageAttendance: Math.round(avgActual),
    error: {
      countOfYes: mae((m) => m.yes_count),
      formula: mae((m) => m.expected),
      regression: mae((m) => m.ml),
    },
  };

  // food in held-back batches that was never cooked, by unit
  const { rows: notCooked } = await pool.query(
    `SELECT d.unit, ROUND(SUM((1 - sd.held_back_share) * (sd.recommended_qty - sd.first_batch_qty)), 1)::float AS amount
     FROM slot_dishes sd
     JOIN dishes d ON d.dish_id = sd.dish_id
     JOIN meal_slots m ON m.slot_id = sd.slot_id
     WHERE sd.held_back_share IS NOT NULL
       AND m.slot_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date - $1::int
     GROUP BY d.unit ORDER BY d.unit`,
    [days]
  );
  const { rows: decisions } = await pool.query(
    `SELECT CASE WHEN share = 1 THEN 'all' WHEN share = 0 THEN 'held' ELSE 'part' END AS decision,
            COUNT(*)::int AS meals
     FROM (SELECT DISTINCT sd.slot_id, sd.held_back_share AS share
           FROM slot_dishes sd JOIN meal_slots m ON m.slot_id = sd.slot_id
           WHERE sd.held_back_share IS NOT NULL
             AND m.slot_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date - $1::int) x
     GROUP BY 1`,
    [days]
  );

  const { rows: waste } = await pool.query(
    `SELECT d.name AS dish, w.leftover_level AS level, COUNT(*)::int AS meals
     FROM waste_logs w
     JOIN dishes d ON d.dish_id = w.dish_id
     JOIN meal_slots m ON m.slot_id = w.slot_id
     WHERE m.slot_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date - $1::int
     GROUP BY 1, 2 ORDER BY 1`,
    [days]
  );

  const { rows: rates } = await pool.query(
    `SELECT d.name AS dish, d.unit, d.consumption_rate::float AS now,
            COALESCE((SELECT h.old_rate FROM dish_rate_history h WHERE h.dish_id = d.dish_id
                      ORDER BY h.history_id LIMIT 1), d.consumption_rate)::float AS started,
            COALESCE((SELECT json_agg(json_build_object('date', to_char(m.slot_date, 'YYYY-MM-DD'), 'rate', h.new_rate::float)
                                      ORDER BY h.history_id)
                      FROM dish_rate_history h JOIN meal_slots m ON m.slot_id = h.slot_id
                      WHERE h.dish_id = d.dish_id), '[]') AS history
     FROM dishes d ORDER BY d.name`
  );

  res.json({ days, summary, meals, heldBack: { notCooked, decisions }, waste, rates });
});

module.exports = router;
