// Demo helper: moves the next meal's service window so it is being served right now.
// Lets us show check-ins and the held-back decision at any time of day.
//   npm run demo:serve            -> service started 18 minutes ago
//   npm run demo:serve -- 5       -> started 5 minutes ago
require("dotenv").config();
const pool = require("../src/db/pool");
const { forecastSlot } = require("../src/services/forecast");

async function main() {
  const minutesIn = Number(process.argv[2] || 18);

  const { rows } = await pool.query(
    `SELECT slot_id, slot_type, to_char(slot_date, 'DD Mon') AS day
     FROM meal_slots WHERE service_ends_at > NOW() AND recalibrated_at IS NULL
     ORDER BY service_starts_at LIMIT 1`
  );
  const slot = rows[0];
  if (!slot) throw new Error("No upcoming meal found");

  await pool.query(
    `UPDATE meal_slots SET
       marking_closes_at = LEAST(marking_closes_at, NOW() - INTERVAL '3 hours'),
       service_starts_at = NOW() - $2 * INTERVAL '1 minute',
       service_ends_at   = NOW() - $2 * INTERVAL '1 minute' + INTERVAL '2 hours',
       state = 'forecast'
     WHERE slot_id = $1`,
    [slot.slot_id, minutesIn]
  );
  await pool.query("DELETE FROM check_ins WHERE slot_id = $1", [slot.slot_id]);
  await pool.query("UPDATE slot_dishes SET held_back_cooked = NULL WHERE slot_id = $1", [slot.slot_id]);
  await forecastSlot(slot.slot_id);

  console.log(`${slot.slot_type} on ${slot.day} is now being served (${minutesIn} min in)`);
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
