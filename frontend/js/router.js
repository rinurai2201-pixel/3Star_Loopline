/* Single-page shell router — one sidebar, load content by hash */
window.LooplineRouter = (function () {
  const PARTIALS = {
    dashboard: '/pages/partials/dashboard.html',
    my_tasks: '/pages/partials/my-tasks.html',
    my_attendance: '/pages/partials/my-attendance.html',
    my_leaves: '/pages/partials/my-leaves.html',
    my_salary: '/pages/partials/my-salary.html',
    hr_overview: '/pages/partials/hr-overview.html',
    hr_employees: '/pages/partials/hr-employees.html',
    hr_attendance: '/pages/partials/hr-attendance.html',
    hr_leaves: '/pages/partials/hr-leaves.html',
    hr_payroll: '/pages/partials/hr-payroll.html',
    chat: '/pages/partials/messages.html',
    freelance: '/pages/partials/freelance.html',
    revenue: '/pages/partials/revenue.html',
    reports: '/pages/partials/reports.html',
    partners: '/pages/partials/partners.html',
    tl: '/pages/partials/tl.html',
    teams: '/pages/partials/teams.html',
  };

  let loading = false;

  function parseHash() {
    const h = (location.hash || '').replace(/^#\/?/, '').trim();
    return h || null;
  }

  function landingFromBackend(landingPage) {
    if (!landingPage) return null;
    if (landingPage.includes('#')) return landingPage.split('#')[1];
    const rel = landingPage.replace(/^\/pages\//, '');
    return (window.LEGACY_PATH_TO_PAGE && LEGACY_PATH_TO_PAGE[rel]) || null;
  }

  async function loadPage(pageKey) {
    if (!currentUser || loading) return;
    const rules = roleRules(currentUser.role);
    if (!rules[pageKey]) {
      pageKey = landingPageKey(currentUser.role);
    }
    loading = true;
    try {
      window.LOOPLINE_PAGE = pageKey;
      const url = PARTIALS[pageKey];
      if (!url) throw new Error('Unknown page: ' + pageKey);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load page content');
      document.getElementById('main-content').innerHTML = await res.text();
      if (typeof closeMobileNav === 'function') closeMobileNav();
      if (typeof boot === 'function') await boot();
    } finally {
      loading = false;
    }
  }

  async function navigate(pageKey) {
    if (!currentUser) return;
    const rules = roleRules(currentUser.role);
    if (!rules[pageKey]) {
      alert("Your role doesn't have access to that section.");
      return;
    }
    if (parseHash() !== pageKey) {
      location.hash = pageKey;
      return;
    }
    await loadPage(pageKey);
  }

  async function start(user, landingPage) {
    let page = parseHash() || landingFromBackend(landingPage) || landingPageKey(user.role);
    const rules = roleRules(user.role);
    if (!rules[page]) page = landingPageKey(user.role);
    window.addEventListener('hashchange', () => {
      const next = parseHash();
      if (next && next !== window.LOOPLINE_PAGE) {
        loadPage(next).catch((e) => alert(e.message));
      }
    });
    if (parseHash() !== page) {
      history.replaceState(null, '', window.APP_SHELL + '#' + page);
    }
    await loadPage(page);
  }

  return { start, navigate, parseHash, PARTIALS };
})();
