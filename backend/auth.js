const jwt = require("jsonwebtoken");
const db = require("./db");

const PASSWORD_RESET_ALLOWED_PATHS = new Set(["/me/change-password"]);

async function requireLogin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const [rows] = await db.query(
      "SELECT id, role, section, token_version, is_active, is_default_password FROM users WHERE id = ?",
      [decoded.id]
    );
    const u = rows[0];
    
    if (!u || !u.is_active || u.token_version !== decoded.tv) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }

    if (u.is_default_password === 1 && !PASSWORD_RESET_ALLOWED_PATHS.has(req.path)) {
      return res.status(403).json({
        error: "You must change your password before continuing.",
        code: "PASSWORD_RESET_REQUIRED",
      });
    }

    req.user = { id: u.id, role: u.role, section: u.section };
    next();
  } catch (err) {
    console.error("requireLogin DB error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 1 && req.user.role !== 2) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 2) {
    return res.status(403).json({ error: "Super Admin only" });
  }
  next();
}

module.exports = { requireLogin, requireAdmin, requireSuperAdmin };