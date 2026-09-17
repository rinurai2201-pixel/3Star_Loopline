/* Loopline app — same UI, backend-driven state */
let DB = {
  employees: [],
  attendance: [],
  tasks: [],
  leaves: [],
  messages: [],
  clients: [],
  expenses: [],
  incentiveLog: [],
  payslips: [],
  complaints: [],
  freelanceJobs: [],
  ceoVision: [],
  portfolios: [],
  clientAccounts: [],
  holidays: [],
};
let currentUser = null;
let unlocked = { tl: false, revenue: false };
let activeContactId = null;
let pendingChatImage = null;
let pendingPortfolioImage = null;
let submittingJobId = null;
let pendingSubmissionNote = '';
let leaveBalanceUsed = 0;
let attendanceViewMonth = null;
let payrollOverviewMode = 'monthly';
let payrollOverviewMonth = null;
let payrollOverviewYear = null;
let freelanceJobsFilter = 'all';
let holidayConfigMonth = null;

async function loadHolidayConfig(year) {
  const y = year || (holidayConfigMonth ? holidayConfigMonth.slice(0, 4) : new Date().getFullYear());
  try {
    const data = await Api.holidayConfig({ year: Number(y) });
    DB.holidays = data.holidays || [];
    setHolidayConfig(DB.holidays, data.weekendDays);
    return data;
  } catch (_) {
    return null;
  }
}

function holidaysForMonth(month) {
  return (DB.holidays || [])
    .filter((h) => (h.date || '').startsWith(month + '-'))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function monthDayBounds(month) {
  const [y, mo] = month.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  return { min: `${month}-01`, max: `${month}-${String(last).padStart(2, '0')}` };
}

function teamMembersForView() {
  if (!currentUser) return (DB.employees || []).filter((e) => e.active !== false);
  if (currentUser.role === 'TL') {
    return (DB.employees || []).filter((e) => e.tlId === currentUser.id && e.active !== false);
  }
  if (currentUser.role === 'Manager') {
    return (DB.employees || []).filter((e) => ['Employee', 'Sales', 'TL'].includes(e.role) && e.active !== false);
  }
  return (DB.employees || []).filter((e) => e.active !== false);
}

function assignableTeamMembers() {
  return (DB.employees || []).filter((e) => ['Employee', 'Sales'].includes(e.role) && e.active !== false);
}

function teamLeads() {
  return (DB.employees || []).filter((e) => e.role === 'TL' && e.active !== false);
}

function needsTeamAttendance(role) {
  return role === 'HR' || role === 'TL' || role === 'Manager';
}

async function refreshAllData() {
  if (!currentUser) return;
  const role = currentUser.role;
  const jobs = [
    Api.employees().then((d) => { DB.employees = d.employees || []; }),
  ];
  if (usesPersonalAttendance(role)) {
    jobs.push(Api.attendance().then((d) => { DB.attendance = d.attendance || []; }));
  } else if (needsTeamAttendance(role)) {
    jobs.push(
      Api.statusBoard().then((d) => { DB.attendance = d.attendance || []; }).catch(() => { DB.attendance = []; })
    );
  } else {
    DB.attendance = [];
  }
  jobs.push(
    Api.tasks().then((d) => { DB.tasks = d.tasks || []; }),
    Api.leaves().then((d) => { DB.leaves = d.leaves || []; }),
    Api.contacts().then((d) => { /* contacts fetched on render */ }).catch(() => {}),
    Api.complaints().then((d) => { DB.complaints = d.complaints || []; }),
    Api.freelanceJobs().then((d) => { DB.freelanceJobs = d.jobs || []; }),
    Api.leaveBalance().then((d) => { leaveBalanceUsed = d.used || 0; }).catch(() => {})
  );
  jobs.push(loadHolidayConfig());
  if (role === 'HR' || roleRules(role).my_salary) {
    jobs.push(
      Api.payslips().then((d) => { DB.payslips = d.payslips || []; }).catch(() => { DB.payslips = []; })
    );
  }
  if (role === 'Freelancer') {
    jobs.push(Api.portfolio().then((d) => { DB.portfolios = d.portfolio || []; }));
  }
  if (role === 'TL') {
    jobs.push(Api.clientAccounts().then((d) => { DB.clientAccounts = d.accounts || []; }).catch(() => {}));
  }
  if (REVENUE_ROLES.includes(role)) {
    jobs.push(
      Api.revenueReports().then((d) => {
        DB.clients = d.clients || [];
        DB.expenses = d.expenses || [];
      }).catch(() => {})
    );
    jobs.push(Api.vision().then((d) => { DB.ceoVision = d.vision || []; }).catch(() => {}));
  }
  await Promise.all(jobs);
  // refresh current user from employees list
  const fresh = DB.employees.find((e) => e.id === currentUser.id);
  if (fresh) {
    currentUser = fresh;
    localStorage.setItem('loopline_user', JSON.stringify(fresh));
  }
}

async function boot() {
  hideAppLoader();
  document.getElementById('app').classList.add('active');
  if (typeof buildSidebar === 'function') {
    buildSidebar(currentUser.role, window.LOOPLINE_PAGE);
  }
  document.getElementById('side-name').textContent = currentUser.name;
  document.getElementById('side-role').textContent =
    currentUser.role + (currentUser.department ? ' · ' + currentUser.department : '');
  document.getElementById('side-avatar').textContent = initials(currentUser.name);
  const hello = document.getElementById('dash-hello');
  if (hello) hello.textContent = "Hi " + currentUser.name.split(' ')[0] + ", here's your day";
  setupMobileNav();
  if (currentUser.role === 'TL') {
    unlocked.tl = true;
    sessionStorage.setItem('unlocked_tl', '1');
  }
  if (REVENUE_ROLES.includes(currentUser.role)) {
    unlocked.revenue = true;
    sessionStorage.setItem('unlocked_revenue', '1');
    const lock = document.getElementById('revenue-lock');
    const content = document.getElementById('revenue-content');
    if (lock) lock.style.display = 'none';
    if (content) content.style.display = 'block';
  }
  const navTarget = sessionStorage.getItem('loopline_nav_page');
  if (navTarget) sessionStorage.removeItem('loopline_nav_page');
  const rules = roleRules(currentUser.role);
  let page = navTarget && rules[navTarget] ? navTarget : (window.LOOPLINE_PAGE || landingPageKey(currentUser.role));
  if (!rules[page]) page = landingPageKey(currentUser.role);
  await refreshAllData();
  renderAll();
  const title = (window.PAGE_TITLES && PAGE_TITLES[page]) || page;
  document.title = title + ' — Loopline';
}

function wireNavLinks() {
  if (currentUser && typeof buildSidebar === 'function') {
    buildSidebar(currentUser.role, window.LOOPLINE_PAGE);
  }
}

function closeMobileNav() {
  const aside = document.querySelector('aside');
  const toggle = document.getElementById('mobile-nav-toggle');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  if (aside) aside.classList.remove('open');
  if (toggle) {
    toggle.innerHTML = '☰';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.setAttribute('aria-expanded', 'false');
  }
  if (backdrop) backdrop.classList.remove('show');
  document.body.classList.remove('nav-open');
}

function openMobileNav() {
  const aside = document.querySelector('aside');
  const toggle = document.getElementById('mobile-nav-toggle');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  if (aside) aside.classList.add('open');
  if (toggle) {
    toggle.innerHTML = '✕';
    toggle.setAttribute('aria-label', 'Close menu');
    toggle.setAttribute('aria-expanded', 'true');
  }
  if (backdrop) backdrop.classList.add('show');
  document.body.classList.add('nav-open');
}

function setupMobileNav() {
  const aside = document.querySelector('aside');
  if (!aside || document.getElementById('mobile-nav-toggle')) return;

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.id = 'mobile-nav-backdrop';
  backdrop.className = 'mobile-nav-backdrop';
  backdrop.setAttribute('aria-label', 'Close menu');
  backdrop.onclick = () => closeMobileNav();
  document.body.prepend(backdrop);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'mobile-nav-toggle';
  toggle.className = 'mobile-nav-toggle';
  toggle.setAttribute('aria-label', 'Open menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '☰';
  toggle.onclick = () => {
    if (aside.classList.contains('open')) closeMobileNav();
    else openMobileNav();
  };
  document.body.prepend(toggle);

  document.querySelector('main')?.addEventListener('click', () => closeMobileNav());
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeMobileNav();
  });
}

function showAppLoader() {
  if (document.getElementById('app-loader')) return;
  const el = document.createElement('div');
  el.id = 'app-loader';
  el.className = 'app-loader';
  el.innerHTML = '<div class="app-loader-inner"><div class="brand-mark">L</div><div>Loading Loopline…</div></div>';
  document.body.appendChild(el);
}

function hideAppLoader() {
  document.getElementById('app-loader')?.remove();
}

function flashToast(message, type) {
  const el = document.createElement('div');
  el.className = 'toast toast-' + (type || 'info');
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function showPage(name) {
  const rules = roleRules(currentUser.role);
  if (!rules[name]) {
    alert("Your role doesn't have access to that section.");
    return;
  }
  if (window.LOOPLINE_APP_SHELL && typeof LooplineRouter !== 'undefined') {
    LooplineRouter.navigate(name);
    return;
  }
  location.href = pageUrl(name, currentUser.role);
}

async function logout() {
  try { await Api.logout(); } catch (_) {}
  Api.setToken(null);
  localStorage.removeItem('loopline_user');
  location.href = resolvePagePath('login.html');
}

function openChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (!modal) return;
  ['cp-current', 'cp-new', 'cp-confirm'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const errEl = document.getElementById('cp-error');
  if (errEl) {
    errEl.style.color = 'var(--danger)';
    errEl.textContent = '';
  }
  modal.style.display = 'flex';
  document.getElementById('cp-current')?.focus();
}

function closeChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) modal.style.display = 'none';
}

function closeProfileMenu() {
  const btn = document.getElementById('side-profile-btn');
  const menu = document.getElementById('side-profile-menu');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  if (menu) menu.hidden = true;
}

function toggleProfileMenu(event) {
  if (event) event.stopPropagation();
  const btn = document.getElementById('side-profile-btn');
  const menu = document.getElementById('side-profile-menu');
  if (!btn || !menu) return;
  const open = btn.getAttribute('aria-expanded') === 'true';
  if (open) {
    closeProfileMenu();
    return;
  }
  btn.setAttribute('aria-expanded', 'true');
  menu.hidden = false;
}

document.addEventListener('click', (e) => {
  const foot = document.querySelector('.side-foot');
  if (!foot || foot.contains(e.target)) return;
  closeProfileMenu();
});

async function submitChangePassword() {
  const currentPassword = (document.getElementById('cp-current')?.value || '').trim();
  const newPassword = (document.getElementById('cp-new')?.value || '').trim();
  const confirmPassword = (document.getElementById('cp-confirm')?.value || '').trim();
  const errEl = document.getElementById('cp-error');
  const btn = document.getElementById('cp-save-btn');
  if (errEl) {
    errEl.style.color = 'var(--danger)';
    errEl.textContent = '';
  }
  if (!currentPassword || !newPassword || !confirmPassword) {
    if (errEl) errEl.textContent = 'Fill in all password fields.';
    return;
  }
  if (newPassword.length < 6) {
    if (errEl) errEl.textContent = 'New password must be at least 6 characters.';
    return;
  }
  if (newPassword !== confirmPassword) {
    if (errEl) errEl.textContent = 'New password and confirmation do not match.';
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating…';
  }
  try {
    await Api.changePassword(currentPassword, newPassword);
    closeChangePasswordModal();
    flashToast('Password updated', 'success');
  } catch (e) {
    if (errEl) errEl.textContent = e.message;
    else alert(e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Update password';
    }
  }
}

async function unlockSection(section) {
  const pass = document.getElementById(section + '-password').value;
  try {
    await Api.unlock(section, pass);
    unlocked[section] = true;
    sessionStorage.setItem('unlocked_' + section, '1');
    document.getElementById(section + '-lock').style.display = 'none';
    document.getElementById(section + '-content').style.display = 'block';
    renderAll();
  } catch (e) {
    document.getElementById(section + '-error').textContent = e.message;
  }
}

/* ---------------- TASKS ---------------- */
function myAssignedTasks() {
  return DB.tasks
    .filter((t) => t.assignedTo === currentUser.id)
    .sort((a, b) => ((a.endDate || '') + (a.endTime || '')).localeCompare((b.endDate || '') + (b.endTime || '')));
}

function taskRowEditableHtml(t, { showAssignedBy = false } = {}) {
  const pct = t.progress ?? 0;
  return `<td class="task-col-title"><strong>${escapeHtml(t.title)}</strong>${t.desc ? `<div class="task-note">${escapeHtml(t.desc)}</div>` : ''}</td>
    ${showAssignedBy ? `<td class="task-col-assigned-by">${escapeHtml(t.assignedBy || '—')}</td>` : ''}
    <td class="task-col-deadline">${t.endDate || '—'} ${t.endTime || ''}</td>
    <td class="task-col-status">${statusBadge(t.status)}</td>
    <td class="task-col-progress">
      <div class="task-progress-wrap">
        <div class="task-progress-bar"><div class="task-progress-fill" style="width:${pct}%"></div></div>
        <div class="task-progress-controls">
          <input type="range" class="task-progress-input" min="0" max="100" value="${pct}" oninput="previewTaskProgress(this)">
          <span class="task-progress-pct">${pct}%</span>
        </div>
      </div>
    </td>
    <td class="task-col-update">
      <div class="task-update-row">
        <select class="task-status-select">${taskStatusOptions(t.status)}</select>
        <button type="button" class="btn btn-accent btn-sm" onclick="saveTaskRow('${t.id}')">Update</button>
      </div>
    </td>`;
}

function renderEditableTaskTable(bodyId, tasks, { emptyColspan = 6, emptyText = 'No tasks assigned yet.', showAssignedBy = false } = {}) {
  const tbody = document.getElementById(bodyId);
  if (!tbody) return;
  tbody.innerHTML = tasks.length ? '' : `<tr class="empty-row"><td colspan="${emptyColspan}">${emptyText}</td></tr>`;
  tasks.forEach((t) => {
    const tr = document.createElement('tr');
    tr.dataset.taskId = t.id;
    tr.innerHTML = taskRowEditableHtml(t, { showAssignedBy });
    tbody.appendChild(tr);
  });
}

function renderMyTasksPage() {
  renderEditableTaskTable('my-tasks-page-body', myAssignedTasks(), {
    emptyColspan: 6,
    emptyText: 'No tasks assigned to you yet.',
    showAssignedBy: true,
  });
}

/* ---------------- DASHBOARD (overview) ---------------- */
function renderDashboardOverview() {
  renderBirthdayBanner();
  renderBirthdayWidget('dash-birthdays');
  renderMyComplaints();
}

