const jwt = require("jsonwebtoken");
const db = require("./db");

const JWT_ISSUER = "classfund-api";
const JWT_AUDIENCE = "classfund-app";
const PASSWORD_RESET_ALLOWED = new Set(["POST /me/change-password"]);

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, tv: user.token_version },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: "2h", issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
  );
}

async function requireLogin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (!Number.isInteger(decoded.id) || !Number.isInteger(decoded.tv)) {
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

    if (u.is_default_password && !PASSWORD_RESET_ALLOWED.has(`${req.method} ${req.path}`)) {
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
  if (req.user.role !== 1 || !req.user.section) {
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

module.exports = { requireLogin, requireAdmin, requireSuperAdmin, signToken };