const { app, pool, request, resetDb, tokenFor, makeSlot } = require("./helpers");

let admin;
let staff;

beforeAll(async () => {
  await resetDb();
  admin = await tokenFor("admin@iiitl.ac.in");
  staff = await tokenFor("staff@iiitl.ac.in");
});
afterAll(() => pool.end());

const as = (token) => ({
  get: (path) => request(app).get(path).set("Authorization", `Bearer ${token}`),
  put: (path, body) => request(app).put(path).set("Authorization", `Bearer ${token}`).send(body),
  post: (path, body) => request(app).post(path).set("Authorization", `Bearer ${token}`).send(body),
});

describe("settings (FR-24)", () => {
  test("admin can change the buffer and split", async () => {
    const res = await as(admin).put("/api/admin/settings", { safety_buffer: 0.1, first_batch_split: 0.8 });
    expect(res.status).toBe(200);
    expect(res.body.settings.safety_buffer).toBe(0.1);
    expect(res.body.settings.first_batch_split).toBe(0.8);
  });

  test("values outside the allowed range are refused", async () => {
    expect((await as(admin).put("/api/admin/settings", { safety_buffer: 0.9 })).status).toBe(400);
    expect((await as(admin).put("/api/admin/settings", { first_batch_split: 0.2 })).status).toBe(400);
    expect((await as(admin).put("/api/admin/settings", { safety_buffer: "lots" })).status).toBe(400);
  });

  test("settings that are not meant to be edited are ignored", async () => {
    const res = await as(admin).put("/api/admin/settings", { default_reliability: 0.1 });
    expect(res.status).toBe(400);
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'default_reliability'");
    expect(Number(rows[0].value)).toBe(0.9);
  });

  test("mess staff cannot change settings", async () => {
    expect((await as(staff).put("/api/admin/settings", { safety_buffer: 0.2 })).status).toBe(403);
  });
});

describe("meals and menu (FR-23)", () => {
  test("admin can add a dish", async () => {
    const res = await as(admin).post("/api/admin/dishes", { name: "Khichdi", unit: "kg", consumption_rate: 0.2 });
    expect(res.status).toBe(201);
    expect((await as(admin).post("/api/admin/dishes", { name: "Khichdi", unit: "kg", consumption_rate: 0.2 })).status).toBe(409);
    expect((await as(admin).post("/api/admin/dishes", { name: "Soup", unit: "bowls", consumption_rate: 1 })).status).toBe(400);
  });

  test("admin can change a meal's timings and menu while marking is open", async () => {
    const slot = await makeSlot(120);
    const { rows } = await pool.query("SELECT dish_id FROM dishes WHERE name = 'Khichdi'");
    const now = Date.now();
    const res = await as(admin).put(`/api/admin/slots/${slot}`, {
      marking_closes_at: new Date(now + 3 * 3600e3).toISOString(),
      service_starts_at: new Date(now + 5 * 3600e3).toISOString(),
      service_ends_at: new Date(now + 7 * 3600e3).toISOString(),
      dish_ids: [rows[0].dish_id],
    });
    expect(res.status).toBe(200);
    const menu = await pool.query("SELECT dish_id FROM slot_dishes WHERE slot_id = $1", [slot]);
    expect(menu.rows).toEqual([{ dish_id: rows[0].dish_id }]);
  });

  test("timings must be in order", async () => {
    const slot = await makeSlot(120);
    const now = Date.now();
    const res = await as(admin).put(`/api/admin/slots/${slot}`, {
      marking_closes_at: new Date(now + 6 * 3600e3).toISOString(),
      service_starts_at: new Date(now + 5 * 3600e3).toISOString(),
      service_ends_at: new Date(now + 7 * 3600e3).toISOString(),
      dish_ids: [1],
    });
    expect(res.status).toBe(400);
  });

  test("a meal can't be changed once marking has closed", async () => {
    const slot = await makeSlot(-5);
    const res = await as(admin).put(`/api/admin/slots/${slot}`, { dish_ids: [1] });
    expect(res.status).toBe(409);
  });
});

describe("analytics (FR-25)", () => {
  test("returns aggregates and never identifies a student", async () => {
    const res = await as(admin).get("/api/admin/analytics");
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/@iiitl|user_id|email/);
  });

  test("mess staff cannot see admin analytics", async () => {
    expect((await as(staff).get("/api/admin/analytics")).status).toBe(403);
  });
});
