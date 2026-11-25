// Demo helper: moves the next meal's service window so it can be shown at any time of day.
//   npm run demo:serve            -> service started 18 minutes ago (check-ins, held-back advice)
//   npm run demo:serve -- 5       -> started 5 minutes ago
//   npm run demo:serve -- done    -> service ended 5 minutes ago (leftover logging)
require("dotenv").config();
const pool = require("../src/db/pool");
const { forecastSlot } = require("../src/services/forecast");

async function main() {
  const arg = process.argv[2];
  const done = arg === "done";
  const minutesIn = done ? 125 : Number(arg || 18);

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
  const forecast = await forecastSlot(slot.slot_id);

  if (done) {
    // a finished service: the held-back batch was cooked and most of the forecast turned up
    const turnout = Math.round(forecast.expected * 0.97);
    await pool.query(
      `INSERT INTO check_ins (slot_id, count, logged_at) VALUES
         ($1, $2, NOW() - INTERVAL '100 minutes'), ($1, $3, NOW() - INTERVAL '10 minutes')`,
      [slot.slot_id, Math.round(turnout * 0.6), turnout]
    );
    await pool.query("UPDATE slot_dishes SET held_back_cooked = true WHERE slot_id = $1", [slot.slot_id]);
    await pool.query("UPDATE meal_slots SET state = 'staged_decision' WHERE slot_id = $1", [slot.slot_id]);
    console.log(`${slot.slot_type} on ${slot.day} finished 5 minutes ago with ${turnout} checked in`);
  } else {
    console.log(`${slot.slot_type} on ${slot.day} is now being served (${minutesIn} min in)`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
