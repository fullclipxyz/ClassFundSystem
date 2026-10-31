require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const db = require("./db");
const { requireLogin, requireAdmin, requireSuperAdmin, signToken } = require("./auth");

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing. Set it in backend/.env and in the Render environment.");
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn("WARNING: JWT_SECRET is shorter than 32 characters. Use a long random secret.");
}

const app = express();
app.set("trust proxy", 1);
app.use(helmet());

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
if (allowedOrigins.length === 0) console.warn("WARNING: FRONTEND_ORIGIN is not set. CORS is open to all origins.");
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));

app.use(express.json({ limit: "10kb" }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== "object") req.body = {};
  next();
});

// ==================== HELPERS ====================

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function sendError(res, err) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "This record already exists." });
  console.error(err);
  return res.status(500).json({ error: "Server error" });
}

async function withTransaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

const clean = (v) => (typeof v === "string" ? v.trim() : "");

const MAX_AMOUNT = 100000;
function parseAmount(v) {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (typeof v === "string" && !v.trim()) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

function parseId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isValidDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isValidMonth(s) {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

// Today's date in the Philippines (YYYY-MM-DD), regardless of the server's timezone
function todayManila() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function cleanSection(v) {
  const s = clean(v).replace(/\s+/g, " ");
  return /^[A-Za-z0-9][A-Za-z0-9 _.\-]{1,49}$/.test(s) ? s : null;
}

const validStudentId = (v) => /^[A-Za-z0-9-]{6,30}$/.test(v);

function validPassword(pw, minLen) {
  return typeof pw === "string" && pw.length >= minLen && Buffer.byteLength(pw) <= 72;
}

function tempPassword(len = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

async function logEvent(req, text, section) {
  try {
    const sec = section !== undefined ? section : (req.user ? req.user.section : null);
    await db.query("INSERT INTO security_logs (ip_address, event_type, section) VALUES (?, ?, ?)", [req.ip, String(text).slice(0, 100), sec]);
  } catch (err) { console.error("Log error:", err.message); }
}

// ==================== RATE LIMITERS ====================

const idKey = (sid) => "id:" + String(sid).trim().toLowerCase().slice(0, 100);

const studentLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => (typeof req.body.studentId === "string" && req.body.studentId.trim() ? idKey(req.body.studentId) : `ip:${req.ip}`),
  handler: async (req, res, next, options) => {
    const rl = req.rateLimit;
    const firstBlock = !rl || typeof rl.current !== "number" || rl.current <= rl.limit + 1;
    if (firstBlock) {
      try {
        const studentId = typeof req.body.studentId === "string" ? req.body.studentId.trim().slice(0, 40) : "Unknown";
        const [users] = await db.query("SELECT section FROM users WHERE student_id = ?", [studentId]);
        const section = users.length > 0 ? users[0].section : null;
        await db.query("INSERT INTO security_logs (ip_address, event_type, section) VALUES (?, ?, ?)", [req.ip, `Blocked Login (ID: ${studentId})`.slice(0, 100), section]);
      } catch (err) { console.error("Log error:", err.message); }
    }
    res.status(options.statusCode).json({ error: "Too many failed attempts. Try again in 15 minutes." });
  },
});

const ipLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `ip:${req.ip}`,
  message: { error: "Too many failed attempts from this network. Try again in 15 minutes." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `reg:${req.ip}`,
  message: { error: "Too many registration attempts. Try again later." },
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `uid:${req.user ? req.user.id : req.ip}`,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});

app.set("studentLoginLimiter", studentLoginLimiter);
app.set("ipLoginLimiter", ipLoginLimiter);

app.get("/", (req, res) => { res.json({ message: "Class Fund API is running" }); });

// ==================== LOGIN ====================
const FAKE_HASH = bcrypt.hashSync("not-a-real-password-x", 10);

