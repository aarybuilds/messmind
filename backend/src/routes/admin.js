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

module.exports = router;
