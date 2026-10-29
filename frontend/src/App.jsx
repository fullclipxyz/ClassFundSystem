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
      <div className="page-header-content">
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

/* ==================== PAGINATION COMPONENT ==================== */
function Pagination({ currentPage, totalPages, onPageChange }) {
  return (
    <div className="pagination-container">
      <button 
        onClick={() => onPageChange(Math.max(currentPage - 1, 1))} 
        disabled={currentPage === 1}
        className="pagination-btn"
        style={{ background: "white", color: "var(--text-main)", border: "1px solid var(--border-color)", borderRadius: "6px", opacity: currentPage === 1 ? 0.5 : 1 }}
      >
        &lt; Back
      </button>
      
      <div className="pagination-numbers" style={{ display: "flex", gap: "8px" }}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => (
          <button
            key={pageNumber}
            onClick={() => onPageChange(pageNumber)}
            style={{ 
              padding: "8px 14px", 
              background: currentPage === pageNumber ? "#0f172a" : "white", 
              color: currentPage === pageNumber ? "white" : "var(--text-main)", 
              border: "1px solid var(--border-color)", 
              borderRadius: "6px",
              fontWeight: "600"
            }}
          >
            {pageNumber}
          </button>
        ))}
      </div>

      <div className="pagination-mobile-label" style={{ display: "none" }}>
        Page {currentPage} of {totalPages}
      </div>

      <button 
        onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))} 
        disabled={currentPage === totalPages}
        className="pagination-btn"
        style={{ background: "white", color: "var(--text-main)", border: "1px solid var(--border-color)", borderRadius: "6px", opacity: currentPage === totalPages ? 0.5 : 1 }}
      >
        Next &gt;
      </button>
    </div>
  );
}

