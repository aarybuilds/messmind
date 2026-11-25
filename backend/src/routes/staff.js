const express = require("express");
const pool = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { forecastSlot, storedForecast } = require("../services/forecast");
const { adviseHeldBack, DECISION_WINDOW_MIN } = require("../services/staged");

const router = express.Router();

// Mess staff dashboard. Admin can look too. Aggregates only (NFR-1).
router.use(requireAuth, requireRole("staff", "admin"));

// GET /api/staff/slots - today's and tomorrow's meals, and which one to show first
router.get("/slots", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT slot_id, to_char(slot_date, 'YYYY-MM-DD') AS date, slot_type AS type, state,
            service_starts_at, service_ends_at,
            NOW() BETWEEN service_starts_at AND service_ends_at AS in_service_window
     FROM meal_slots
     WHERE slot_date BETWEEN (NOW() AT TIME ZONE 'Asia/Kolkata')::date
                         AND (NOW() AT TIME ZONE 'Asia/Kolkata')::date + 1
     ORDER BY service_starts_at`
  );
  const now = Date.now();
  const current =
    rows.find((r) => r.in_service_window) || rows.find((r) => new Date(r.service_ends_at) > now) || rows[0];
  res.json({ slots: rows, currentId: current ? current.slot_id : null });
});

// Everything the dashboard needs for one meal
async function slotView(slotId) {
  const { rows } = await pool.query(
    `SELECT slot_id, state, service_starts_at, service_ends_at,
            NOW() < marking_closes_at AS marking_open,
            NOW() BETWEEN service_starts_at AND service_ends_at AS in_service_window,
            EXTRACT(EPOCH FROM NOW() - service_starts_at) / 60 AS minutes_in,
            EXTRACT(EPOCH FROM service_ends_at - service_starts_at) / 60 AS service_minutes
     FROM meal_slots WHERE slot_id = $1`,
    [slotId]
  );
  const slot = rows[0];
  if (!slot) return null;

  // students can still change their minds, so keep it fresh until the cut-off
  if (slot.marking_open || !(await storedForecast(slotId))) {
    await forecastSlot(slotId);
  }
  const forecast = await storedForecast(slotId);

  const { rows: checks } = await pool.query(
    "SELECT count, logged_at FROM check_ins WHERE slot_id = $1 ORDER BY logged_at DESC, checkin_id DESC LIMIT 1",
    [slotId]
  );
  const checkedIn = checks[0] ? checks[0].count : 0;

  const service = {
    inWindow: slot.in_service_window,
    minutesIn: Math.max(0, Math.floor(Number(slot.minutes_in))),
    serviceMinutes: Math.round(Number(slot.service_minutes)),
    decideBy: new Date(new Date(slot.service_starts_at).getTime() + DECISION_WINDOW_MIN * 60000),
    checkedIn,
    lastCheckIn: checks[0] ? checks[0].logged_at : null,
    decision: forecast.dishes.length ? forecast.dishes[0].heldBackCooked : null,
    advice: null,
  };

  if (slot.in_service_window) {
    service.advice = adviseHeldBack({
      headcount: forecast.headcount,
      split: forecast.dishes.length && forecast.dishes[0].total
        ? forecast.dishes[0].firstBatch / forecast.dishes[0].total
        : 0.75,
      observed: checkedIn,
      minutesIn: service.minutesIn,
      serviceMinutes: service.serviceMinutes,
      dishes: forecast.dishes,
    });
  }

  return {
    ...forecast,
    state: slot.state,
    markingOpen: slot.marking_open,
    serviceStartsAt: slot.service_starts_at,
    serviceEndsAt: slot.service_ends_at,
    service,
  };
}

// GET /api/staff/slots/:id
router.get("/slots/:id", async (req, res) => {
  const view = await slotView(req.params.id);
  if (!view) return res.status(404).json({ error: "Meal not found" });
  res.json(view);
});

async function requireServiceWindow(slotId, res) {
  const { rows } = await pool.query(
    "SELECT NOW() BETWEEN service_starts_at AND service_ends_at AS open FROM meal_slots WHERE slot_id = $1",
    [slotId]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Meal not found" });
    return false;
  }
  if (!rows[0].open) {
    res.status(409).json({ error: "This meal is not being served right now" });
    return false;
  }
  return true;
}

// POST /api/staff/slots/:id/check-ins  { add: 5 } or { count: 120 } (cumulative)
router.post("/slots/:id/check-ins", async (req, res) => {
  const slotId = req.params.id;
  if (!(await requireServiceWindow(slotId, res))) return;

  const { rows } = await pool.query(
    "SELECT count FROM check_ins WHERE slot_id = $1 ORDER BY logged_at DESC, checkin_id DESC LIMIT 1",
    [slotId]
  );
  const current = rows[0] ? rows[0].count : 0;

  let next;
  if (Number.isInteger(req.body.add)) next = current + req.body.add;
  else if (Number.isInteger(req.body.count)) next = req.body.count;
  else return res.status(400).json({ error: "Send add or count as a whole number" });

  if (next < 0 || next > 5000) return res.status(400).json({ error: "That count doesn't look right" });

  await pool.query("INSERT INTO check_ins (slot_id, count) VALUES ($1, $2)", [slotId, next]);
  await pool.query(
    "UPDATE meal_slots SET state = 'in_service' WHERE slot_id = $1 AND state IN ('forecast', 'marking_closed')",
    [slotId]
  );
  res.status(201).json(await slotView(slotId));
});

// POST /api/staff/slots/:id/held-back  { cook: true | false }
router.post("/slots/:id/held-back", async (req, res) => {
  const slotId = req.params.id;
  if (typeof req.body.cook !== "boolean") {
    return res.status(400).json({ error: "cook must be true or false" });
  }
  if (!(await requireServiceWindow(slotId, res))) return;

  await pool.query("UPDATE slot_dishes SET held_back_cooked = $2 WHERE slot_id = $1", [slotId, req.body.cook]);
  await pool.query(
    "UPDATE meal_slots SET state = 'staged_decision' WHERE slot_id = $1 AND state IN ('forecast', 'in_service')",
    [slotId]
  );
  res.json(await slotView(slotId));
});

module.exports = router;
