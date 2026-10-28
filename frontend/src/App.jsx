import { useState, useEffect } from "react";
import "./App.css";

const API = "https://classfundsystem.onrender.com";

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
          action={<button className="button-secondary" onClick={onLogout}>Log out</button>}
        />
        {loading && <p className="loading-text">Loading your account...</p>}
        <Notice type="error">{error}</Notice>
        {summary && !loading && (
          <>
            <div className="stat-grid">
              <StatCard label="Total Shared" value={money(summary.paid)} detail="Your total contributions" accent="stat-success" />
              <StatCard label={`${session.user.section} Fund`} value={money(summary.totalClassFund)} detail="Total cash on hand for your section" accent="stat-primary" />
            </div>
            <section className="content-section">
              <div className="section-heading">
                <div><h2>My Contributions</h2><p>Review your recorded payments.</p></div>
                <span className="count-badge">{summary.payments.length} records</span>
              </div>
              {summary.payments.length === 0 ? (
                <div className="empty-state"><div className="empty-icon">₱</div><h3>No payments yet</h3></div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>#</th><th>Date</th><th className="right">Amount</th></tr></thead>
                    <tbody>
                      {summary.payments.map((payment, index) => (
                        <tr key={payment.id ?? index}>
                          <td>{index + 1}</td>
                          <td>{payment.date}</td>
                          <td className="right amount-green">{money(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td colSpan="2"><strong>Total Shared</strong></td><td className="right"><strong>{money(summary.paid)}</strong></td></tr></tfoot>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
        <footer className="page-footer">Class Fund Portal · {session.user.section || "Student Account"}</footer>
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [student, setStudent] = useState({ studentId: "", name: "", password: "" });
  const [payment, setPayment] = useState({ studentId: "", amount: "" });
  const [expense, setExpense] = useState({ description: "", amount: "" });

  async function call(path, method = "GET", body) {
    const options = { method, headers: { Authorization: `Bearer ${session.token}` } };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, options);
    let data;
    try { data = await res.json(); } catch { throw new Error("Invalid response."); }
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function loadAll() {
    const [rep, pays, exps, studs] = await Promise.all([
      call("/admin/report"), call("/admin/payments"), call("/admin/expenses"), call("/admin/students"), 
    ]);
    setReport(rep); setPayments(pays); setExpenses(exps); setStudents(studs); 
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [rep, pays, exps, studs] = await Promise.all([
          call("/admin/report"), call("/admin/payments"), call("/admin/expenses"), call("/admin/students"), 
        ]);
        if (active) { setReport(rep); setPayments(pays); setExpenses(exps); setStudents(studs); }
      } catch (err) {
        if (active) { setMessage(err.message); setMessageType("error"); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [session.token]);

  async function submit(path, body, reset) {
    if (busy) return;
    setMessage(""); setBusy(true);
    try {
      const data = await call(path, "POST", body);
      setMessage(data.message || "Success"); setMessageType("success");
      reset(); await loadAll();
    } catch (err) {
      setMessage(err.message || "Error"); setMessageType("error");
    } finally { setBusy(false); }
  }

  async function removeItem(path, label) {
    if (busy) return;
    if (!window.confirm(`Delete this ${label}?`)) return;
    setBusy(true); setMessage("");
    try {
      const data = await call(path, "DELETE");
      setMessage(data.message || "Deleted"); setMessageType("success"); await loadAll();
    } catch (err) {
      setMessage(err.message || "Error"); setMessageType("error");
    } finally { setBusy(false); }
  }

  const totalPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setMessage("");
    setIsSidebarOpen(false); 
  };

  return (
    <div className="admin-layout">
      <div className="mobile-header">
        <div className="brand">
          <div className="brand-mark">STI</div>
          <div className="brand-copy"><strong>STI COLLEGE</strong><span>{session.user.section} ADMIN</span></div>
        </div>
        <button className="menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>
      </div>

      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand">
            <div className="brand-mark">STI</div>
            <div className="brand-copy"><strong>STI COLLEGE</strong><span>{session.user.section} ADMIN</span></div>
          </div>
          <button className="close-btn" onClick={() => setIsSidebarOpen(false)}>✕</button>
        </div>

        <nav className="sidebar-nav">
          <button className={activeTab === "overview" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("overview")}>Overview</button>
          <button className={activeTab === "students" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("students")}>Students</button>
          <button className={activeTab === "deposits" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("deposits")}>Deposits</button>
          <button className={activeTab === "expenses" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("expenses")}>Expenses</button>
          <button className={activeTab === "manage" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("manage")}>Manage Fund</button>
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
            {loading ? <p className="loading-text">Loading...</p> : report ? (
              <div className="stat-grid">
                <StatCard label="Total collected" value={money(report.collected)} accent="stat-success" />
                <StatCard label="Total expenses" value={money(report.expenses)} />
                <StatCard label="Monthly net" value={money(report.monthNet)} accent="stat-primary" />
                <StatCard label="Cash on hand" value={money(report.cashOnHand)} accent="stat-cash" />
              </div>
            ) : <p className="loading-text">Report unavailable.</p>}
          </div>
        )}

        {activeTab === "students" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="USER DIRECTORY" title={`${session.user.section} Students`} description="View all students." />
            {students.length === 0 ? (
              <div className="empty-state"><h3>No students found</h3></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>ID</th><th>Name</th><th className="right">Action</th></tr></thead>
                  <tbody>
                    {students.map((s, i) => (
                      <tr key={s.id}>
                        <td>{i + 1}</td><td className="mono">{s.student_id}</td><td>{s.name}</td>
                        <td className="right"><button className="btn-delete" onClick={() => removeItem(`/admin/students/${s.id}`, "student")}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "deposits" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="TRANSACTIONS" title="All Deposits" description="Student contributions." />
            {payments.length === 0 ? <div className="empty-state"><h3>No payments</h3></div> : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>ID</th><th>Name</th><th>Date</th><th className="right">Amount</th><th className="right">Action</th></tr></thead>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={p.id}>
                        <td>{i + 1}</td><td className="mono">{p.student_id}</td><td>{p.name}</td><td>{p.date}</td>
                        <td className="right amount-green">{money(p.amount)}</td>
                        <td className="right"><button className="btn-delete" onClick={() => removeItem(`/admin/payments/${p.id}`, "payment")}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan="4"><strong>Total</strong></td><td className="right"><strong>{money(totalPayments)}</strong></td><td></td></tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "expenses" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="TRANSACTIONS" title="All Expenses" description="Track spending." />
            {expenses.length === 0 ? <div className="empty-state"><h3>No expenses</h3></div> : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Description</th><th>Date</th><th className="right">Amount</th><th className="right">Action</th></tr></thead>
                  <tbody>
                    {expenses.map((e, i) => (
                      <tr key={e.id}>
                        <td>{i + 1}</td><td>{e.description}</td><td>{e.date}</td>
                        <td className="right amount-red">{money(e.amount)}</td>
                        <td className="right"><button className="btn-delete" onClick={() => removeItem(`/admin/expenses/${e.id}`, "expense")}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan="3"><strong>Total</strong></td><td className="right"><strong>{money(totalExpenses)}</strong></td><td></td></tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "manage" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="ADMIN ACTIONS" title="Manage Class Fund" description="Add students, log payments and expenses." />
            <div className="admin-grid">
              <form className="form-card" onSubmit={(e) => { e.preventDefault(); submit("/admin/students", student, () => setStudent({ studentId: "", name: "", password: "" })); }}>
                <div className="form-card-heading"><h3>Add student</h3></div>
                <label>Student ID</label><input placeholder="ID" value={student.studentId} onChange={(e) => setStudent({ ...student, studentId: e.target.value })} required />
                <label>Full name</label><input placeholder="Name" value={student.name} onChange={(e) => setStudent({ ...student, name: e.target.value })} required />
                <label>Password</label><input type="password" placeholder="Password" value={student.password} onChange={(e) => setStudent({ ...student, password: e.target.value })} required />
                <button type="submit" disabled={busy}>{busy ? "Wait..." : "Add student"}</button>
              </form>

              <form className="form-card" onSubmit={(e) => { e.preventDefault(); submit("/admin/payments", payment, () => setPayment({ studentId: "", amount: "" })); }}>
                <div className="form-card-heading"><h3>Record payment</h3></div>
                <label>Student ID</label><input placeholder="ID" value={payment.studentId} onChange={(e) => setPayment({ ...payment, studentId: e.target.value })} required />
                <label>Amount (PHP)</label><input type="number" placeholder="0.00" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} required />
                <button type="submit" disabled={busy}>{busy ? "Wait..." : "Record payment"}</button>
              </form>

              <form className="form-card" onSubmit={(e) => { e.preventDefault(); submit("/admin/expenses", expense, () => setExpense({ description: "", amount: "" })); }}>
                <div className="form-card-heading"><h3>Log expense</h3></div>
                <label>Description</label><input placeholder="Description" value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} required />
                <label>Amount (PHP)</label><input type="number" placeholder="0.00" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} required />
                <button type="submit" disabled={busy}>{busy ? "Wait..." : "Save expense"}</button>
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
    const body = isRegistering ? { studentId, name, password, section } : { studentId, password };

    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error"); return; }
      if (isRegistering) {
        setIsRegistering(false); setName(""); setPassword(""); setSection(""); setError("Admin created! Log in.");
      } else { setSession(data); }
    } catch {
      setError("Cannot reach server.");
    } finally { setLoading(false); }
  }

  function handleLogout() {
    setSession(null); setStudentId(""); setName(""); setPassword(""); setSection(""); setError("");
  }

  if (session && session.user.role === 0) return <StudentView session={session} onLogout={handleLogout} />;
  if (session) return <AdminView session={session} onLogout={handleLogout} />;

  return (
    <div className="student-layout">
      <main className="container login-container">
        <Brand />
        <div className="login-intro">
          <p className="eyebrow">STUDENT SERVICES</p>
          <h1>{isRegistering ? "Admin Registration" : "Class Fund"}</h1>
          <p className="page-description">{isRegistering ? "Create a new admin account." : "Sign in to view records."}</p>
        </div>
        <Notice type={error.includes("created") ? "success" : "error"}>{error}</Notice>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>ID or Username</label>
          <input type="text" placeholder="Enter ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} required />
          {isRegistering && (
            <>
              <label>Full Name</label><input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <label>Section</label><input type="text" placeholder="e.g. BSIT 1A" value={section} onChange={(e) => setSection(e.target.value)} required />
            </>
          )}
          <label>Password</label>
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="login-button" type="submit" disabled={loading}>{loading ? "Wait..." : isRegistering ? "Register as Admin" : "Sign in"}</button>
        </form>
        <div className="login-note" style={{ marginTop: '16px', textAlign: 'center' }}>
          {isRegistering ? (
            <button type="button" className="button-secondary" onClick={() => { setIsRegistering(false); setError(""); }} style={{ width: "100%" }}>Back to Login</button>
          ) : (
            <p style={{ margin: 0, fontSize: "13px" }}>Need an admin account? <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(true); setError(""); }} style={{ color: "#2563eb", fontWeight: 600 }}>Register here</a></p>
          )}
        </div>
        <footer className="page-footer">Class Fund Portal · Access</footer>
      </main>
    </div>
  );
}

export default App;