/* ---------------- MY ATTENDANCE ---------------- */
function renderMyAttendance() {
  if (!usesPersonalAttendance(currentUser.role)) return;

  const today = todayStr();
  const rec = DB.attendance.find((a) => a.empId === currentUser.id && a.date === today);
  const dot = document.getElementById('clock-dot');
  const txt = document.getElementById('clock-status-text');
  const btn = document.getElementById('clock-btn');
  const teaBtn = document.getElementById('tea-break-btn');
  const foodBtn = document.getElementById('food-break-btn');
  const breakSub = document.getElementById('break-sub');
  if (!txt || !btn) return;
  const openBreak = rec && (rec.breaks || []).find((b) => !b.end);

  if (rec && !rec.clockOut) {
    if (openBreak) {
      if (dot) dot.classList.remove('live');
      txt.textContent = `On ${breakTypeLabel(openBreak.type)} since ${openBreak.start}`;
      btn.textContent = 'Clock Out';
      btn.disabled = true;
    } else {
      if (dot) dot.classList.add('live');
      txt.textContent = 'Clocked in at ' + rec.clockIn;
      btn.textContent = 'Clock Out';
      btn.disabled = false;
    }
  } else if (rec && rec.clockOut) {
    if (dot) dot.classList.remove('live');
    txt.textContent = `Worked ${rec.clockIn} → ${rec.clockOut}`;
    btn.textContent = 'Clocked out for today';
    btn.disabled = true;
  } else {
    if (dot) dot.classList.remove('live');
    txt.textContent = 'Not clocked in';
    btn.textContent = 'Clock In';
    btn.disabled = false;
  }

  [['Tea', teaBtn], ['Food', foodBtn]].forEach(([type, el]) => {
    if (!el) return;
    el.classList.remove('on');
    if (!rec || rec.clockOut) {
      el.disabled = true;
      el.innerHTML = `<span class="bicon">${type === 'Tea' ? '🍵' : '🍱'}</span> ${type} Break`;
    } else if (openBreak && openBreak.type === type) {
      el.disabled = false;
      el.classList.add('on');
      el.innerHTML = `<span class="bicon">${type === 'Tea' ? '🍵' : '🍱'}</span> End ${type} Break`;
    } else if (openBreak) {
      el.disabled = true;
      el.innerHTML = `<span class="bicon">${type === 'Tea' ? '🍵' : '🍱'}</span> ${type} Break`;
    } else {
      el.disabled = false;
      el.innerHTML = `<span class="bicon">${type === 'Tea' ? '🍵' : '🍱'}</span> ${type} Break`;
    }
  });

  if (breakSub) {
    const teaMin = breakMinutesByType(rec, 'Tea');
    const foodMin = breakMinutesByType(rec, 'Food');
    if (!rec || !(rec.breaks || []).length) breakSub.textContent = 'No breaks yet today';
    else {
      const parts = [];
      if (teaMin) parts.push(`🍵 Tea ${teaMin}m`);
      if (foodMin) parts.push(`🍱 Food ${foodMin}m`);
      breakSub.textContent = parts.length ? parts.join(' · ') + ' today' : 'No breaks yet today';
    }
  }

  renderWeekStrip();
  loadAndRenderMonthlyAttendance();
}

async function loadAndRenderMonthlyAttendance() {
  const picker = document.getElementById('att-month-picker');
  if (!picker || !currentUser || !usesPersonalAttendance(currentUser.role)) return;
  const month = attendanceViewMonth || picker.value || monthStr();
  picker.value = month;
  attendanceViewMonth = month;
  try {
    await loadHolidayConfig(Number(month.slice(0, 4)));
    const data = await Api.attendance({ month });
    const incoming = data.attendance || [];
    const rest = DB.attendance.filter(
      (a) => !(a.empId === currentUser.id && (a.date || '').startsWith(month + '-'))
    );
    DB.attendance = rest.concat(incoming);
  } catch (_) { /* render from cached data */ }
  renderMonthlyAttendance();
}

async function changeAttendanceMonth(month) {
  if (!month || !currentUser) return;
  attendanceViewMonth = month;
  try {
    await loadHolidayConfig(Number(month.slice(0, 4)));
    const data = await Api.attendance({ month });
    const incoming = data.attendance || [];
    const rest = DB.attendance.filter(
      (a) => !(a.empId === currentUser.id && (a.date || '').startsWith(month + '-'))
    );
    DB.attendance = rest.concat(incoming);
    renderMonthlyAttendance();
  } catch (e) { alert(e.message); }
}

function renderMonthlyAttendance() {
  const tbody = document.getElementById('att-month-body');
  const statsEl = document.getElementById('att-month-stats');
  const picker = document.getElementById('att-month-picker');
  if (!tbody || !currentUser) return;

  const month = attendanceViewMonth || picker?.value || monthStr();
  if (picker) picker.value = month;
  attendanceViewMonth = month;

  const myLeaves = DB.leaves.filter((l) => l.empId === currentUser.id);
  const monthRecords = DB.attendance.filter(
    (a) => a.empId === currentUser.id && (a.date || '').startsWith(month + '-')
  );
  const { rows, stats } = buildMonthlyAttendanceRows(currentUser.id, month, monthRecords, myLeaves);
  const today = todayStr();

  if (statsEl) {
    statsEl.innerHTML = `
      <div class="att-stat-pill present"><div class="att-stat-num">${stats.present}</div><div class="att-stat-lbl">Present</div></div>
      <div class="att-stat-pill leave"><div class="att-stat-num">${stats.leave}</div><div class="att-stat-lbl">On leave</div></div>
      <div class="att-stat-pill holiday"><div class="att-stat-num">${stats.holiday + stats.weekend}</div><div class="att-stat-lbl">Holiday / weekend</div></div>
      <div class="att-stat-pill missed"><div class="att-stat-num">${stats.missed + stats.incomplete}</div><div class="att-stat-lbl">Missed / incomplete</div></div>
      <div class="att-stat-pill hours"><div class="att-stat-num">${formatDuration(stats.totalMinutes)}</div><div class="att-stat-lbl">Total hours</div></div>`;
  }

  tbody.innerHTML = rows.length
    ? rows.map((r) => `<tr class="${r.iso === today ? 'att-row-today' : ''}">
        <td><strong>${escapeHtml(r.dateLabel)}</strong></td>
        <td>${escapeHtml(r.clockIn)}</td>
        <td>${escapeHtml(r.clockOut)}</td>
        <td>${escapeHtml(r.hours)}</td>
        <td><span class="att-status ${r.statusCls}">${escapeHtml(r.status)}</span></td>
        <td class="att-remarks">${escapeHtml(r.note)}</td>
      </tr>`).join('')
    : '<tr class="empty-row"><td colspan="6">No records for this month.</td></tr>';
}

/* ---------------- MY LEAVES ---------------- */
function renderMyLeaves() {
  renderLeaveBalance();

  const lb = document.getElementById('my-leaves-body');
  if (lb) {
    const myLeaves = DB.leaves.filter((l) => l.empId === currentUser.id).sort((a, b) => b.from.localeCompare(a.from));
    lb.innerHTML = myLeaves.length ? '' : '<div style="color:var(--ink-soft);font-size:13px;padding:10px 0;">No requests yet.</div>';
    myLeaves.forEach((l) => {
      const div = document.createElement('div');
      div.className = 'leave-timeline-item';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.innerHTML = `<div class="leave-timeline-bar ${l.status}"></div>
        <div style="flex:1;">
          <div class="leave-timeline-dates">${l.from} → ${l.to}</div>
          ${l.reason ? `<div class="leave-timeline-reason">${escapeHtml(l.reason)}</div>` : ''}
          ${l.status !== 'Pending' && l.reviewedByName ? `<div class="leave-timeline-reviewer">${escapeHtml(leaveReviewedByLabel(l))}</div>` : ''}
        </div>
        ${statusBadge2(l.status)}`;
      lb.appendChild(div);
    });
  }
}

/* ---------------- MY SALARY ---------------- */
function payslipNetPreview(base, incentive, allowance, deduction) {
  return (Number(base) || 0) + (Number(incentive) || 0) + (Number(allowance) || 0) - (Number(deduction) || 0);
}

function payslipDetailHtml(slip) {
  const empName = slip.empName || currentUser?.name || '—';
  const empRole = slip.empRole || currentUser?.role || '';
  const dept = slip.empDepartment || currentUser?.department || '';
  return `
    <div class="payslip-detail-grid">
      <div class="payslip-detail-block">
        <div class="payslip-detail-label">Employee</div>
        <div class="payslip-detail-value">${escapeHtml(empName)}</div>
        <div class="payslip-detail-sub">${escapeHtml(empRole)}${dept ? ' · ' + escapeHtml(dept) : ''}</div>
      </div>
      <div class="payslip-detail-block">
        <div class="payslip-detail-label">Payroll month</div>
        <div class="payslip-detail-value">${monthLabel(slip.month)}</div>
        <div class="payslip-detail-sub">${slip.publishedAt ? 'Issued ' + slip.publishedAt : 'Draft'}</div>
      </div>
    </div>
    <table class="payslip-breakdown">
      <thead><tr><th>Component</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>Base salary</td><td>${money(slip.baseSalary)}</td></tr>
        <tr><td>Incentive / bonus</td><td>${money(slip.incentive)}</td></tr>
        <tr><td>Allowance</td><td>${money(slip.allowance)}</td></tr>
        <tr class="deduct-row"><td>Deductions</td><td>− ${money(slip.deduction)}</td></tr>
        <tr class="net-row"><td><strong>Net pay</strong></td><td><strong>${money(slip.netPay)}</strong></td></tr>
      </tbody>
    </table>
    <div class="payslip-meta-grid">
      <div><span>Working days</span><b>${slip.workingDays ?? '—'}</b></div>
      <div><span>Paid days</span><b>${slip.paidDays ?? '—'}</b></div>
      <div><span>LOP days</span><b>${slip.lopDays ?? 0}</b></div>
      <div><span>Performance</span><b>${slip.performanceScore ?? '—'}</b></div>
    </div>
    ${slip.notes ? `<div class="payslip-notes"><strong>Notes:</strong> ${escapeHtml(slip.notes)}</div>` : ''}`;
}

async function loadMyPayslips() {
  try {
    const data = await Api.payslips();
    DB.payslips = data.payslips || [];
  } catch (_) { /* keep cached */ }
  renderMySalary();
}

function renderMySalary() {
  const sal = document.getElementById('my-salary');
  if (sal) sal.textContent = money(currentUser.baseSalary);
  const score = document.getElementById('my-score');
  if (score) score.textContent = currentUser.performanceScore == null ? '—' : currentUser.performanceScore;

  const slips = (DB.payslips || [])
    .filter((p) => p.empId === currentUser.id && p.status === 'Published')
    .sort((a, b) => b.month.localeCompare(a.month));
  const latest = slips[0];
  const latestNet = document.getElementById('my-latest-net');
  const latestMonth = document.getElementById('my-latest-month');
  if (latestNet) latestNet.textContent = latest ? money(latest.netPay) : '—';
  if (latestMonth) {
    latestMonth.textContent = latest ? monthLabel(latest.month) : 'No payslip published yet';
  }

  const tbody = document.getElementById('my-payslips-body');
  if (!tbody) return;
  if (!slips.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No payslips published yet. HR will issue your monthly salary slip here.</td></tr>';
    return;
  }
  tbody.innerHTML = slips.map((slip) => `<tr>
      <td><strong>${monthLabel(slip.month)}</strong></td>
      <td>${money(slip.baseSalary)}</td>
      <td>${money(slip.incentive)}</td>
      <td>${money(slip.deduction)}</td>
      <td><strong>${money(slip.netPay)}</strong></td>
      <td>${slip.publishedAt || '—'}</td>
      <td>
        <button type="button" class="subtle-btn" onclick="viewPayslip('${slip.id}')">View</button>
        <button type="button" class="subtle-btn" onclick="downloadPayslipPdf('${slip.id}')">PDF</button>
      </td>
    </tr>`).join('');
}

function viewPayslip(slipId) {
  const slip = (DB.payslips || []).find((p) => p.id === slipId);
  if (!slip) { alert('Payslip not found.'); return; }
  const modal = document.getElementById('payslip-modal');
  const body = document.getElementById('payslip-modal-body');
  const foot = document.getElementById('payslip-modal-foot');
  const title = document.getElementById('payslip-modal-title');
  if (!modal || !body) return;
  if (title) title.textContent = monthLabel(slip.month) + ' — ' + (slip.empName || currentUser.name);
  body.innerHTML = payslipDetailHtml(slip);
  if (foot) {
    foot.innerHTML = `<button type="button" class="btn btn-ghost" onclick="closePayslipModal()">Close</button>
      <button type="button" class="btn btn-accent" onclick="downloadPayslipPdf('${slip.id}')">Download PDF</button>`;
  }
  modal.style.display = 'flex';
}

function closePayslipModal() {
  const modal = document.getElementById('payslip-modal');
  if (modal) modal.style.display = 'none';
}