app.post("/login", ipLoginLimiter, studentLoginLimiter, async (req, res) => {
  try {
    const studentId = clean(req.body.studentId);
    const password = req.body.password;
    const loginRole = req.body.loginRole;
    const fail = () => res.status(401).json({ error: "Invalid ID or password" });

    if (!studentId || studentId.length > 40 || typeof password !== "string" || !password || password.length > 200) {
      return res.status(400).json({ error: "Invalid ID or password" });
    }

    const [rows] = await db.query("SELECT id, student_id, name, password_hash, role, section, is_default_password, token_version, is_active FROM users WHERE student_id = ?", [studentId]);
    const user = rows[0];

    const ok = await bcrypt.compare(password, user ? user.password_hash : FAKE_HASH);
    if (!user || !user.is_active || !ok) return fail();
    if (loginRole === "student") { if (user.role !== 0) return fail(); }
    else if (loginRole === "admin") { if (user.role === 0) return fail(); }
    else return fail();

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, section: user.section, isDefaultPassword: Boolean(user.is_default_password) } });
  } catch (err) { sendError(res, err); }
});

// ==================== REGISTER ADMIN (Invite code removed) ====================
app.post("/register-admin", registerLimiter, async (req, res) => {
  const fail = () => res.status(400).json({ error: "Registration failed. Please check your details and try again." });
  try {
    const studentId = clean(req.body.studentId);
    const name = clean(req.body.name);
    const password = req.body.password;
    const section = cleanSection(req.body.section);

    if (!validStudentId(studentId) || !name || name.length > 100 || !section) return fail();
    if (!validPassword(password, 8)) return fail();

    const [existingId] = await db.query("SELECT id FROM users WHERE student_id = ?", [studentId]);
    if (existingId.length > 0) return fail();

    const [existingSection] = await db.query("SELECT id FROM users WHERE section = ? AND role = 1", [section]);
    if (existingSection.length > 0) return fail();

    const hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (student_id, name, password_hash, role, section, token_version, is_active, is_default_password) VALUES (?, ?, ?, 1, ?, 1, TRUE, FALSE)", [studentId, name, hash, section]);
    await logEvent(req, `Admin Registered (ID: ${studentId})`, section);

    res.json({ message: "Admin account created successfully!" });
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") return fail();
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ============ STUDENT DEPOSIT ============
app.post("/me/deposit", requireLogin, async (req, res) => {
  try {
    if (req.user.role !== 0) return res.status(403).json({ error: "Students only" });
    const money = parseAmount(req.body.amount);
    if (money === null) return res.status(400).json({ error: "Valid positive amount required" });

    const [existing] = await db.query("SELECT id FROM deposit_requests WHERE user_id = ? AND status = 'pending'", [req.user.id]);
    if (existing.length > 0) return res.status(400).json({ error: "You already have a pending deposit. Please wait." });

    await db.query("INSERT INTO deposit_requests (user_id, amount) VALUES (?, ?)", [req.user.id, money]);
    res.json({ message: "Deposit request submitted! Waiting for admin approval." });
  } catch (err) { sendError(res, err); }
});

// ============ ADMIN APPROVALS ============
app.get("/admin/approvals", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT d.id, d.amount, d.created_at, u.name, u.student_id FROM deposit_requests d JOIN users u ON u.id = d.user_id WHERE u.section = ? AND d.status = 'pending' ORDER BY d.created_at ASC`, [req.user.section]);
    res.json(rows);
  } catch (err) { sendError(res, err); }
});

app.post("/admin/approvals/:id/approve", requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "Request not found" });

    await withTransaction(async (conn) => {
      const [reqs] = await conn.query(
        `SELECT d.id, d.amount, d.user_id FROM deposit_requests d JOIN users u ON u.id = d.user_id
         WHERE d.id = ? AND u.section = ? AND u.role = 0 AND u.is_active = TRUE AND d.status = 'pending' FOR UPDATE`,
        [id, req.user.section]
      );
      if (reqs.length === 0) throw new HttpError(404, "Request not found");
      const r = reqs[0];
      await conn.query("INSERT INTO payments (user_id, amount, paid_date, section) VALUES (?, ?, ?, ?)", [r.user_id, r.amount, todayManila(), req.user.section]);
      await conn.query("UPDATE deposit_requests SET status = 'approved' WHERE id = ? AND status = 'pending'", [r.id]);
    });

    res.json({ message: "Deposit approved and added to records!" });
  } catch (err) { sendError(res, err); }
});

app.post("/admin/approvals/:id/reject", requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "Request not found" });
    const [result] = await db.query("UPDATE deposit_requests d JOIN users u ON u.id = d.user_id SET d.status = 'rejected' WHERE d.id = ? AND u.section = ? AND u.role = 0 AND d.status = 'pending'", [id, req.user.section]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Request not found" });
    res.json({ message: "Deposit request rejected." });
  } catch (err) { sendError(res, err); }
});

// ============ ADMIN SECURITY ============
app.get("/admin/security-logs", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, ip_address, event_type, created_at FROM security_logs WHERE section = ? ORDER BY created_at DESC LIMIT 50", [req.user.section]);
    res.json(rows);
  } catch (err) { sendError(res, err); }
});

app.post("/admin/unblock-student", requireLogin, requireAdmin, async (req, res) => {
  try {
    const studentId = clean(req.body.studentId);
    if (!studentId) return res.status(400).json({ error: "Student ID required" });

    const [users] = await db.query("SELECT section FROM users WHERE student_id = ? AND role = 0", [studentId]);
    if (users.length === 0 || users[0].section !== req.user.section) return res.status(403).json({ error: "Unauthorized" });

    const limiter = req.app.get("studentLoginLimiter");
    if (limiter && limiter.resetKey) limiter.resetKey(idKey(studentId));

    await logEvent(req, `Student Unblocked (ID: ${studentId})`);
    res.json({ message: `Successfully unblocked student ${studentId}.` });
  } catch (err) { sendError(res, err); }
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
  } catch (err) { sendError(res, err); }
});

// ============ STUDENTS ============
app.post("/admin/students", requireLogin, requireAdmin, async (req, res) => {
  try {
    const studentId = clean(req.body.studentId);
    const name = clean(req.body.name);
    const password = req.body.password;
    if (!studentId || !name || typeof password !== "string" || !password) return res.status(400).json({ error: "ID, name and password are required" });
    if (!validStudentId(studentId)) return res.status(400).json({ error: "Student ID must be 6-30 characters (letters, numbers, hyphen)." });
    if (name.length > 100) return res.status(400).json({ error: "Name is too long." });
    if (!validPassword(password, 6)) return res.status(400).json({ error: "Password must be 6-72 characters." });

    const hash = await bcrypt.hash(password, 10);

    await withTransaction(async (conn) => {
      const [existing] = await conn.query("SELECT id, role, section, is_active FROM users WHERE student_id = ? FOR UPDATE", [studentId]);
      if (existing.length > 0) {
        const u = existing[0];
        const canReactivate = u.role === 0 && !u.is_active && u.section === req.user.section;
        if (!canReactivate) throw new HttpError(409, "This Student ID is already registered.");
        await conn.query("UPDATE users SET name = ?, password_hash = ?, is_default_password = TRUE, is_active = TRUE, token_version = token_version + 1 WHERE id = ?", [name, hash, u.id]);
        return;
      }
      await conn.query("INSERT INTO users (student_id, name, password_hash, role, section, token_version, is_active, is_default_password) VALUES (?, ?, ?, 0, ?, 1, TRUE, TRUE)", [studentId, name, hash, req.user.section]);
    });

    res.json({ message: "Student added to " + req.user.section });
  } catch (err) { sendError(res, err); }
});

app.get("/admin/students", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, student_id, name, DATE_FORMAT(created_at, '%Y-%m-%d %h:%i %p') AS created_at FROM users WHERE role = 0 AND section = ? AND is_active = TRUE ORDER BY name ASC", [req.user.section]);
    res.json(rows);
  } catch (err) { sendError(res, err); }
});

app.delete("/admin/students/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "Student not found" });

    await withTransaction(async (conn) => {
      const [rows] = await conn.query("SELECT id FROM users WHERE id = ? AND role = 0 AND section = ? AND is_active = TRUE FOR UPDATE", [id, req.user.section]);
      if (rows.length === 0) throw new HttpError(404, "Student not found");

      const [[{ count }]] = await conn.query("SELECT COUNT(*) AS count FROM payments WHERE user_id = ? AND is_deleted = FALSE", [id]);
      if (count > 0) throw new HttpError(409, "Cannot delete: this student has active payment records. Delete the payments first if you want to remove the student.");

      await conn.query("UPDATE deposit_requests SET status = 'rejected' WHERE user_id = ? AND status = 'pending'", [id]);
      await conn.query("UPDATE users SET is_active = FALSE, token_version = token_version + 1 WHERE id = ? AND section = ?", [id, req.user.section]);
    });

    await logEvent(req, `Student Deleted (user #${id})`);
    res.json({ message: "Student deleted successfully" });
  } catch (err) { sendError(res, err); }
});

app.post("/admin/reset-password", requireLogin, requireAdmin, async (req, res) => {
  try {
    const studentId = clean(req.body.studentId);
    if (!studentId) return res.status(400).json({ error: "Student ID required" });

    const [rows] = await db.query("SELECT id, name FROM users WHERE student_id = ? AND role = 0 AND section = ? AND is_active = TRUE", [studentId, req.user.section]);
    if (rows.length === 0) return res.status(404).json({ error: "Student not found" });

    const temp = tempPassword();
    const hash = await bcrypt.hash(temp, 10);
    await db.query("UPDATE users SET password_hash = ?, is_default_password = TRUE, token_version = token_version + 1 WHERE id = ?", [hash, rows[0].id]);

    await logEvent(req, `Password Reset (Student ID: ${studentId})`);
    res.json({ message: `Password for ${rows[0].name} was reset. Temporary password: ${temp} (give it to the student, they must change it at next login).` });
  } catch (err) { sendError(res, err); }
});

// ============ PAYMENTS ============
app.post("/admin/payments", requireLogin, requireAdmin, async (req, res) => {
  try {
    const studentId = clean(req.body.studentId);
    const money = parseAmount(req.body.amount);
    const date = req.body.date ? String(req.body.date) : todayManila();
    if (!studentId || money === null) return res.status(400).json({ error: "Student ID and valid positive amount required" });
    if (!isValidDate(date) || date > todayManila()) return res.status(400).json({ error: "Invalid date." });

    const name = await withTransaction(async (conn) => {
      const [rows] = await conn.query("SELECT id, name FROM users WHERE student_id = ? AND role = 0 AND section = ? AND is_active = TRUE FOR UPDATE", [studentId, req.user.section]);
      if (rows.length === 0) throw new HttpError(404, "Student not found");
      await conn.query("INSERT INTO payments (user_id, amount, paid_date, section) VALUES (?, ?, ?, ?)", [rows[0].id, money, date, req.user.section]);
      return rows[0].name;
    });

    res.json({ message: "Payment recorded for " + name });
  } catch (err) { sendError(res, err); }
});

app.get("/admin/payments", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT p.id, p.amount, DATE_FORMAT(p.paid_date, '%Y-%m-%d %h:%i %p') AS date, u.student_id, u.name, p.is_deleted FROM payments p JOIN users u ON u.id = p.user_id WHERE p.section = ? ORDER BY p.paid_date DESC, p.id DESC", [req.user.section]);
    res.json(rows);
  } catch (err) { sendError(res, err); }
});

