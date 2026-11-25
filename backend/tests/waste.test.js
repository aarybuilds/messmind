const { app, pool, request, resetDb, tokenFor } = require("./helpers");

let staff;

// a finished lunch with rice and dal on the plan, and `ate` students recorded as eating
async function finishedMeal({ ate = 100, heldBackCooked = true } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO meal_slots (slot_date, slot_type, marking_closes_at, service_starts_at, service_ends_at, state)
     VALUES (CURRENT_DATE - (random() * 1000)::int - 1, 'lunch', NOW() - INTERVAL '8 hours',
             NOW() - INTERVAL '4 hours', NOW() - INTERVAL '2 hours', 'in_service')
     RETURNING slot_id`
  );
  const slot = rows[0].slot_id;

  await pool.query(
    `INSERT INTO dishes (name, unit, consumption_rate) VALUES ('Rice', 'kg', 0.145), ('Dal', 'L', 0.21)
     ON CONFLICT (name) DO UPDATE SET consumption_rate = EXCLUDED.consumption_rate`
  );
  // planned for 110: rice 16 kg (12 first), dal 23.1 L (17.3 first)
  await pool.query(
    `INSERT INTO slot_dishes (slot_id, dish_id, recommended_qty, first_batch_qty, held_back_cooked)
     SELECT $1, dish_id, CASE name WHEN 'Rice' THEN 16 ELSE 23.1 END,
            CASE name WHEN 'Rice' THEN 12 ELSE 17.3 END, $2
     FROM dishes WHERE name IN ('Rice', 'Dal')`,
    [slot, heldBackCooked]
  );
  await pool.query(
    `INSERT INTO attendance_predictions (slot_id, stage, yes_count, no_count, none_count, yes_part,
       no_part, none_part, rule_based_estimate, safety_buffer, recommended_qty)
     VALUES ($1, 1, 0, 0, 0, 0, 0, 0, 102, 0.08, 110)`,
    [slot]
  );

  // `ate` real students so the meal has attendance data
  const prefix = `eater${slot}x`;
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     SELECT 'Eater ' || i, $1 || i || '@iiitl.ac.in', 'x', 'student' FROM generate_series(1, $2::int) i`,
    [prefix, ate]
  );
  await pool.query(
    "INSERT INTO reliability_profiles (user_id) SELECT user_id FROM users WHERE email LIKE $1 || '%'",
    [prefix]
  );
  await pool.query(
    "INSERT INTO attendance_records (user_id, slot_id) SELECT user_id, $2 FROM users WHERE email LIKE $1 || '%'",
    [prefix, slot]
  );
  return slot;
}

async function dishIds() {
  const { rows } = await pool.query("SELECT dish_id, name FROM dishes");
  return Object.fromEntries(rows.map((r) => [r.name, r.dish_id]));
}

function logWaste(slot, entries) {
  return request(app)
    .post(`/api/staff/slots/${slot}/waste`)
    .set("Authorization", `Bearer ${staff}`)
    .send({ entries });
}

beforeEach(async () => {
  await resetDb();
  staff = await tokenFor("staff@iiitl.ac.in");
});
afterAll(() => pool.end());

test("half the dal left over lowers its rate; rice almost empty barely moves (FR-19, FR-20)", async () => {
  const slot = await finishedMeal({ ate: 100 });
  const ids = await dishIds();

  const res = await logWaste(slot, [
    { dish_id: ids.Rice, level: "almost_empty" },
    { dish_id: ids.Dal, level: "half_left" },
  ]);
  expect(res.status).toBe(201);
  expect(res.body.attendance).toBe(100);

  const { rows } = await pool.query("SELECT name, consumption_rate FROM dishes ORDER BY name");
  const rate = Object.fromEntries(rows.map((r) => [r.name, Number(r.consumption_rate)]));
  expect(rate.Dal).toBeLessThan(0.21);
  expect(Math.abs(rate.Rice - 0.145)).toBeLessThan(0.002);

  const history = await pool.query("SELECT COUNT(*)::int AS n FROM dish_rate_history WHERE slot_id = $1", [slot]);
  expect(history.rows[0].n).toBe(2);
});

test("moves the meal to model_updated", async () => {
  const slot = await finishedMeal();
  const ids = await dishIds();
  await logWaste(slot, [
    { dish_id: ids.Rice, level: "empty" },
    { dish_id: ids.Dal, level: "empty" },
  ]);
  const { rows } = await pool.query("SELECT state FROM meal_slots WHERE slot_id = $1", [slot]);
  expect(rows[0].state).toBe("model_updated");
});

test("uses only the first batch when the held-back batch was held", async () => {
  const slot = await finishedMeal({ ate: 100, heldBackCooked: false });
  const ids = await dishIds();
  await logWaste(slot, [
    { dish_id: ids.Rice, level: "half_left" },
    { dish_id: ids.Dal, level: "half_left" },
  ]);
  const { rows } = await pool.query(
    "SELECT observed_rate FROM dish_rate_history h JOIN dishes d USING (dish_id) WHERE d.name = 'Rice'"
  );
  // 12 kg cooked, half left, 100 ate -> 0.06 kg each
  expect(Number(rows[0].observed_rate)).toBeCloseTo(0.06, 3);
});

test("cannot be logged twice", async () => {
  const slot = await finishedMeal();
  const ids = await dishIds();
  const entries = [
    { dish_id: ids.Rice, level: "empty" },
    { dish_id: ids.Dal, level: "empty" },
  ];
  await logWaste(slot, entries);
  expect((await logWaste(slot, entries)).status).toBe(409);
});

test("every dish needs a level", async () => {
  const slot = await finishedMeal();
  const ids = await dishIds();
  const res = await logWaste(slot, [{ dish_id: ids.Rice, level: "empty" }]);
  expect(res.status).toBe(400);
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM waste_logs");
  expect(rows[0].n).toBe(0);
});

test("not allowed before service has closed", async () => {
  const { rows } = await pool.query(
    `INSERT INTO meal_slots (slot_date, slot_type, marking_closes_at, service_starts_at, service_ends_at)
     VALUES (CURRENT_DATE + 500, 'dinner', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '10 minutes',
             NOW() + INTERVAL '1 hour')
     RETURNING slot_id`
  );
  const res = await logWaste(rows[0].slot_id, []);
  expect(res.status).toBe(409);
});