function downloadPayslipPdf(slipId) {
  const slip = (DB.payslips || []).find((p) => p.id === slipId);
  if (!slip) { alert('Payslip not found.'); return; }
  if (!window.jspdf) { alert('PDF generator is still loading — try again in a moment.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const empName = slip.empName || currentUser?.name || 'Employee';
  const empRole = slip.empRole || currentUser?.role || '';
  const dept = slip.empDepartment || currentUser?.department || '';
  doc.setFillColor(22, 28, 43);
  doc.rect(0, 0, 595, 90, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Loopline', 40, 45);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text('Payslip — ' + monthLabel(slip.month), 40, 66);
  doc.setTextColor(25, 29, 38);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Employee details', 40, 120);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text('Name: ' + empName, 40, 142);
  doc.text('Role: ' + empRole + (dept ? ' · ' + dept : ''), 40, 160);
  doc.text('Issued: ' + (slip.publishedAt || new Date().toLocaleDateString()), 40, 178);
  doc.setDrawColor(228, 224, 214);
  doc.line(40, 196, 555, 196);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Earnings & deductions', 40, 222);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  let y = 246;
  const rows = [
    ['Base salary', slip.baseSalary],
    ['Incentive / bonus', slip.incentive],
    ['Allowance', slip.allowance],
    ['Deductions', -slip.deduction],
  ];
  rows.forEach(([label, amt]) => {
    doc.text(label, 40, y);
    doc.text(money(Math.abs(amt)), 480, y, { align: 'right' });
    y += 20;
  });
  doc.line(40, y, 555, y); y += 24;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Net pay', 40, y);
  doc.setFontSize(16);
  doc.text(money(slip.netPay), 480, y, { align: 'right' });
  y += 36;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.setTextColor(91, 98, 112);
  doc.text(`Working days: ${slip.workingDays ?? '—'}   Paid days: ${slip.paidDays ?? '—'}   LOP: ${slip.lopDays ?? 0}`, 40, y);
  if (slip.performanceScore != null) {
    y += 16;
    doc.text('Performance score: ' + slip.performanceScore + ' / 100', 40, y);
  }
  if (slip.notes) {
    y += 20;
    doc.text('Notes: ' + slip.notes.slice(0, 120), 40, y);
  }
  doc.setFontSize(9);
  doc.text('This is a system-generated payslip from Loopline.', 40, 780);
  doc.save(`Payslip-${empName.replace(/\s+/g, '_')}-${slip.month}.pdf`);
}

function renderDashboard() {
  renderDashboardOverview();
  renderMyAttendance();
  renderMyLeaves();
  renderMySalary();
}

function switchLeaveTab(tab) {
  document.getElementById('leave-tab-apply').style.display = tab === 'apply' ? 'block' : 'none';
  document.getElementById('leave-tab-history').style.display = tab === 'history' ? 'block' : 'none';
  document.getElementById('leave-tab-btn-apply').classList.toggle('active', tab === 'apply');
  document.getElementById('leave-tab-btn-history').classList.toggle('active', tab === 'history');
}

function renderLeaveBalance() {
  const fill = document.getElementById('leave-balance-fill');
  const text = document.getElementById('leave-balance-text');
  if (!fill || !text) return;
  const used = leaveBalanceUsed;
  const pct = Math.min(100, Math.round((used / ANNUAL_LEAVE_QUOTA) * 100));
  fill.style.width = pct + '%';
  text.textContent = `${used} / ${ANNUAL_LEAVE_QUOTA} leave days used this year`;
  const ring = document.getElementById('leave-ring-fg');
  const ringText = document.getElementById('leave-ring-text');
  if (ring) ring.style.strokeDashoffset = String(157 - (157 * pct) / 100);
  if (ringText) ringText.textContent = used;
}

function renderWeekStrip() {
  const el = document.getElementById('week-strip');
  if (!el) return;
  const today = new Date();
  const todayIso = todayStr();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  el.innerHTML = days.map((d) => {
    const iso = localDateStr(d);
    const isWeekendDay = WEEKEND_DAYS.includes(d.getDay());
    const isHol = isCompanyHoliday(iso);
    const rec = DB.attendance.find((a) => a.empId === currentUser.id && a.date === iso);
    const onLeave = DB.leaves.some(
      (l) => l.empId === currentUser.id && l.status === 'Approved' && l.from <= iso && l.to >= iso
    );
    let cls;
    if (iso > todayIso) cls = 'future';
    else if (onLeave) cls = 'leave';
    else if (rec) cls = 'present';
    else if (isHol) cls = 'holiday';
    else if (isWeekendDay) cls = 'weekend';
    else cls = 'absent';
    const label = d.toLocaleDateString('default', { weekday: 'short' }).slice(0, 3);
    return `<div class="week-day${iso === todayIso ? ' today' : ''}">
      <div class="wd-label">${label}</div>
      <div class="wd-dot ${cls}"></div>
      <div class="wd-date">${d.getDate()}</div>
    </div>`;
  }).join('');
}

async function toggleClock() {
  const today = todayStr();
  const rec = DB.attendance.find((a) => a.empId === currentUser.id && a.date === today);
  const isClockOut = rec && !rec.clockOut;

  if (isClockOut) {
    const openBreak = (rec.breaks || []).find((b) => !b.end);
    if (openBreak) {
      alert(`Please end your ${breakTypeLabel(openBreak.type)} before clocking out.`);
      return;
    }
    if (!confirm('Are you sure you want to clock out?')) {
      return;
    }
  }

  try {
    await Api.clock();
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}

async function toggleBreak(type) {
  try {
    await Api.breakToggle(type);
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}

async function updateTaskWork(taskId, { status, progress } = {}) {
  const body = {};
  if (status != null) body.status = status;
  if (progress != null) body.progress = progress;
  if (!Object.keys(body).length) return;
  try {
    await Api.updateTaskStatus(taskId, body);
    await refreshAllData();
    renderAll();
    flashToast('Task updated', 'success');
  } catch (e) { alert(e.message); }
}

function previewTaskProgress(input) {
  const row = input.closest('tr');
  if (!row) return;
  const pct = input.value;
  const label = row.querySelector('.task-progress-pct');
  const fill = row.querySelector('.task-progress-fill');
  if (label) label.textContent = `${pct}%`;
  if (fill) fill.style.width = `${pct}%`;
}

function saveTaskRow(taskId) {
  const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
  if (!row) return;
  const status = row.querySelector('.task-status-select')?.value;
  const progress = Number(row.querySelector('.task-progress-input')?.value ?? 0);
  updateTaskWork(taskId, { status, progress });
}

async function applyLeave() {
  const fromDate = document.getElementById('leave-from').value;
  const toDate = document.getElementById('leave-to').value;
  const reason = document.getElementById('leave-reason').value.trim();
  if (!fromDate || !toDate) { alert('Pick both dates.'); return; }
  try {
    await Api.applyLeave({ fromDate, toDate, reason });
    document.getElementById('leave-from').value = '';
    document.getElementById('leave-to').value = '';
    document.getElementById('leave-reason').value = '';
    await refreshAllData();
    renderAll();
    flashToast('Leave request submitted', 'success');
  } catch (e) { alert(e.message); }
}

async function applyLeaveAs() {
  const fromDate = document.getElementById('tl-leave-from').value;
  const toDate = document.getElementById('tl-leave-to').value;
  const reason = document.getElementById('tl-leave-reason').value.trim();
  if (!fromDate || !toDate) { alert('Pick both dates.'); return; }
  try {
    await Api.applyLeave({ fromDate, toDate, reason });
    document.getElementById('tl-leave-from').value = '';
    document.getElementById('tl-leave-to').value = '';
    document.getElementById('tl-leave-reason').value = '';
    await refreshAllData();
    renderAll();
    flashToast('Leave request submitted', 'success');
  } catch (e) { alert(e.message); }
}

/* ---------------- CHAT ---------------- */
async function renderContacts() {
  const list = document.getElementById('contact-list');
  if (!list) return;
  let contacts = [];
  try {
    const data = await Api.contacts();
    contacts = data.contacts || [];
  } catch (_) { contacts = []; }
  if (activeContactId && !contacts.find((c) => c.id === activeContactId)) activeContactId = null;
  if (!activeContactId && contacts.length) activeContactId = contacts[0].id;
  list.innerHTML = contacts.length
    ? ''
    : '<div style="padding:16px;color:var(--ink-soft);font-size:13px;">No other users in the company yet.</div>';
  contacts.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'contact-item' + (c.id === activeContactId ? ' active' : '');
    div.innerHTML = `<span>${escapeHtml(c.name)} <span class="role-pill">${c.role}</span></span>${
      c.unread ? `<span class="badge badge-pending">${c.unread}</span>` : ''
    }`;
    div.onclick = async () => {
      activeContactId = c.id;
      await renderContacts();
      await renderChatThread();
    };
    list.appendChild(div);
  });
}

async function renderChatThread() {
  const box = document.getElementById('chat-messages');
  if (!box) return;
  if (!activeContactId) {
    box.innerHTML = '<div style="color:var(--ink-soft);font-size:13px;text-align:center;margin-top:20px;">Select a contact to start chatting.</div>';
    return;
  }
  let thread = [];
  try {
    const data = await Api.thread(activeContactId);
    thread = data.messages || [];
  } catch (_) {}
  box.innerHTML = thread.length
    ? ''
    : '<div style="color:var(--ink-soft);font-size:13px;text-align:center;margin-top:20px;">No messages yet — say hello 👋</div>';
  thread.forEach((m) => {
    const div = document.createElement('div');
    div.className = 'msg' + (m.fromId === currentUser.id ? ' me' : '');
    div.innerHTML = `<div class="meta">${m.fromId === currentUser.id ? 'You' : escapeHtml(m.fromName)} · ${m.time}</div>${
      m.text ? escapeHtml(m.text) : ''
    }${m.image ? `<img src="${m.image}" onclick="window.open(this.src)">` : ''}`;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

function handleChatImagePick(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingChatImage = reader.result;
    renderChatImagePreview();
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function renderChatImagePreview() {
  const el = document.getElementById('chat-img-preview-row');
  if (!el) return;
  if (!pendingChatImage) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="chat-img-preview"><img src="${pendingChatImage}"><span>Image attached</span><button onclick="pendingChatImage=null;renderChatImagePreview();">Remove</button></div>`;
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if ((!text && !pendingChatImage) || !activeContactId) return;
  try {
    await Api.sendMessage({ toId: activeContactId, text, image: pendingChatImage });
    input.value = '';
    pendingChatImage = null;
    renderChatImagePreview();
    await renderChatThread();
    await renderContacts();
  } catch (e) { alert(e.message); }
}

/* ---------------- STATUS / HR ---------------- */
function renderStatusBoard(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const today = todayStr();
  const roster =
    currentUser.role === 'TL' || currentUser.role === 'Manager'
      ? teamMembersForView()
      : currentUser.role === 'HR'
      ? attendanceRoster(DB.employees || []).filter((e) => e.role !== 'Freelancer')
      : attendanceRoster(DB.employees || []);
  if (!roster.length) {
    el.innerHTML = '<div style="color:var(--ink-soft);font-size:13px;">No team members yet.</div>';
    return;
  }
  el.innerHTML = '<div class="status-grid"></div>';
  const grid = el.querySelector('.status-grid');
  roster.forEach((emp) => {
    const rec = DB.attendance.find((a) => a.empId === emp.id && a.date === today);
    const onLeave = DB.leaves.some(
      (l) => l.empId === emp.id && l.status === 'Approved' && l.from <= today && l.to >= today
    );
    const breaks = rec ? rec.breaks || [] : [];
    const openBreak = breaks.find((b) => !b.end);
    let cls, label, pulse;
    if (onLeave) { cls = 'leave'; label = 'On leave'; pulse = 'leave'; }
    else if (!rec) { cls = 'notin'; label = 'Not clocked in'; pulse = 'notin'; }
    else if (rec.clockOut) { cls = 'out'; label = 'Clocked out'; pulse = 'out'; }
    else if (openBreak) { cls = 'break'; label = 'On ' + breakTypeLabel(openBreak.type); pulse = 'break'; }
    else { cls = 'working'; label = 'Working'; pulse = 'working'; }
    const teaMin = breakMinutesByType(rec, 'Tea');
    const foodMin = breakMinutesByType(rec, 'Food');
    let timesHtml = '';
    if (onLeave) timesHtml = `<div class="status-times">Approved leave covers today</div>`;
    else if (rec) {
      timesHtml = `<div class="status-times">
        <div>In: <b>${rec.clockIn || '—'}</b> ${rec.clockOut ? ` · Out: <b>${rec.clockOut}</b>` : ''}</div>
        <div>${teaMin ? `<span class="break-chip tea">🍵 Tea ${teaMin}m</span>` : ''}${
          foodMin ? `<span class="break-chip food">🍱 Food ${foodMin}m</span>` : ''
        }${!teaMin && !foodMin ? 'No breaks yet' : ''}</div>
      </div>`;
    } else timesHtml = `<div class="status-times">No activity logged yet</div>`;
    const tile = document.createElement('div');
    tile.className = 'status-tile status-tile-' + cls;
    tile.innerHTML = `<span class="status-pulse ${pulse}"></span>
      <div class="status-tile-top">
        <div class="avatar">${initials(emp.name)}</div>
        <div><div class="status-tile-name">${escapeHtml(emp.name)}</div><div class="status-tile-role">${emp.role}${
      emp.department ? ' · ' + escapeHtml(emp.department) : ''
    }</div></div>
      </div>
      <span class="status-label ${cls}">${label}</span>
      ${timesHtml}`;
    grid.appendChild(tile);
  });
}

async function renderActivityLog() {
  const dateInput = document.getElementById('hr-activity-date');
  if (!dateInput) return;
  if (!dateInput.value) dateInput.value = todayStr();
  const date = dateInput.value;
  const body = document.getElementById('hr-activity-body');
  if (!body) return;
  const roster = attendanceRoster(DB.employees || []).filter((e) => e.role !== 'Freelancer');
  let dayAttendance = DB.attendance.filter((a) => a.date === date);
  if (currentUser.role === 'HR' && date !== todayStr()) {
    try {
      const data = await Api.attendance({ date });
      dayAttendance = data.attendance || [];
    } catch (_) {
      dayAttendance = [];
    }
  }
  body.innerHTML = roster.length ? '' : '<tr class="empty-row"><td colspan="6">No employees yet.</td></tr>';
  roster.forEach((emp) => {
    const rec = dayAttendance.find((a) => a.empId === emp.id);
    const teaMin = breakMinutesByType(rec, 'Tea');
    const foodMin = breakMinutesByType(rec, 'Food');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${escapeHtml(emp.name)}</strong><div style="font-size:11px;color:var(--ink-soft);">${emp.role}</div></td>
      <td class="act-cell-time">${rec && rec.clockIn ? rec.clockIn : '—'}</td>
      <td class="act-cell-time">${rec && rec.clockOut ? rec.clockOut : rec ? 'Still in' : '—'}</td>
      <td>${teaMin ? `<span class="break-chip tea">🍵 ${teaMin}m</span>` : '—'}</td>
      <td>${foodMin ? `<span class="break-chip food">🍱 ${foodMin}m</span>` : '—'}</td>
      <td>${teaMin + foodMin ? `${teaMin + foodMin}m` : '—'}</td>`;
    body.appendChild(tr);
  });
}

function payrollOverviewPeriod() {
  const now = new Date();
  return {
    mode: payrollOverviewMode,
    month: payrollOverviewMonth || monthStr(),
    year: payrollOverviewYear || String(now.getFullYear()),
  };
}

function payrollSummary() {
  const staff = (DB.employees || []).filter(
    (e) => !['CEO', 'Partner', 'HR', 'Freelancer'].includes(e.role)
  );
  const base = staff.reduce((s, e) => s + (Number(e.baseSalary) || 0), 0);
  const incentives = staff.reduce((s, e) => s + (Number(e.incentive) || 0), 0);
  return { count: staff.length, base, incentives, total: base + incentives };
}

function payrollSummaryFromPayslips() {
  const { mode, month, year } = payrollOverviewPeriod();
  const slips = (DB.payslips || []).filter((p) => {
    if (p.status !== 'Published') return false;
    if (mode === 'monthly') return p.month === month;
    return (p.month || '').startsWith(`${year}-`);
  });
  return {
    mode,
    month,
    year,
    payslipCount: slips.length,
    staffCount: new Set(slips.map((s) => s.empId)).size,
    base: slips.reduce((s, p) => s + (Number(p.baseSalary) || 0), 0),
    incentives: slips.reduce((s, p) => s + (Number(p.incentive) || 0), 0),
    allowances: slips.reduce((s, p) => s + (Number(p.allowance) || 0), 0),
    deductions: slips.reduce((s, p) => s + (Number(p.deduction) || 0), 0),
    total: slips.reduce((s, p) => s + (Number(p.netPay) || 0), 0),
  };
}

async function ensurePayrollOverviewData() {
  const { mode, month, year } = payrollOverviewPeriod();
  if (mode === 'monthly') {
    const hasMonth = (DB.payslips || []).some((p) => p.month === month);
    if (!hasMonth) {
      try {
        const data = await Api.payslips({ month });
        const incoming = data.payslips || [];
        const rest = (DB.payslips || []).filter((p) => p.month !== month);
        DB.payslips = rest.concat(incoming);
      } catch (_) { /* keep cached */ }
    }
    return;
  }
  const hasYear = (DB.payslips || []).some((p) => (p.month || '').startsWith(`${year}-`));
  if (!hasYear) {
    try {
      const data = await Api.payslips();
      DB.payslips = data.payslips || [];
    } catch (_) { /* keep cached */ }
  }
}

async function setPayrollOverviewMode(mode) {
  payrollOverviewMode = mode === 'yearly' ? 'yearly' : 'monthly';
  await ensurePayrollOverviewData();
  renderPayrollSummary();
}

async function setPayrollOverviewMonth(month) {
  if (!month) return;
  payrollOverviewMonth = month;
  const payslipMonth = document.getElementById('hr-payslip-month');
  if (payslipMonth) payslipMonth.value = month;
  await ensurePayrollOverviewData();
  renderPayrollSummary();
  if (window.LOOPLINE_PAGE === 'hr_payroll') await loadHRPayslips();
}

async function setPayrollOverviewYear(year) {
  if (!year) return;
  payrollOverviewYear = String(year);
  await ensurePayrollOverviewData();
  renderPayrollSummary();
}

function renderPayrollSummary() {
  const el = document.getElementById('hr-payroll-summary');
  if (!el) return;
  const period = payrollOverviewPeriod();
  const p = payrollSummaryFromPayslips();
  const periodLabel = period.mode === 'monthly' ? monthLabel(period.month) : period.year;
  const periodSub = period.mode === 'monthly'
    ? `Published payslips — ${periodLabel}`
    : `Published payslips — year ${period.year}`;

  el.innerHTML = `
    <div class="payroll-overview-toolbar">
      <div class="payroll-period-tabs">
        <button type="button" class="payroll-period-tab${period.mode === 'monthly' ? ' active' : ''}" onclick="setPayrollOverviewMode('monthly')">Monthly</button>
        <button type="button" class="payroll-period-tab${period.mode === 'yearly' ? ' active' : ''}" onclick="setPayrollOverviewMode('yearly')">Yearly</button>
      </div>
      <div class="payroll-period-pickers">
        ${period.mode === 'monthly'
          ? `<label class="payroll-picker-label">Month<input type="month" class="month-select" value="${period.month}" onchange="setPayrollOverviewMonth(this.value)"></label>`
          : `<label class="payroll-picker-label">Year<input type="number" class="month-select payroll-year-input" min="2020" max="2099" value="${period.year}" onchange="setPayrollOverviewYear(this.value)"></label>`
        }
      </div>
    </div>
    <div class="grid grid-4" style="margin-top:14px;">
      <div class="card stat-card acc-navy"><div class="stat-label">Employees paid</div><div class="stat-value">${p.staffCount}</div><div class="stat-sub">${p.payslipCount} payslip(s) · ${periodSub}</div></div>
      <div class="card stat-card"><div class="stat-label">Total base salary</div><div class="stat-value">${money(p.base)}</div><div class="stat-sub">Base component</div></div>
      <div class="card stat-card acc-accent"><div class="stat-label">Incentives & allowances</div><div class="stat-value">${money(p.incentives + p.allowances)}</div><div class="stat-sub">Bonus + allowance</div></div>
      <div class="card stat-card acc-teal"><div class="stat-label">Net payroll</div><div class="stat-value">${money(p.total)}</div><div class="stat-sub">After ${money(p.deductions)} deductions</div></div>
    </div>
    ${p.payslipCount ? '' : `<p class="payroll-overview-empty">No published payslips for ${periodLabel}. Issue and publish payslips below.</p>`}`;
}

function autoCalcClientPending() {
  const amount = Number(document.getElementById('cl-amount')?.value) || 0;
  const paid = Number(document.getElementById('cl-paid')?.value) || 0;
  const holding = Number(document.getElementById('cl-holding')?.value) || 0;
  const pendingEl = document.getElementById('cl-pendingamt');
  if (pendingEl && amount > 0) pendingEl.value = Math.max(0, amount - paid - holding);
}

function wireRevenueFormHelpers() {
  ['cl-amount', 'cl-paid', 'cl-holding'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.pendingWired) {
      el.dataset.pendingWired = '1';
      el.addEventListener('input', autoCalcClientPending);
    }
  });
  ['revenue-password', 'tl-password'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.enterWired) {
      el.dataset.enterWired = '1';
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (id === 'revenue-password') unlockSection('revenue');
          else unlockSection('tl');
        }
      });
    }
  });
}