app.delete("/admin/payments/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "Payment not found" });
    const [result] = await db.query("UPDATE payments SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = ? WHERE id = ? AND section = ? AND is_deleted = FALSE", [req.user.id, id, req.user.section]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Payment not found" });
    await logEvent(req, `Payment Deleted (#${id})`);
    res.json({ message: "Payment removed from active list. Audit trail preserved." });
  } catch (err) { sendError(res, err); }
});

// ============ EXPENSES ============
app.post("/admin/expenses", requireLogin, requireAdmin, async (req, res) => {
  try {
    const description = clean(req.body.description);
    const money = parseAmount(req.body.amount);
    const date = req.body.date ? String(req.body.date) : todayManila();
    if (!description || description.length > 200 || money === null) return res.status(400).json({ error: "Description (max 200 characters) and valid positive amount required" });
    if (!isValidDate(date) || date > todayManila()) return res.status(400).json({ error: "Invalid date." });

    await db.query("INSERT INTO expenses (description, amount, expense_date, section) VALUES (?, ?, ?, ?)", [description, money, date, req.user.section]);
    res.json({ message: "Expense logged: " + description });
  } catch (err) { sendError(res, err); }
});

app.get("/admin/expenses", requireLogin, requireAdmin, async (req, res) => {
  try {
    const showArchived = req.query.archived === "true";
    const query = showArchived
      ? "SELECT id, description, amount, DATE_FORMAT(expense_date, '%Y-%m-%d') AS date, is_deleted FROM expenses WHERE section = ? AND is_deleted = TRUE ORDER BY expense_date DESC, id DESC"
      : "SELECT id, description, amount, DATE_FORMAT(expense_date, '%Y-%m-%d') AS date, is_deleted FROM expenses WHERE section = ? AND is_deleted = FALSE ORDER BY expense_date DESC, id DESC";
    const [rows] = await db.query(query, [req.user.section]);
    res.json(rows);
  } catch (err) { sendError(res, err); }
});

