const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (!email.toLowerCase().endsWith("@iiitl.ac.in")) {
    return res.status(400).json({ error: "Use your institute email address" });
  }

  const { rows } = await pool.query(
    "SELECT user_id, name, email, password_hash, role, is_active FROM users WHERE email = $1",
    [email.toLowerCase()]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Wrong email or password" });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: "This account has been deactivated" });
  }

  const token = jwt.sign(
    { id: user.user_id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({
    token,
    user: { id: user.user_id, name: user.name, email: user.email, role: user.role },
  });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT user_id AS id, name, email, role FROM users WHERE user_id = $1",
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  res.json(rows[0]);
});

module.exports = router;