function renderHROverview() {
  ensurePayrollOverviewData().then(() => renderPayrollSummary());
  renderBirthdayWidget('hr-birthdays');
  renderStatusBoard('hr-status-board');
  renderHRPendingLeaves();
}

function renderHRPendingLeaves() {
  const el = document.getElementById('hr-pending-leaves');
  if (!el) return;
  const pending = DB.leaves.filter((l) => l.status === 'Pending').slice(0, 5);
  if (!pending.length) {
    el.innerHTML = '<div style="color:var(--ink-soft);font-size:13px;">No pending leave requests.</div>';
    return;
  }
  el.innerHTML = pending.map((l) => {
    const emp = DB.employees.find((e) => e.id === l.empId);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px;">
      <span><strong>${emp ? escapeHtml(emp.name) : '—'}</strong> · ${l.from} → ${l.to}</span>
      <a href="/pages/hr/leaves.html" style="font-size:12px;color:var(--teal);font-weight:600;">Review →</a>
    </div>`;
  }).join('');
}

function renderHREmployees() {
  const body = document.getElementById('hr-roster-body');
  if (!body) return;
  body.innerHTML = DB.employees.length ? '' : '<tr class="empty-row"><td colspan="7">No employees yet.</td></tr>';
  DB.employees.forEach((emp) => {
    const isActive = emp.active !== false;
    const tr = document.createElement('tr');
    if (!isActive) tr.classList.add('emp-inactive-row');
    tr.innerHTML = `<td><strong>${escapeHtml(emp.name)}</strong><div style="font-size:11.5px;color:var(--ink-soft);">${emp.email || ''}</div></td>
      <td>${emp.role}</td>
      <td>${emp.tlName || '—'}</td>
      <td>${escapeHtml(emp.department || '—')}</td>
      <td><input type="date" value="${emp.birthday || ''}" style="padding:6px;border:1px solid var(--line);border-radius:6px;" onchange="setBirthday('${emp.id}', this.value)"${isActive ? '' : ' disabled'}></td>
      <td><span class="badge ${isActive ? 'badge-approved' : 'badge-rejected'}">${isActive ? 'Active' : 'Deactivated'}</span></td>
      <td class="emp-actions">${
        ['CEO', 'Partner', 'HR'].includes(emp.role)
          ? '—'
          : isActive
            ? `<button type="button" class="subtle-btn" onclick="toggleEmployeeActive('${emp.id}', false)">Deactivate</button>
               <button type="button" class="subtle-btn danger-text" onclick="removeEmployee('${emp.id}')">Remove</button>`
            : `<button type="button" class="subtle-btn" onclick="toggleEmployeeActive('${emp.id}', true)">Reactivate</button>
               <button type="button" class="subtle-btn danger-text" onclick="removeEmployee('${emp.id}')">Remove</button>`
      }</td>`;
    body.appendChild(tr);
  });
}

function renderPartners() {
  const body = document.getElementById('partner-roster-body');
  if (!body) return;
  const partners = (DB.employees || []).filter((e) => e.role === 'Partner');
  body.innerHTML = partners.length ? '' : '<tr class="empty-row"><td colspan="5">No partners yet. Create one above.</td></tr>';
  partners.forEach((emp) => {
    const isActive = emp.active !== false;
    const tr = document.createElement('tr');
    if (!isActive) tr.classList.add('emp-inactive-row');
    tr.innerHTML = `<td><strong>${escapeHtml(emp.name)}</strong></td>
      <td>${escapeHtml(emp.email || '—')}</td>
      <td>${escapeHtml(emp.department || '—')}</td>
      <td><span class="badge ${isActive ? 'badge-approved' : 'badge-rejected'}">${isActive ? 'Active' : 'Deactivated'}</span></td>
      <td class="emp-actions">${
        isActive
          ? `<button type="button" class="subtle-btn" onclick="togglePartnerActive('${emp.id}', false)">Deactivate</button>
             <button type="button" class="subtle-btn" onclick="resetPartnerPassword('${emp.id}')">Reset password</button>`
          : `<button type="button" class="subtle-btn" onclick="togglePartnerActive('${emp.id}', true)">Activate</button>
             <button type="button" class="subtle-btn" onclick="resetPartnerPassword('${emp.id}')">Reset password</button>`
      }</td>`;
    body.appendChild(tr);
  });
}

async function addPartner() {
  if (!currentUser || currentUser.role !== 'CEO') {
    alert('Only the CEO can add partners.');
    return;
  }
  const nameEl = document.getElementById('partner-new-name');
  const emailEl = document.getElementById('partner-new-email');
  const passEl = document.getElementById('partner-new-password');
  if (!nameEl || !emailEl || !passEl) {
    alert('Open Partners from the sidebar to add a partner.');
    showPage('partners');
    return;
  }
  const name = (nameEl.value || '').trim();
  const email = (emailEl.value || '').trim();
  const password = passEl.value || '';
  const dept = (document.getElementById('partner-new-dept')?.value || '').trim();
  const errEl = document.getElementById('partner-add-error');
  const btn = document.getElementById('partner-add-btn');
  if (errEl) {
    errEl.style.color = 'var(--danger)';
    errEl.textContent = '';
  }
  if (!name || !email || !password) {
    if (errEl) errEl.textContent = 'Name, email and password are required.';
    return;
  }
  const confirmed = confirm(
    `Are you sure you want to create this partner?\n\n` +
      `Name: ${name}\n` +
      `Email: ${email}\n\n` +
      `All profit and revenue details can be seen by this partner.`
  );
  if (!confirmed) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating…';
  }
  try {
    await Api.createPartner({ name, email, password, department: dept });
    ['partner-new-name', 'partner-new-email', 'partner-new-password'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const deptEl = document.getElementById('partner-new-dept');
    if (deptEl) deptEl.value = 'Partnership';
    if (errEl) {
      errEl.style.color = 'var(--teal)';
      errEl.textContent = `Partner account created for ${name}. They can sign in with ${email}.`;
    }
    flashToast(`Partner created: ${name}`, 'success');
    await refreshAllData();
    renderAll();
  } catch (e) {
    if (errEl) {
      errEl.style.color = 'var(--danger)';
      errEl.textContent = e.message;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Create partner';
    }
  }
}

async function resetPartnerPassword(empId) {
  if (!currentUser || currentUser.role !== 'CEO') return;
  const password = prompt('Enter a new password for this partner (min 6 characters):');
  if (password == null) return;
  if (password.trim().length < 6) {
    alert('Password must be at least 6 characters.');
    return;
  }
  try {
    await Api.resetPartnerPassword(empId, password.trim());
    flashToast('Partner password reset', 'success');
    await refreshAllData();
    renderAll();
  } catch (e) {
    alert(e.message);
  }
}

async function togglePartnerActive(empId, active) {
  if (!currentUser || currentUser.role !== 'CEO') return;
  const emp = (DB.employees || []).find((e) => e.id === empId);
  const label = emp?.name || 'this partner';
  const msg = active
    ? `Activate ${label}? They will be able to sign in again.`
    : `Deactivate ${label}? They will be signed out and cannot log in until activated again.`;
  if (!confirm(msg)) return;
  try {
    await Api.setPartnerActive(empId, active);
    flashToast(active ? 'Partner activated' : 'Partner deactivated', 'success');
    await refreshAllData();
    renderAll();
  } catch (e) {
    alert(e.message);
  }
}

function renderHRAttendance() {
  renderStatusBoard('hr-status-board');
  renderActivityLog();
  renderHolidayManagement();
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function renderHolidayManagement() {
  const panel = document.getElementById('hr-holiday-panel');
  if (!panel) return;

  const monthEl = document.getElementById('hr-holiday-month');
  const month = holidayConfigMonth || monthEl?.value || monthStr();
  holidayConfigMonth = month;
  if (monthEl) monthEl.value = month;

  await loadHolidayConfig(month.slice(0, 4));

  const monthLabelEl = document.getElementById('hr-holiday-month-label');
  if (monthLabelEl) monthLabelEl.textContent = monthLabel(month);

  const countEl = document.getElementById('hr-holiday-count');
  const monthHolidays = holidaysForMonth(month);
  if (countEl) countEl.textContent = monthHolidays.length;

  const weekendEl = document.getElementById('hr-weekend-days');
  if (weekendEl) {
    weekendEl.innerHTML = WEEKDAY_LABELS.map(
      (label, i) =>
        `<label class="weekend-day-chip${WEEKEND_DAYS.includes(i) ? ' active' : ''}">
          <input type="checkbox" value="${i}" ${WEEKEND_DAYS.includes(i) ? 'checked' : ''} onchange="saveWeekendDays()">
          <span>${label}</span>
        </label>`
    ).join('');
  }

  const dateEl = document.getElementById('hr-holiday-date');
  const bounds = monthDayBounds(month);
  if (dateEl) {
    dateEl.min = bounds.min;
    dateEl.max = bounds.max;
    if (dateEl.value && (dateEl.value < bounds.min || dateEl.value > bounds.max)) {
      dateEl.value = '';
    }
  }

  const listEl = document.getElementById('hr-holidays-list');
  if (listEl) {
    listEl.innerHTML = monthHolidays.length
      ? monthHolidays.map(
          (h) =>
            `<tr>
              <td><strong>${escapeHtml(formatShortDate(h.date))}</strong><div class="holiday-iso">${escapeHtml(h.date)}</div></td>
              <td>${escapeHtml(h.name || '—')}</td>
              <td class="holiday-action"><button type="button" class="subtle-btn danger-text" onclick="removeHoliday('${h.id}')">Remove</button></td>
            </tr>`
        ).join('')
      : '<tr class="empty-row"><td colspan="3">No holidays set for this month.</td></tr>';
  }
}

async function changeHolidayMonth(month) {
  if (!month) return;
  holidayConfigMonth = month;
  await renderHolidayManagement();
  if (window.LOOPLINE_PAGE === 'my_attendance' || window.LOOPLINE_PAGE === 'dashboard') {
    renderMyAttendance();
  }
}

async function addHolidayEntry() {
  const dateEl = document.getElementById('hr-holiday-date');
  const nameEl = document.getElementById('hr-holiday-name');
  const date = dateEl?.value;
  const name = (nameEl?.value || '').trim();
  if (!date) {
    alert('Pick a holiday date.');
    return;
  }
  const month = holidayConfigMonth || monthStr();
  if (!date.startsWith(month + '-')) {
    alert(`Pick a date within ${monthLabel(month)}.`);
    return;
  }
  try {
    await Api.addHoliday({ date, name });
    if (nameEl) nameEl.value = '';
    if (dateEl) dateEl.value = '';
    await loadHolidayConfig(month.slice(0, 4));
    await renderHolidayManagement();
    renderMyAttendance();
  } catch (e) {
    alert(e.message);
  }
}

async function removeHoliday(id) {
  if (!confirm('Remove this holiday?')) return;
  try {
    await Api.deleteHoliday(id);
    const month = holidayConfigMonth || monthStr();
    await loadHolidayConfig(month.slice(0, 4));
    await renderHolidayManagement();
    renderMyAttendance();
  } catch (e) {
    alert(e.message);
  }
}

async function saveWeekendDays() {
  const checked = [...document.querySelectorAll('#hr-weekend-days input:checked')].map((el) => Number(el.value));
  if (!checked.length) {
    alert('Select at least one weekend day.');
    await renderHolidayManagement();
    return;
  }
  try {
    const data = await Api.setWeekendDays(checked);
    setHolidayConfig(DB.holidays, data.weekendDays);
    await renderHolidayManagement();
    renderMyAttendance();
  } catch (e) {
    alert(e.message);
    await renderHolidayManagement();
  }
}

function renderHRLeaves() {
  const pending = DB.leaves.filter((l) => l.status === 'Pending').length;
  const approved = DB.leaves.filter((l) => l.status === 'Approved' && l.from.startsWith(monthStr())).length;
  const total = DB.leaves.length;
  const statP = document.getElementById('leave-stat-pending');
  const statA = document.getElementById('leave-stat-approved');
  const statT = document.getElementById('leave-stat-total');
  if (statP) statP.textContent = pending;
  if (statA) statA.textContent = approved;
  if (statT) statT.textContent = total;

  const lb = document.getElementById('hr-leaves-body');
  if (!lb) return;
  const sorted = DB.leaves.slice().sort((a, b) => b.from.localeCompare(a.from));
  lb.innerHTML = sorted.length ? '' : '<tr class="empty-row"><td colspan="7">No leave requests.</td></tr>';
  sorted.forEach((l) => {
    const emp = DB.employees.find((e) => e.id === l.empId);
    const days = daysBetweenInclusive(l.from, l.to);
    const roleNote = leaveApplicantRole(l) === 'Manager' ? ' <span class="leave-hr-only">Manager</span>' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${emp ? escapeHtml(emp.name) : escapeHtml(l.empName || '—')}${roleNote}</td>
      <td>${l.from} → ${l.to}</td>
      <td>${days}</td>
      <td>${escapeHtml(l.reason || '—')}</td>
      <td>${statusBadge2(l.status)}</td>
      <td>${leaveReviewedByHtml(l)}</td>
      <td class="leave-actions">${leaveActionButtons(l)}</td>`;
    lb.appendChild(tr);
  });
}

