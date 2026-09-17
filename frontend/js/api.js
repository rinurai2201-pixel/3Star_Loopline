function formatApiError(data, fallback) {
  if (!data) return fallback || 'Request failed';
  const detail = data.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((x) => x.msg || x.message || JSON.stringify(x)).join('. ');
  }
  return data.message || fallback || JSON.stringify(data);
}

const Api = (() => {
  const tokenKey = 'loopline_token';

  function getToken() {
    return localStorage.getItem(tokenKey);
  }
  function setToken(t) {
    if (t) localStorage.setItem(tokenKey, t);
    else localStorage.removeItem(tokenKey);
  }

  async function request(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API_BASE + path, { ...options, headers });
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { detail: text }; }
    if (!res.ok) {
      throw new Error(formatApiError(data, res.statusText));
    }
    return data;
  }

  return {
    getToken,
    setToken,
    request,
    login: (email, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    me: () => request('/api/auth/me'),
    changePassword: (currentPassword, newPassword) =>
      request('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    unlock: (section, password) => request('/api/auth/unlock', { method: 'POST', body: JSON.stringify({ section, password }) }),

    employees: () => request('/api/employees'),
    createEmployee: (body) => request('/api/employees', { method: 'POST', body: JSON.stringify(body) }),
    partners: () => request('/api/employees/partners'),
    createPartner: (body) => request('/api/employees/partners', { method: 'POST', body: JSON.stringify(body) }),
    resetPartnerPassword: (id, password) =>
      request(`/api/employees/partners/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }),
    setPartnerActive: (id, active) =>
      request(`/api/employees/partners/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    assignTeam: (id, tlId) => request(`/api/employees/${id}/team`, { method: 'PATCH', body: JSON.stringify({ tlId: tlId || null }) }),
    setSalary: (id, baseSalary) => request(`/api/employees/${id}/salary`, { method: 'PATCH', body: JSON.stringify({ baseSalary }) }),
    giveIncentive: (id, amount) => request(`/api/employees/${id}/incentive`, { method: 'POST', body: JSON.stringify({ amount }) }),
    setScore: (id, score) => request(`/api/employees/${id}/score`, { method: 'PATCH', body: JSON.stringify({ score }) }),
    setBirthday: (id, birthday) => request(`/api/employees/${id}/birthday`, { method: 'PATCH', body: JSON.stringify({ birthday }) }),
    removeEmployee: (id) => request(`/api/employees/${id}`, { method: 'DELETE' }),
    setEmployeeActive: (id, active) =>
      request(`/api/employees/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    myIncentives: () => request('/api/employees/incentives/mine'),

    payslips: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/api/payslips' + (q ? '?' + q : ''));
    },
    getPayslip: (id) => request(`/api/payslips/${id}`),
    savePayslip: (body) => request('/api/payslips', { method: 'POST', body: JSON.stringify(body) }),
    updatePayslip: (id, body) => request(`/api/payslips/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    publishPayslip: (id) => request(`/api/payslips/${id}/publish`, { method: 'POST' }),
    deletePayslip: (id) => request(`/api/payslips/${id}`, { method: 'DELETE' }),

    attendance: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/api/attendance' + (q ? '?' + q : ''));
    },
    clock: () => request('/api/attendance/clock', { method: 'POST' }),
    breakToggle: (type) => request('/api/attendance/break', { method: 'POST', body: JSON.stringify({ type }) }),
    manualAttendance: (body) => request('/api/attendance/manual', { method: 'POST', body: JSON.stringify(body) }),
    statusBoard: () => request('/api/attendance/status-board'),

    tasks: () => request('/api/tasks'),
    createTask: (body) => request('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
    updateTaskStatus: (id, body) => request(`/api/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),

    leaves: () => request('/api/leaves'),
    applyLeave: (body) => request('/api/leaves', { method: 'POST', body: JSON.stringify(body) }),
    setLeaveStatus: (id, status) => request(`/api/leaves/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    leaveBalance: () => request('/api/leaves/balance'),

    contacts: () => request('/api/messages/contacts'),
    thread: (id) => request(`/api/messages/thread/${id}`),
    sendMessage: (body) => request('/api/messages', { method: 'POST', body: JSON.stringify(body) }),

    revenueSummary: (month) => request('/api/revenue/summary' + (month ? '?month=' + month : '')),
    revenueReports: () => request('/api/revenue/reports'),
    listExpenses: (month) => request('/api/revenue/expenses' + (month ? '?month=' + month : '')),
    addClient: (body) => request('/api/revenue/clients', { method: 'POST', body: JSON.stringify(body) }),
    deleteClient: (id) => request(`/api/revenue/clients/${id}`, { method: 'DELETE' }),
    addExpense: (body) => request('/api/revenue/expenses', { method: 'POST', body: JSON.stringify(body) }),
    deleteExpense: (id) => request(`/api/revenue/expenses/${id}`, { method: 'DELETE' }),

    complaints: () => request('/api/complaints'),
    submitComplaint: (text) => request('/api/complaints', { method: 'POST', body: JSON.stringify({ text }) }),
    resolveComplaint: (id) => request(`/api/complaints/${id}/resolve`, { method: 'PATCH' }),

    vision: () => request('/api/vision'),
    saveVision: (text) => request('/api/vision', { method: 'POST', body: JSON.stringify({ text }) }),

    clientAccounts: () => request('/api/client-accounts'),
    addClientAccount: (body) => request('/api/client-accounts', { method: 'POST', body: JSON.stringify(body) }),
    deleteClientAccount: (id) => request(`/api/client-accounts/${id}`, { method: 'DELETE' }),

    freelanceJobs: () => request('/api/freelance/jobs'),
    postFreelanceJob: (body) => request('/api/freelance/jobs', { method: 'POST', body: JSON.stringify(body) }),
    requestFreelanceJob: (id) => request(`/api/freelance/jobs/${id}/request`, { method: 'POST' }),
    assignFreelance: (jobId, freelancerId) => request(`/api/freelance/jobs/${jobId}/assign/${freelancerId}`, { method: 'POST' }),
    submitFreelance: (id, body) => request(`/api/freelance/jobs/${id}/submit`, { method: 'POST', body: JSON.stringify(body) }),
    approveFreelance: (id) => request(`/api/freelance/jobs/${id}/approve`, { method: 'POST' }),
    requestChangesFreelance: (id) => request(`/api/freelance/jobs/${id}/request-changes`, { method: 'POST' }),
    reassignFreelance: (id) => request(`/api/freelance/jobs/${id}/reassign`, { method: 'POST' }),
    deleteFreelance: (id) => request(`/api/freelance/jobs/${id}`, { method: 'DELETE' }),

    portfolio: () => request('/api/portfolio'),
    addPortfolio: (body) => request('/api/portfolio', { method: 'POST', body: JSON.stringify(body) }),
    deletePortfolio: (id) => request(`/api/portfolio/${id}`, { method: 'DELETE' }),

    holidayConfig: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/api/holidays/config' + (q ? '?' + q : ''));
    },
    addHoliday: (body) => request('/api/holidays', { method: 'POST', body: JSON.stringify(body) }),
    deleteHoliday: (id) => request(`/api/holidays/${id}`, { method: 'DELETE' }),
    setWeekendDays: (weekendDays) =>
      request('/api/holidays/weekend-config', { method: 'PATCH', body: JSON.stringify({ weekendDays }) }),
  };
})();
