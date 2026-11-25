const pool = require("../db/pool");

// Mess timings (IST). Marking for breakfast closes the night before.
const TIMINGS = {
  breakfast: { start: "07:30", end: "09:30", closesDayBefore: true, closes: "22:00" },
  lunch: { start: "12:30", end: "14:30", closesDayBefore: false, closes: "09:00" },
  dinner: { start: "19:30", end: "21:30", closesDayBefore: false, closes: "16:00" },
};

// Weekly menu, index 0 = Sunday. Dish names must match the dishes table.
const WEEKLY_MENU = [
  { breakfast: ["Bread", "Tea"], lunch: ["Rice", "Dal", "Roti", "Paneer Curry"], dinner: ["Rice", "Dal", "Roti", "Mixed Veg"] },
  { breakfast: ["Poha", "Tea"], lunch: ["Rice", "Dal", "Roti", "Mixed Veg"], dinner: ["Rice", "Dal", "Roti", "Mixed Veg"] },
  { breakfast: ["Bread", "Tea"], lunch: ["Rice", "Dal", "Roti", "Mixed Veg"], dinner: ["Rice", "Dal", "Roti", "Paneer Curry"] },
  { breakfast: ["Poha", "Tea"], lunch: ["Rice", "Dal", "Roti", "Mixed Veg"], dinner: ["Rice", "Dal", "Roti", "Mixed Veg"] },
  { breakfast: ["Bread", "Tea"], lunch: ["Rice", "Dal", "Roti", "Mixed Veg"], dinner: ["Rice", "Dal", "Roti", "Mixed Veg"] },
  { breakfast: ["Poha", "Tea"], lunch: ["Rice", "Dal", "Roti", "Mixed Veg"], dinner: ["Rice", "Dal", "Roti", "Paneer Curry"] },
  { breakfast: ["Poha", "Tea"], lunch: ["Rice", "Dal", "Roti", "Mixed Veg"], dinner: ["Rice", "Dal", "Roti", "Mixed Veg"] },
];

const MARKING_OPENS_HOURS_BEFORE = 48;

// Creates a slot (and its menu) if it doesn't exist yet. dateStr is YYYY-MM-DD.
async function createSlot(client, dateStr, type) {
  const t = TIMINGS[type];
  const { rows } = await client.query(
    `INSERT INTO meal_slots (slot_date, slot_type, marking_closes_at, service_starts_at, service_ends_at)
     VALUES (
       $1::date, $2,
       (($1::date - $3::int) + $4::time) AT TIME ZONE 'Asia/Kolkata',
       ($1::date + $5::time) AT TIME ZONE 'Asia/Kolkata',
       ($1::date + $6::time) AT TIME ZONE 'Asia/Kolkata'
     )
     ON CONFLICT (slot_date, slot_type) DO NOTHING
     RETURNING slot_id`,
    [dateStr, type, t.closesDayBefore ? 1 : 0, t.closes, t.start, t.end]
  );
  if (!rows[0]) return null;

  const slotId = rows[0].slot_id;
  const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  await client.query(
    `INSERT INTO slot_dishes (slot_id, dish_id)
     SELECT $1, dish_id FROM dishes WHERE name = ANY($2)`,
    [slotId, WEEKLY_MENU[dayOfWeek][type]]
  );
  return slotId;
}

// Makes sure slots exist from today up to `days` ahead
async function ensureUpcomingSlots(days = 7) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT to_char((NOW() AT TIME ZONE 'Asia/Kolkata')::date + d, 'YYYY-MM-DD') AS day FROM generate_series(0, $1) d",
      [days]
    );
    for (const { day } of rows) {
      for (const type of Object.keys(TIMINGS)) {
        await createSlot(client, day, type);
      }
    }
  } finally {
    client.release();
  }
}

// Moves slots forward in their lifecycle based on the clock (SRS fig 5.9).
// Later states (forecast, in service ...) are moved by staff actions.
async function refreshSlotStates() {
  await pool.query(
    `UPDATE meal_slots SET state = 'marking_open'
     WHERE state = 'scheduled'
       AND NOW() >= service_starts_at - ($1 || ' hours')::interval
       AND NOW() < marking_closes_at`,
    [MARKING_OPENS_HOURS_BEFORE]
  );
  await pool.query(
    `UPDATE meal_slots SET state = 'marking_closed'
     WHERE state IN ('scheduled', 'marking_open') AND NOW() >= marking_closes_at`
  );
}

module.exports = { TIMINGS, WEEKLY_MENU, createSlot, ensureUpcomingSlots, refreshSlotStates };