/* ==================== STUDENT VIEW ==================== */
function StudentView({ session, onLogout }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(session.user.isDefaultPassword);
  const [newPassword, setNewPassword] = useState("");
  const [changingPass, setChangingPass] = useState(false);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositMessage, setDepositMessage] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${API}/me/summary`, { headers: { Authorization: `Bearer ${session.token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load your summary.");
        if (active) setSummary(data);
      } catch (err) { if (active) setError(err.message || "Cannot reach the server."); } finally { if (active) setLoading(false); }
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
    } catch (err) { alert(err.message); } finally { setChangingPass(false); }
  }

  async function handleDeposit(e) {
    e.preventDefault();
    setDepositLoading(true); setDepositMessage("");
    try {
      const res = await fetch(`${API}/me/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ amount: depositAmount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDepositMessage(data.message);
      setDepositAmount("");
    } catch (err) { setDepositMessage(err.message); } finally { setDepositLoading(false); }
  }

  if (showPasswordPrompt) {
    return (
      <div className="student-layout">
        <main className="container login-container">
          <Brand />
          <PageHeader eyebrow="SECURITY ALERT" title="Set a New Password" description="Your password was reset by the admin. Please create a new secure password." />
          <form className="login-form" onSubmit={handleChangePassword}>
            <label>New Password</label>
            <input type="password" placeholder="Enter new password" minLength="6" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
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
        <PageHeader eyebrow={`${session.user.section || "STUDENT"} PORTAL`} title={`Hi, ${session.user.name}`} description="Here's an overview of the class fund." action={<button className="button-secondary logout-btn-top" onClick={onLogout}>Log out</button>} />
        {loading && <p className="loading-text">Loading your account...</p>}
        <Notice type="error">{error}</Notice>
        
        {summary && !loading && (
          <>
            <div className="dashboard-grid">
              <div className="color-card card-pink"><p className="stat-label">Total Shared</p><p className="stat-value">{money(summary.paid)}</p><p className="stat-detail">All your contributions</p></div>
              <div className="color-card card-blue"><p className="stat-label">{session.user.section} Fund</p><p className="stat-value">{money(summary.totalClassFund)}</p><p className="stat-detail">Available section balance</p></div>
            </div>

            <section className="content-section" style={{ marginBottom: "32px" }}>
              <div className="form-card">
                <div className="form-card-heading">
                  <span className="form-icon" style={{ background: "#ecfdf5", color: "#059669" }}>₱</span>
                  <div><h3>Submit a Deposit</h3><p>Send money to the class fund. Admin will verify it.</p></div>
                </div>
                {depositMessage && <Notice type={depositMessage.includes("submitted") ? "success" : "error"}>{depositMessage}</Notice>}
                <form onSubmit={handleDeposit}>
                  <div>
                    <label>Amount (PHP)</label>
                    <input type="number" min="1" step="0.01" placeholder="0.00" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} required style={{ marginBottom: 0 }} />
                  </div>
                  <button type="submit" disabled={depositLoading} style={{ background: "#059669", borderColor: "#059669" }}>{depositLoading ? "Submitting..." : "Submit Deposit"}</button>
                </form>
              </div>
            </section>

            <section className="content-section">
              <div className="section-heading"><div><h2>My Contributions</h2><p>Review your recorded payments.</p></div><span className="count-badge">{summary.payments.length} records</span></div>
              {summary.payments.length === 0 ? (
                <div className="empty-state"><div className="empty-icon">₱</div><h3>No payments yet</h3></div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>#</th><th>Date</th><th className="right">Amount</th></tr></thead>
                    <tbody>{summary.payments.map((payment, index) => (
                      <tr key={payment.id ?? index}>
                        <td data-label="#">{index + 1}</td>
                        <td data-label="Date">{payment.date}</td>
                        <td data-label="Amount" className="right amount-green">{money(payment.amount)}</td>
                      </tr>
                    ))}</tbody>
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => { fetch(`${API}/super-admin/admins`, { headers: { Authorization: `Bearer ${session.token}` } }).then(res => res.json()).then(data => setAdmins(data)); }, [session.token]);

  const deleteSection = async (section) => {
    if (!window.confirm(`⚠️ WARNING: Are you sure you want to delete the ENTIRE ${section} section?`)) return;
    try {
      const res = await fetch(`${API}/super-admin/sections/${section}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message); setAdmins(admins.filter(a => a.section !== section));
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
      const res = await fetch(`${API}/super-admin/reset-admin-password`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ adminId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message);
    } catch (err) { alert(err.message); }
  };

  const handleTabClick = (tab) => { setActiveTab(tab); setMessage(""); setIsSidebarOpen(false); };

  return (
    <div className="admin-layout">
      <div className="mobile-header">
        <div className="brand"><div className="brand-mark">STI</div><div className="brand-copy"><strong>SUPER ADMIN</strong><span>MASTER CONTROL</span></div></div>
        <button className="menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>
      </div>

      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand"><div className="brand-mark">STI</div><div className="brand-copy"><strong>SUPER ADMIN</strong><span>MASTER CONTROL</span></div></div>
          <button className="close-btn" onClick={() => setIsSidebarOpen(false)}>✕</button>
        </div>
        <nav className="sidebar-nav">
          <button className={activeTab === "sections" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("sections")}>All Sections</button>
          <button className={activeTab === "security" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("security")}>Security</button>
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
                      <td data-label="#">{i + 1}</td>
                      <td data-label="Admin Name">{a.name}</td>
                      <td data-label="Admin ID" className="mono">{a.student_id}</td>
                      <td data-label="Section"><strong>{a.section}</strong></td>
                      <td data-label="Action" className="right action-cell">
                        <button className="btn-inspect" onClick={() => inspectSection(a.section)}>Inspect</button>
                        <button className="btn-inspect" style={{ color: "#dc2626", borderColor: "#fecaca" }} onClick={() => resetAdminPassword(a.student_id, a.name)}>Reset Pass</button>
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
            <div className="stat-grid"><div className="stat-card stat-success"><p className="stat-label">Brute-Force Protection</p><p className="stat-value">Active</p><p className="stat-detail">Max 5 login attempts per 15 mins</p></div></div>
            <div className="form-card" style={{ maxWidth: "600px", marginTop: "24px" }}>
              <div className="form-card-heading"><h3>Unblock IP Addresses</h3></div>
              <p style={{ marginBottom: "16px", fontSize: "14px", color: "var(--text-muted)" }}>If a legitimate user gets locked out, you can instantly clear the rate limits here.</p>
              <div className="button-group-mobile">
                <button onClick={handleUnblockAll} disabled={unblocking} style={{ background: "#f59e0b", borderColor: "#f59e0b", color: "white" }}>{unblocking ? "Clearing..." : "Clear All Blocks"}</button>
                <button onClick={fetchLogs} style={{ background: "var(--brand-blue)", borderColor: "var(--brand-blue)", color: "white" }}>View Blocked Logs</button>
              </div>
            </div>
          </div>
        )}

        {showLogs && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: "800px" }}>
              <div className="modal-header"><h2>Security Logs</h2><button onClick={() => setShowLogs(false)} style={{ display: "block", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", padding: "6px 12px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", fontSize: "16px" }}>✕</button></div>
              <div className="modal-body">
                {logs.length === 0 ? <p>No security logs found.</p> : (
                  <div className="table-wrap"><table className="data-table">
                    <thead><tr><th>#</th><th>IP Address</th><th>Event</th><th>Date & Time</th></tr></thead>
                    <tbody>{logs.map((log, i) => (
                      <tr key={log.id}>
                        <td data-label="#">{i + 1}</td>
                        <td data-label="IP Address" className="mono">{log.ip_address}</td>
                        <td data-label="Event"><span style={{ color: "#dc2626", fontWeight: "bold" }}>{log.event_type}</span></td>
                        <td data-label="Date & Time">{new Date(log.created_at).toLocaleString()}</td>
                      </tr>
                    ))}</tbody>
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
                    <tbody>{inspectData.students.length === 0 ? (<tr><td colSpan="3">No students in this section yet.</td></tr>) : (inspectData.students.map((s, i) => (
                      <tr key={s.id}>
                        <td data-label="#">{i + 1}</td>
                        <td data-label="Student ID" className="mono">{s.student_id}</td>
                        <td data-label="Name">{s.name}</td>
                      </tr>
                    )))}</tbody>
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
  const [approvals, setApprovals] = useState([]); 
  const [ledger, setLedger] = useState([]);
  const [secLogs, setSecLogs] = useState([]);
  
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(true);
  
  const [busyStudent, setBusyStudent] = useState(false);
  const [busyPayment, setBusyPayment] = useState(false);
  const [busyExpense, setBusyExpense] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  
  const [activeTab, setActiveTab] = useState("overview"); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const itemsPerPage = 10;
  const [studentPage, setStudentPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [expensePage, setExpensePage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerSearch, setLedgerSearch] = useState("");

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
    } catch (err) { alert(err.message); } finally { setChangingPass(false); }
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
    const [rep, pays, exps, studs, apps, ledg, secs] = await Promise.all([
      call("/admin/report"), call("/admin/payments"), call("/admin/expenses"), call("/admin/students"), call("/admin/approvals"), call("/admin/ledger"), call("/admin/security-logs")
    ]);
    setReport(rep); setPayments(pays); setExpenses(exps); setStudents(studs); setApprovals(apps); setLedger(ledg); setSecLogs(secs);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try { await loadAll(); } catch (err) { if (active) { setMessage(err.message); setMessageType("error"); } } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [session.token]);

  async function submit(path, body, reset, setBusy, isBusy) {
    if (isBusy) return;
    setMessage(""); setBusy(true);
    try {
      const data = await call(path, "POST", body);
      setMessage(data.message || "Success"); setMessageType("success");
      reset(); await loadAll();
    } catch (err) { setMessage(err.message || "Error"); setMessageType("error"); } finally { setBusy(false); }
  }

  async function removeItem(path, label) {
    if (busyAction) return;
    if (!window.confirm(`Delete this ${label}?`)) return;
    setBusyAction(true); setMessage("");
    try {
      const data = await call(path, "DELETE");
      setMessage(data.message || "Deleted"); setMessageType("success"); await loadAll();
    } catch (err) { setMessage(err.message || "Error"); setMessageType("error"); } finally { setBusyAction(false); }
  }

  async function handleApproval(id, action) {
    if (busyAction) return;
    setBusyAction(true); setMessage("");
    try {
      const data = await call(`/admin/approvals/${id}/${action}`, "POST");
      setMessage(data.message); setMessageType("success"); await loadAll();
    } catch (err) { setMessage(err.message); setMessageType("error"); } finally { setBusyAction(false); }
  }

  async function handleUnblock(studentId) {
    if (busyAction) return;
    if (!window.confirm(`Unblock student ${studentId}?`)) return;
    setBusyAction(true); setMessage("");
    try {
      const data = await call("/admin/unblock-student", "POST", { studentId });
      setMessage(data.message); setMessageType("success"); await loadAll();
    } catch (err) { setMessage(err.message); setMessageType("error"); } finally { setBusyAction(false); }
  }

  async function resetStudentPassword(studentId) {
    if (busyAction) return;
    if (!window.confirm(`Reset password for student ${studentId}?`)) return;
    setBusyAction(true); setMessage("");
    try {
      const data = await call("/admin/reset-password", "POST", { studentId });
      setMessage(data.message); setMessageType("success");
    } catch (err) { 
      setMessage(err.message); setMessageType("error"); 
    } finally { 
      setBusyAction(false); 
    }
  }

  const totalPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const studentTotalPages = Math.ceil(students.length / itemsPerPage) || 1;
  const currentStudents = students.slice((studentPage - 1) * itemsPerPage, studentPage * itemsPerPage);

  const paymentTotalPages = Math.ceil(payments.length / itemsPerPage) || 1;
  const currentPayments = payments.slice((paymentPage - 1) * itemsPerPage, paymentPage * itemsPerPage);

  const expenseTotalPages = Math.ceil(expenses.length / itemsPerPage) || 1;
  const currentExpenses = expenses.slice((expensePage - 1) * itemsPerPage, expensePage * itemsPerPage);

  const filteredLedger = ledger.filter(item => {
    if (!ledgerSearch) return true;
    const searchLower = ledgerSearch.toLowerCase();
    return item.description.toLowerCase().includes(searchLower) || item.type.toLowerCase().includes(searchLower);
  });
  const ledgerTotalPages = Math.ceil(filteredLedger.length / itemsPerPage) || 1;
  const currentLedgerItems = filteredLedger.slice((ledgerPage - 1) * itemsPerPage, ledgerPage * itemsPerPage);

  const handleTabClick = (tab) => { 
    setActiveTab(tab); 
    setMessage(""); 
    setIsSidebarOpen(false); 
    setStudentPage(1); setPaymentPage(1); setExpensePage(1); setLedgerPage(1);
  };

  if (showPasswordPrompt) {
    return (
      <div className="student-layout">
        <main className="container login-container">
          <Brand />
          <PageHeader eyebrow="SECURITY ALERT" title="Set a New Password" description="Your password was reset by the Super Admin. Please create a new secure password." />
          <form className="login-form" onSubmit={handleChangePassword}>
            <label>New Password</label>
            <input type="password" placeholder="Enter new password" minLength="6" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
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
          
          <button className={activeTab === "approvals" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("approvals")}>
            Approvals {approvals.length > 0 && <span style={{ background: "#ef4444", color: "white", borderRadius: "50%", padding: "2px 8px", fontSize: "12px", marginLeft: "auto" }}>{approvals.length}</span>}
          </button>
          
          <button className={activeTab === "students" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("students")}>Students</button>
          <button className={activeTab === "ledger" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("ledger")}>General Ledger</button>
          
          <button className={activeTab === "security" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("security")}>Security Logs</button>
          
          <button className={activeTab === "deposits" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("deposits")}>Deposits</button>
          <button className={activeTab === "expenses" ? "nav-item active" : "nav-item"} onClick={() => handleTabClick("expenses")}>Expenses</button>
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
            
            {/* CLICKABLE RECENT ACTIVITY */}
            <div className="activity-item" onClick={() => handleTabClick("deposits")} style={{ cursor: "pointer", transition: "background 0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#f1f5f9"} onMouseOut={(e) => e.currentTarget.style.background = "#f8fafc"}>
              <div className="activity-info"><h4>Total Deposits Recorded</h4><p>All payments saved in the database</p></div>
              <div className="activity-amount" style={{ color: "#059669" }}>{payments.length} Transactions</div>
            </div>

            <div className="activity-item" onClick={() => handleTabClick("expenses")} style={{ cursor: "pointer", transition: "background 0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "#f1f5f9"} onMouseOut={(e) => e.currentTarget.style.background = "#f8fafc"}>
              <div className="activity-info"><h4>Total Expenses Logged</h4><p>All expenses saved in the database</p></div>
              <div className="activity-amount" style={{ color: "#dc2626" }}>{expenses.length} Records</div>
            </div>
            
          </div>
        )}

        {activeTab === "security" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="PROTECTION" title="Security Logs" description="Manage students from your section who are locked out." />
            {secLogs.length === 0 ? (
              <div className="empty-state"><h3>No lockouts</h3><p>All students in your section are safe.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Blocked ID / Info</th><th>IP Address</th><th>Date & Time</th><th className="right">Action</th></tr></thead>
                  <tbody>
                    {secLogs.map((log, i) => {
                      const match = log.event_type.match(/ID:\s*([^)]+)/);
                      const blockedId = match ? match[1].trim() : "";

                      return (
                        <tr key={log.id}>
                          <td data-label="#">{i + 1}</td>
                          <td data-label="Info"><span style={{ color: "#dc2626", fontWeight: "600" }}>{log.event_type}</span></td>
                          <td data-label="IP Address" className="mono">{log.ip_address}</td>
                          <td data-label="Date & Time">{new Date(log.created_at).toLocaleString()}</td>
                          <td data-label="Action" className="right action-cell">
                            {blockedId && (
                              <button className="btn-inspect" onClick={() => handleUnblock(blockedId)} disabled={busyAction}>Unblock Student</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "approvals" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="VERIFICATION" title="Pending Approvals" description="Verify student deposit submissions." />
            {approvals.length === 0 ? (
              <div className="empty-state"><h3>No pending approvals</h3><p>All student deposits have been verified.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Student Name</th><th>Student ID</th><th>Amount</th><th>Date & Time</th><th className="right">Action</th></tr></thead>
                  <tbody>
                    {approvals.map((a, i) => (
                      <tr key={a.id}>
                        <td data-label="#">{i + 1}</td>
                        <td data-label="Student Name">{a.name}</td>
                        <td data-label="Student ID" className="mono">{a.student_id}</td>
                        <td data-label="Amount" className="amount-green"><strong>{money(a.amount)}</strong></td>
                        <td data-label="Date & Time">{new Date(a.created_at).toLocaleString()}</td>
                        <td data-label="Action" className="right action-cell">
                          <button className="btn-inspect" onClick={() => handleApproval(a.id, "approve")} disabled={busyAction} style={{ color: "#059669", borderColor: "#a7f3d0" }}>Approve</button>
                          <button className="btn-delete" onClick={() => handleApproval(a.id, "reject")} disabled={busyAction}>Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "ledger" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="FINANCIAL RECORD" title="General Ledger" description="A complete history of all money in and money out." />

            <div style={{ marginBottom: "20px", maxWidth: "400px" }}>
              <label>Filter by Student (Name or ID)</label>
              <input type="text" placeholder="Search by Student ID or Name..." value={ledgerSearch} onChange={(e) => { setLedgerSearch(e.target.value); setLedgerPage(1); }} style={{ marginBottom: 0 }} />
            </div>

            {filteredLedger.length === 0 ? (
              <div className="empty-state"><h3>No transactions found</h3></div>
            ) : (
              <>
                <div className="table-wrap ledger-card">
                  <table className="data-table">
                    <thead><tr><th>#</th><th>Date</th><th>Type</th><th>Description</th><th className="right">Amount</th></tr></thead>
                    <tbody>
                      {currentLedgerItems.map((item, i) => (
                        <tr key={`${item.type}-${item.id}`}>
                          <td data-label="#">{(ledgerPage - 1) * itemsPerPage + i + 1}</td>
                          <td data-label="Date">{new Date(item.date).toLocaleDateString()}</td>
                          <td data-label="Type">
                            <span style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "600", background: item.type === "Deposit" ? "#ecfdf5" : "#fef2f2", color: item.type === "Deposit" ? "#065f46" : "#991b1b" }}>
                              {item.type}
                            </span>
                          </td>
                          <td data-label="Description">{item.description}</td>
                          <td data-label="Amount" className={`right ${item.type === "Deposit" ? "amount-green" : "amount-red"}`}>
                            <strong>{item.type === "Deposit" ? "+" : "-"} {money(item.amount)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination currentPage={ledgerPage} totalPages={ledgerTotalPages} onPageChange={setLedgerPage} />
              </>
            )}
          </div>
        )}

        {activeTab === "students" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="USER DIRECTORY" title={`${session.user.section} Students`} description="View and add students." />
            
            <div className="form-card" style={{ marginBottom: "24px" }}>
              <div className="form-card-heading"><span className="form-icon">01</span><div><h3>Add student</h3><p>Create a new student account.</p></div></div>
              <form onSubmit={(e) => { e.preventDefault(); submit("/admin/students", student, () => setStudent({ studentId: "", name: "", password: "" }), setBusyStudent, busyStudent); }}>
                <div><label>Student ID</label><input placeholder="e.g. 2024001" value={student.studentId} onChange={(e) => setStudent({ ...student, studentId: e.target.value.replace(/[^0-9]/g, '') })} minLength="6" required style={{ marginBottom: 0 }} /></div>
                <div><label>Full name</label><input placeholder="e.g. Juan Dela Cruz" value={student.name} onChange={(e) => setStudent({ ...student, name: e.target.value.replace(/[^a-zA-Z\s]/g, '') })} required style={{ marginBottom: 0 }} /></div>
                <div><label>Password</label><input type="password" placeholder="Create a strong password" value={student.password} onChange={(e) => setStudent({ ...student, password: e.target.value })} minLength="6" required style={{ marginBottom: 0 }} /></div>
                <button type="submit" disabled={busyStudent}>{busyStudent ? "Wait..." : "Add student"}</button>
              </form>
            </div>

            {students.length === 0 ? (
              <div className="empty-state"><h3>No students found</h3></div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data-table" style={{ minWidth: "100%" }}>
                    <thead><tr><th>#</th><th>ID</th><th>Name</th><th>Account Created</th><th className="right">Action</th></tr></thead>
                    <tbody>
                      {currentStudents.map((s, i) => (
                        <tr key={s.id}>
                          <td data-label="#">{(studentPage - 1) * itemsPerPage + i + 1}</td>
                          <td data-label="ID" className="mono">{s.student_id}</td>
                          <td data-label="Name">{s.name}</td>
                          <td data-label="Created" style={{ color: "var(--text-muted)", fontSize: "13px" }}>{s.created_at}</td>
                          <td data-label="Action" className="right action-cell">
                            <button className="btn-inspect" onClick={() => resetStudentPassword(s.student_id)} disabled={busyAction}>Reset Pass</button>
                            <button className="btn-delete" onClick={() => removeItem(`/admin/students/${s.id}`, "student")} disabled={busyAction}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination currentPage={studentPage} totalPages={studentTotalPages} onPageChange={setStudentPage} />
              </>
            )}
          </div>
        )}

        {activeTab === "deposits" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="TRANSACTIONS" title="All Deposits" description="Record payments and view student contributions." />

            <div className="form-card" style={{ marginBottom: "24px" }}>
              <div className="form-card-heading"><span className="form-icon">02</span><div><h3>Record payment</h3><p>Manually record a student's contribution.</p></div></div>
              <form className="two-inputs" onSubmit={(e) => { e.preventDefault(); submit("/admin/payments", payment, () => { setPayment({ studentId: "", amount: "" }); setShowDropdown(false); }, setBusyPayment, busyPayment); }}>
                <div className="custom-dropdown-container">
                  <label>Student ID</label>
                  <input placeholder="Enter or select student ID" value={payment.studentId} onChange={(e) => { setPayment({ ...payment, studentId: e.target.value.replace(/[^0-9]/g, '') }); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} required style={{ marginBottom: 0 }} />
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
                <div><label>Amount (PHP)</label><input type="number" min="1" step="0.01" placeholder="0.00" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} required style={{ marginBottom: 0 }} /></div>
                <button type="submit" disabled={busyPayment}>{busyPayment ? "Wait..." : "Record payment"}</button>
              </form>
            </div>

            {payments.length === 0 ? <div className="empty-state"><h3>No payments</h3></div> : (
              <>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>#</th><th>ID</th><th>Name</th><th>Date & Time</th><th className="right">Amount</th><th className="right">Action</th></tr></thead>
                    <tbody>{currentPayments.map((p, i) => (
                      <tr key={p.id}>
                        <td data-label="#">{(paymentPage - 1) * itemsPerPage + i + 1}</td>
                        <td data-label="ID" className="mono">{p.student_id}</td>
                        <td data-label="Name">{p.name}</td>
                        <td data-label="Date">{p.date}</td>
                        <td data-label="Amount" className="right amount-green">{money(p.amount)}</td>
                        <td data-label="Action" className="right action-cell"><button className="btn-delete" onClick={() => removeItem(`/admin/payments/${p.id}`, "payment")} disabled={busyAction}>Delete</button></td>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr><td colSpan="4"><strong>Total</strong></td><td className="right"><strong>{money(totalPayments)}</strong></td><td></td></tr></tfoot>
                  </table>
                </div>
                <Pagination currentPage={paymentPage} totalPages={paymentTotalPages} onPageChange={setPaymentPage} />
              </>
            )}
          </div>
        )}

        {activeTab === "expenses" && (
          <div className="tab-content fade-in">
            <PageHeader eyebrow="TRANSACTIONS" title="All Expenses" description="Log spending and track expenses." />

            <div className="form-card" style={{ marginBottom: "24px" }}>
              <div className="form-card-heading"><span className="form-icon">03</span><div><h3>Log expense</h3><p>Keep track of fund spending.</p></div></div>
              <form className="two-inputs" onSubmit={(e) => { e.preventDefault(); submit("/admin/expenses", expense, () => setExpense({ description: "", amount: "" }), setBusyExpense, busyExpense); }}>
                <div><label>Description</label><input placeholder="What is the expense for?" value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} required style={{ marginBottom: 0 }} /></div>
                <div><label>Amount (PHP)</label><input type="number" min="1" step="0.01" placeholder="0.00" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} required style={{ marginBottom: 0 }} /></div>
                <button type="submit" disabled={busyExpense}>{busyExpense ? "Wait..." : "Save expense"}</button>
              </form>
            </div>

            {expenses.length === 0 ? <div className="empty-state"><h3>No expenses</h3></div> : (
              <>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>#</th><th>Description</th><th>Date</th><th className="right">Amount</th><th className="right">Action</th></tr></thead>
                    <tbody>{currentExpenses.map((e, i) => (
                      <tr key={e.id}>
                        <td data-label="#">{(expensePage - 1) * itemsPerPage + i + 1}</td>
                        <td data-label="Description">{e.description}</td>
                        <td data-label="Date">{e.date}</td>
                        <td data-label="Amount" className="right amount-red">{money(e.amount)}</td>
                        <td data-label="Action" className="right action-cell"><button className="btn-delete" onClick={() => removeItem(`/admin/expenses/${e.id}`, "expense")} disabled={busyAction}>Delete</button></td>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr><td colSpan="3"><strong>Total</strong></td><td className="right"><strong>{money(totalExpenses)}</strong></td><td></td></tr></tfoot>
                  </table>
                </div>
                <Pagination currentPage={expensePage} totalPages={expenseTotalPages} onPageChange={setExpensePage} />
              </>
            )}
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
    const saved = sessionStorage.getItem("classFundSession");
    if (saved) {
      try { setSession(JSON.parse(saved)); } catch (e) { sessionStorage.removeItem("classFundSession"); }
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault(); 
    if (loading) return; 
    setError(""); 
    setLoading(true);
    
    const endpoint = isRegistering ? "/register-admin" : "/login";
    const body = isRegistering ? { studentId, name, password, section } : { studentId, password, loginRole };
    
    try {
      const res = await fetch(`${API}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      
      if (!res.ok || data.error) { 
        setError(data.error || "Invalid ID or password"); 
        setLoading(false);
        return; 
      }
      
      if (isRegistering) { 
        setIsRegistering(false); 
        setError("Admin created! Log in."); 
      } else if (data.token) { 
        sessionStorage.setItem("classFundSession", JSON.stringify(data)); 
        setSession(data); 
      } else {
        setError("Invalid ID or password");
      }
    } catch { 
      setError("Cannot reach server."); 
    } finally { 
      setLoading(false); 
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("classFundSession"); 
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
            placeholder={isRegistering ? "Enter Admin ID" : loginRole === "student" ? "Enter student ID" : "Enter admin ID"} 
            value={studentId} 
            onChange={e => setStudentId(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))} 
            minLength={isRegistering ? 6 : undefined}
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
          <input type="password" placeholder={isRegistering ? "Create a strong password" : "Enter your password"} value={password} onChange={e => setPassword(e.target.value)} minLength={isRegistering ? 6 : undefined} required />
          
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