app.delete("/admin/expenses/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "Expense not found" });
    const [result] = await db.query("UPDATE expenses SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = ? WHERE id = ? AND section = ? AND is_deleted = FALSE", [req.user.id, id, req.user.section]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Expense not found" });
    await logEvent(req, `Expense Deleted (#${id})`);
    res.json({ message: "Expense removed from active list. Audit trail preserved." });
  } catch (err) { sendError(res, err); }
});

// ============ SUMMARY & REPORT ============
app.get("/me/summary", requireLogin, async (req, res) => {
  try {
    const [payments] = await db.query("SELECT id, amount, DATE_FORMAT(paid_date, '%Y-%m-%d') AS date FROM payments WHERE user_id = ? AND is_deleted = FALSE ORDER BY paid_date DESC, id DESC", [req.user.id]);
    const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const [[allC]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ? AND is_deleted = FALSE", [req.user.section]);
    const [[allE]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ? AND is_deleted = FALSE", [req.user.section]);
    res.json({ paid, totalClassFund: Number(allC.total) - Number(allE.total), payments });
  } catch (err) { sendError(res, err); }
});

app.post("/me/change-password", requireLogin, changePasswordLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== "string" || !currentPassword) return res.status(400).json({ error: "Current password is required" });

    const minLen = req.user.role === 0 ? 6 : 8;
    if (!validPassword(newPassword, minLen)) return res.status(400).json({ error: `New password must be ${minLen}-72 characters` });
    if (newPassword === currentPassword) return res.status(400).json({ error: "New password must differ from current" });

    const [rows] = await db.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    const ok = rows[0] && (await bcrypt.compare(currentPassword, rows[0].password_hash));
    if (!ok) return res.status(400).json({ error: "Current password is incorrect" });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password_hash = ?, is_default_password = FALSE, token_version = token_version + 1 WHERE id = ?", [hash, req.user.id]);
    res.json({ message: "Password updated successfully!" });
  } catch (err) { sendError(res, err); }
});

