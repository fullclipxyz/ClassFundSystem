require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const db = require("./db");
const { requireLogin, requireAdmin } = require("./auth");

const app = express();

// 1. Trust Render's proxy (fixes the IP issue)
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors());
app.use(express.json());

// ==================== RATE LIMITERS ====================

// Limiter A: Per Student ID. 5 failed attempts allowed per 15 mins.
const studentLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // Only failed attempts count!
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `id:${(req.body && req.body.studentId) || req.ip}`,
  handler: async (req, res, next, options) => {
    try {
      const studentId = (req.body && req.body.studentId) || "Unknown";
      const [users] = await db.query("SELECT section FROM users WHERE student_id = ?", [studentId]);
      const section = users.length > 0 ? users[0].section : null;
      await db.query(
        "INSERT INTO security_logs (ip_address, event_type, section) VALUES (?, ?, ?)",
        [req.ip, `Blocked Login (ID: ${studentId})`, section]
      );
    } catch (err) { 
      console.error("Failed to save security log:", err.message); 
    }
    res.status(options.statusCode).json({ error: "Too many failed attempts. Try again in 15 minutes." });
  }
});

// Limiter B: Per IP Address. 50 failed attempts allowed per 15 mins.
// This catches attackers trying 100 different student IDs from one IP.
const ipLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${req.ip}`,
});

// Expose limiters to the unblock route
app.set("studentLoginLimiter", studentLoginLimiter);
app.set("ipLoginLimiter", ipLoginLimiter);

app.get("/", (req, res) => { res.json({ message: "Class Fund API is running" }); });

// ==================== LOGIN ====================
// BOTH limiters are applied here. They protect Students, Admins, and Super Admins.
app.post("/login", ipLoginLimiter, studentLoginLimiter, async (req, res) => {
  try {
    const { studentId, password, loginRole } = req.body;
    if (!studentId || !password) return res.status(400).json({ error: "Invalid ID or password" });

    const [rows] = await db.query("SELECT id, student_id, name, password_hash, role, section, is_default_password, token_version, is_active FROM users WHERE student_id = ?", [studentId]);
    const user = rows[0];
    
    // Generic error message so attackers don't know if the ID exists
    const fail = () => res.status(401).json({ error: "Invalid ID or password" });

    if (!user || !user.is_active) return fail();
    if (loginRole === "student" && user.role !== 0) return fail();
    if (loginRole === "admin" && user.role === 0) return fail();

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return fail();

    const token = jwt.sign(
      { id: user.id, role: user.role, section: user.section, tv: user.token_version },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, section: user.section, isDefaultPassword: user.is_default_password === 1 } });
  } catch (err) { 
    console.error("login error:", err.message);
    res.status(500).json({ error: "Server error" }); 
  }
});

// ==================== REGISTER ADMIN ====================
app.post("/register-admin", async (req, res) => {
  try {
    const { studentId, name, password, section } = req.body;
    if (!studentId || !name || !password || !section) return res.status(400).json({ error: "All fields are required" });
    if (studentId.length < 6) return res.status(400).json({ error: "Admin ID must be at least 6 characters." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    const [existingId] = await db.query("SELECT id FROM users WHERE student_id = ? AND role IN (1, 2)", [studentId]);
    if (existingId.length > 0) return res.status(409).json({ error: "This Admin ID is already taken." });

    const [existingSection] = await db.query("SELECT id FROM users WHERE section = ? AND role = 1", [section]);
    if (existingSection.length > 0) return res.status(409).json({ error: "An administrator is already assigned to this section." });

    const hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (student_id, name, password_hash, role, section, token_version, is_active) VALUES (?, ?, ?, 1, ?, 1, TRUE)", [studentId, name, hash, section]);
    res.json({ message: "Admin account created successfully!" });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============ STUDENT DEPOSIT ============
app.post("/me/deposit", requireLogin, async (req, res) => {
  try {
    const { amount } = req.body;
    const money = Number(amount);
    if (!(money > 0)) return res.status(400).json({ error: "Valid positive amount required" });

    const [existing] = await db.query("SELECT id FROM deposit_requests WHERE user_id = ? AND status = 'pending'", [req.user.id]);
    if (existing.length > 0) return res.status(400).json({ error: "You already have a pending deposit. Please wait for the Admin to approve it." });

    await db.query("INSERT INTO deposit_requests (user_id, amount) VALUES (?, ?)", [req.user.id, money]);
    res.json({ message: "Deposit request submitted! Waiting for admin approval." });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============ ADMIN APPROVALS ============
app.get("/admin/approvals", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.id, d.amount, d.created_at, u.name, u.student_id
       FROM deposit_requests d JOIN users u ON u.id = d.user_id
       WHERE u.section = ? AND d.status = 'pending' ORDER BY d.created_at ASC`,
      [req.user.section]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post("/admin/approvals/:id/approve", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [reqs] = await db.query("SELECT d.id, d.amount, d.user_id FROM deposit_requests d JOIN users u ON u.id = d.user_id WHERE d.id = ? AND u.section = ? AND d.status = 'pending'", [req.params.id, req.user.section]);
    if (reqs.length === 0) return res.status(404).json({ error: "Request not found" });
    const request = reqs[0];
    await db.query("INSERT INTO payments (user_id, amount, paid_date, section) VALUES (?, ?, CURDATE(), ?)", [request.user_id, request.amount, req.user.section]);
    await db.query("UPDATE deposit_requests SET status = 'approved' WHERE id = ?", [req.params.id]);
    res.json({ message: "Deposit approved and added to records!" });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post("/admin/approvals/:id/reject", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [result] = await db.query("UPDATE deposit_requests d JOIN users u ON u.id = d.user_id SET d.status = 'rejected' WHERE d.id = ? AND u.section = ? AND d.status = 'pending'", [req.params.id, req.user.section]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Request not found" });
    res.json({ message: "Deposit request rejected." });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============ ADMIN SECURITY ============
app.get("/admin/security-logs", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, ip_address, event_type, created_at FROM security_logs WHERE section = ? ORDER BY created_at DESC LIMIT 50", [req.user.section]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post("/admin/unblock-student", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { studentId } = req.body;
    const [users] = await db.query("SELECT section FROM users WHERE student_id = ?", [studentId]);
    if (users.length === 0 || users[0].section !== req.user.section) return res.status(403).json({ error: "Unauthorized" });
    
    // FIX: Reset the STUDENT'S limit, not the Admin's IP
    const limiter = req.app.get("studentLoginLimiter");
    if (limiter) limiter.resetKey(`id:${studentId}`);
    
    await db.query("DELETE FROM security_logs WHERE section = ? AND event_type LIKE ?", [req.user.section, `%${studentId}%`]);
    res.json({ message: `Successfully unblocked student ${studentId}.` });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============ LEDGER ============
app.get("/admin/ledger", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, type, description, amount, date, is_deleted FROM (
        SELECT p.id, 'Deposit' as type, CONCAT(u.name, ' (', u.student_id, ')') as description, p.amount, p.paid_date as date, p.is_deleted
        FROM payments p JOIN users u ON u.id = p.user_id WHERE p.section = ?
        UNION ALL
        SELECT e.id, 'Expense' as type, e.description, e.amount, e.expense_date as date, e.is_deleted
        FROM expenses e WHERE e.section = ?
      ) AS ledger ORDER BY date DESC, id DESC`,
      [req.user.section, req.user.section]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============ STUDENTS ============
app.post("/admin/students", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { studentId, name, password } = req.body;
    if (!studentId || !name || !password) return res.status(400).json({ error: "ID, name and password are required" });
    if (studentId.length < 6) return res.status(400).json({ error: "Student ID must be at least 6 characters." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    const [existingId] = await db.query("SELECT id FROM users WHERE student_id = ? AND role = 0", [studentId]);
    if (existingId.length > 0) return res.status(409).json({ error: "This Student ID is already registered." });

    const hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (student_id, name, password_hash, role, section, token_version, is_active) VALUES (?, ?, ?, 0, ?, 1, TRUE)", [studentId, name, hash, req.user.section]);
    res.json({ message: "Student added to " + req.user.section });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.get("/admin/students", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, student_id, name, DATE_FORMAT(created_at, '%Y-%m-%d %h:%i %p') AS created_at FROM users WHERE role = 0 AND section = ? AND is_active = TRUE ORDER BY name ASC", [req.user.section]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.delete("/admin/students/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND role = 0 AND section = ? AND is_active = TRUE",
      [req.params.id, req.user.section]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    const [[{ count }]] = await db.query(
      "SELECT COUNT(*) AS count FROM payments WHERE user_id = ?",
      [req.params.id]
    );
    if (count > 0) {
      return res.status(409).json({
        error: "Cannot delete: this student has payment records. Remove payments first if needed.",
      });
    }

    await db.query(
      "UPDATE users SET is_active = FALSE, token_version = token_version + 1 WHERE id = ? AND section = ?",
      [req.params.id, req.user.section]
    );

    res.json({ message: "Student deleted" });
  } catch (err) {
    console.error("delete student error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/admin/reset-password", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { studentId } = req.body;
    const [rows] = await db.query("SELECT id, name FROM users WHERE student_id = ? AND role = 0 AND section = ? AND is_active = TRUE", [studentId, req.user.section]);
    if (rows.length === 0) return res.status(404).json({ error: "Student not found" });
    const hash = await bcrypt.hash("123456", 10);
    await db.query("UPDATE users SET password_hash = ?, is_default_password = TRUE, token_version = token_version + 1 WHERE id = ?", [hash, rows[0].id]);
    res.json({ message: `Password for ${rows[0].name} reset to default (123456).` });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============ PAYMENTS ============
app.post("/admin/payments", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { studentId, amount, date } = req.body;
    const money = Number(amount);
    if (!studentId || !(money > 0)) return res.status(400).json({ error: "Student ID and valid positive amount required" });
    const [rows] = await db.query("SELECT id, name FROM users WHERE student_id = ? AND role = 0 AND section = ? AND is_active = TRUE", [studentId, req.user.section]);
    if (rows.length === 0) return res.status(404).json({ error: "Student not found" });
    await db.query("INSERT INTO payments (user_id, amount, paid_date, section) VALUES (?, ?, COALESCE(?, CURDATE()), ?)", [rows[0].id, money, date || null, req.user.section]);
    res.json({ message: "Payment recorded for " + rows[0].name });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.get("/admin/payments", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT p.id, p.amount, DATE_FORMAT(p.paid_date, '%Y-%m-%d %h:%i %p') AS date, u.student_id, u.name FROM payments p JOIN users u ON u.id = p.user_id WHERE p.section = ? AND p.is_deleted = FALSE ORDER BY p.paid_date DESC, p.id DESC", [req.user.section]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.delete("/admin/payments/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [result] = await db.query("UPDATE payments SET is_deleted = TRUE WHERE id = ? AND section = ?", [req.params.id, req.user.section]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Payment not found" });
    res.json({ message: "Payment removed from active list. Audit trail preserved." });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============ EXPENSES ============
app.post("/admin/expenses", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { description, amount, date } = req.body;
    const money = Number(amount);
    if (!description || !(money > 0)) return res.status(400).json({ error: "Description and valid positive amount required" });
    await db.query("INSERT INTO expenses (description, amount, expense_date, section) VALUES (?, ?, COALESCE(?, CURDATE()), ?)", [description, money, date || null, req.user.section]);
    res.json({ message: "Expense logged: " + description });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.get("/admin/expenses", requireLogin, requireAdmin, async (req, res) => {
  try {
    const showArchived = req.query.archived === "true";
    const query = showArchived
      ? "SELECT id, description, amount, DATE_FORMAT(expense_date, '%Y-%m-%d') AS date, is_deleted FROM expenses WHERE section = ? AND is_deleted = TRUE ORDER BY expense_date DESC, id DESC"
      : "SELECT id, description, amount, DATE_FORMAT(expense_date, '%Y-%m-%d') AS date, is_deleted FROM expenses WHERE section = ? AND is_deleted = FALSE ORDER BY expense_date DESC, id DESC";
    const [rows] = await db.query(query, [req.user.section]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.delete("/admin/expenses/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [result] = await db.query("UPDATE expenses SET is_deleted = TRUE WHERE id = ? AND section = ?", [req.params.id, req.user.section]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Expense not found" });
    res.json({ message: "Expense removed from active list. Audit trail preserved." });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============ SUMMARY & REPORT ============
app.get("/me/summary", requireLogin, async (req, res) => {
  try {
    const [payments] = await db.query("SELECT id, amount, DATE_FORMAT(paid_date, '%Y-%m-%d') AS date FROM payments WHERE user_id = ? AND is_deleted = FALSE ORDER BY paid_date DESC, id DESC", [req.user.id]);
    const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const [[allC]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ? AND is_deleted = FALSE", [req.user.section]);
    const [[allE]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ? AND is_deleted = FALSE", [req.user.section]);
    res.json({ paid, totalClassFund: Number(allC.total) - Number(allE.total), payments });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post("/me/change-password", requireLogin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password_hash = ?, is_default_password = FALSE, token_version = token_version + 1 WHERE id = ?", [hash, req.user.id]);
    res.json({ message: "Password updated successfully!" });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.get("/admin/report", requireLogin, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const thisMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const month = req.query.month || thisMonth;
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Month must look like 2026-10" });
    const start = month + "-01";
    const [[c]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ? AND paid_date >= ? AND paid_date < DATE_ADD(?, INTERVAL 1 MONTH) AND is_deleted = FALSE", [req.user.section, start, start]);
    const [[e]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ? AND expense_date >= ? AND expense_date < DATE_ADD(?, INTERVAL 1 MONTH) AND is_deleted = FALSE", [req.user.section, start, start]);
    const [[allC]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ? AND is_deleted = FALSE", [req.user.section]);
    const [[allE]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ? AND is_deleted = FALSE", [req.user.section]);
    res.json({ month, collected: Number(c.total), expenses: Number(e.total), monthNet: Number(c.total) - Number(e.total), cashOnHand: Number(allC.total) - Number(allE.total) });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============ SUPER ADMIN ============
app.get("/super-admin/admins", requireLogin, async (req, res) => {
  if (req.user.role !== 2) return res.status(403).json({ error: "Super Admin only" });
  try { const [rows] = await db.query("SELECT id, student_id, name, section FROM users WHERE role = 1 ORDER BY section ASC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.get("/super-admin/sections/:sectionName", requireLogin, async (req, res) => {
  if (req.user.role !== 2) return res.status(403).json({ error: "Super Admin only" });
  try {
    const [students] = await db.query("SELECT id, student_id, name FROM users WHERE role = 0 AND section = ? AND is_active = TRUE ORDER BY name ASC", [req.params.sectionName]);
    const [[allC]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ? AND is_deleted = FALSE", [req.params.sectionName]);
    const [[allE]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ? AND is_deleted = FALSE", [req.params.sectionName]);
    res.json({ students, cashOnHand: Number(allC.total) - Number(allE.total) });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.delete("/super-admin/sections/:sectionName", requireLogin, async (req, res) => {
  if (req.user.role !== 2) return res.status(403).json({ error: "Super Admin only" });
  try {
    await db.query("DELETE FROM payments WHERE section = ?", [req.params.sectionName]);
    await db.query("DELETE FROM expenses WHERE section = ?", [req.params.sectionName]);
    await db.query("DELETE FROM users WHERE section = ?", [req.params.sectionName]);
    res.json({ message: `Successfully deleted the entire ${req.params.sectionName} section.` });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post("/super-admin/reset-limits", requireLogin, async (req, res) => {
  if (req.user.role !== 2) return res.status(403).json({ error: "Super Admin only" });
  try {
    const limiter = req.app.get("studentLoginLimiter");
    const ipLimiter = req.app.get("ipLoginLimiter");
    
    if (limiter && limiter.resetKey) limiter.resetKey(req.ip); // Best effort for IP limiter
    if (ipLimiter && ipLimiter.resetKey) ipLimiter.resetKey(`ip:${req.ip}`);

    res.json({ message: "Successfully unblocked your IP address." });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.get("/super-admin/logs", requireLogin, async (req, res) => {
  if (req.user.role !== 2) return res.status(403).json({ error: "Super Admin only" });
  try { const [logs] = await db.query("SELECT id, ip_address, event_type, created_at FROM security_logs ORDER BY created_at DESC LIMIT 50"); res.json(logs); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post("/super-admin/reset-admin-password", requireLogin, async (req, res) => {
  if (req.user.role !== 2) return res.status(403).json({ error: "Super Admin only" });
  try {
    const { adminId } = req.body;
    const [rows] = await db.query("SELECT id, name FROM users WHERE student_id = ? AND role = 1", [adminId]);
    if (rows.length === 0) return res.status(404).json({ error: "Admin not found" });
    const hash = await bcrypt.hash("123456", 10);
    await db.query("UPDATE users SET password_hash = ?, is_default_password = TRUE, token_version = token_version + 1 WHERE id = ?", [hash, rows[0].id]);
    res.json({ message: `Password for Admin ${rows[0].name} reset to default (123456).` });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => { console.log("Server running at http://localhost:" + PORT); });