const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Admin only. Accounts only - no attendance or declaration data here (NFR-1).
router.use(requireAuth, requireRole("admin"));

// GET /api/users?role=student&search=sharma
router.get("/", async (req, res) => {
  const { role, search } = req.query;
  const params = [];
  let where = "WHERE role <> 'admin'";

  if (role) {
    params.push(role);
    where += ` AND role = $${params.length}`;
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where += ` AND (LOWER(name) LIKE $${params.length} OR email LIKE $${params.length})`;
  }

  const { rows } = await pool.query(
    `SELECT user_id AS id, name, email, role, is_active
     FROM users ${where} ORDER BY role DESC, name LIMIT 50`,
    params
  );
  res.json(rows);
});

// POST /api/users
router.post("/", async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Name, email, password and role are required" });
  }
  if (!["student", "staff"].includes(role)) {
    return res.status(400).json({ error: "Role must be student or staff" });
  }
  if (!email.toLowerCase().endsWith("@iiitl.ac.in")) {
    return res.status(400).json({ error: "Use an institute email address" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING user_id AS id, name, email, role, is_active`,
      [name.trim(), email.toLowerCase(), hash, role]
    );
    if (role === "student") {
      await pool.query("INSERT INTO reliability_profiles (user_id) VALUES ($1)", [rows[0].id]);
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    throw err;
  }
});

// PATCH /api/users/:id  - edit name or activate / deactivate
router.patch("/:id", async (req, res) => {
  const { name, is_active } = req.body;

  const { rows } = await pool.query(
    `UPDATE users
     SET name = COALESCE($1, name), is_active = COALESCE($2, is_active)
     WHERE user_id = $3 AND role <> 'admin'
     RETURNING user_id AS id, name, email, role, is_active`,
    [name ?? null, typeof is_active === "boolean" ? is_active : null, req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  res.json(rows[0]);
});

module.exports = router;
