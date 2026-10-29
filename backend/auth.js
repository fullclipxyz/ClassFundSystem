const jwt = require("jsonwebtoken");

function requireLogin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    // 2 hours token expiry for better security
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { maxAge: "2h" });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  // Allows both Admin (1) and Super Admin (2)
  if (req.user.role !== 1 && req.user.role !== 2) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };