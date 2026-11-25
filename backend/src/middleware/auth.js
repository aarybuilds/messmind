const jwt = require("jsonwebtoken");

// Checks the bearer token and puts { id, role, name } on req.user
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Login required" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired, please log in again" });
  }
}

// Role check is always done here on the server, never trusted from the client (NFR-8)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have access to this" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
