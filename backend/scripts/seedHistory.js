// Seeds about a month of past meals: slots, student declarations and who actually ate.
// Each demo student gets their own habits so the forecast has something real to learn.
// Also adds some declarations for upcoming slots so the dashboard isn't empty.
require("dotenv").config();
const pool = require("../src/db/pool");
const { createSlot, ensureUpcomingSlots, refreshSlotStates } = require("../src/services/slots");
const { forecastSlot } = require("../src/services/forecast");
const { recalibrateSlot } = require("../src/services/recalibrate");

const DAYS_OF_HISTORY = 35;
const DEMO_STUDENT = "lcb2025101@iiitl.ac.in"; // left unmarked for upcoming slots so the demo starts clean

// fixed seed so every reset gives the same data
let seed = 24;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function between(a, b) {
  return a + (b - a) * rand();
}
function clamp(p) {
  return Math.min(0.98, Math.max(0.02, p));
}

function makeHabits() {
  return {
    eatRate: between(0.45, 0.92),
    markProb: rand() < 0.15 ? 0 : between(0.2, 0.95), // some students never use the app
    reliability: between(0.8, 0.99),
    flipRate: between(0, 0.15),
  };
}

// how likely a student is to eat a given slot
function eatChance(habits, type, dayOfWeek, menu) {
  let p = habits.eatRate;
  if (type === "breakfast") p -= 0.18;
  if (type === "dinner") p += 0.03;
  const weekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (weekend && type === "lunch") p -= 0.1;
  if (weekend && type === "dinner") p -= 0.15;
  if (menu.includes("Paneer Curry")) p += 0.06;
  return clamp(p);
}

async function bulkInsert(table, columns, types, rows) {
  if (rows.length === 0) return;
  const arrays = columns.map((_, i) => rows.map((r) => r[i]));
  const unnest = types.map((t, i) => `$${i + 1}::${t}[]`).join(", ");
  await pool.query(
    `INSERT INTO ${table} (${columns.join(", ")}) SELECT * FROM unnest(${unnest}) ON CONFLICT DO NOTHING`,
    arrays
  );
}

async function main() {
  const { rows: students } = await pool.query(
    "SELECT user_id, email FROM users WHERE role = 'student' ORDER BY user_id"
  );
  const habits = new Map(students.map((s) => [s.user_id, makeHabits()]));

  // past slots
  const client = await pool.connect();
  const { rows: days } = await client.query(
    `SELECT to_char((NOW() AT TIME ZONE 'Asia/Kolkata')::date - d, 'YYYY-MM-DD') AS day
     FROM generate_series($1, 1, -1) d`,
    [DAYS_OF_HISTORY]
  );
  for (const { day } of days) {
    for (const type of ["breakfast", "lunch", "dinner"]) {
      await createSlot(client, day, type);
    }
  }
  client.release();

  const { rows: pastSlots } = await pool.query(
    `SELECT m.slot_id, m.slot_type, EXTRACT(DOW FROM m.slot_date)::int AS dow,
            m.marking_closes_at, array_agg(d.name) AS menu
     FROM meal_slots m
     JOIN slot_dishes sd ON sd.slot_id = m.slot_id
     JOIN dishes d ON d.dish_id = sd.dish_id
     WHERE m.service_ends_at < NOW()
     GROUP BY m.slot_id`
  );

  const marks = [];
  const attendance = [];
  for (const slot of pastSlots) {
    for (const s of students) {
      const h = habits.get(s.user_id);
      const p = eatChance(h, slot.slot_type, slot.dow, slot.menu);
      let attended;
      if (rand() < h.markProb) {
        const saysYes = rand() < p;
        // mark some time in the last day before the cut-off
        const markedAt = new Date(slot.marking_closes_at.getTime() - between(0.5, 24) * 3600 * 1000);
        marks.push([s.user_id, slot.slot_id, saysYes, markedAt]);
        attended = saysYes ? rand() < h.reliability : rand() < h.flipRate;
      } else {
        attended = rand() < p;
      }
      if (attended) attendance.push([s.user_id, slot.slot_id]);
    }
  }

  await bulkInsert("meal_marks", ["user_id", "slot_id", "intent_to_eat", "marked_at"], ["int", "int", "bool", "timestamptz"], marks);
  await bulkInsert("attendance_records", ["user_id", "slot_id"], ["int", "int"], attendance);
  await pool.query("UPDATE meal_slots SET state = 'model_updated' WHERE service_ends_at < NOW()");

  // Replay the month in order: forecast each meal as it would have been at its
  // cut-off, then learn from it before moving on. No forecast sees the future.
  const { rows: ordered } = await pool.query(
    "SELECT slot_id, marking_closes_at FROM meal_slots WHERE service_ends_at < NOW() ORDER BY service_starts_at"
  );
  for (const s of ordered) {
    await forecastSlot(s.slot_id, { asOf: s.marking_closes_at });
    await recalibrateSlot(s.slot_id);
  }

  // declarations for meals that haven't been served yet
  await ensureUpcomingSlots(7);
  await refreshSlotStates();
  const { rows: upcomingSlots } = await pool.query(
    `SELECT m.slot_id, m.slot_type, EXTRACT(DOW FROM m.slot_date)::int AS dow, array_agg(d.name) AS menu,
            EXTRACT(EPOCH FROM m.marking_closes_at - NOW()) / 3600 AS hours_left,
            m.marking_closes_at
     FROM meal_slots m
     JOIN slot_dishes sd ON sd.slot_id = m.slot_id
     JOIN dishes d ON d.dish_id = sd.dish_id
     WHERE m.service_ends_at > NOW()
     GROUP BY m.slot_id`
  );
  const upcoming = [];
  for (const slot of upcomingSlots) {
    for (const s of students) {
      if (s.email === DEMO_STUDENT) continue;
      const h = habits.get(s.user_id);
      // most people mark close to the cut-off, so far-away slots have fewer marks so far
      // closed but not yet served: everyone who was going to mark has marked
      const soFar = slot.hours_left <= 0 ? 1 : slot.hours_left < 12 ? 0.9 : slot.hours_left < 36 ? 0.5 : 0.2;
      if (rand() < h.markProb * soFar) {
        const p = eatChance(h, slot.slot_type, slot.dow, slot.menu);
        const latest = Math.min(Date.now(), slot.marking_closes_at.getTime());
        const markedAt = new Date(latest - between(0.2, 12) * 3600 * 1000);
        upcoming.push([s.user_id, slot.slot_id, rand() < p, markedAt]);
      }
    }
  }
  await bulkInsert("meal_marks", ["user_id", "slot_id", "intent_to_eat", "marked_at"], ["int", "int", "bool", "timestamptz"], upcoming);

  console.log(
    `Seeded ${pastSlots.length} past slots, ${marks.length} past declarations, ` +
      `${attendance.length} attendance records, ${upcoming.length} upcoming declarations`
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