function renderHRPayroll() {
  ensurePayrollOverviewData().then(() => renderPayrollSummary());
  renderHRPayslips();
}

async function loadHRPayslips() {
  const monthEl = document.getElementById('hr-payslip-month');
  const month = monthEl?.value || payrollOverviewMonth || monthStr();
  if (monthEl) monthEl.value = month;
  try {
    const data = await Api.payslips({ month });
    const incoming = data.payslips || [];
    const rest = (DB.payslips || []).filter((p) => p.month !== month);
    DB.payslips = rest.concat(incoming);
  } catch (_) { /* keep cached */ }
  renderHRPayslips();
}

function renderHRPayslips() {
  const monthEl = document.getElementById('hr-payslip-month');
  const tbody = document.getElementById('hr-payslips-body');
  if (!tbody) return;
  const month = monthEl?.value || monthStr();
  if (monthEl && !monthEl.value) monthEl.value = month;

  const staff = DB.employees.filter((e) => ['Employee', 'Manager', 'Sales', 'TL'].includes(e.role) && e.active !== false);
  const monthSlips = (DB.payslips || []).filter((p) => p.month === month);

  if (!staff.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="11">No payroll staff.</td></tr>';
    return;
  }

  tbody.innerHTML = staff.map((emp) => {
    const slip = monthSlips.find((p) => p.empId === emp.id);
    if (!slip) {
      return `<tr>
        <td><strong>${escapeHtml(emp.name)}</strong><div style="font-size:11px;color:var(--ink-soft);">${emp.role}</div></td>
        <td colspan="8" style="color:var(--ink-soft);">Not created</td>
        <td><span class="badge badge-pending">Missing</span></td>
        <td><button type="button" class="subtle-btn" onclick="openHRPayslipForm('${emp.id}')">Create</button></td>
      </tr>`;
    }
    const statusCls = slip.status === 'Published' ? 'badge-approved' : 'badge-pending';
    const actions = slip.status === 'Published'
      ? `<button type="button" class="subtle-btn" onclick="viewPayslip('${slip.id}')">View</button>
         <button type="button" class="subtle-btn" onclick="editPublishedPayslip('${slip.id}', '${emp.id}')">Edit</button>`
      : `<button type="button" class="subtle-btn" onclick="openHRPayslipForm('${emp.id}', '${slip.id}')">Edit</button>
         <button type="button" class="subtle-btn" onclick="publishPayslipById('${slip.id}')">Publish</button>
         <button type="button" class="subtle-btn" onclick="deletePayslipById('${slip.id}')">Delete</button>`;
    return `<tr>
      <td><strong>${escapeHtml(emp.name)}</strong></td>
      <td>${money(slip.baseSalary)}</td>
      <td>${money(slip.incentive)}</td>
      <td>${money(slip.allowance)}</td>
      <td>${money(slip.deduction)}</td>
      <td>${slip.workingDays ?? '—'}</td>
      <td>${slip.paidDays ?? '—'}</td>
      <td>${slip.lopDays ?? 0}</td>
      <td><strong>${money(slip.netPay)}</strong></td>
      <td><span class="badge ${statusCls}">${slip.status}</span></td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

function updateHRPayslipPreview() {
  const el = document.getElementById('hr-ps-net-preview');
  if (!el) return;
  const net = payslipNetPreview(
    document.getElementById('hr-ps-base')?.value,
    document.getElementById('hr-ps-incentive')?.value,
    document.getElementById('hr-ps-allowance')?.value,
    document.getElementById('hr-ps-deduction')?.value
  );
  el.textContent = 'Net pay: ' + money(net);
}

function openHRPayslipForm(empId, slipId) {
  const emp = DB.employees.find((e) => e.id === empId);
  if (!emp) return;
  const monthEl = document.getElementById('hr-payslip-month');
  const month = monthEl?.value || monthStr();
  const slip = slipId
    ? (DB.payslips || []).find((p) => p.id === slipId)
    : (DB.payslips || []).find((p) => p.empId === empId && p.month === month);

  document.getElementById('hr-ps-emp-id').value = empId;
  document.getElementById('hr-ps-slip-id').value = slip?.id || '';
  document.getElementById('hr-ps-month').value = month;
  document.getElementById('hr-ps-emp-name').value = emp.name;
  document.getElementById('hr-ps-month-label').value = monthLabel(month);
  document.getElementById('hr-ps-base').value = slip?.baseSalary ?? emp.baseSalary ?? 0;
  document.getElementById('hr-ps-incentive').value = slip?.incentive ?? 0;
  document.getElementById('hr-ps-allowance').value = slip?.allowance ?? 0;
  document.getElementById('hr-ps-deduction').value = slip?.deduction ?? 0;
  document.getElementById('hr-ps-working-days').value = slip?.workingDays ?? '';
  document.getElementById('hr-ps-paid-days').value = slip?.paidDays ?? '';
  document.getElementById('hr-ps-lop-days').value = slip?.lopDays ?? 0;
  document.getElementById('hr-ps-score').value = slip?.performanceScore ?? emp.performanceScore ?? '';
  document.getElementById('hr-ps-notes').value = slip?.notes || '';
  document.getElementById('hr-payslip-form-title').textContent =
    (slip ? 'Edit' : 'Create') + ' payslip — ' + emp.name;

  ['hr-ps-base', 'hr-ps-incentive', 'hr-ps-allowance', 'hr-ps-deduction'].forEach((id) => {
    const input = document.getElementById(id);
    if (input && !input.dataset.previewWired) {
      input.dataset.previewWired = '1';
      input.addEventListener('input', updateHRPayslipPreview);
    }
  });
  updateHRPayslipPreview();
  document.getElementById('hr-payslip-modal').style.display = 'flex';
}

function closeHRPayslipForm() {
  const modal = document.getElementById('hr-payslip-modal');
  if (modal) modal.style.display = 'none';
}

async function saveHRPayslip(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const publish = submitter?.value === 'publish';
  const body = {
    empId: document.getElementById('hr-ps-emp-id').value,
    month: document.getElementById('hr-ps-month').value,
    baseSalary: Number(document.getElementById('hr-ps-base').value) || 0,
    incentive: Number(document.getElementById('hr-ps-incentive').value) || 0,
    allowance: Number(document.getElementById('hr-ps-allowance').value) || 0,
    deduction: Number(document.getElementById('hr-ps-deduction').value) || 0,
    workingDays: document.getElementById('hr-ps-working-days').value
      ? Number(document.getElementById('hr-ps-working-days').value) : null,
    paidDays: document.getElementById('hr-ps-paid-days').value
      ? Number(document.getElementById('hr-ps-paid-days').value) : null,
    lopDays: Number(document.getElementById('hr-ps-lop-days').value) || 0,
    performanceScore: document.getElementById('hr-ps-score').value
      ? Number(document.getElementById('hr-ps-score').value) : null,
    notes: document.getElementById('hr-ps-notes').value.trim(),
  };
  try {
    const slip = await Api.savePayslip(body);
    if (publish) await Api.publishPayslip(slip.id);
    closeHRPayslipForm();
    await loadHRPayslips();
    flashToast(publish ? 'Payslip published' : 'Payslip saved as draft', 'success');
  } catch (e) { alert(e.message); }
}

async function publishPayslipById(id) {
  if (!confirm('Publish this payslip? The employee will be able to view and download it.')) return;
  try {
    await Api.publishPayslip(id);
    await loadHRPayslips();
    flashToast('Payslip published', 'success');
  } catch (e) { alert(e.message); }
}

async function editPublishedPayslip(id, empId) {
  if (!confirm('Revert to draft to edit this payslip?')) return;
  try {
    await Api.updatePayslip(id, { status: 'Draft' });
    await loadHRPayslips();
    openHRPayslipForm(empId, id);
  } catch (e) { alert(e.message); }
}

async function unpublishPayslip(id) {
  if (!confirm('Revert to draft so you can edit this payslip?')) return;
  try {
    await Api.updatePayslip(id, { status: 'Draft' });
    await loadHRPayslips();
    flashToast('Payslip reverted to draft', 'success');
  } catch (e) { alert(e.message); }
}

async function deletePayslipById(id) {
  if (!confirm('Delete this draft payslip?')) return;
  try {
    await Api.deletePayslip(id);
    await loadHRPayslips();
    flashToast('Payslip deleted', 'success');
  } catch (e) { alert(e.message); }
}

function renderHR() {
  renderHROverview();
  renderHREmployees();
  renderHRAttendance();
  renderHRLeaves();
  renderHRPayroll();
}

async function setSalary(id, val) {
  try {
    await Api.setSalary(id, Number(val) || 0);
    await refreshAllData();
    renderAll();
    flashToast('Salary updated', 'success');
  } catch (e) { alert(e.message); }
}
async function giveIncentive(id) {
  const amt = prompt('Incentive amount to add:');
  if (amt === null || isNaN(Number(amt)) || Number(amt) === 0) return;
  try {
    await Api.giveIncentive(id, Number(amt));
    await refreshAllData();
    renderAll();
    flashToast(`Incentive of ${money(Number(amt))} added`, 'success');
  } catch (e) { alert(e.message); }
}
async function setBirthday(id, val) {
  try { await Api.setBirthday(id, val || null); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}
async function setScore(id) {
  const score = prompt('Performance score (0-100):');
  if (score === null || isNaN(Number(score))) return;
  try { await Api.setScore(id, Number(score)); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}
async function removeEmployee(id) {
  if (!confirm('Remove this team member permanently?')) return;
  try { await Api.removeEmployee(id); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}
async function toggleEmployeeActive(id, active) {
  const emp = (DB.employees || []).find((e) => e.id === id);
  const label = emp?.name || 'this employee';
  const msg = active
    ? `Reactivate ${label}? They will be able to sign in again.`
    : `Deactivate ${label}? They will be signed out and cannot log in until reactivated.`;
  if (!confirm(msg)) return;
  try {
    await Api.setEmployeeActive(id, active);
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}
async function addEmployee() {
  const nameEl = document.getElementById('hr-new-name');
  const emailEl = document.getElementById('hr-new-email');
  const passEl = document.getElementById('hr-new-password');
  const roleEl = document.getElementById('hr-new-role');
  if (!nameEl || !emailEl || !passEl || !roleEl) {
    alert('Open the Employees page from the sidebar to add team members.');
    showPage('hr_employees');
    return;
  }
  const name = (nameEl.value || '').trim();
  const email = (emailEl.value || '').trim();
  const password = passEl.value || '';
  const role = roleEl.value;
  const dept = (document.getElementById('hr-new-dept')?.value || '').trim();
  const birthday = document.getElementById('hr-new-birthday')?.value || null;
  const errEl = document.getElementById('hr-add-error');
  const btn = document.getElementById('hr-add-btn');
  if (errEl) errEl.textContent = '';
  if (!name || !email || !password) {
    const msg = 'Name, email and password are required.';
    if (errEl) errEl.textContent = msg;
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating…';
  }
  try {
    await Api.createEmployee({ name, email, password, role, department: dept, birthday });
    ['hr-new-name', 'hr-new-email', 'hr-new-password', 'hr-new-dept', 'hr-new-birthday'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (errEl) {
      errEl.style.color = 'var(--teal)';
      errEl.textContent = `Account created for ${name}. They can sign in with ${email}.`;
    }
    flashToast(`Account created for ${name}`, 'success');
    await refreshAllData();
    renderAll();
  } catch (e) {
    if (errEl) {
      errEl.style.color = 'var(--danger)';
      errEl.textContent = e.message;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Create account';
    }
  }
}
async function assignTeamMember(empId, tlId) {
  try {
    await Api.assignTeam(empId, tlId || null);
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}
function renderManagerTeams() {
  const body = document.getElementById('manager-teams-body');
  if (!body) return;
  const members = assignableTeamMembers();
  const tls = teamLeads();
  body.innerHTML = members.length
    ? ''
    : '<tr class="empty-row"><td colspan="4">No employees or sales staff yet — ask HR to add team members.</td></tr>';
  members.forEach((emp) => {
    const options = ['<option value="">— Unassigned —</option>']
      .concat(
        tls.map(
          (tl) =>
            `<option value="${tl.id}" ${emp.tlId === tl.id ? 'selected' : ''}>${escapeHtml(tl.name)}</option>`
        )
      )
      .join('');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${escapeHtml(emp.name)}</strong></td>
      <td>${emp.role}</td>
      <td>${escapeHtml(emp.department || '—')}</td>
      <td><select onchange="assignTeamMember('${emp.id}', this.value)">${options}</select></td>`;
    body.appendChild(tr);
  });
}

