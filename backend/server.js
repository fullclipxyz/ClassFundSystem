require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { requireLogin, requireAdmin } = require("./auth");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Class Fund API is running" });
});

app.post("/login", async (req, res) => {
  try {
    const { studentId, password } = req.body;

    if (!studentId || !password) {
      return res.status(400).json({ error: "ID/Name and password are required" });
    }

    const [rows] = await db.query(
      "SELECT id, student_id, name, password_hash, role, section FROM users WHERE student_id = ? OR name = ?",
      [studentId, studentId]
    );

    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));

    if (!ok) {
      return res.status(401).json({ error: "Wrong ID/Name or password" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, section: user.section },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role, section: user.section },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/register-admin", async (req, res) => {
  try {
    const { studentId, name, password, section } = req.body;

    if (!studentId || !name || !password || !section) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (student_id, name, password_hash, role, section) VALUES (?, ?, ?, 1, ?)",
      [studentId, name, hash, section]
    );

    res.json({ message: "Admin account created successfully!" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "ID/Username already exists" });
    }
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ============ STUDENT ROUTES ============

app.post("/admin/students", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { studentId, name, password } = req.body;
    const section = req.user.section;

    if (!studentId || !name || !password) {
      return res.status(400).json({ error: "ID, name and password are required" });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (student_id, name, password_hash, role, section) VALUES (?, ?, ?, 0, ?)",
      [studentId, name, hash, section]
    );

    res.json({ message: "Student added to " + section });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Student ID already exists" });
    }
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/admin/students", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, student_id, name FROM users WHERE role = 0 AND section = ? ORDER BY name ASC",
      [req.user.section]
    );
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/admin/students/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM payments WHERE user_id = ?", [req.params.id]);
    const [result] = await db.query("DELETE FROM users WHERE id = ? AND role = 0 AND section = ?", [req.params.id, req.user.section]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Student not found in your section" });
    }
    res.json({ message: "Student deleted" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ============ PAYMENT ROUTES ============

app.post("/admin/payments", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { studentId, amount, date } = req.body;
    const money = Number(amount);
    const section = req.user.section;

    if (!studentId || !(money > 0)) {
      return res.status(400).json({ error: "Student ID and amount required" });
    }

    const [rows] = await db.query(
      "SELECT id, name FROM users WHERE student_id = ? AND role = 0 AND section = ?",
      [studentId, section]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Student not found in your section" });
    }

    await db.query(
      "INSERT INTO payments (user_id, amount, paid_date, section) VALUES (?, ?, COALESCE(?, CURDATE()), ?)",
      [rows[0].id, money, date || null, section]
    );

    res.json({ message: "Payment recorded for " + rows[0].name });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/admin/payments", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.amount, DATE_FORMAT(p.paid_date, '%Y-%m-%d') AS date,
              u.student_id, u.name
       FROM payments p
       JOIN users u ON u.id = p.user_id
       WHERE p.section = ?
       ORDER BY p.paid_date DESC, p.id DESC`,
      [req.user.section]
    );
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/admin/payments/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [result] = await db.query("DELETE FROM payments WHERE id = ? AND section = ?", [req.params.id, req.user.section]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Payment not found in your section" });
    }
    res.json({ message: "Payment deleted" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ============ EXPENSE ROUTES ============

app.post("/admin/expenses", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { description, amount, date } = req.body;
    const money = Number(amount);
    const section = req.user.section;

    if (!description || !(money > 0)) {
      return res.status(400).json({ error: "Description and amount required" });
    }

    await db.query(
      "INSERT INTO expenses (description, amount, expense_date, section) VALUES (?, ?, COALESCE(?, CURDATE()), ?)",
      [description, money, date || null, section]
    );

    res.json({ message: "Expense logged: " + description });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/admin/expenses", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, description, amount, DATE_FORMAT(expense_date, '%Y-%m-%d') AS date
       FROM expenses
       WHERE section = ?
       ORDER BY expense_date DESC, id DESC`,
      [req.user.section]
    );
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/admin/expenses/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    const [result] = await db.query("DELETE FROM expenses WHERE id = ? AND section = ?", [req.params.id, req.user.section]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Expense not found in your section" });
    }
    res.json({ message: "Expense deleted" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ============ SUMMARY & REPORT ============

app.get("/me/summary", requireLogin, async (req, res) => {
  try {
    const [payments] = await db.query(
      "SELECT id, amount, DATE_FORMAT(paid_date, '%Y-%m-%d') AS date FROM payments WHERE user_id = ? ORDER BY paid_date DESC, id DESC",
      [req.user.id]
    );

    const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    const [[allC]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ?", [req.user.section]);
    const [[allE]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ?", [req.user.section]);
    const totalClassFund = Number(allC.total) - Number(allE.total);

    res.json({ paid, totalClassFund, payments });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/admin/report", requireLogin, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const thisMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const month = req.query.month || thisMonth;
    const section = req.user.section;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Month must look like 2026-10" });
    }

    const start = month + "-01";

    const [[c]] = await db.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ? AND paid_date >= ? AND paid_date < DATE_ADD(?, INTERVAL 1 MONTH)",
      [section, start, start]
    );
    const [[e]] = await db.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ? AND expense_date >= ? AND expense_date < DATE_ADD(?, INTERVAL 1 MONTH)",
      [section, start, start]
    );
    const [[allC]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE section = ?", [section]);
    const [[allE]] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE section = ?", [section]);

    res.json({
      month,
      collected: Number(c.total),
      expenses: Number(e.total),
      monthNet: Number(c.total) - Number(e.total),
      cashOnHand: Number(allC.total) - Number(allE.total),
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Server running at http://localhost:" + PORT);
});