app.get("/admin/report", requireLogin, requireAdmin, async (req, res) => {
  try {
    const month = req.query.month || todayManila().slice(0, 7);
    if (!isValidMonth(month)) return res.status(400).json({ error: "Month must look like 2026-10" });
    const start = month + "-01";
    const [[c]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ? AND paid_date >= ? AND paid_date < DATE_ADD(?, INTERVAL 1 MONTH) AND is_deleted = FALSE", [req.user.section, start, start]);
    const [[e]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ? AND expense_date >= ? AND expense_date < DATE_ADD(?, INTERVAL 1 MONTH) AND is_deleted = FALSE", [req.user.section, start, start]);
    const [[allC]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ? AND is_deleted = FALSE", [req.user.section]);
    const [[allE]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ? AND is_deleted = FALSE", [req.user.section]);
    res.json({ month, collected: Number(c.total), expenses: Number(e.total), monthNet: Number(c.total) - Number(e.total), cashOnHand: Number(allC.total) - Number(allE.total) });
  } catch (err) { sendError(res, err); }
});

// ============ SUPER ADMIN ============
app.get("/super-admin/admins", requireLogin, requireSuperAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, student_id, name, section FROM users WHERE role = 1 ORDER BY section ASC");
    res.json(rows);
  } catch (err) { sendError(res, err); }
});

app.get("/super-admin/sections/:sectionName", requireLogin, requireSuperAdmin, async (req, res) => {
  try {
    const section = clean(req.params.sectionName);
    if (!section) return res.status(400).json({ error: "Section required" });
    const [students] = await db.query("SELECT id, student_id, name FROM users WHERE role = 0 AND section = ? AND is_active = TRUE ORDER BY name ASC", [section]);
    const [[allC]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ? AND is_deleted = FALSE", [section]);
    const [[allE]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ? AND is_deleted = FALSE", [section]);
    res.json({ students, cashOnHand: Number(allC.total) - Number(allE.total) });
  } catch (err) { sendError(res, err); }
});

app.delete("/super-admin/sections/:sectionName", requireLogin, requireSuperAdmin, async (req, res) => {
  try {
    const section = clean(req.params.sectionName);
    if (!section) return res.status(400).json({ error: "Section required" });

    await withTransaction(async (conn) => {
      const [protectedUsers] = await conn.query("SELECT id FROM users WHERE section = ? AND role = 2", [section]);
      if (protectedUsers.length > 0) throw new HttpError(400, "This section contains a Super Admin account and cannot be deleted.");

      await conn.query("DELETE d FROM deposit_requests d JOIN users u ON u.id = d.user_id WHERE u.section = ?", [section]);
      await conn.query("DELETE FROM payments WHERE section = ?", [section]);
      await conn.query("DELETE FROM expenses WHERE section = ?", [section]);
      await conn.query("DELETE FROM users WHERE section = ? AND role <> 2", [section]);
    });

    await logEvent(req, `Section Deleted: ${section}`, null);
    res.json({ message: `Successfully deleted the entire ${section} section.` });
  } catch (err) { sendError(res, err); }
});

app.post("/super-admin/reset-limits", requireLogin, requireSuperAdmin, async (req, res) => {
  try {
    const ipLimiter = req.app.get("ipLoginLimiter");
    if (ipLimiter && ipLimiter.resetKey) ipLimiter.resetKey(`ip:${req.ip}`);
    res.json({ message: "Successfully unblocked your IP address." });
  } catch (err) { sendError(res, err); }
});

app.get("/super-admin/logs", requireLogin, requireSuperAdmin, async (req, res) => {
  try {
    const [logs] = await db.query("SELECT id, ip_address, event_type, created_at FROM security_logs ORDER BY created_at DESC LIMIT 50");
    res.json(logs);
  } catch (err) { sendError(res, err); }
});

app.post("/super-admin/reset-admin-password", requireLogin, requireSuperAdmin, async (req, res) => {
  try {
    const adminId = clean(req.body.adminId);
    if (!adminId) return res.status(400).json({ error: "Admin ID required" });

    const [rows] = await db.query("SELECT id, name FROM users WHERE student_id = ? AND role = 1", [adminId]);
    if (rows.length === 0) return res.status(404).json({ error: "Admin not found" });
    found" });

    const temp = tempPassword();
    const hash = await bcrypt.hash(temp, 10);
    await db.query("UPDATE users SET password_hash = ?, is_default_password = TRUE, token_version = token_version + 1 WHERE id = ?", [hash, rows[0].id]);

    await logEvent(req, `Admin Password Reset (ID: ${adminId})`, null);
    res.json({ message: `Successfully reset the password for Admin ${rows[0].name}. Temporary password: ${temp} (they must change it at next login).` });
  } catch (err) { sendError(res, err); }
});

// ==================== FALLBACKS ====================
app.use((req, res) => { res.status(404).json({ error: "Not found" }); });

app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
  if (err && err.type === "entity.too.large") return res.status(413).json({ error: "Request too large" });
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => { console.log("Server running at http://localhost:" + PORT); });