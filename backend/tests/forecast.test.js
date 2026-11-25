const { app, pool, request, resetDb, tokenFor, makeSlot } = require("./helpers");
const { forecastSlot } = require("../src/services/forecast");
const { recalibrateSlot } = require("../src/services/recalibrate");

// 10 students: s1..s10
async function addStudents() {
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     SELECT 'S' || i, 's' || i || '@iiitl.ac.in', 'x', 'student' FROM generate_series(1, 10) i`
  );
  await pool.query(
    `INSERT INTO reliability_profiles (user_id)
     SELECT user_id FROM users WHERE email LIKE 's%@iiitl.ac.in' AND email NOT LIKE 'student%'`
  );
  // the two students from resetDb stay out of the way
  await pool.query("UPDATE users SET is_active = false WHERE email LIKE 'student%'");
}

async function addRice(slotId) {
  await pool.query(
    "INSERT INTO dishes (name, unit, consumption_rate) VALUES ('Rice', 'kg', 0.145) ON CONFLICT DO NOTHING"
  );
  await pool.query(
    "INSERT INTO slot_dishes (slot_id, dish_id) SELECT $1, dish_id FROM dishes WHERE name = 'Rice'",
    [slotId]
  );
}

async function mark(slotId, emails, eating) {
  await pool.query(
    `INSERT INTO meal_marks (user_id, slot_id, intent_to_eat)
     SELECT user_id, $1, $3 FROM users WHERE email = ANY($2)`,
    [slotId, emails, eating]
  );
}

async function attend(slotId, emails) {
  await pool.query(
    "INSERT INTO attendance_records (user_id, slot_id) SELECT user_id, $1 FROM users WHERE email = ANY($2)",
    [slotId, emails]
  );
}

// a meal that has already finished
async function pastSlot(daysAgo, type = "lunch") {
  const { rows } = await pool.query(
    `INSERT INTO meal_slots (slot_date, slot_type, marking_closes_at, service_starts_at, service_ends_at, state)
     VALUES (CURRENT_DATE - $1::int, $2,
             NOW() - ($1 * 24 + 6) * INTERVAL '1 hour',
             NOW() - ($1 * 24 + 3) * INTERVAL '1 hour',
             NOW() - ($1 * 24 + 1) * INTERVAL '1 hour', 'in_service')
     RETURNING slot_id`,
    [daysAgo, type]
  );
  return rows[0].slot_id;
}

const s = (...n) => n.map((i) => `s${i}@iiitl.ac.in`);

beforeEach(async () => {
  await resetDb();
  await addStudents();
});
afterAll(() => pool.end());

describe("cold start (FR-11, NFR-3)", () => {
  test("produces a forecast with no history, matching a hand calculation", async () => {
    const slot = await makeSlot(60);
    await addRice(slot);
    await mark(slot, s(1, 2, 3, 4), true);
    await mark(slot, s(5, 6), false);

    const f = await forecastSlot(slot);

    // stage 0: 4 x 0.90 + 2 x 0.10 + 4 x 0.65 = 3.6 + 0.2 + 2.6 = 6.4
    expect(f.stage).toBe(0);
    expect(f.yesPart).toBe(3.6);
    expect(f.noPart).toBe(0.2);
    expect(f.nonePart).toBe(2.6);
    expect(f.expected).toBe(6.4);
    // 6.4 x 1.08 = 6.9 -> 7 students -> 7 x 0.145 = 1.0 kg
    expect(f.headcount).toBe(7);
    expect(f.dishes[0].total).toBe(1);
  });

  test("still works when nobody has declared anything", async () => {
    const slot = await makeSlot(60);
    const f = await forecastSlot(slot);
    expect(f.noneCount).toBe(10);
    expect(f.expected).toBe(6.5);
  });

  test("the forecast is stored so it can be re-derived later (NFR-4)", async () => {
    const slot = await makeSlot(60);
    await mark(slot, s(1, 2), true);
    await forecastSlot(slot);
    const { rows } = await pool.query("SELECT * FROM attendance_predictions WHERE slot_id = $1", [slot]);
    const p = rows[0];
    expect(Number(p.yes_part) + Number(p.no_part) + Number(p.none_part)).toBeCloseTo(Number(p.rule_based_estimate), 5);
  });
});

describe("recalibration (FR-10, FR-21)", () => {
  test("a student who says yes and does not come loses reliability", async () => {
    const first = await pastSlot(2);
    await mark(first, s(1), true);
    await attend(first, s(9)); // someone else ate, so we have attendance data
    await recalibrateSlot(first);

    let { rows } = await pool.query(
      `SELECT p.* FROM reliability_profiles p JOIN users u USING (user_id) WHERE u.email = 's1@iiitl.ac.in'`
    );
    expect(rows[0].yes_total).toBe(1);
    expect(rows[0].yes_attended).toBe(0);
    expect(Number(rows[0].reliability_score)).toBe(0);

    const second = await pastSlot(1);
    await mark(second, s(1), true);
    await attend(second, s(1));
    await recalibrateSlot(second);

    ({ rows } = await pool.query(
      `SELECT p.* FROM reliability_profiles p JOIN users u USING (user_id) WHERE u.email = 's1@iiitl.ac.in'`
    ));
    expect(Number(rows[0].reliability_score)).toBe(0.5);
  });

  test("undeclared and flipped students are counted in the right groups", async () => {
    const slot = await pastSlot(1);
    await mark(slot, s(2), false);
    await attend(slot, s(2, 3));
    await recalibrateSlot(slot);

    const { rows } = await pool.query(
      `SELECT u.email, p.no_total, p.no_attended, p.none_total, p.none_attended
       FROM reliability_profiles p JOIN users u USING (user_id)
       WHERE u.email IN ('s2@iiitl.ac.in', 's3@iiitl.ac.in') ORDER BY u.email`
    );
    expect(rows[0]).toMatchObject({ no_total: 1, no_attended: 1, none_total: 0 });
    expect(rows[1]).toMatchObject({ none_total: 1, none_attended: 1, no_total: 0 });
  });

  test("records actual attendance and the forecast error", async () => {
    const slot = await pastSlot(1);
    await forecastSlot(slot, { asOf: new Date(Date.now() - 30 * 3600 * 1000) });
    await attend(slot, s(1, 2, 3, 4, 5));
    await recalibrateSlot(slot);

    const { rows } = await pool.query("SELECT * FROM attendance_predictions WHERE slot_id = $1", [slot]);
    expect(rows[0].actual_attendance).toBe(5);
    const expectedError = (Number(rows[0].recommended_qty) - 5) / 5;
    expect(Number(rows[0].forecast_error)).toBeCloseTo(expectedError, 3);
  });

  test("running it twice does not count the meal twice", async () => {
    const slot = await pastSlot(1);
    await mark(slot, s(1), true);
    await attend(slot, s(9));
    expect(await recalibrateSlot(slot)).toBe(true);
    expect(await recalibrateSlot(slot)).toBe(false);

    const { rows } = await pool.query(
      `SELECT p.sample_size FROM reliability_profiles p JOIN users u USING (user_id) WHERE u.email = 's1@iiitl.ac.in'`
    );
    expect(rows[0].sample_size).toBe(1);
  });

  test("a meal with no per-student attendance leaves profiles alone and uses the check-in tally", async () => {
    const slot = await pastSlot(1);
    await mark(slot, s(1, 2, 3), true);
    await pool.query("INSERT INTO check_ins (slot_id, count) VALUES ($1, 4), ($1, 7)", [slot]);
    await forecastSlot(slot, { asOf: new Date(Date.now() - 30 * 3600 * 1000) });
    await recalibrateSlot(slot);

    const { rows: profiles } = await pool.query("SELECT SUM(sample_size)::int AS n FROM reliability_profiles");
    expect(profiles[0].n).toBe(0);
    const { rows } = await pool.query("SELECT actual_attendance FROM attendance_predictions WHERE slot_id = $1", [slot]);
    expect(rows[0].actual_attendance).toBe(7);
  });
});

describe("degradation ladder in practice", () => {
  test("moves from stage 0 to segment rates after 7 completed meals", async () => {
    for (let d = 8; d >= 1; d--) {
      const slot = await pastSlot(d);
      await attend(slot, s(1, 2, 3, 4, 5, 6));
      await recalibrateSlot(slot);
    }
    const upcoming = await makeSlot(60);
    const f = await forecastSlot(upcoming);
    expect(f.stage).toBeGreaterThanOrEqual(1);
    // 6 of 10 came every time, so the forecast should be close to 6, not the 6.5 default
    expect(f.expected).toBeCloseTo(6, 0);
  });
});

describe("GET /api/predictions/:slotId", () => {
  test("staff get aggregates only, never individual students (NFR-1)", async () => {
    const slot = await makeSlot(60);
    await mark(slot, s(1, 2, 3), true);
    const staff = await tokenFor("staff@iiitl.ac.in");
    const res = await request(app).get(`/api/predictions/${slot}`).set("Authorization", `Bearer ${staff}`);

    expect(res.status).toBe(200);
    expect(res.body.yesCount).toBe(3);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/@iiitl|user_id|email/);
  });
});
