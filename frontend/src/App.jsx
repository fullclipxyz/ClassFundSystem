import { useState, useEffect } from "react";
import "./App.css";

const API = "https://classfundsystem.onrender.com"; // Change to Render URL when deploying

function money(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">STI</div>
      <div className="brand-copy"><strong>STI COLLEGE</strong><span>CLASS FUND PORTAL</span></div>
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

function Notice({ children, type = "info" }) {
  if (!children) return null;
  return <div className={`notice notice-${type}`} role="status">{children}</div>;
}

/* ==================== STUDENT VIEW ==================== */
function StudentView({ session, onLogout }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(session.user.isDefaultPassword);
  const [newPassword, setNewPassword] = useState("");
  const [changingPass, setChangingPass] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${API}/me/summary`, { headers: { Authorization: `Bearer ${session.token}` } });
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

  async function handleChangePassword(e) {
    e.preventDefault();
    setChangingPass(true);
    try {
      const res = await fetch(`${API}/me/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowPasswordPrompt(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setChangingPass(false);
    }
  }

  if (showPasswordPrompt) {
    return (
      <div className="student-layout">
        <main className="container">
          <Brand />
          <PageHeader eyebrow="SECURITY ALERT" title="Set a New Password" description="Your password was reset by the admin. Please create a new secure password." />
          <form className="login-form" onSubmit={handleChangePassword}>
            <label>New Password</label>
            <input type="password" placeholder="Enter new password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
            <button className="login-button" type="submit" disabled={changingPass}>{changingPass ? "Saving..." : "Save Password"}</button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="student-layout">
      <main className="container">
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
            <div className="dashboard-grid">
              <div className="color-card card-pink">
                <p className="stat-label">Total Shared</p>
                <p className="stat-value">{money(summary.paid)}</p>
                <p className="stat-detail">All your contributions</p>
              </div>

              <div className="color-card card-blue">
                <p className="stat-label">{session.user.section} Fund</p>
                <p className="stat-value">{money(summary.totalClassFund)}</p>
                <p className="stat-detail">Available section balance</p>
              </div>
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

/* ==================== SUPER ADMIN VIEW ==================== */
function SuperAdminView({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState("sections");
  const [admins, setAdmins] = useState([]);
  const [message, setMessage] = useState("");
  const [inspectData, setInspectData] = useState(null);
  const [unblocking, setUnblocking] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    fetch(`${API}/super-admin/admins`, { headers: { Authorization: `Bearer ${session.token}` } }).then(res => res.json()).then(data => setAdmins(data));
  }, [session.token]);

  const deleteSection = async (section) => {
    if (!window.confirm(`⚠️ WARNING: Are you sure you want to delete the ENTIRE ${section} section?`)) return;
    try {
      const res = await fetch(`${API}/super-admin/sections/${section}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message);
      setAdmins(admins.filter(a => a.section !== section));
    } catch (err) { setMessage(err.message); }
  };

  const inspectSection = async (section) => {
    try {
      const res = await fetch(`${API}/super-admin/sections/${section}`, { headers: { Authorization: `Bearer ${session.token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInspectData({ section, ...data });
    } catch (err) { alert(err.message); }
  };

  const handleUnblockAll = async () => {
    if (!window.confirm("Are you sure you want to unblock all IP addresses?")) return;
    setUnblocking(true); setMessage("");
    try {
      const res = await fetch(`${API}/super-admin/reset-limits`, { method: "POST", headers: { Authorization: `Bearer ${session.token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message);
    } catch (err) { setMessage(err.message); } finally { setUnblocking(false); }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API}/super-admin/logs`, { headers: { Authorization: `Bearer ${session.token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogs(data); setShowLogs(true);
    } catch (err) { alert(err.message); }
  };

  const resetAdminPassword = async (adminId, name) => {
    if (!window.confirm(`Reset password for Admin ${name}?`)) return;
    try {
      const res = await fetch(`${API}/super-admin/reset-admin-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ adminId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message);
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand"><div className="brand-mark">STI</div><div className="brand-copy"><strong>SUPER ADMIN</strong><span>MASTER CONTROL</span></div></div>
        </div>
        <nav className="sidebar-nav">
          <button className={activeTab === "sections" ? "nav-item active" : "nav-item"} onClick={() => { setActiveTab("sections"); setMessage(""); }}>All Sections</button>
          <button className={activeTab === "security" ? "nav-item active" : "nav-item"} onClick={() => { setActiveTab("security"); setMessage(""); }}>Security</button>
        </nav>
        <div className="sidebar-footer">
          <div className="admin-info"><p className="admin-name">{session.user.name}</p><p className="admin-role">Super Admin</p></div>
          <button className="button-secondary logout-btn" onClick={onLogout}>Log out</button>
        </div>
      </aside>

      <main className="admin-main">
        {message && <Notice type={message.includes("Success") ? "success" : "error"}>{message}</Notice>}
        
        {activeTab === "sections" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="MASTER CONTROL" title="All Sections" description="Manage all admin accounts and sections." />
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Admin Name</th><th>Admin ID</th><th>Section</th><th className="right">Action</th></tr></thead>
                <tbody>
                  {admins.map((a, i) => (
                    <tr key={a.id}>
                      <td>{i + 1}</td>
                      <td>{a.name}</td>
                      <td className="mono">{a.student_id}</td>
                      <td><strong>{a.section}</strong></td>
                      <td className="right">
                        <button className="btn-inspect" onClick={() => inspectSection(a.section)}>Inspect</button>
                        <button className="btn-inspect" style={{ margin: "0 8px", color: "#dc2626", borderColor: "#fecaca" }} onClick={() => resetAdminPassword(a.student_id, a.name)}>Reset Pass</button>
                        <button className="btn-delete" onClick={() => deleteSection(a.section)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "security" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="SYSTEM PROTECTION" title="Security Controls" description="Manage access and brute-force protections." />
            <div className="stat-grid">
              <div className="stat-card stat-success">
                <p className="stat-label">Brute-Force Protection</p>
                <p className="stat-value">Active</p>
                <p className="stat-detail">Max 10 login attempts per 15 mins</p>
              </div>
            </div>
            <div className="form-card" style={{ maxWidth: "600px", marginTop: "24px" }}>
              <div className="form-card-heading"><h3>Unblock IP Addresses</h3></div>
              <p style={{ marginBottom: "16px", fontSize: "14px", color: "var(--text-muted)" }}>If a legitimate user gets locked out, you can instantly clear the rate limits here.</p>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={handleUnblockAll} disabled={unblocking} className="btn-warning" style={{ flex: 1, background: "#f59e0b", borderColor: "#f59e0b", color: "white" }}>{unblocking ? "Clearing..." : "Clear All Blocks"}</button>
                <button onClick={fetchLogs} style={{ flex: 1, background: "var(--brand-blue)", borderColor: "var(--brand-blue)", color: "white" }}>View Blocked Logs</button>
              </div>
            </div>
          </div>
        )}

        {showLogs && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: "800px" }}>
              <div className="modal-header"><h2>Security Logs (Recent Blocks)</h2><button onClick={() => setShowLogs(false)} style={{ display: "block", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", padding: "6px 12px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", fontSize: "16px" }}>✕</button></div>
              <div className="modal-body">
                {logs.length === 0 ? <p>No security logs found.</p> : (
                  <div className="table-wrap"><table className="data-table">
                    <thead><tr><th>#</th><th>IP Address</th><th>Event</th><th>Date & Time</th></tr></thead>
                    <tbody>{logs.map((log, i) => (<tr key={log.id}><td>{i + 1}</td><td className="mono">{log.ip_address}</td><td><span style={{ color: "#dc2626", fontWeight: "bold" }}>{log.event_type}</span></td><td>{new Date(log.created_at).toLocaleString()}</td></tr>))}</tbody>
                  </table></div>
                )}
              </div>
            </div>
          </div>
        )}

        {inspectData && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header"><h2>Section: {inspectData.section}</h2><button onClick={() => setInspectData(null)} style={{ display: "block", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", padding: "6px 12px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", fontSize: "16px" }}>✕</button></div>
              <div className="modal-body">
                <div style={{ marginBottom: "20px" }}><p>Total Cash on Hand: <strong className="amount-green">{money(inspectData.cashOnHand)}</strong></p></div>
                <h3>Students in this section ({inspectData.students.length})</h3>
                <div className="table-wrap" style={{ maxHeight: "300px", overflowY: "auto" }}>
                  <table className="data-table">
                    <thead><tr><th>#</th><th>Student ID</th><th>Name</th></tr></thead>
                    <tbody>{inspectData.students.length === 0 ? (<tr><td colSpan="3">No students in this section yet.</td></tr>) : (inspectData.students.map((s, i) => (<tr key={s.id}><td>{i + 1}</td><td className="mono">{s.student_id}</td><td>{s.name}</td></tr>)))}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ==================== ADMIN VIEW (SECTION) ==================== */
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
  const [showDropdown, setShowDropdown] = useState(false);

  const [student, setStudent] = useState({ studentId: "", name: "", password: "" });
  const [payment, setPayment] = useState({ studentId: "", amount: "" });
  const [expense, setExpense] = useState({ description: "", amount: "" });

  const [showPasswordPrompt, setShowPasswordPrompt] = useState(session.user.isDefaultPassword);
  const [newPassword, setNewPassword] = useState("");
  const [changingPass, setChangingPass] = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    setChangingPass(true);
    try {
      const res = await fetch(`${API}/me/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowPasswordPrompt(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setChangingPass(false);
    }
  }

  async function call(path, method = "GET", body) {
    const options = { method, headers: { Authorization: `Bearer ${session.token}` } };
    if (body !== undefined) { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
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
      try { await loadAll(); } catch (err) { if (active) { setMessage(err.message); setMessageType("error"); } } finally { if (active) setLoading(false); }
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
    } catch (err) { setMessage(err.message || "Error"); setMessageType("error"); } finally { setBusy(false); }
  }

  async function removeItem(path, label) {
    if (busy) return;
    if (!window.confirm(`Delete this ${label}?`)) return;
    setBusy(true); setMessage("");
    try {
      const data = await call(path, "DELETE");
      setMessage(data.message || "Deleted"); setMessageType("success"); await loadAll();
    } catch (err) { setMessage(err.message || "Error"); setMessageType("error"); } finally { setBusy(false); }
  }

  async function resetStudentPassword(studentId) {
    if (!window.confirm(`Reset password for student ${studentId}?`)) return;
    setBusy(true); setMessage("");
    try {
      const data = await call("/admin/reset-password", "POST", { studentId });
      setMessage(data.message); setMessageType("success");
    } catch (err) { setMessage(err.message); setMessageType("error"); } finally { setBusy(false); }
  }

  const totalPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const handleTabClick = (tab) => { setActiveTab(tab); setMessage(""); setIsSidebarOpen(false); };

  if (showPasswordPrompt) {
    return (
      <div className="student-layout">
        <main className="container">
          <Brand />
          <PageHeader eyebrow="SECURITY ALERT" title="Set a New Password" description="Your password was reset by the Super Admin. Please create a new secure password." />
          <form className="login-form" onSubmit={handleChangePassword}>
            <label>New Password</label>
            <input type="password" placeholder="Enter new password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
            <button className="login-button" type="submit" disabled={changingPass}>{changingPass ? "Saving..." : "Save Password"}</button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <div className="mobile-header">
        <div className="brand"><div className="brand-mark">STI</div><div className="brand-copy"><strong>STI COLLEGE</strong><span>{session.user.section} ADMIN</span></div></div>
        <button className="menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>
      </div>

      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand"><div className="brand-mark">STI</div><div className="brand-copy"><strong>STI COLLEGE</strong><span>{session.user.section} ADMIN</span></div></div>
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
          <div className="admin-info"><p className="admin-name">{session.user.name}</p><p className="admin-role">{session.user.section} Admin</p></div>
          <button className="button-secondary logout-btn" onClick={onLogout}>Log out</button>
        </div>
      </aside>

      <main className="admin-main">
        {message && <Notice type={messageType}>{message}</Notice>}

        {activeTab === "overview" && (
          <div className="tab-content fade-in">
            <div className="dashboard-banner"><div><h2>Welcome back, {session.user.name}!</h2><p>Here is the current financial overview for {session.user.section}.</p></div></div>
            {loading ? <p className="loading-text">Loading...</p> : report && (
              <div className="dashboard-grid">
                <div className="color-card card-pink"><p className="stat-label">Total Collected</p><p className="stat-value">{money(report.collected)}</p><p className="stat-detail">All student contributions</p></div>
                <div className="color-card card-blue"><p className="stat-label">Total Expenses</p><p className="stat-value">{money(report.expenses)}</p><p className="stat-detail">Funds spent this month</p></div>
                <div className="color-card card-yellow"><p className="stat-label">Cash on Hand</p><p className="stat-value">{money(report.cashOnHand)}</p><p className="stat-detail">Available balance</p></div>
                <div className="color-card card-purple"><p className="stat-label">Monthly Net</p><p className="stat-value">{money(report.monthNet)}</p><p className="stat-detail">Net growth this month</p></div>
              </div>
            )}
            <div className="section-heading" style={{ marginTop: "32px" }}><div><h2>Recent Activity</h2><p>Quick glance at the latest transactions.</p></div></div>
            <div className="activity-item"><div className="activity-info"><h4>Total Deposits Recorded</h4><p>All payments saved in the database</p></div><div className="activity-amount" style={{ color: "#059669" }}>{payments.length} Transactions</div></div>
            <div className="activity-item"><div className="activity-info"><h4>Total Expenses Logged</h4><p>All expenses saved in the database</p></div><div className="activity-amount" style={{ color: "#dc2626" }}>{expenses.length} Records</div></div>
          </div>
        )}

        {activeTab === "students" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="USER DIRECTORY" title={`${session.user.section} Students`} description="View all students." />
            {students.length === 0 ? (
              <div className="empty-state"><h3>No students found</h3></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table" style={{ minWidth: "100%" }}>
                  <thead><tr><th>#</th><th>ID</th><th>Name</th><th>Account Created</th><th className="right">Action</th></tr></thead>
                  <tbody>
                    {students.map((s, i) => (
                      <tr key={s.id}>
                        <td>{i + 1}</td><td className="mono">{s.student_id}</td><td>{s.name}</td><td style={{ color: "var(--text-muted)", fontSize: "13px" }}>{s.created_at}</td>
                        <td className="right">
                          <button className="btn-inspect" style={{ marginRight: "8px" }} onClick={() => resetStudentPassword(s.student_id)}>Reset Pass</button>
                          <button className="btn-delete" onClick={() => removeItem(`/admin/students/${s.id}`, "student")}>Delete</button>
                        </td>
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
                  <thead><tr><th>#</th><th>ID</th><th>Name</th><th>Date & Time</th><th className="right">Amount</th><th className="right">Action</th></tr></thead>
                  <tbody>{payments.map((p, i) => (<tr key={p.id}><td>{i + 1}</td><td className="mono">{p.student_id}</td><td>{p.name}</td><td>{p.date}</td><td className="right amount-green">{money(p.amount)}</td><td className="right"><button className="btn-delete" onClick={() => removeItem(`/admin/payments/${p.id}`, "payment")}>Delete</button></td></tr>))}</tbody>
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
                  <tbody>{expenses.map((e, i) => (<tr key={e.id}><td>{i + 1}</td><td>{e.description}</td><td>{e.date}</td><td className="right amount-red">{money(e.amount)}</td><td className="right"><button className="btn-delete" onClick={() => removeItem(`/admin/expenses/${e.id}`, "expense")}>Delete</button></td></tr>))}</tbody>
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
                <div className="form-card-heading"><span className="form-icon">01</span><div><h3>Add student</h3><p>Create a new student account.</p></div></div>
                <label>Student ID</label><input placeholder="e.g. 2024001" value={student.studentId} onChange={(e) => setStudent({ ...student, studentId: e.target.value.replace(/[^0-9]/g, '') })} required />
                <label>Full name</label><input placeholder="e.g. Juan Dela Cruz" value={student.name} onChange={(e) => setStudent({ ...student, name: e.target.value.replace(/[^a-zA-Z\s]/g, '') })} required />
                <label>Password</label><input type="password" placeholder="Create a password" value={student.password} onChange={(e) => setStudent({ ...student, password: e.target.value })} required />
                <button type="submit" disabled={busy}>{busy ? "Wait..." : "Add student"}</button>
              </form>

              <form className="form-card" onSubmit={(e) => { e.preventDefault(); submit("/admin/payments", payment, () => { setPayment({ studentId: "", amount: "" }); setShowDropdown(false); }); }}>
                <div className="form-card-heading"><span className="form-icon">02</span><div><h3>Record payment</h3><p>Record a student's contribution.</p></div></div>
                <label>Student ID</label>
                <div className="custom-dropdown-container">
                  <input placeholder="Enter or select student ID" value={payment.studentId} onChange={(e) => { setPayment({ ...payment, studentId: e.target.value.replace(/[^0-9]/g, '') }); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} required />
                  {showDropdown && students.filter(s => s.student_id.includes(payment.studentId)).length > 0 && (
                    <ul className="custom-dropdown-list">
                      {students.filter(s => s.student_id.includes(payment.studentId)).map(s => (
                        <li key={s.id} onClick={() => { setPayment({ ...payment, studentId: s.student_id }); setShowDropdown(false); }} className={payment.studentId === s.student_id ? "active" : ""}>
                          <span className="student-name">{s.name}</span>
                          <span className="student-id">{s.student_id}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <label>Amount (PHP)</label><input type="number" placeholder="0.00" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} required />
                <button type="submit" disabled={busy}>{busy ? "Wait..." : "Record payment"}</button>
              </form>

              <form className="form-card" onSubmit={(e) => { e.preventDefault(); submit("/admin/expenses", expense, () => setExpense({ description: "", amount: "" })); }}>
                <div className="form-card-heading"><span className="form-icon">03</span><div><h3>Log expense</h3><p>Keep track of fund spending.</p></div></div>
                <label>Description</label><input placeholder="What is the expense for?" value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} required />
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
  
  const [loginRole, setLoginRole] = useState("student"); 

  useEffect(() => {
    const saved = localStorage.getItem("classFundSession");
    if (saved) {
      try { setSession(JSON.parse(saved)); } catch (e) { localStorage.removeItem("classFundSession"); }
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault(); 
    if (loading) return; 
    setError(""); 
    setLoading(true);
    
    const endpoint = isRegistering ? "/register-admin" : "/login";
    const body = isRegistering ? { studentId, name, password, section } : { studentId, password };
    
    try {
      const res = await fetch(`${API}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      
      if (isRegistering) { 
        setIsRegistering(false); 
        setError("Admin created! Log in."); 
      } else { 
        localStorage.setItem("classFundSession", JSON.stringify(data)); 
        setSession(data); 
      }
    } catch { setError("Cannot reach server."); } finally { setLoading(false); }
  }

  function handleLogout() {
    localStorage.removeItem("classFundSession"); 
    setSession(null); setStudentId(""); setName(""); setPassword(""); setSection(""); setError("");
  }

  if (session && session.user.role === 2) return <SuperAdminView session={session} onLogout={handleLogout} />;
  if (session && session.user.role === 1) return <AdminView session={session} onLogout={handleLogout} />;
  if (session && session.user.role === 0) return <StudentView session={session} onLogout={handleLogout} />;

  return (
    <div className="student-layout">
      <main className="container login-container">
        <Brand />
        
        {!isRegistering && (
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", background: "#f1f5f9", padding: "5px", borderRadius: "8px" }}>
            <button 
              type="button"
              onClick={() => setLoginRole("student")}
              style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "none", background: loginRole === "student" ? "white" : "transparent", boxShadow: loginRole === "student" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", color: loginRole === "student" ? "var(--brand-blue)" : "var(--text-muted)", fontWeight: "600", cursor: "pointer" }}
            >
              Student
            </button>
            <button 
              type="button"
              onClick={() => setLoginRole("admin")}
              style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "none", background: loginRole === "admin" ? "white" : "transparent", boxShadow: loginRole === "admin" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", color: loginRole === "admin" ? "var(--brand-blue)" : "var(--text-muted)", fontWeight: "600", cursor: "pointer" }}
            >
              Administrator
            </button>
          </div>
        )}

        <Notice type={error.includes("created") ? "success" : "error"}>{error}</Notice>
        
        <form className="login-form" onSubmit={handleSubmit}>
          <label>ID</label>
          <input 
            placeholder={isRegistering ? "Enter admin ID" : loginRole === "student" ? "Enter student ID" : "Enter admin ID"} 
            value={studentId} 
            onChange={e => setStudentId(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))} 
            required 
          />
          
          {isRegistering && (
            <>
              <label>Full Name</label>
              <input placeholder="Enter your full name" value={name} onChange={e => setName(e.target.value.replace(/[^a-zA-Z\s]/g, ''))} required />
              <label>Section</label><input placeholder="e.g. BSIT 1A" value={section} onChange={e => setSection(e.target.value)} required />
            </>
          )}
          
          <label>Password</label>
          <input type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required />
          
          <button className="login-button" type="submit" disabled={loading}>{loading ? "Wait..." : isRegistering ? "Register" : "Sign in"}</button>
        </form>

        <div className="login-note" style={{ marginTop: '16px', textAlign: 'center' }}>
          {isRegistering ? (
            <button className="button-secondary" onClick={() => { setIsRegistering(false); setError(""); }} style={{ width: "100%" }}>Back</button>
          ) : loginRole === "admin" ? (
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
              Don't have an administrator account?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(true); setError(""); }} style={{ color: "var(--brand-accent)", fontWeight: "600", textDecoration: "none" }}>
                Register here
              </a>
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
              Student access is managed by your class administrator.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;