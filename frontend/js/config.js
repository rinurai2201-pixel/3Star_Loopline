// API base — same origin when served by FastAPI or ngrok, else local backend
window.API_BASE = window.API_BASE || (
  location.port === '8000' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? (location.port === '8000' ? '' : 'http://127.0.0.1:8000')
    : (location.protocol + '//' + location.host)
);

window.PAGE_FILES = {
  dashboard: {
    Employee: '/pages/employee/dashboard.html',
    Manager: '/pages/employee/dashboard.html',
    Sales: '/pages/employee/dashboard.html',
  },
  my_tasks: {
    Employee: '/pages/employee/tasks.html',
    Manager: '/pages/employee/tasks.html',
    Sales: '/pages/employee/tasks.html',
    TL: '/pages/employee/tasks.html',
  },
  my_attendance: {
    Employee: '/pages/employee/attendance.html',
    Manager: '/pages/employee/attendance.html',
    Sales: '/pages/employee/attendance.html',
    TL: '/pages/employee/attendance.html',
  },
  my_leaves: {
    Employee: '/pages/employee/leaves.html',
    Manager: '/pages/employee/leaves.html',
    Sales: '/pages/employee/leaves.html',
    TL: '/pages/employee/leaves.html',
  },
  my_salary: {
    Employee: '/pages/employee/salary.html',
    Manager: '/pages/employee/salary.html',
    Sales: '/pages/employee/salary.html',
    TL: '/pages/employee/salary.html',
  },
  hr_overview: '/pages/hr/overview.html',
  hr_employees: '/pages/hr/employees.html',
  hr_attendance: '/pages/hr/attendance.html',
  hr_leaves: '/pages/hr/leaves.html',
  hr_payroll: '/pages/hr/payroll.html',
  chat: '/pages/messages.html',
  teams: '/pages/manager/teams.html',
  tl: '/pages/tl_task_management.html',
  revenue: { HR: '/pages/hr_revenue.html', CEO: '/pages/ceo_revenue.html', Partner: '/pages/ceo_revenue.html' },
  reports: { HR: '/pages/hr_reports.html', CEO: '/pages/ceo_reports.html', Partner: '/pages/ceo_reports.html' },
  partners: '/pages/app.html#partners',
  freelance: '/pages/freelance_hub.html',
};

window.pageFileFor = function (page, role) {
  const map = window.PAGE_FILES[page];
  if (!map) return '/pages/employee/dashboard.html';
  if (typeof map === 'string') return map;
  return map[role] || Object.values(map)[0];
};

window.PAGES_BASE = '/pages/';
window.APP_SHELL = '/pages/app.html';

window.pagesRoot = function () {
  return window.PAGES_BASE;
};

window.LEGACY_PATH_TO_PAGE = {
  'employee/dashboard.html': 'dashboard',
  'employee/tasks.html': 'my_tasks',
  'employee/attendance.html': 'my_attendance',
  'employee/leaves.html': 'my_leaves',
  'employee/salary.html': 'my_salary',
  'hr/overview.html': 'hr_overview',
  'hr/employees.html': 'hr_employees',
  'hr/attendance.html': 'hr_attendance',
  'hr/leaves.html': 'hr_leaves',
  'hr/payroll.html': 'hr_payroll',
  'manager/teams.html': 'teams',
  'messages.html': 'chat',
  'freelance_hub.html': 'freelance',
  'hr_revenue.html': 'revenue',
  'ceo_revenue.html': 'revenue',
  'hr_reports.html': 'reports',
  'ceo_reports.html': 'reports',
  'tl_task_management.html': 'tl',
};

window.normalizePageRel = function (file) {
  let rel = String(file || '').replace(/^pages\//, '').replace(/^\/+/, '').replace(/\/+/g, '/');
  while (rel.includes('hr/hr/')) rel = rel.replace(/hr\/hr\//g, 'hr/');
  return rel;
};

window.resolvePagePath = function (file) {
  if (!file) return APP_SHELL + '#dashboard';
  if (file.startsWith('http://') || file.startsWith('https://')) return file;
  if (file.startsWith(APP_SHELL)) return file;
  if (file.includes('#')) {
    const hash = file.split('#').pop();
    return hash ? APP_SHELL + '#' + hash : APP_SHELL + '#dashboard';
  }
  if (file === 'login.html' || file.endsWith('/login.html')) {
    return file.startsWith('/') ? file : PAGES_BASE + 'login.html';
  }
  let rel = file;
  if (rel.startsWith('/pages/')) rel = rel.slice('/pages/'.length);
  else if (rel.startsWith('pages/')) rel = rel.slice('pages/'.length);
  rel = normalizePageRel(rel);
  const pageKey = LEGACY_PATH_TO_PAGE[rel];
  if (pageKey) return APP_SHELL + '#' + pageKey;
  if (file.startsWith('/')) return file;
  return PAGES_BASE + rel;
};

window.pageUrl = function (page, role) {
  return APP_SHELL + '#' + page;
};

window.PAGE_TITLES = {
  dashboard: 'My Dashboard',
  my_tasks: 'My Tasks',
  my_attendance: 'My Attendance',
  my_leaves: 'My Leave',
  my_salary: 'My Salary',
  hr_overview: 'HR Overview',
  hr_employees: 'Employees',
  hr_attendance: 'Attendance',
  hr_leaves: 'Leave Management',
  hr_payroll: 'Payroll & Salary',
  chat: 'Messages',
  teams: 'Team Assignment',
  tl: 'Team Tasks',
  revenue: 'Revenue & Profit',
  reports: 'Reports & Scale',
  partners: 'Partners',
  freelance: 'Freelance Hub',
};
