const { app, pool, request, resetDb, tokenFor, uniqueDay } = require("./helpers");

let staff;
let student;

// a lunch that started `minutesAgo` minutes ago and runs for 2 hours
async function servingSlot(minutesAgo) {
  const { rows } = await pool.query(
    `INSERT INTO meal_slots (slot_date, slot_type, marking_closes_at, service_starts_at, service_ends_at, state)
     VALUES (CURRENT_DATE + $2::int, 'lunch',
             NOW() - ($1 + 180) * INTERVAL '1 minute',
             NOW() - $1 * INTERVAL '1 minute',
             NOW() - $1 * INTERVAL '1 minute' + INTERVAL '2 hours', 'forecast')
     RETURNING slot_id`,
    [minutesAgo, uniqueDay()]
  );
  const slotId = rows[0].slot_id;
  await pool.query(
    "INSERT INTO dishes (name, unit, consumption_rate) VALUES ('Rice', 'kg', 0.145) ON CONFLICT DO NOTHING"
  );
  await pool.query(
    "INSERT INTO slot_dishes (slot_id, dish_id) SELECT $1, dish_id FROM dishes WHERE name = 'Rice'",
    [slotId]
  );
  return slotId;
}

function post(path, token, body) {
  return request(app).post(path).set("Authorization", `Bearer ${token}`).send(body);
}

beforeAll(async () => {
  await resetDb();
  staff = await tokenFor("staff@iiitl.ac.in");
  student = await tokenFor("student1@iiitl.ac.in");
});
afterAll(() => pool.end());

describe("check-ins (FR-16)", () => {
  test("staff can add to the running count during service", async () => {
    const slot = await servingSlot(10);
    await post(`/api/staff/slots/${slot}/check-ins`, staff, { add: 10 });
    const res = await post(`/api/staff/slots/${slot}/check-ins`, staff, { add: 5 });
    expect(res.status).toBe(201);
    expect(res.body.service.checkedIn).toBe(15);
  });

  test("an exact count can be set to correct a mistake", async () => {
    const slot = await servingSlot(10);
    await post(`/api/staff/slots/${slot}/check-ins`, staff, { add: 50 });
    const res = await post(`/api/staff/slots/${slot}/check-ins`, staff, { count: 42 });
    expect(res.body.service.checkedIn).toBe(42);
  });

  test("rejected outside the service window", async () => {
    const slot = await servingSlot(-60); // starts in an hour
    const res = await post(`/api/staff/slots/${slot}/check-ins`, staff, { add: 1 });
    expect(res.status).toBe(409);
  });

  test("rejects nonsense counts", async () => {
    const slot = await servingSlot(10);
    expect((await post(`/api/staff/slots/${slot}/check-ins`, staff, { add: "ten" })).status).toBe(400);
    expect((await post(`/api/staff/slots/${slot}/check-ins`, staff, { count: -3 })).status).toBe(400);
  });

  test("first check-in moves the meal into service", async () => {
    const slot = await servingSlot(10);
    await post(`/api/staff/slots/${slot}/check-ins`, staff, { add: 1 });
    const { rows } = await pool.query("SELECT state FROM meal_slots WHERE slot_id = $1", [slot]);
    expect(rows[0].state).toBe("in_service");
  });
});

describe("dashboard view", () => {
  test("shows the breakdown, kitchen quantities and live advice (NFR-4, FR-18)", async () => {
    const slot = await servingSlot(20);
    const res = await post(`/api/staff/slots/${slot}/check-ins`, staff, { count: 30 });
    const v = res.body;

    expect(v.yesPart + v.noPart + v.nonePart).toBeCloseTo(v.expected, 1);
    expect(v.dishes[0]).toMatchObject({ name: "Rice", unit: "kg" });
    expect(v.dishes[0].firstBatch + v.dishes[0].heldBack).toBeCloseTo(v.dishes[0].total, 1);
    expect(v.service.inWindow).toBe(true);
    expect(["cook", "partial", "hold", "wait"]).toContain(v.service.advice.action);
  });
});

describe("held-back decision (FR-17)", () => {
  test("recording the decision marks every dish and moves the state on", async () => {
    const slot = await servingSlot(20);
    const res = await post(`/api/staff/slots/${slot}/held-back`, staff, { share: 1 });
    expect(res.status).toBe(200);
    expect(res.body.service.decision).toBe(1);

    const { rows } = await pool.query("SELECT state FROM meal_slots WHERE slot_id = $1", [slot]);
    expect(rows[0].state).toBe("staged_decision");
  });

  test("a partial batch is stored as a share", async () => {
    const slot = await servingSlot(20);
    const res = await post(`/api/staff/slots/${slot}/held-back`, staff, { share: 0.6 });
    expect(res.body.service.decision).toBe(0.6);
  });

  test("share must be between 0 and 1", async () => {
    const slot = await servingSlot(20);
    expect((await post(`/api/staff/slots/${slot}/held-back`, staff, { share: "yes" })).status).toBe(400);
    expect((await post(`/api/staff/slots/${slot}/held-back`, staff, { share: 1.5 })).status).toBe(400);
  });
});

describe("access", () => {
  test("students cannot use the staff endpoints", async () => {
    const res = await request(app).get("/api/staff/slots").set("Authorization", `Bearer ${student}`);
    expect(res.status).toBe(403);
  });
});
