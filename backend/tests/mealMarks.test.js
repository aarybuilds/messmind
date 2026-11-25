const { app, pool, request, resetDb, tokenFor, makeSlot } = require("./helpers");

let student;
let staff;

beforeAll(async () => {
  await resetDb();
  student = await tokenFor("student1@iiitl.ac.in");
  staff = await tokenFor("staff@iiitl.ac.in");
});
afterAll(() => pool.end());

function declare(token, slotId, eating) {
  return request(app)
    .put(`/api/meal-marks/${slotId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ eating });
}

describe("declaring intent (FR-3)", () => {
  test("a student can declare before the cut-off", async () => {
    const slot = await makeSlot(60);
    const res = await declare(student, slot, true);
    expect(res.status).toBe(200);
    expect(res.body.intent_to_eat).toBe(true);
  });

  test("a declaration can be changed before the cut-off", async () => {
    const slot = await makeSlot(60);
    await declare(student, slot, true);
    const res = await declare(student, slot, false);
    expect(res.status).toBe(200);
    expect(res.body.intent_to_eat).toBe(false);

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM meal_marks WHERE slot_id = $1",
      [slot]
    );
    expect(rows[0].n).toBe(1);
  });

  test("a declaration can be cleared", async () => {
    const slot = await makeSlot(60);
    await declare(student, slot, true);
    const res = await request(app)
      .delete(`/api/meal-marks/${slot}`)
      .set("Authorization", `Bearer ${student}`);
    expect(res.status).toBe(200);
    expect(res.body.intent_to_eat).toBeNull();
  });

  test("eating must be a boolean", async () => {
    const slot = await makeSlot(60);
    const res = await declare(student, slot, "yes");
    expect(res.status).toBe(400);
  });
});

describe("cut-off boundary (FR-4)", () => {
  test("accepted one minute before the cut-off", async () => {
    const slot = await makeSlot(1);
    const res = await declare(student, slot, true);
    expect(res.status).toBe(200);
  });

  test("rejected one minute after the cut-off", async () => {
    const slot = await makeSlot(-1);
    const res = await declare(student, slot, true);
    expect(res.status).toBe(409);
  });

  test("an existing declaration cannot be changed after the cut-off", async () => {
    const slot = await makeSlot(60);
    await declare(student, slot, true);
    await pool.query(
      "UPDATE meal_slots SET marking_closes_at = NOW() - INTERVAL '1 second' WHERE slot_id = $1",
      [slot]
    );

    const res = await declare(student, slot, false);
    expect(res.status).toBe(409);

    const { rows } = await pool.query(
      "SELECT intent_to_eat FROM meal_marks WHERE slot_id = $1",
      [slot]
    );
    expect(rows[0].intent_to_eat).toBe(true);
  });

  test("an existing declaration cannot be cleared after the cut-off", async () => {
    const slot = await makeSlot(60);
    await declare(student, slot, true);
    await pool.query(
      "UPDATE meal_slots SET marking_closes_at = NOW() - INTERVAL '1 second' WHERE slot_id = $1",
      [slot]
    );
    const res = await request(app)
      .delete(`/api/meal-marks/${slot}`)
      .set("Authorization", `Bearer ${student}`);
    expect(res.status).toBe(409);
  });

  test("unknown slot gives 404", async () => {
    const res = await declare(student, 999999, true);
    expect(res.status).toBe(404);
  });
});

describe("access", () => {
  test("mess staff cannot use the student marking endpoints", async () => {
    const res = await request(app)
      .get("/api/meal-marks/upcoming")
      .set("Authorization", `Bearer ${staff}`);
    expect(res.status).toBe(403);
  });

  test("history shows only the logged-in student's own record", async () => {
    // a finished meal where student2 said yes and ate, student1 did nothing
    const { rows } = await pool.query(
      `INSERT INTO meal_slots (slot_date, slot_type, marking_closes_at, service_starts_at, service_ends_at, state)
       VALUES (CURRENT_DATE - 1, 'dinner', NOW() - INTERVAL '30 hours', NOW() - INTERVAL '26 hours',
               NOW() - INTERVAL '24 hours', 'model_updated')
       RETURNING slot_id`
    );
    const slot = rows[0].slot_id;
    await pool.query(
      `INSERT INTO meal_marks (user_id, slot_id, intent_to_eat)
       SELECT user_id, $1, true FROM users WHERE email = 'student2@iiitl.ac.in'`,
      [slot]
    );
    await pool.query(
      `INSERT INTO attendance_records (user_id, slot_id)
       SELECT user_id, $1 FROM users WHERE email = 'student2@iiitl.ac.in'`,
      [slot]
    );

    const res = await request(app)
      .get("/api/meal-marks/history")
      .set("Authorization", `Bearer ${student}`);
    const row = res.body.find((r) => r.slot_id === slot);
    expect(row.intent_to_eat).toBeNull();
    expect(row.attended).toBe(false);
  });
});
