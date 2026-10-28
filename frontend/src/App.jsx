import { useState, useEffect } from "react";
import "./App.css";

// 🚨 IMPORTANT: REPLACE THIS URL ONCE YOU DEPLOY TO RENDER
const API = "https://your-backend-name.onrender.com"; 

function money(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">STI</div>
      <div className="brand-copy">
        <strong>STI COLLEGE</strong>
        <span>CLASS FUND PORTAL</span>
      </div>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, detail, accent = "" }) {
  return (
    <section className={`stat-card ${accent}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {detail && <p className="stat-detail">{detail}</p>}
    </section>
  );
}

function Notice({ children, type = "info" }) {
  if (!children) return null;
  return (
    <div className={`notice notice-${type}`} role="status">
      {children}
    </div>
  );
}

/* ==================== STUDENT VIEW ==================== */
function StudentView({ session, onLogout }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API}/me/summary`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load your summary.");
        if (active) setSummary(data);
      } catch (err) {
        if (active) setError(err.message || "Cannot reach the server.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [session.token]);

  return (
    <div className="student-layout">
      <main className="container login-container student-card">
        <Brand />

        <PageHeader
          eyebrow={`${session.user.section || "STUDENT"} PORTAL`}
          title={`Hi, ${session.user.name}`}
          description="Here's an overview of the class fund."
          action={
            <button className="button-secondary" onClick={onLogout}>
              Log out
            </button>
          }
        />

        {loading && <p className="loading-text">Loading your account...</p>}
        <Notice type="error">{error}</Notice>

        {summary && !loading && (
          <>
            <div className="stat-grid">
              <StatCard
                label="Total Shared"
                value={money(summary.paid)}
                detail="Your total contributions"
                accent="stat-success"
              />
              <StatCard
                label={`${session.user.section} Fund`}
                value={money(summary.totalClassFund)}
                detail="Total cash on hand for your section"
                accent="stat-primary"
              />
            </div>

            <section className="content-section">
              <div className="section-heading">
                <div>
                  <h2>My Contributions</h2>
                  <p>Review your recorded payments.</p>
                </div>
                <span className="count-badge">
                  {summary.payments.length} records
                </span>
              </div>

              {summary.payments.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">₱</div>
                  <h3>No payments yet</h3>
                  <p>Your payment records will appear here once recorded.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th className="right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.payments.map((payment, index) => (
                        <tr key={payment.id ?? index}>
                          <td>{index + 1}</td>
                          <td>{payment.date}</td>
                          <td className="right amount-green">
                            {money(payment.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="2"><strong>Total Shared</strong></td>
                        <td className="right"><strong>{money(summary.paid)}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        <footer className="page-footer">
          Class Fund Portal · {session.user.section || "Student Account"}
        </footer>
      </main>
    </div>
  );
}

/* ==================== ADMIN VIEW ==================== */
function AdminView({ session, onLogout }) {
  const [report, setReport] = useState(null);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [students, setStudents] = useState([]); 
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  
  const [activeTab, setActiveTab] = useState("overview"); 

  const [student, setStudent] = useState({ studentId: "", name: "", password: "" });
  const [payment, setPayment] = useState({ studentId: "", amount: "" });
  const [expense, setExpense] = useState({ description: "", amount: "" });

  async function call(path, method = "GET", body) {
    const options = {
      method,
      headers: { Authorization: `Bearer ${session.token}` },
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, options);
    let data;
    try { data = await res.json(); }
    catch { throw new Error("The server returned an invalid response."); }
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function loadAll() {
    const [rep, pays, exps, studs] = await Promise.all([
      call("/admin/report"),
      call("/admin/payments"),
      call("/admin/expenses"),
      call("/admin/students"), 
    ]);
    setReport(rep);
    setPayments(pays);
    setExpenses(exps);
    setStudents(studs); 
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [rep, pays, exps, studs] = await Promise.all([
          call("/admin/report"),
          call("/admin/payments"),
          call("/admin/expenses"),
          call("/admin/students"), 
        ]);
        if (active) {
          setReport(rep);
          setPayments(pays);
          setExpenses(exps);
          setStudents(studs);
        }
      } catch (err) {
        if (active) {
          setMessage(err.message);
          setMessageType("error");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [session.token]);

  async function submit(path, body, reset) {
    if (busy) return;
    setMessage("");
    setBusy(true);
    try {
      const data = await call(path, "POST", body);
      setMessage(data.message || "Operation completed successfully.");
      setMessageType("success");
      reset();
      await loadAll();
    } catch (err) {
      setMessage(err.message || "Something went wrong.");
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(path, label) {
    if (busy) return;
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await call(path, "DELETE");
      setMessage(data.message || "Deleted successfully.");
      setMessageType("success");
      await loadAll();
    } catch (err) {
      setMessage(err.message || "Delete failed.");
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  }

  const totalPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand">
            <div className="brand-mark">STI</div>
            <div className="brand-copy">
              <strong>STI COLLEGE</strong>
              <span>{session.user.section} ADMIN</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className={activeTab === "overview" ? "nav-item active" : "nav-item"} onClick={() => { setActiveTab("overview"); setMessage(""); }}>Overview</button>
          <button className={activeTab === "students" ? "nav-item active" : "nav-item"} onClick={() => { setActiveTab("students"); setMessage(""); }}>Students</button>
          <button className={activeTab === "deposits" ? "nav-item active" : "nav-item"} onClick={() => { setActiveTab("deposits"); setMessage(""); }}>Deposits</button>
          <button className={activeTab === "expenses" ? "nav-item active" : "nav-item"} onClick={() => { setActiveTab("expenses"); setMessage(""); }}>Expenses</button>
          <button className={activeTab === "manage" ? "nav-item active" : "nav-item"} onClick={() => { setActiveTab("manage"); setMessage(""); }}>Manage Fund</button>
        </nav>

        <div className="sidebar-footer">
          <div className="admin-info">
            <p className="admin-name">{session.user.name}</p>
            <p className="admin-role">{session.user.section} Admin</p>
          </div>
          <button className="button-secondary logout-btn" onClick={onLogout}>Log out</button>
        </div>
      </aside>

      <main className="admin-main">
        {message && <Notice type={messageType}>{message}</Notice>}

        {activeTab === "overview" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow={`${session.user.section} ADMINISTRATION`} title="Financial Overview" description="Monitor your section's class fund." />
            {loading ? (
              <p className="loading-text">Loading financial report...</p>
            ) : report ? (
              <div className="stat-grid">
                <StatCard label="Total collected" value={money(report.collected)} detail="Recorded payments" accent="stat-success" />
                <StatCard label="Total expenses" value={money(report.expenses)} detail="Recorded expenses" />
                <StatCard label="Monthly net" value={money(report.monthNet)} detail="This month's net amount" accent="stat-primary" />
                <StatCard label="Cash on hand" value={money(report.cashOnHand)} detail="Current reported cash" accent="stat-cash" />
              </div>
            ) : (
              <p className="loading-text">Report unavailable. Check server connection.</p>
            )}
          </div>
        )}

        {activeTab === "students" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="USER DIRECTORY" title={`${session.user.section} Students`} description="View all students in your section." />
            {students.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">👥</div><h3>No students found</h3><p>Add students in the Manage Fund tab.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Student ID</th><th>Full Name</th><th className="right">Action</th></tr></thead>
                  <tbody>
                    {students.map((s, i) => (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td className="mono">{s.student_id}</td>
                        <td>{s.name}</td>
                        <td className="right">
                          <button className="btn-delete" disabled={busy} onClick={() => removeItem(`/admin/students/${s.id}`, "student")}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan="3"><strong>Total Students: {students.length}</strong></td><td></td></tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "deposits" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="TRANSACTIONS" title="All Deposits" description="View and manage all student contributions." />
            {payments.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">₱</div><h3>No payments recorded</h3></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Student ID</th><th>Name</th><th>Date</th><th className="right">Amount</th><th className="right">Action</th></tr></thead>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={p.id}>
                        <td>{i + 1}</td>
                        <td className="mono">{p.student_id}</td>
                        <td>{p.name}</td>
                        <td>{p.date}</td>
                        <td className="right amount-green">{money(p.amount)}</td>
                        <td className="right"><button className="btn-delete" disabled={busy} onClick={() => removeItem(`/admin/payments/${p.id}`, "payment")}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan="4"><strong>Total deposits</strong></td><td className="right"><strong>{money(totalPayments)}</strong></td><td></td></tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "expenses" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="TRANSACTIONS" title="All Expenses" description="Track where the class fund is being spent." />
            {expenses.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">−</div><h3>No expenses recorded</h3></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Description</th><th>Date</th><th className="right">Amount</th><th className="right">Action</th></tr></thead>
                  <tbody>
                    {expenses.map((e, i) => (
                      <tr key={e.id}>
                        <td>{i + 1}</td>
                        <td>{e.description}</td>
                        <td>{e.date}</td>
                        <td className="right amount-red">{money(e.amount)}</td>
                        <td className="right"><button className="btn-delete" disabled={busy} onClick={() => removeItem(`/admin/expenses/${e.id}`, "expense")}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan="3"><strong>Total expenses</strong></td><td className="right"><strong>{money(totalExpenses)}</strong></td><td></td></tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "manage" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="ADMIN ACTIONS" title="Manage Class Fund" description="Add students, record payments, and log expenses." />
            <div className="admin-grid">
              <form className="form-card" onSubmit={(e) => { e.preventDefault(); submit("/admin/students", student, () => setStudent({ studentId: "", name: "", password: "" })); }}>
                <div className="form-card-heading"><span className="form-icon">01</span><div><h3>Add student</h3><p>Create a student account in {session.user.section}.</p></div></div>
                <label>Student ID</label><input placeholder="Enter student ID" value={student.studentId} onChange={(e) => setStudent({ ...student, studentId: e.target.value })} required />
                <label>Full name</label><input placeholder="Enter full name" value={student.name} onChange={(e) => setStudent({ ...student, name: e.target.value })} required />
                <label>Password</label><input type="password" placeholder="Create password" value={student.password} onChange={(e) => setStudent({ ...student, password: e.target.value })} required />
                <button type="submit" disabled={busy}>{busy ? "Please wait..." : "Add student"}</button>
              </form>

              <form className="form-card" onSubmit={(e) => { e.preventDefault(); submit("/admin/payments", payment, () => setPayment({ studentId: "", amount: "" })); }}>
                <div className="form-card-heading"><span className="form-icon">02</span><div><h3>Record payment</h3><p>Record a student's contribution.</p></div></div>
                <label>Student ID</label><input placeholder="Enter student ID" value={payment.studentId} onChange={(e) => setPayment({ ...payment, studentId: e.target.value })} required />
                <label>Amount (PHP)</label><input type="number" min="0.01" step="0.01" placeholder="0.00" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} required />
                <button type="submit" disabled={busy}>{busy ? "Please wait..." : "Record payment"}</button>
              </form>

              <form className="form-card" onSubmit={(e) => { e.preventDefault(); submit("/admin/expenses", expense, () => setExpense({ description: "", amount: "" })); }}>
                <div className="form-card-heading"><span className="form-icon">03</span><div><h3>Log expense</h3><p>Keep track of fund spending.</p></div></div>
                <label>Description</label><input placeholder="What was the expense for?" value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} required />
                <label>Amount (PHP)</label><input type="number" min="0.01" step="0.01" placeholder="0.00" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} required />
                <button type="submit" disabled={busy}>{busy ? "Please wait..." : "Save expense"}</button>
              </form>
            </div>
          </div>
        )}

        <footer className="page-footer">Class Fund Portal · {session.user.section} Admin</footer>
      </main>
    </div>
  );
}

/* ==================== APP ROOT ==================== */
function App() {
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [section, setSection] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  
  const [isRegistering, setIsRegistering] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    const endpoint = isRegistering ? "/register-admin" : "/login";
    const body = isRegistering 
      ? { studentId, name, password, section } 
      : { studentId, password };

    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      if (isRegistering) {
        setIsRegistering(false);
        setName("");
        setPassword("");
        setSection("");
        setError("Admin account created! Please log in.");
      } else {
        setSession(data);
      }
    } catch {
      setError("Cannot reach the server. Make sure the server is running.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setSession(null);
    setStudentId("");
    setName("");
    setPassword("");
    setSection("");
    setError("");
  }

  if (session && session.user.role === 0) {
    return <StudentView session={session} onLogout={handleLogout} />;
  }
  if (session) {
    return <AdminView session={session} onLogout={handleLogout} />;
  }

  return (
    <div className="student-layout">
      <main className="container login-container">
        <Brand />
        <div className="login-intro">
          <p className="eyebrow">STUDENT SERVICES</p>
          <h1>{isRegistering ? "Admin Registration" : "Class Fund"}</h1>
          <p className="page-description">
            {isRegistering 
              ? "Create a new administrator account for a section." 
              : "Sign in to view your balance and class fund payment records."}
          </p>
        </div>
        
        <Notice type={error.includes("created") ? "success" : "error"}>{error}</Notice>
        
        <form className="login-form" onSubmit={handleSubmit}>
          <label>Student ID or Username</label>
          <input 
            type="text" 
            placeholder="Enter your ID or Username" 
            autoComplete="username" 
            value={studentId} 
            onChange={(e) => setStudentId(e.target.value)} 
            required 
          />
          
          {isRegistering && (
            <>
              <label>Full Name</label>
              <input 
                type="text" 
                placeholder="Enter your Full Name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
              <label>Section Name (e.g. BSIT 1A)</label>
              <input 
                type="text" 
                placeholder="Enter Section Name" 
                value={section} 
                onChange={(e) => setSection(e.target.value)} 
                required 
              />
            </>
          )}

          <label>Password</label>
          <input 
            type="password" 
            placeholder="Enter your password" 
            autoComplete={isRegistering ? "new-password" : "current-password"} 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
          />
          
          <button className="login-button" type="submit" disabled={loading}>
            {loading 
              ? "Please wait..." 
              : isRegistering 
                ? "Register as Admin" 
                : "Sign in"}
          </button>
        </form>

        <div className="login-note" style={{ marginTop: '16px', textAlign: 'center' }}>
          {isRegistering ? (
            <button 
              type="button" 
              className="button-secondary" 
              onClick={() => { setIsRegistering(false); setError(""); }}
              style={{ width: "100%" }}
            >
              Back to Login
            </button>
          ) : (
            <p style={{ margin: 0, fontSize: "13px" }}>
              Need an admin account?{" "}
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); setIsRegistering(true); setError(""); }}
                style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}
              >
                Register here
              </a>
            </p>
          )}
        </div>
        <footer className="page-footer">Class Fund Portal · Access</footer>
      </main>
    </div>
  );
}

export default App;