function renderManagerOverview() {
  renderStatusBoard('manager-status-board');
  const body = document.getElementById('manager-leave-body');
  if (!body) return;
  const teamIds = new Set((teamMembersForView() || []).map((e) => e.id));
  const pending = (DB.leaves || []).filter(
    (l) => l.status === 'Pending' && teamIds.has(l.empId) && leaveApplicantRole(l) !== 'Manager'
  );
  body.innerHTML = pending.length
    ? ''
    : '<tr class="empty-row"><td colspan="5">No pending leave requests for your team.</td></tr>';
  pending.forEach((l) => {
    const emp = DB.employees.find((e) => e.id === l.empId);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${emp ? escapeHtml(emp.name) : '—'}</td>
      <td>${l.from} → ${l.to}</td>
      <td>${daysBetweenInclusive(l.from, l.to)}</td>
      <td>${escapeHtml(l.reason || '—')}</td>
      <td class="leave-actions">${leaveActionButtons(l)}</td>`;
    body.appendChild(tr);
  });
}

async function setLeaveStatus(id, status) {
  try { await Api.setLeaveStatus(id, status); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}

/* ---------------- TL ---------------- */
function populateAssigneeSelect() {
  const sel = document.getElementById('task-assignee');
  if (!sel) return;
  const team = teamMembersForView().filter((e) => ['Employee', 'Sales'].includes(e.role));
  const selfOption = `<option value="${currentUser.id}">${escapeHtml(currentUser.name)} (Me)</option>`;
  const teamOptions = team.map((e) => `<option value="${e.id}">${escapeHtml(e.name)} (${e.role})</option>`).join('');
  sel.innerHTML = team.length
    ? selfOption + teamOptions
    : selfOption;
}
function populateAttendanceSelect() {
  const sel = document.getElementById('tl-attendance-emp');
  if (!sel) return;
  const team = teamMembersForView().filter((e) => e.role !== 'Freelancer');
  sel.innerHTML = team.length
    ? team.map((e) => `<option value="${e.id}">${escapeHtml(e.name)} (${e.role})</option>`).join('')
    : '<option value="">No team members</option>';
}

async function assignTask() {
  const title = document.getElementById('task-title').value.trim();
  const assignedTo = document.getElementById('task-assignee').value;
  const startDate = document.getElementById('task-start-date').value;
  const startTime = document.getElementById('task-start-time').value;
  const endDate = document.getElementById('task-end-date').value;
  const endTime = document.getElementById('task-end-time').value;
  const desc = document.getElementById('task-desc').value.trim();
  if (!title || !assignedTo || !endDate) { alert('Task title, assignee and deadline date are required.'); return; }
  try {
    await Api.createTask({ title, assignedTo, startDate, startTime, endDate, endTime, desc });
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}

async function createMyTask() {
  if (!currentUser) return;
  const titleEl = document.getElementById('my-task-title');
  const endEl = document.getElementById('my-task-end-date');
  if (!titleEl || !endEl) {
    alert('Open My Tasks from the sidebar to add a task.');
    showPage('my_tasks');
    return;
  }
  const title = (titleEl.value || '').trim();
  const startDate = document.getElementById('my-task-start-date')?.value || '';
  const startTime = document.getElementById('my-task-start-time')?.value || '';
  const endDate = endEl.value || '';
  const endTime = document.getElementById('my-task-end-time')?.value || '';
  const desc = (document.getElementById('my-task-desc')?.value || '').trim();
  const errEl = document.getElementById('my-task-add-error');
  const btn = document.getElementById('my-task-add-btn');
  if (errEl) {
    errEl.style.color = 'var(--danger)';
    errEl.textContent = '';
  }
  if (!title || !endDate) {
    if (errEl) errEl.textContent = 'Task title and deadline date are required.';
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding…';
  }
  try {
    await Api.createTask({
      title,
      assignedTo: currentUser.id,
      startDate,
      startTime,
      endDate,
      endTime,
      desc,
    });
    ['my-task-title', 'my-task-start-date', 'my-task-start-time', 'my-task-end-date', 'my-task-end-time', 'my-task-desc'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    closeMyTaskModal();
    flashToast('Task added', 'success');
    await refreshAllData();
    renderAll();
  } catch (e) {
    if (errEl) {
      errEl.style.color = 'var(--danger)';
      errEl.textContent = e.message;
    } else {
      alert(e.message);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Add task';
    }
  }
}

function openMyTaskModal() {
  const modal = document.getElementById('my-task-modal');
  if (!modal) {
    showPage('my_tasks');
    return;
  }
  const errEl = document.getElementById('my-task-add-error');
  if (errEl) errEl.textContent = '';
  modal.style.display = 'flex';
  document.getElementById('my-task-title')?.focus();
}

function closeMyTaskModal() {
  const modal = document.getElementById('my-task-modal');
  if (modal) modal.style.display = 'none';
}

function renderTL() {
  renderBirthdayWidget('tl-birthdays');
  renderMyComplaints();
  renderStatusBoard('tl-status-board');
  renderClientAccounts();
  populateAssigneeSelect();
  populateAttendanceSelect();
  populateTaskStatusFilter('tl-status-filter');
  const filter = document.getElementById('tl-status-filter') ? document.getElementById('tl-status-filter').value : '';
  const body = document.getElementById('tl-tasks-body');
  if (!body) return;
  let list = DB.tasks
    .filter((t) => t.assignedTo !== currentUser.id)
    .slice()
    .sort((a, b) =>
    ((a.endDate || '') + (a.endTime || '')).localeCompare((b.endDate || '') + (b.endTime || ''))
  );
  if (filter) list = list.filter((t) => t.status === filter);
  body.innerHTML = list.length ? '' : '<tr class="empty-row"><td colspan="7">No tasks match.</td></tr>';
  list.forEach((t) => {
    const emp = DB.employees.find((e) => e.id === t.assignedTo);
    const pct = t.progress ?? 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${escapeHtml(t.title)}</strong></td>
      <td>${emp ? escapeHtml(emp.name) : '—'}</td>
      <td>${t.startDate || '—'} ${t.startTime || ''}</td>
      <td>${t.endDate || '—'} ${t.endTime || ''}</td>
      <td>${statusBadge(t.status)}</td>
      <td>
        <div class="task-progress-wrap">
          <div class="task-progress-bar"><div class="task-progress-fill" style="width:${pct}%"></div></div>
          <span class="task-progress-pct">${pct}%</span>
        </div>
      </td>
      <td><button class="subtle-btn" onclick="removeTask('${t.id}')">Delete</button></td>`;
    body.appendChild(tr);
  });
}

