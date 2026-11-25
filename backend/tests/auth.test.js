const { app, pool, request, resetDb, PASSWORD } = require("./helpers");

beforeAll(resetDb);
afterAll(() => pool.end());

describe("POST /api/auth/login", () => {
  test("logs in with correct details and returns the role", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "student1@iiitl.ac.in", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe("student");
  });

  test("rejects a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "student1@iiitl.ac.in", password: "nope" });
    expect(res.status).toBe(401);
  });

  test("rejects non-institute emails", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "someone@gmail.com", password: PASSWORD });
    expect(res.status).toBe(400);
  });

  test("rejects deactivated accounts", async () => {
    await pool.query("UPDATE users SET is_active = false WHERE email = 'student2@iiitl.ac.in'");
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "student2@iiitl.ac.in", password: PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe("role checks (FR-2)", () => {
  test("a request without a token is refused", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("a student cannot reach the admin endpoints", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "student1@iiitl.ac.in", password: PASSWORD });
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });
});
