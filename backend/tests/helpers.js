const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const app = require("../src/app");
const pool = require("../src/db/pool");

const PASSWORD = "password123";

// each test meal gets its own date so (date, meal type) never clashes
let dayCounter = 100;
function uniqueDay() {
  dayCounter += 1;
  return dayCounter;
}

// fresh schema + one user of each role
async function resetDb() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "..", "database", "schema.sql"), "utf8");
  await pool.query(sql);

  const hash = await bcrypt.hash(PASSWORD, 4);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES
      ('Admin', 'admin@iiitl.ac.in', $1, 'admin'),
      ('Staff', 'staff@iiitl.ac.in', $1, 'staff'),
      ('Student One', 'student1@iiitl.ac.in', $1, 'student'),
      ('Student Two', 'student2@iiitl.ac.in', $1, 'student')`,
    [hash]
  );
  await pool.query(
    "INSERT INTO reliability_profiles (user_id) SELECT user_id FROM users WHERE role = 'student'"
  );
}

async function tokenFor(email) {
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  return res.body.token;
}

// slot whose marking cut-off is `closesInMinutes` from now (negative = already closed)
async function makeSlot(closesInMinutes, type = "lunch") {
  const { rows } = await pool.query(
    `INSERT INTO meal_slots (slot_date, slot_type, marking_closes_at, service_starts_at, service_ends_at, state)
     VALUES (CURRENT_DATE + $3::int, $2,
             NOW() + $1 * INTERVAL '1 minute',
             NOW() + ($1 + 180) * INTERVAL '1 minute',
             NOW() + ($1 + 300) * INTERVAL '1 minute',
             'marking_open')
     RETURNING slot_id`,
    [closesInMinutes, type, uniqueDay()]
  );
  return rows[0].slot_id;
}

module.exports = { app, pool, request, resetDb, tokenFor, makeSlot, uniqueDay, PASSWORD };
