const money = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const todayStr = () => localDateStr();
const monthStr = (d) => {
  if (d) return String(d).slice(0, 7);
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const nowTime = () => new Date().toTimeString().slice(0, 5);

function initials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

const TASK_STATUSES = [
  'Not Started',
  'Pending',
  'In Progress',
  'On Hold',
  'Under Review',
  'Needs Feedback',
  'Completed',
  'Blocked',
];

function taskStatusOptions(current) {
  const statuses = !current || TASK_STATUSES.includes(current)
    ? TASK_STATUSES
    : [current, ...TASK_STATUSES];
  return statuses.map(
    (s) => `<option value="${escapeHtml(s)}"${s === current ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');
}

function statusBadge(status) {
  const map = {
    'Not Started': 'badge-pending',
    Pending: 'badge-pending',
    'In Progress': 'badge-progress',
    'On Hold': 'badge-holding',
    'Under Review': 'badge-submitted',
    'Needs Feedback': 'badge-holding',
    Completed: 'badge-done',
    Blocked: 'badge-rejected',
  };
  return `<span class="badge ${map[status] || 'badge-pending'}">${escapeHtml(status || 'Pending')}</span>`;
}
function statusBadge2(status) {
  const map = { Pending: 'badge-pending', Approved: 'badge-approved', Rejected: 'badge-rejected' };
  return `<span class="badge ${map[status] || 'badge-pending'}">${status}</span>`;
}
function paymentBadge(status) {
  const map = { Paid: 'badge-done', Pending: 'badge-pending', Holding: 'badge-holding' };
  return `<span class="badge ${map[status] || 'badge-pending'}">${status}</span>`;
}

function daysBetweenInclusive(from, to) {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function minutesBetween(t1, t2) {
  if (!t1) return 0;
  const end = t2 || nowTime();
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
}

function breakTypeLabel(type) {
  return type === 'Tea' ? 'Tea Break' : type === 'Food' ? 'Food Break' : 'Break';
}

function breakMinutesByType(rec, type) {
  if (!rec) return 0;
  const list = (rec.breaks || []).filter((b) => (b.type || 'Break') === type);
  return list.reduce((s, b) => s + minutesBetween(b.start, b.end || nowTime()), 0);
}

function monthLabel(m) {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function isTodayMonthDay(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function daysLeftInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

/* Holiday / weekend config — loaded from API (HR-managed). */
let WEEKEND_DAYS = [0, 6];
let COMPANY_HOLIDAYS = [];

function setHolidayConfig(holidays, weekendDays) {
  COMPANY_HOLIDAYS = (holidays || []).map((h) => ({
    date: h.date,
    name: h.name || '',
  }));
  if (Array.isArray(weekendDays) && weekendDays.length) {
    WEEKEND_DAYS = weekendDays.map(Number);
  }
}

function isWeekend(iso) {
  const d = new Date(iso + 'T00:00:00');
  return WEEKEND_DAYS.includes(d.getDay());
}

function isCompanyHoliday(iso) {
  return COMPANY_HOLIDAYS.some((h) => h.date === iso);
}

function companyHolidayName(iso) {
  const h = COMPANY_HOLIDAYS.find((x) => x.date === iso);
  return h?.name || '';
}

function isHoliday(iso) {
  return isWeekend(iso) || isCompanyHoliday(iso);
}

function isOnApprovedLeave(empId, iso, leaves) {
  return (leaves || []).some(
    (l) => l.empId === empId && l.status === 'Approved' && l.from <= iso && l.to >= iso
  );
}

function totalBreakMinutes(rec, asOfDate) {
  if (!rec || !(rec.breaks || []).length) return 0;
  const endNow = asOfDate === todayStr() ? nowTime() : null;
  return (rec.breaks || []).reduce(
    (s, b) => s + minutesBetween(b.start, b.end || endNow || b.start),
    0
  );
}

function workingMinutes(rec, asOfDate) {
  if (!rec || !rec.clockIn) return 0;
  const iso = asOfDate || rec.date;
  const end = rec.clockOut || (iso === todayStr() ? nowTime() : null);
  if (!end) return 0;
  return Math.max(0, minutesBetween(rec.clockIn, end) - totalBreakMinutes(rec, iso));
}

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function formatShortDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('default', { weekday: 'short', day: 'numeric', month: 'short' });
}

function buildMonthlyAttendanceRows(empId, month, attendance, leaves) {
  const [y, mo] = month.split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  const today = todayStr();
  const rows = [];
  let stats = { present: 0, leave: 0, holiday: 0, weekend: 0, missed: 0, incomplete: 0, totalMinutes: 0 };

  for (let day = 1; day <= lastDay; day++) {
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const rec = (attendance || []).find((a) => a.empId === empId && a.date === iso);
    const onLeave = isOnApprovedLeave(empId, iso, leaves);
    const weekend = isWeekend(iso);
    const companyHol = isCompanyHoliday(iso);
    const row = {
      iso,
      dateLabel: formatShortDate(iso),
      clockIn: '—',
      clockOut: '—',
      hours: '—',
      status: '',
      statusCls: '',
      note: '',
    };

    if (iso > today) {
      row.status = 'Upcoming';
      row.statusCls = 'att-future';
    } else if (onLeave) {
      row.status = 'Leave';
      row.statusCls = 'att-leave';
      row.note = 'Approved leave';
      stats.leave += 1;
    } else if (companyHol) {
      row.status = 'Holiday';
      row.statusCls = 'att-holiday';
      row.note = companyHolidayName(iso) || 'Public holiday';
      stats.holiday += 1;
    } else if (weekend) {
      row.status = 'Weekend';
      row.statusCls = 'att-weekend';
      stats.weekend += 1;
    } else if (!rec || !rec.clockIn) {
      row.status = 'Missed';
      row.statusCls = 'att-missed';
      row.note = 'No clock-in recorded';
      stats.missed += 1;
    } else if (!rec.clockOut && iso < today) {
      row.status = 'Incomplete';
      row.statusCls = 'att-incomplete';
      row.clockIn = rec.clockIn;
      row.hours = formatDuration(workingMinutes(rec, iso));
      row.note = 'Clock-out missing';
      stats.incomplete += 1;
    } else {
      row.clockIn = rec.clockIn;
      row.clockOut = rec.clockOut || (iso === today ? 'Still in' : '—');
      const mins = workingMinutes(rec, iso);
      row.hours = formatDuration(mins) + (iso === today && !rec.clockOut ? ' (ongoing)' : '');
      if (iso === today && !rec.clockOut) {
        row.status = 'In office';
        row.statusCls = 'att-present';
      } else {
        row.status = 'Present';
        row.statusCls = 'att-present';
        stats.present += 1;
        stats.totalMinutes += mins;
      }
    }
    rows.push(row);
  }
  return { rows: rows.reverse(), stats };
}

const REVENUE_ROLES = ['CEO', 'Partner', 'HR'];
const FREELANCE_MANAGERS = ['TL', 'HR', 'CEO', 'Partner'];
const NO_ATTENDANCE_ROLES = ['CEO', 'Partner', 'HR'];
const PROTECTED_ROLES = ['CEO', 'Partner', 'HR'];
const ANNUAL_LEAVE_QUOTA = 12;

function usesPersonalAttendance(role) {
  return !NO_ATTENDANCE_ROLES.includes(role);
}

function attendanceRoster(employees) {
  return (employees || []).filter((e) => e.active !== false && !NO_ATTENDANCE_ROLES.includes(e.role));
}

function roleRules(role) {
  const isStaff = ['Employee', 'Manager', 'Sales'].includes(role);
  const isTeamLead = role === 'TL';
  return {
    dashboard: isStaff,
    my_tasks: isStaff || isTeamLead,
    my_attendance: isStaff || isTeamLead,
    my_leaves: isStaff || isTeamLead,
    my_salary: isStaff || isTeamLead,
    chat: true,
    hr_overview: role === 'HR',
    hr_employees: role === 'HR',
    hr_attendance: role === 'HR',
    hr_leaves: role === 'HR',
    hr_payroll: role === 'HR',
    teams: role === 'Manager',
    tl: role === 'TL',
    revenue: REVENUE_ROLES.includes(role),
    reports: REVENUE_ROLES.includes(role),
    partners: role === 'CEO',
    freelance: true,
  };
}

function leaveApplicantRole(leave) {
  if (leave.empRole) return leave.empRole;
  const emp = (DB.employees || []).find((e) => e.id === leave.empId);
  return emp?.role || '';
}

function canApproveLeave(leave) {
  if (leave.status !== 'Pending') return false;
  if (!currentUser) return false;
  if (currentUser.role === 'HR') return true;
  if (leaveApplicantRole(leave) === 'Manager') return false;
  return currentUser.role === 'Manager' || currentUser.role === 'TL';
}

function leaveReviewedByLabel(leave) {
  if (!leave || leave.status === 'Pending') return '—';
  if (!leave.reviewedByName) return '—';
  const verb = leave.status === 'Approved' ? 'Approved' : 'Rejected';
  const datePart = leave.reviewedAt ? ` · ${leave.reviewedAt}` : '';
  return `${verb} by ${leave.reviewedByName}${datePart}`;
}

function leaveReviewedByHtml(leave) {
  if (!leave || leave.status === 'Pending') return '—';
  if (!leave.reviewedByName) return '—';
  const verb = leave.status === 'Approved' ? 'Approved' : 'Rejected';
  const dateHtml = leave.reviewedAt
    ? `<div class="leave-review-date">${escapeHtml(leave.reviewedAt)}</div>`
    : '';
  return `<strong>${escapeHtml(leave.reviewedByName)}</strong><div class="leave-review-meta">${verb}${dateHtml ? ' · ' + escapeHtml(leave.reviewedAt) : ''}</div>`;
}

function leaveActionButtons(leave) {
  if (!canApproveLeave(leave)) {
    if (leave.status === 'Pending' && leaveApplicantRole(leave) === 'Manager') {
      return '<span class="leave-hr-only">HR only</span>';
    }
    return '—';
  }
  return `<button type="button" class="subtle-btn" onclick="setLeaveStatus('${leave.id}','Approved')">Approve</button>
    <button type="button" class="subtle-btn" onclick="setLeaveStatus('${leave.id}','Rejected')">Reject</button>`;
}

function landingPageKey(role) {
  if (role === 'Employee' || role === 'Manager' || role === 'Sales') return 'dashboard';
  if (role === 'TL') return 'tl';
  if (role === 'HR') return 'hr_overview';
  if (role === 'CEO' || role === 'Partner') return 'reports';
  if (role === 'Freelancer') return 'freelance';
  return 'dashboard';
}
