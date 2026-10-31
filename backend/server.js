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
  
  const [showArchivedExpenses, setShowArchivedExpenses] = useState(false);
  const [showArchivedLedger, setShowArchivedLedger] = useState(false);

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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPass, setChangingPass] = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    setChangingPass(true);
    try {
      const res = await fetch(`${API}/me/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      alert("Password updated! Please log in again.");
      onLogout();
      
    } catch (err) { alert(err.message); } finally { setChangingPass(false); }
  }

  async function call(path, method = "GET", body) {
    const options = { method, headers: { Authorization: `Bearer ${session.token}` } };
    if (body !== undefined) { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
    
    const res = await fetch(`${API}${path}`, options);
    let data;
    try { data = await res.json(); } catch { throw new Error("Invalid response."); }
    
    if (res.status === 401) {
      alert("Your session has expired. Please log in again.");
      onLogout();
      return;
    }

    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function loadAll(archivedExp = showArchivedExpenses) {
    const [rep, pays, exps, studs, apps, ledg, secs] = await Promise.all([
      call("/admin/report"), 
      call("/admin/payments"), 
      call(`/admin/expenses?archived=${archivedExp}`), 
      call("/admin/students"), 
      call("/admin/approvals"), 
      call("/admin/ledger"), 
      call("/admin/security-logs")
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
    } catch (err) { setMessage(err.message); setMessageType("error"); } finally { setBusyAction(false); }
  }

  // CLEAN PAYMENTS: Only active payments show in the Deposits tab
  const activePayments = payments.filter(p => !p.is_deleted);
  const totalPayments = activePayments.reduce((s, p) => s + Number(p.amount), 0);
  const paymentTotalPages = Math.ceil(activePayments.length / itemsPerPage) || 1;
  const currentPayments = activePayments.slice((paymentPage - 1) * itemsPerPage, paymentPage * itemsPerPage);

  const totalExpenses = expenses.reduce((s, e) => s + (e.is_deleted ? 0 : Number(e.amount)), 0);
  const expenseTotalPages = Math.ceil(expenses.length / itemsPerPage) || 1;
  const currentExpenses = expenses.slice((expensePage - 1) * itemsPerPage, expensePage * itemsPerPage);

  const studentTotalPages = Math.ceil(students.length / itemsPerPage) || 1;
  const currentStudents = students.slice((studentPage - 1) * itemsPerPage, studentPage * itemsPerPage);

  const filteredLedger = ledger.filter(item => {
    if (showArchivedLedger && item.is_deleted !== 1) return false;
    if (!showArchivedLedger && item.is_deleted === 1) return false;
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
            <label>Current Password</label>
            <input type="password" placeholder="Enter current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
            
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
            Approvals {approvals.length > 0 && <span className="nav-badge">{approvals.length}</span>}
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
            
            <div className="activity-item clickable" onClick={() => handleTabClick("deposits")}>
              <div className="activity-info"><h4>Total Deposits Recorded</h4><p></p>
                            <div className="activity-amount" style={{ color: "#059669" }}>{activePayments.length} Transactions</div>
            </div>

            <div className="activity-item clickable" onClick={() => handleTabClick("expenses")}>
              <div className="activity-info"><h4>Total Expenses Logged</h4><p>All expenses saved in the database</p></div>
              <div className="activity-amount" style={{ color: "#dc2626" }}>{expenses.filter(e => !e.is_deleted).length} Records</div>
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
            <PageHeader 
              eyebrow="FINANCIAL RECORD" 
              title={showArchivedLedger ? "Archived Ledger" : "General Ledger"} 
              description={showArchivedLedger ? "Review all deleted transactions." : "A complete history of all active money in and out."} 
            />

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
                        <tr key={`${item.type}-${item.id}`} style={{ opacity: item.is_deleted ? 0.6 : 1 }}>
                          <td data-label="#">{(ledgerPage - 1) * itemsPerPage + i + 1}</td>
                          <td data-label="Date">{new Date(item.date).toLocaleDateString()}</td>
                          <td data-label="Type">
                            <span className={`badge ${item.type === "Deposit" ? "badge-in" : "badge-out"}`}>
                              {item.type}
                            </span>
                            {item.is_deleted === 1 && (
                              <span className="badge" style={{ background: "#fee2e2", color: "#991b1b", marginLeft: "6px" }}>Deleted</span>
                            )}
                          </td>
                          <td data-label="Description">{item.description}</td>
                          <td data-label="Amount" className={`right ${item.type === "Deposit" ? "amount-green" : "amount-red"}`}>
                            <strong style={{ textDecoration: item.is_deleted ? "line-through" : "none" }}>
                              {item.type === "Deposit" ? "+" : "-"} {money(item.amount)}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "10px" }}>
                  <button 
                    className="button-secondary" 
                    onClick={() => { setShowArchivedLedger(!showArchivedLedger); setLedgerPage(1); }}
                  >
                    {showArchivedLedger ? "← Back to Active" : "View Archived"}
                  </button>
                  <Pagination currentPage={ledgerPage} totalPages={ledgerTotalPages} onPageChange={setLedgerPage} />
                </div>
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

            {activePayments.length === 0 ? <div className="empty-state"><h3>No active payments</h3></div> : (
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
                        <td data-label="Amount" className="right amount-green">
                          {money(p.amount)}
                        </td>
                        <td data-label="Action" className="right action-cell">
                          <button className="btn-delete" onClick={() => removeItem(`/admin/payments/${p.id}`, "payment")} disabled={busyAction}>Delete</button>
                        </td>
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
            <PageHeader 
              eyebrow="TRANSACTIONS" 
              title={showArchivedExpenses ? "Archived Expenses" : "All Expenses"} 
              description={showArchivedExpenses ? "Review deleted expense history." : "Log spending and track expenses."} 
            />

            {!showArchivedExpenses && (
              <div className="form-card" style={{ marginBottom: "24px" }}>
                <div className="form-card-heading"><span className="form-icon">03</span><div><h3>Log expense</h3><p>Keep track of fund spending.</p></div></div>
                <form className="two-inputs" onSubmit={(e) => { e.preventDefault(); submit("/admin/expenses", expense, () => setExpense({ description: "", amount: "" }), setBusyExpense, busyExpense); }}>
                  <div><label>Description</label><input placeholder="What is the expense for?" value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} required style={{ marginBottom: 0 }} /></div>
                  <div><label>Amount (PHP)</label><input type="number" min="1" step="0.01" placeholder="0.00" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} required style={{ marginBottom: 0 }} /></div>
                  <button type="submit" disabled={busyExpense}>{busyExpense ? "Wait..." : "Save expense"}</button>
                </form>
              </div>
            )}

            {expenses.length === 0 ? (
              <div className="empty-state">
                <h3>{showArchivedExpenses ? "No archived expenses" : "No expenses"}</h3>
                <p>{showArchivedExpenses ? "You have no deleted records." : "Start by logging a new expense above."}</p>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Description</th>
                        <th>Date</th>
                        <th className="right">Amount</th>
                        {!showArchivedExpenses && <th className="right">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {currentExpenses.map((e, i) => (
                        <tr key={e.id} style={{ opacity: e.is_deleted ? 0.6 : 1 }}>
                          <td data-label="#">{(expensePage - 1) * itemsPerPage + i + 1}</td>
                          <td data-label="Description">
                            {e.description}
                            {e.is_deleted === 1 && <span className="badge" style={{ background: "#fee2e2", color: "#991b1b", marginLeft: "6px" }}>Deleted</span>}
                          </td>
                          <td data-label="Date">{e.date}</td>
                          <td data-label="Amount" className="right amount-red" style={{ textDecoration: e.is_deleted ? "line-through" : "none" }}>
                            {money(e.amount)}
                          </td>
                          {!showArchivedExpenses && (
                            <td data-label="Action" className="right action-cell">
                              <button className="btn-delete" onClick={() => removeItem(`/admin/expenses/${e.id}`, "expense")} disabled={busyAction}>Delete</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {!showArchivedExpenses && (
                      <tfoot><tr><td colSpan="3"><strong>Total</strong></td><td className="right"><strong>{money(totalExpenses)}</strong></td><td></td></tr></tfoot>
                    )}
                  </table>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "10px" }}>
                  <button 
                    className="button-secondary" 
                    onClick={() => { setShowArchivedExpenses(!showArchivedExpenses); loadAll(!showArchivedExpenses); setExpensePage(1); }}
                  >
                    {showArchivedExpenses ? "← Back to Active" : "View Archived"}
                  </button>
                  <Pagination currentPage={expensePage} totalPages={expenseTotalPages} onPageChange={setExpensePage} />
                </div>
              </>
            )}
          </div>
        )}
        <footer className="page-footer">Class Fund Portal · {session.user.section} Admin</footer>
      </main>
    </div>
  );
}

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
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={loginRole === "student"} className={loginRole === "student" ? "segmented-btn active" : "segmented-btn"} onClick={() => setLoginRole("student")}>Student</button>
            <button type="button" role="tab" aria-selected={loginRole === "admin"} className={loginRole === "admin" ? "segmented-btn active" : "segmented-btn"} onClick={() => setLoginRole("admin")}>Administrator</button>
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