async function removeTask(id) {
  if (!confirm('Delete this task?')) return;
  try { await Api.deleteTask(id); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}

async function manualAttendance(action, breakType) {
  const sel = document.getElementById('tl-attendance-emp');
  if (!sel || !sel.value) return;
  try {
    await Api.manualAttendance({ empId: sel.value, action, breakType: breakType || null });
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}

/* ---------------- REVENUE ---------------- */
function populateMonthPickers() {
  const months = new Set(DB.clients.map((c) => c.month));
  (DB.expenses || []).forEach((e) => months.add(e.month));
  months.add(monthStr());
  const sorted = Array.from(months).sort().reverse();
  const sel = document.getElementById('revenue-month');
  if (sel) {
    const cur = sel.value || monthStr();
    sel.innerHTML = sorted.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join('');
    sel.value = sorted.includes(cur) ? cur : monthStr();
  }
  const clMonth = document.getElementById('cl-month');
  if (clMonth && !clMonth.value) clMonth.value = monthStr();
  const expMonth = document.getElementById('exp-month');
  if (expMonth && !expMonth.value) expMonth.value = monthStr();
}

async function addClientEntry() {
  const name = document.getElementById('cl-name').value.trim();
  const businessName = document.getElementById('cl-business').value.trim();
  const checked = Array.from(document.querySelectorAll('#cl-services input[type=checkbox]:checked')).map((cb) => cb.value);
  const otherVal = document.getElementById('cl-service-other').value.trim();
  const services = checked.filter((s) => s !== 'Other');
  if (checked.includes('Other') && otherVal) services.push(otherVal);
  autoCalcClientPending();
  const body = {
    name,
    businessName,
    services,
    amount: Number(document.getElementById('cl-amount').value) || 0,
    paid: Number(document.getElementById('cl-paid').value) || 0,
    pending: Number(document.getElementById('cl-pendingamt').value) || 0,
    holding: Number(document.getElementById('cl-holding').value) || 0,
    gst: Number(document.getElementById('cl-gst').value) || 0,
    tax: Number(document.getElementById('cl-tax').value) || 0,
    payStatus: document.getElementById('cl-paystatus').value,
    joiningDate: document.getElementById('cl-joining').value || null,
    month: document.getElementById('cl-month').value || monthStr(),
    meetingDate: document.getElementById('cl-meeting').value || null,
  };
  if (!name) { alert('Client name is required.'); return; }
  try {
    await Api.addClient(body);
    ['cl-name', 'cl-business', 'cl-amount', 'cl-paid', 'cl-pendingamt', 'cl-holding', 'cl-gst', 'cl-tax', 'cl-joining', 'cl-meeting', 'cl-service-other'].forEach(
      (id) => (document.getElementById(id).value = '')
    );
    document.querySelectorAll('#cl-services input[type=checkbox]').forEach((cb) => (cb.checked = false));
    await refreshAllData();
    renderAll();
    flashToast('Client billing entry added', 'success');
  } catch (e) { alert(e.message); }
}

async function removeClientEntry(id) {
  if (!confirm('Remove this billing entry?')) return;
  try { await Api.deleteClient(id); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}

async function addExpense() {
  const label = document.getElementById('exp-label').value.trim();
  const amount = Number(document.getElementById('exp-amount').value) || 0;
  const month = document.getElementById('exp-month').value || monthStr();
  if (!label) { alert('Expense label required.'); return; }
  try {
    await Api.addExpense({ label, amount, month });
    document.getElementById('exp-label').value = '';
    document.getElementById('exp-amount').value = '';
    await refreshAllData();
    renderAll();
    flashToast('Expense logged', 'success');
  } catch (e) { alert(e.message); }
}

async function addPayrollExpense() {
  const p = payrollSummary();
  if (!p.total) { alert('No payroll to log — set staff salaries first.'); return; }
  const month = document.getElementById('exp-month')?.value || monthStr();
  if (!confirm(`Add payroll expense of ${money(p.total)} for ${monthLabel(month)}?`)) return;
  try {
    await Api.addExpense({ label: 'Staff salaries & incentives', amount: p.total, month });
    await refreshAllData();
    renderAll();
    flashToast('Payroll added to expenses', 'success');
  } catch (e) { alert(e.message); }
}

async function removeExpense(id) {
  try { await Api.deleteExpense(id); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}

async function renderRevenue() {
  populateMonthPickers();
  wireRevenueFormHelpers();
  const month = document.getElementById('revenue-month') ? document.getElementById('revenue-month').value : monthStr();
  let summary;
  try {
    summary = await Api.revenueSummary(month);
  } catch (_) {
    return;
  }
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('rev-total', money(summary.totalBilled));
  set('rev-paid', money(summary.received));
  set('rev-pending', money(summary.pending));
  set('rev-holding', money(summary.holding));
  set('rev-gst', money(summary.gst));
  set('rev-tax', money(summary.tax));
  set('rev-exp', money(summary.expenses));
  set('rev-profit', money(summary.profit));
  set('rev-profit-2', money(summary.profit));

  const body = document.getElementById('rev-clients-body');
  if (body) {
    const clients = summary.clients || [];
    body.innerHTML = clients.length ? '' : '<tr class="empty-row"><td colspan="11">No billing entries for this month.</td></tr>';
    clients.forEach((c) => {
      const payClass = c.payStatus === 'Paid' ? 'badge-done' : c.payStatus === 'Hold' ? 'badge-holding' : 'badge-pending';
      const daysToMeeting = c.meetingDate ? daysBetweenInclusive(todayStr(), c.meetingDate) - 1 : null;
      const meetingSoon = c.meetingDate && c.meetingDate >= todayStr() && daysToMeeting <= 3;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.businessName || '—')}</td><td>${
        (c.services || []).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join('') || '—'
      }</td><td>${c.joiningDate || '—'}</td><td>${money(c.amount)}</td><td>${money(c.paid)}</td><td>${money(
        c.gst || 0
      )}</td><td>${money(c.tax || 0)}</td><td>${
        c.meetingDate
          ? `<span class="badge ${meetingSoon ? 'badge-holding' : 'badge-progress'}">${c.meetingDate}</span>`
          : '—'
      }</td><td><span class="badge ${payClass}">${c.payStatus || 'Pending'}</span></td>
        <td><button class="subtle-btn" onclick="removeClientEntry('${c.id}')">Delete</button></td>`;
      body.appendChild(tr);
    });
  }
  const expBody = document.getElementById('exp-body');
  if (expBody) {
    const expenses = summary.expenseList || [];
    expBody.innerHTML = expenses.length ? '' : '<tr class="empty-row"><td colspan="3">No expenses logged.</td></tr>';
    expenses.forEach((e) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(e.label)}</td><td>${money(e.amount)}</td><td><button class="subtle-btn" onclick="removeExpense('${e.id}')">✕</button></td>`;
      expBody.appendChild(tr);
    });
  }
  renderAlerts('revenue-alerts');
}

function upcomingMeetings() {
  const today = todayStr();
  return DB.clients
    .filter((c) => c.meetingDate && c.meetingDate >= today)
    .map((c) => ({ ...c, daysAway: daysBetweenInclusive(today, c.meetingDate) - 1 }))
    .filter((c) => c.daysAway <= 3)
    .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
}

function renderAlerts(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let html = '';
  const daysLeft = daysLeftInMonth();
  if (daysLeft <= 3) {
    html += `<div class="alert-banner warn">
      <div class="alert-icon">📅</div>
      <div>
        <div class="alert-title">Month-end report reminder</div>
        <div class="alert-body">${
          daysLeft === 0
            ? 'Today is the last day of the month.'
            : `Only ${daysLeft} day(s) left in ${monthLabel(monthStr())}.`
        } Review client billing, mark payments received, and log all expenses before it closes so this month's profit is accurate.</div>
      </div>
    </div>`;
  }
  const meetings = upcomingMeetings();
  if (meetings.length) {
    html += `<div class="alert-banner info">
      <div class="alert-icon">🗓️</div>
      <div>
        <div class="alert-title">Upcoming client meetings</div>
        <ul class="alert-list">
          ${meetings
            .map(
              (m) =>
                `<li><b>${escapeHtml(m.name)}</b>${
                  m.businessName ? ` (${escapeHtml(m.businessName)})` : ''
                } — ${m.daysAway === 0 ? 'today' : m.daysAway === 1 ? 'tomorrow' : `in ${m.daysAway} days`} · ${
                  m.meetingDate
                }</li>`
            )
            .join('')}
        </ul>
      </div>
    </div>`;
  }
  el.innerHTML = html;
}

function renderReports() {
  const byMonth = {};
  DB.clients.forEach((c) => {
    byMonth[c.month] = byMonth[c.month] || { clients: new Set(), billed: 0, paid: 0, pending: 0, holding: 0, gst: 0, tax: 0, expenses: 0 };
    byMonth[c.month].clients.add(c.name);
    byMonth[c.month].billed += c.amount || 0;
    byMonth[c.month].paid += c.paid || 0;
    byMonth[c.month].pending += c.pending || 0;
    byMonth[c.month].holding += c.holding || 0;
    byMonth[c.month].gst += c.gst || 0;
    byMonth[c.month].tax += c.tax || 0;
  });
  (DB.expenses || []).forEach((e) => {
    byMonth[e.month] = byMonth[e.month] || { clients: new Set(), billed: 0, paid: 0, pending: 0, holding: 0, gst: 0, tax: 0, expenses: 0 };
    byMonth[e.month].expenses += e.amount || 0;
  });
  const months = Object.keys(byMonth).sort();
  const curMonth = monthStr();
  const cur = byMonth[curMonth] || { clients: new Set(), billed: 0, paid: 0, pending: 0, holding: 0, gst: 0, tax: 0, expenses: 0 };
  const curProfit = cur.paid - cur.expenses - cur.gst - cur.tax;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('rp-clients', cur.clients.size);
  set('rp-revenue', money(cur.billed));
  set('rp-profit', money(curProfit));
  set('rp-received', money(cur.paid));
  const idx = months.indexOf(curMonth);
  let growthTxt = '—', growthSub = 'Not enough history yet';
  if (idx > 0) {
    const prev = byMonth[months[idx - 1]];
    if (prev.billed > 0) {
      const growth = ((cur.billed - prev.billed) / prev.billed) * 100;
      growthTxt = (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%';
      growthSub = 'vs ' + monthLabel(months[idx - 1]);
    }
  }
  set('rp-growth', growthTxt);
  set('rp-growth-sub', growthSub);
  renderAlerts('reports-alerts');

  const mb = document.getElementById('rp-month-body');
  if (mb) {
    const sortedMonths = months.slice().sort().reverse();
    mb.innerHTML = sortedMonths.length ? '' : '<tr class="empty-row"><td colspan="8">No revenue data yet.</td></tr>';
    sortedMonths.forEach((m) => {
      const d = byMonth[m];
      const profit = d.paid - d.expenses - d.gst - d.tax;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${monthLabel(m)}</td><td>${d.clients.size}</td><td>${money(d.billed)}</td><td>${money(
        d.paid
      )}</td><td>${money(d.expenses)}</td><td>${money(d.gst + d.tax)}</td><td>${money(profit)}</td><td>${money(d.pending)}</td>`;
      mb.appendChild(tr);
    });
  }
  const cb = document.getElementById('rp-client-body');
  if (cb) {
    const rows = DB.clients.slice().sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name));
    cb.innerHTML = rows.length ? '' : '<tr class="empty-row"><td colspan="6">No client entries yet.</td></tr>';
    rows.forEach((c) => {
      const status = c.holding > 0 ? 'Holding' : c.pending > 0 ? 'Pending' : 'Paid';
      const tr = document.createElement('tr');
      const svc = (c.services && c.services[0]) || c.service || '—';
      tr.innerHTML = `<td>${escapeHtml(c.name)}</td><td>${monthLabel(c.month)}</td><td>${escapeHtml(
        Array.isArray(c.services) ? c.services.join(', ') : svc
      )}</td><td>${money(c.amount)}</td><td>${money(c.paid)}</td><td>${paymentBadge(status)}</td>`;
      cb.appendChild(tr);
    });
  }
}

/* ---------------- COMPLAINTS / VISION / VAULT ---------------- */
async function submitComplaint(inputId) {
  const id = inputId || 'complaint-input';
  const el = document.getElementById(id);
  if (!el) return;
  const text = el.value.trim();
  if (!text) { alert('Write something before sending.'); return; }
  try {
    await Api.submitComplaint(text);
    el.value = '';
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}

function renderMyComplaints() {
  ['my-complaints', 'tl-my-complaints', 'freelance-my-complaints'].forEach(renderMyComplaintsInto);
}

function renderMyComplaintsInto(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const mine = DB.complaints.filter((c) => c.fromId === currentUser.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!mine.length) { el.innerHTML = ''; return; }
  el.innerHTML = mine
    .map(
      (c) => `<div class="complaint-history-item">
    <div class="complaint-history-text">${escapeHtml(c.text)}</div>
    <div class="complaint-history-meta">${escapeHtml(c.date || '')} · ${
        c.status === 'Reviewed'
          ? '<span class="complaint-history-reviewed">Reviewed</span>'
          : 'Sent to HR, CEO & Partners'
      }</div>
  </div>`
    )
    .join('');
}

function renderComplaints() {
  const el = document.getElementById('complaints-body');
  if (!el) return;
  const list = DB.complaints.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!list.length) {
    el.innerHTML = '<div style="color:var(--ink-soft);font-size:13px;">No suggestions or complaints yet.</div>';
    return;
  }
  el.innerHTML = list
    .map(
      (c) => `<div style="border-bottom:1px solid #F0EEE7;padding:9px 0;">
    <div style="display:flex;justify-content:space-between;gap:8px;">
      <strong style="font-size:13px;">${escapeHtml(c.fromName)} <span class="role-pill">${c.fromRole}</span></strong>
      ${
        c.status === 'Open'
          ? `<button class="subtle-btn" onclick="resolveComplaint('${c.id}')">Mark reviewed</button>`
          : '<span class="badge badge-done">Reviewed</span>'
      }
    </div>
    <div style="font-size:13px;margin-top:4px;">${escapeHtml(c.text)}</div>
    <div style="font-size:11px;color:var(--ink-soft);margin-top:3px;">${c.date}</div>
  </div>`
    )
    .join('');
}

async function resolveComplaint(id) {
  try { await Api.resolveComplaint(id); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}

async function saveVision() {
  const el = document.getElementById('vision-input');
  if (!el) return;
  const text = el.value.trim();
  if (!text) return;
  try {
    await Api.saveVision(text);
    el.value = '';
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}

function renderVisionLog() {
  const el = document.getElementById('vision-log');
  if (!el) return;
  const list = DB.ceoVision.slice().sort((a, b) => b.date.localeCompare(a.date));
  el.innerHTML = list.length
    ? list
        .map(
          (v) => `<div class="vision-log-item">
    <div>${escapeHtml(v.text)}</div><div class="vision-log-date">${escapeHtml(v.date || '')}</div>
  </div>`
        )
        .join('')
    : '<div style="color:var(--ink-soft);font-size:13px;">No vision notes yet.</div>';
}

async function addClientAccount() {
  const body = {
    name: document.getElementById('ca-name').value.trim(),
    business: document.getElementById('ca-business').value.trim(),
    website: document.getElementById('ca-website').value.trim(),
    websitePass: document.getElementById('ca-website-pass').value.trim(),
    instaUser: document.getElementById('ca-insta-user').value.trim(),
    instaPass: document.getElementById('ca-insta-pass').value.trim(),
    fbUser: document.getElementById('ca-fb-user').value.trim(),
    fbPass: document.getElementById('ca-fb-pass').value.trim(),
    otherLabel: document.getElementById('ca-other-label').value.trim(),
    otherUser: document.getElementById('ca-other-user').value.trim(),
    otherPass: document.getElementById('ca-other-pass').value.trim(),
  };
  if (!body.name) { alert('Client name is required.'); return; }
  try {
    await Api.addClientAccount(body);
    [
      'ca-name', 'ca-business', 'ca-website', 'ca-website-pass', 'ca-insta-user', 'ca-insta-pass',
      'ca-fb-user', 'ca-fb-pass', 'ca-other-label', 'ca-other-user', 'ca-other-pass',
    ].forEach((id) => (document.getElementById(id).value = ''));
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}

async function removeClientAccount(id) {
  if (!confirm('Remove this client account record?')) return;
  try { await Api.deleteClientAccount(id); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}

function togglePassVisibility(btn) {
  const span = btn.previousElementSibling;
  if (!span) return;
  const isHidden = span.dataset.hidden !== 'false';
  span.textContent = isHidden ? span.dataset.value : '••••••••';
  span.dataset.hidden = isHidden ? 'false' : 'true';
  btn.textContent = isHidden ? '🙈' : '👁';
}

function passCellHtml(value) {
  if (!value) return '—';
  const esc = escapeHtml(value);
  return `<span class="pass-cell"><span data-hidden="true" data-value="${esc}">••••••••</span><button class="pass-toggle" onclick="togglePassVisibility(this)">👁</button></span>`;
}

function renderClientAccounts() {
  const body = document.getElementById('ca-body');
  if (!body) return;
  const list = DB.clientAccounts.slice().sort((a, b) => a.name.localeCompare(b.name));
  body.innerHTML = list.length ? '' : '<tr class="empty-row"><td colspan="7">No client accounts saved yet.</td></tr>';
  list.forEach((c) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${escapeHtml(c.business || '—')}</td>
      <td class="acct-row-block">${c.website ? `<div>${escapeHtml(c.website)}</div>` : '—'}${
      c.websitePass ? `<div>${passCellHtml(c.websitePass)}</div>` : ''
    }</td>
      <td class="acct-row-block">${c.instaUser ? `<div>${escapeHtml(c.instaUser)}</div>${passCellHtml(c.instaPass)}` : '—'}</td>
      <td class="acct-row-block">${c.fbUser ? `<div>${escapeHtml(c.fbUser)}</div>${passCellHtml(c.fbPass)}` : '—'}</td>
      <td class="acct-row-block">${
        c.otherLabel
          ? `<div><b>${escapeHtml(c.otherLabel)}</b></div><div>${escapeHtml(c.otherUser || '')}</div>${passCellHtml(c.otherPass)}`
          : '—'
      }</td>
      <td><button class="subtle-btn" onclick="removeClientAccount('${c.id}')">Delete</button></td>`;
    body.appendChild(tr);
  });
}

/* ---------------- FREELANCE ---------------- */
function handlePortfolioImagePick(input) {
  const file = input.files && input.files[0];
  const drop = document.getElementById('pf-upload-drop');
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingPortfolioImage = reader.result;
    if (drop) {
      drop.textContent = '✅ Image ready — ' + file.name;
      drop.classList.add('has-file');
    }
  };
  reader.readAsDataURL(file);
}

async function addPortfolioItem() {
  const title = document.getElementById('pf-title').value.trim();
  const desc = document.getElementById('pf-desc').value.trim();
  if (!title) { alert('Give your project a title.'); return; }
  try {
    await Api.addPortfolio({ title, desc, image: pendingPortfolioImage });
    document.getElementById('pf-title').value = '';
    document.getElementById('pf-desc').value = '';
    pendingPortfolioImage = null;
    const drop = document.getElementById('pf-upload-drop');
    if (drop) {
      drop.textContent = '📷 Click to upload an image';
      drop.classList.remove('has-file');
    }
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}

async function removePortfolioItem(id) {
  if (!confirm('Remove this portfolio item?')) return;
  try { await Api.deletePortfolio(id); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}

function renderPortfolio() {
  const card = document.getElementById('freelance-portfolio-card');
  if (!card) return;
  const isFreelancer = currentUser.role === 'Freelancer';
  card.style.display = isFreelancer ? 'block' : 'none';
  if (!isFreelancer) return;
  const grid = document.getElementById('my-portfolio-grid');
  const mine = DB.portfolios.filter((p) => p.freelancerId === currentUser.id).sort((a, b) => b.date.localeCompare(a.date));
  grid.innerHTML = mine.length
    ? ''
    : '<div style="color:var(--ink-soft);font-size:13px;">No portfolio items yet — add your first project above.</div>';
  mine.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'portfolio-item';
    div.innerHTML = `${p.image ? `<img src="${p.image}">` : ''}
      <div class="portfolio-item-body">
        <div class="portfolio-item-title">${escapeHtml(p.title)}</div>
        ${p.desc ? `<div class="portfolio-item-desc">${escapeHtml(p.desc)}</div>` : ''}
        <button class="subtle-btn portfolio-item-del" onclick="removePortfolioItem('${p.id}')">Remove</button>
      </div>`;
    grid.appendChild(div);
  });
}

async function postFreelanceJob() {
  const title = document.getElementById('fj-title').value.trim();
  const deadline = document.getElementById('fj-deadline').value;
  const desc = document.getElementById('fj-desc').value.trim();
  if (!title || !deadline) { alert('Job title and deadline are required.'); return; }
  try {
    await Api.postFreelanceJob({ title, deadline, desc });
    document.getElementById('fj-title').value = '';
    document.getElementById('fj-desc').value = '';
    document.getElementById('fj-deadline').value = '';
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}

async function requestFreelanceJob(jobId) {
  try { await Api.requestFreelanceJob(jobId); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}
async function acceptFreelanceRequest(jobId, freelancerId) {
  try { await Api.assignFreelance(jobId, freelancerId); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}

function submitFreelanceJob(jobId) {
  const note = prompt('Add a note about your submission (optional):');
  if (note === null) return;
  const wantImage = confirm('Attach an image with your submission? (e.g. a screenshot of the finished work)');
  if (wantImage) {
    submittingJobId = jobId;
    pendingSubmissionNote = note;
    document.getElementById('fj-submit-image-input').click();
  } else {
    finalizeSubmission(jobId, note, null);
  }
}

function handleSubmissionImagePick(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) {
    finalizeSubmission(submittingJobId, pendingSubmissionNote, null);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => finalizeSubmission(submittingJobId, pendingSubmissionNote, reader.result);
  reader.readAsDataURL(file);
}

async function finalizeSubmission(jobId, note, image) {
  try {
    await Api.submitFreelance(jobId, { note: note || '', image: image || null });
    await refreshAllData();
    renderAll();
  } catch (e) { alert(e.message); }
}

async function approveFreelanceJob(jobId) {
  try { await Api.approveFreelance(jobId); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}
async function requestChangesFreelanceJob(jobId) {
  try { await Api.requestChangesFreelance(jobId); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}
async function reassignFreelanceJob(jobId) {
  if (!confirm('Reassign this job? It will reopen for other freelancers.')) return;
  try { await Api.reassignFreelance(jobId); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}
async function deleteFreelanceJob(jobId) {
  if (!confirm('Delete this job posting?')) return;
  try { await Api.deleteFreelance(jobId); await refreshAllData(); renderAll(); } catch (e) { alert(e.message); }
}

function freelanceJobMeta(job, today) {
  const overdue = job.deadline < today && job.status !== 'Completed';
  if (job.status === 'Completed') {
    return { key: 'completed', label: 'Completed', badge: 'badge-done', card: 'fj-card--completed' };
  }
  if (job.status === 'Submitted') {
    return { key: 'submitted', label: 'Awaiting approval', badge: 'badge-submitted', card: 'fj-card--submitted' };
  }
  if (overdue) {
    return { key: 'overdue', label: 'Overdue', badge: 'badge-rejected', card: 'fj-card--overdue' };
  }
  if (job.status === 'Assigned') {
    return { key: 'assigned', label: 'In progress', badge: 'badge-progress', card: 'fj-card--assigned' };
  }
  return { key: 'open', label: 'Open', badge: 'badge-pending', card: 'fj-card--open' };
}

function freelanceDaysUntil(deadline, today) {
  const a = new Date(deadline + 'T00:00:00');
  const b = new Date(today + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}

function freelanceDeadlineLabel(job, today) {
  const meta = freelanceJobMeta(job, today);
  if (meta.key === 'completed') return { text: 'Completed', cls: 'fj-deadline--done' };
  const days = freelanceDaysUntil(job.deadline, today);
  const formatted = new Date(job.deadline + 'T00:00:00').toLocaleDateString('default', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, cls: 'fj-deadline--overdue' };
  if (days === 0) return { text: 'Due today', cls: 'fj-deadline--soon' };
  if (days <= 3) return { text: `${days}d left · ${formatted}`, cls: 'fj-deadline--soon' };
  return { text: `${days}d left · ${formatted}`, cls: 'fj-deadline--ok' };
}

function setFreelanceJobsFilter(filter) {
  freelanceJobsFilter = filter;
  renderFreelanceHub();
}

function renderFreelanceHub() {
  const postCard = document.getElementById('freelance-post-card');
  const isManager = FREELANCE_MANAGERS.includes(currentUser.role);
  if (postCard) postCard.style.display = isManager ? 'block' : 'none';
  renderPortfolio();
  renderMyComplaints();

  const body = document.getElementById('freelance-jobs-body');
  const statsEl = document.getElementById('freelance-jobs-stats');
  const filtersEl = document.getElementById('freelance-jobs-filters');
  if (!body) return;

  const today = todayStr();
  let jobs = DB.freelanceJobs.slice();
  if (currentUser.role === 'Freelancer') {
    jobs = jobs.filter((j) => j.status === 'Open' || j.assignedFreelancerId === currentUser.id);
  }

  const enriched = jobs.map((j) => ({ job: j, meta: freelanceJobMeta(j, today) }));
  const counts = {
    all: enriched.length,
    open: enriched.filter((x) => x.meta.key === 'open').length,
    active: enriched.filter((x) => ['assigned', 'submitted'].includes(x.meta.key)).length,
    overdue: enriched.filter((x) => x.meta.key === 'overdue').length,
    completed: enriched.filter((x) => x.meta.key === 'completed').length,
  };

  if (statsEl) {
    statsEl.innerHTML = `
      <span class="fj-stat-pill">Total <b>${counts.all}</b></span>
      <span class="fj-stat-pill open">Open <b>${counts.open}</b></span>
      <span class="fj-stat-pill active">Active <b>${counts.active}</b></span>
      ${counts.overdue ? `<span class="fj-stat-pill overdue">Overdue <b>${counts.overdue}</b></span>` : ''}`;
  }

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Open' },
    { id: 'active', label: 'Active' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'completed', label: 'Completed' },
  ];
  if (filtersEl) {
    filtersEl.innerHTML = filters
      .filter((f) => f.id === 'all' || counts[f.id] > 0 || freelanceJobsFilter === f.id)
      .map((f) => `<button type="button" class="fj-filter-tab${freelanceJobsFilter === f.id ? ' active' : ''}" onclick="setFreelanceJobsFilter('${f.id}')">${f.label}${counts[f.id] ? ` (${counts[f.id]})` : ''}</button>`)
      .join('');
  }

  let visible = enriched;
  if (freelanceJobsFilter === 'open') visible = enriched.filter((x) => x.meta.key === 'open');
  else if (freelanceJobsFilter === 'active') visible = enriched.filter((x) => ['assigned', 'submitted'].includes(x.meta.key));
  else if (freelanceJobsFilter === 'overdue') visible = enriched.filter((x) => x.meta.key === 'overdue');
  else if (freelanceJobsFilter === 'completed') visible = enriched.filter((x) => x.meta.key === 'completed');

  visible.sort((a, b) => {
    const rank = { overdue: 0, open: 1, assigned: 2, submitted: 3, completed: 4 };
    const ra = rank[a.meta.key] ?? 5;
    const rb = rank[b.meta.key] ?? 5;
    if (ra !== rb) return ra - rb;
    return a.job.deadline.localeCompare(b.job.deadline);
  });

  if (!visible.length) {
    body.innerHTML = `<div class="fj-empty-state">
      <div class="fj-empty-icon">🧑‍💻</div>
      <div class="fj-empty-title">No jobs in this view</div>
      <div class="fj-empty-desc">${freelanceJobsFilter === 'all'
        ? 'There are no freelance jobs right now. Managers can post a new job above.'
        : 'Try another filter or check back later for new opportunities.'}</div>
    </div>`;
    return;
  }

  body.innerHTML = visible.map(({ job: j, meta }) => {
    const deadline = freelanceDeadlineLabel(j, today);
    let actionsHtml = '';
    if (currentUser.role === 'Freelancer') {
      if (j.status === 'Open') {
        const already = (j.requests || []).find((r) => r.freelancerId === currentUser.id);
        actionsHtml = already
          ? `<span class="badge badge-pending">Request sent</span>`
          : `<button type="button" class="btn btn-accent" onclick="requestFreelanceJob('${j.id}')">Request job</button>`;
      } else if (j.assignedFreelancerId === currentUser.id && j.status === 'Assigned') {
        actionsHtml = `<button type="button" class="btn btn-accent" onclick="submitFreelanceJob('${j.id}')">Submit work</button>`;
      } else if (j.assignedFreelancerId === currentUser.id && j.status === 'Submitted') {
        actionsHtml = `<span class="badge badge-submitted">Waiting for approval</span>`;
      }
    } else if (isManager) {
      const pendingReqs = (j.requests || []).filter((r) => r.status === 'Pending');
      const reqPanel = pendingReqs.length
        ? `<div class="fj-requests-panel">
            <div class="fj-requests-title">${pendingReqs.length} freelancer request${pendingReqs.length > 1 ? 's' : ''}</div>
            ${pendingReqs.map((r) => `<div class="fj-request-row">
              <span class="fj-request-name">${escapeHtml(r.freelancerName)}</span>
              <button type="button" class="subtle-btn" onclick="acceptFreelanceRequest('${j.id}','${r.freelancerId}')">Assign</button>
            </div>`).join('')}
          </div>`
        : '';
      const mgrActions = [];
      if (j.status === 'Submitted') {
        mgrActions.push(`<button type="button" class="btn btn-accent" onclick="approveFreelanceJob('${j.id}')">Approve</button>`);
        mgrActions.push(`<button type="button" class="subtle-btn" onclick="requestChangesFreelanceJob('${j.id}')">Request changes</button>`);
      }
      if ((meta.key === 'overdue' || j.status === 'Assigned') && j.status !== 'Completed') {
        mgrActions.push(`<button type="button" class="subtle-btn" onclick="reassignFreelanceJob('${j.id}')">Reassign</button>`);
      }
      mgrActions.push(`<button type="button" class="subtle-btn" onclick="deleteFreelanceJob('${j.id}')">Delete</button>`);
      actionsHtml = reqPanel + (mgrActions.length ? `<div class="fj-card-actions">${mgrActions.join('')}</div>` : '');
    }

    const submissionHtml = j.submission
      ? `<div class="submission-box">
          <b>Submitted by ${escapeHtml(j.submission.by)} · ${j.submission.date || '—'}</b>
          ${j.submission.note ? `<div>${escapeHtml(j.submission.note)}</div>` : ''}
          ${j.submission.image ? `<img src="${j.submission.image}" alt="Submission" onclick="window.open(this.src)">` : ''}
        </div>`
      : '';

    const assigneeHtml = j.assignedFreelancerName
      ? `<div class="fj-card-assignee">👤 Assigned to ${escapeHtml(j.assignedFreelancerName)}</div>`
      : '';

    const freelancerActions = actionsHtml && currentUser.role === 'Freelancer'
      ? `<div class="fj-card-actions">${actionsHtml}</div>`
      : actionsHtml;

    return `<article class="fj-card ${meta.card}">
      <div class="fj-card-accent"></div>
      <div class="fj-card-inner">
        <div class="fj-card-top">
          <span class="badge ${meta.badge}">${meta.label}</span>
          <span class="fj-deadline ${deadline.cls}">📅 ${deadline.text}</span>
        </div>
        <h3 class="fj-card-title">${escapeHtml(j.title)}</h3>
        ${j.desc ? `<p class="fj-card-desc">${escapeHtml(j.desc)}</p>` : ''}
        <div class="fj-card-meta">
          <span>📌 ${escapeHtml(j.postedBy)} · ${escapeHtml(j.postedByRole || '')}</span>
          ${(j.requests || []).length ? `<span>🙋 ${(j.requests || []).length} request(s)</span>` : ''}
        </div>
        ${assigneeHtml}
        ${submissionHtml}
        ${freelancerActions}
      </div>
    </article>`;
  }).join('');
}

function renderBirthdayBanner() {
  const el = document.getElementById('birthday-banner');
  if (!el) return;
  if (currentUser.birthday && isTodayMonthDay(currentUser.birthday)) {
    el.style.display = 'block';
    el.textContent = `🎉 Happy Birthday, ${currentUser.name.split(' ')[0]}! Wishing you a great one from the whole team.`;
  } else {
    el.style.display = 'none';
    el.textContent = '';
  }
}

function renderBirthdayWidget(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const now = new Date();
  const list = DB.employees
    .filter((e) => e.birthday)
    .map((e) => {
      const d = new Date(e.birthday + 'T00:00:00');
      return {
        name: e.name,
        month: d.getMonth(),
        day: d.getDate(),
        today: d.getMonth() === now.getMonth() && d.getDate() === now.getDate(),
      };
    })
    .filter((e) => e.month === now.getMonth())
    .sort((a, b) => a.day - b.day);
  const compact = el.classList.contains('birthday-widget-list');
  if (!list.length) {
    el.innerHTML = `<div class="birthday-empty">${compact ? 'No birthdays this month.' : 'No birthdays this month.'}</div>`;
    return;
  }
  el.innerHTML = list
    .map((e) => {
      const label = new Date(2000, e.month, e.day).toLocaleDateString('default', { day: 'numeric', month: 'short' });
      return `<div class="birthday-list-item${compact ? ' birthday-list-item--compact' : ''}">
      <span>${e.today ? '🎂 ' : ''}${escapeHtml(e.name)}</span><span class="birthday-list-date">${label}</span></div>`;
    })
    .join('');
}

function populateTaskStatusFilter(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel || sel.dataset.statusReady) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">All statuses</option>${taskStatusOptions('')}`;
  sel.value = current;
  sel.dataset.statusReady = '1';
}

function renderAll() {
  if (!currentUser) return;
  const page = window.LOOPLINE_PAGE;

  switch (page) {
    case 'dashboard':
      renderDashboardOverview();
      renderMyAttendance();
      break;
    case 'my_tasks':
      renderMyTasksPage();
      break;
    case 'my_attendance':
      renderMyAttendance();
      break;
    case 'my_leaves':
      renderMyLeaves();
      break;
    case 'my_salary':
      loadMyPayslips();
      break;
    case 'hr_overview':
      renderHROverview();
      break;
    case 'hr_employees':
      renderHREmployees();
      break;
    case 'hr_attendance':
      renderHRAttendance();
      break;
    case 'hr_leaves':
      renderHRLeaves();
      break;
    case 'hr_payroll':
      renderHRPayroll();
      loadHRPayslips();
      break;
    case 'chat':
      renderContacts();
      renderChatThread();
      break;
    case 'teams':
      renderManagerTeams();
      renderManagerOverview();
      break;
    case 'tl':
      if (unlocked.tl || sessionStorage.getItem('unlocked_tl') === '1') {
        unlocked.tl = true;
        const lock = document.getElementById('tl-lock');
        const content = document.getElementById('tl-content');
        if (lock) lock.style.display = 'none';
        if (content) content.style.display = 'block';
        renderTL();
      }
      break;
    case 'revenue':
      if ((unlocked.revenue || sessionStorage.getItem('unlocked_revenue') === '1') && REVENUE_ROLES.includes(currentUser.role)) {
        unlocked.revenue = true;
        const lock = document.getElementById('revenue-lock');
        const content = document.getElementById('revenue-content');
        if (lock) lock.style.display = 'none';
        if (content) content.style.display = 'block';
        renderRevenue();
      }
      wireRevenueFormHelpers();
      break;
    case 'reports':
      if (REVENUE_ROLES.includes(currentUser.role)) {
        renderReports();
        renderVisionLog();
        renderComplaints();
      }
      break;
    case 'partners':
      if (currentUser.role === 'CEO') renderPartners();
      break;
    case 'freelance':
      renderFreelanceHub();
      break;
  }
}

/* expose for inline handlers */
Object.assign(window, {
  showPage, logout, openChangePasswordModal, closeChangePasswordModal, submitChangePassword, toggleProfileMenu, closeProfileMenu, unlockSection, toggleClock, toggleBreak, changeAttendanceMonth,
  viewPayslip, closePayslipModal, downloadPayslipPdf, openHRPayslipForm, closeHRPayslipForm,
  setPayrollOverviewMode, setPayrollOverviewMonth, setPayrollOverviewYear,
  saveHRPayslip, publishPayslipById, editPublishedPayslip, unpublishPayslip, deletePayslipById, loadHRPayslips, renderHRPayslips,
  updateTaskWork, saveTaskRow, previewTaskProgress, applyLeave, applyLeaveAs,
  switchLeaveTab, sendChat, handleChatImagePick, renderChatImagePreview,
  setSalary, giveIncentive, setBirthday, setScore, removeEmployee, toggleEmployeeActive, addEmployee, assignTeamMember, setLeaveStatus,
  addPartner, renderPartners, resetPartnerPassword, togglePartnerActive,
  assignTask, createMyTask, openMyTaskModal, closeMyTaskModal, removeTask, manualAttendance, addClientEntry, removeClientEntry, addExpense, addPayrollExpense, removeExpense,
  renderRevenue, submitComplaint, resolveComplaint, saveVision, addClientAccount, removeClientAccount,
  togglePassVisibility, handlePortfolioImagePick, addPortfolioItem, removePortfolioItem,
  postFreelanceJob, requestFreelanceJob, acceptFreelanceRequest, submitFreelanceJob,
  handleSubmissionImagePick, approveFreelanceJob, requestChangesFreelanceJob, reassignFreelanceJob,
  deleteFreelanceJob, renderFreelanceHub, setFreelanceJobsFilter, renderActivityLog,
  changeHolidayMonth, addHolidayEntry, removeHoliday, saveWeekendDays,
});

(async function initApp() {
  if (!Api.getToken()) {
    location.href = resolvePagePath('login.html');
    return;
  }
  showAppLoader();
  try {
    const me = await Api.me();
    currentUser = me.user;
    localStorage.setItem('loopline_user', JSON.stringify(me.user));
    if (window.LOOPLINE_APP_SHELL && typeof LooplineRouter !== 'undefined') {
      await LooplineRouter.start(me.user, me.landingPage);
      return;
    }
    const page = window.LOOPLINE_PAGE;
    const rules = roleRules(currentUser.role);
    if (page && !rules[page]) {
      hideAppLoader();
      location.href = resolvePagePath(me.landingPage || pageUrl(landingPageKey(currentUser.role), currentUser.role));
      return;
    }
    await boot();
  } catch (e) {
    hideAppLoader();
    Api.setToken(null);
    location.href = resolvePagePath('login.html');
  }
})();
