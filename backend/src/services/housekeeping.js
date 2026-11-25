// Runs every few minutes and moves meals along their lifecycle (SRS fig 5.9)
const pool = require("../db/pool");
const { ensureUpcomingSlots, refreshSlotStates } = require("./slots");
const { forecastSlot } = require("./forecast");
const { recalibrateSlot } = require("./recalibrate");

async function runHousekeeping() {
  await ensureUpcomingSlots(7);
  await refreshSlotStates();

  // marking just closed: take the final forecast
  const { rows: closed } = await pool.query(
    "SELECT slot_id FROM meal_slots WHERE state = 'marking_closed' ORDER BY service_starts_at"
  );
  for (const { slot_id } of closed) {
    await forecastSlot(slot_id);
    await pool.query("UPDATE meal_slots SET state = 'forecast' WHERE slot_id = $1", [slot_id]);
  }

  // service has started (the forecast is always taken first)
  await pool.query(
    `UPDATE meal_slots SET state = 'in_service'
     WHERE state = 'forecast' AND NOW() >= service_starts_at AND NOW() < service_ends_at`
  );

  // meal is over: learn from it
  const { rows: finished } = await pool.query(
    `SELECT slot_id FROM meal_slots
     WHERE service_ends_at < NOW() AND recalibrated_at IS NULL
     ORDER BY service_starts_at`
  );
  for (const { slot_id } of finished) {
    await recalibrateSlot(slot_id);
  }
}

module.exports = { runHousekeeping };
