/* Purge legacy flat sidebar baked into cached HTML, then build grouped nav */
(function () {
  function purgeLegacySidebar() {
    const aside = document.getElementById('sidebar');
    if (!aside) return;
    if (aside.querySelector('[data-page="hr"]') || aside.textContent.indexOf('HR Management') >= 0) {
      aside.innerHTML = '';
    }
  }

  function cachedUser() {
    try {
      return JSON.parse(localStorage.getItem('loopline_user'));
    } catch (_) {
      return null;
    }
  }

  const NAV = {
    selfService: {
      label: 'Self Service',
      items: [
        { page: 'dashboard', icon: '🏠', label: 'My Dashboard' },
        { page: 'my_tasks', icon: '✅', label: 'My Tasks' },
        { page: 'my_attendance', icon: '🕒', label: 'My Attendance' },
        { page: 'my_leaves', icon: '🏖', label: 'My Leave' },
        { page: 'my_salary', icon: '💰', label: 'My Salary' },
      ],
    },
    hrms: {
      label: 'HRMS',
      items: [
        { page: 'hr_overview', icon: '📊', label: 'HR Overview' },
        { page: 'hr_employees', icon: '👥', label: 'Employees' },
        { page: 'hr_attendance', icon: '🕒', label: 'Attendance' },
        { page: 'hr_leaves', icon: '🏖', label: 'Leave Management' },
        { page: 'hr_payroll', icon: '💰', label: 'Payroll & Salary' },
      ],
    },
    operations: {
      label: 'Operations',
      items: [
        { page: 'tl', icon: '📋', label: 'Team Tasks', lock: 'tl' },
        { page: 'teams', icon: '👥', label: 'Team Assignment' },
      ],
    },
    finance: {
      label: 'Finance',
      items: [
        { page: 'revenue', icon: '💰', label: 'Revenue & Profit', lock: 'revenue' },
        { page: 'reports', icon: '📊', label: 'Reports & Scale' },
      ],
    },
    executive: {
      label: 'Executive',
      items: [
        { page: 'partners', icon: '🤝', label: 'Partners' },
      ],
    },
    general: {
      label: 'General',
      items: [
        { page: 'chat', icon: '💬', label: 'Messages' },
        { page: 'freelance', icon: '🧑‍💻', label: 'Freelance Hub' },
      ],
    },
  };

  function groupsForRole(role) {
    const rules = roleRules(role);
    const groups = [];
    if (rules.dashboard || rules.my_tasks || rules.my_attendance || rules.my_leaves || rules.my_salary) {
      groups.push(NAV.selfService);
    }
    if (rules.hr_overview) groups.push(NAV.hrms);
    if (rules.tl || rules.teams) {
      const ops = { label: 'Operations', items: [] };
      if (rules.tl) ops.items.push(NAV.operations.items[0]);
      if (rules.teams) ops.items.push(NAV.operations.items[1]);
      if (ops.items.length) groups.push(ops);
    }
    if (rules.revenue || rules.reports) {
      const fin = { label: 'Finance', items: [] };
      if (rules.revenue) fin.items.push(NAV.finance.items[0]);
      if (rules.reports) fin.items.push(NAV.finance.items[1]);
      if (fin.items.length) groups.push(fin);
    }
    if (rules.partners) groups.push(NAV.executive);
    if (rules.chat || rules.freelance) groups.push(NAV.general);
    return groups;
  }

  function navigateToPage(page, role) {
    if (typeof closeMobileNav === 'function') closeMobileNav();
    if (typeof showPage === 'function') showPage(page);
    else if (typeof pageUrl === 'function') location.href = pageUrl(page, role);
  }

  function wireNavLinks(role) {
    document.querySelectorAll('#sidebar .nav-item[data-page]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        navigateToPage(btn.dataset.page, role);
      };
    });
  }

  function buildSidebar(role, activePage) {
    purgeLegacySidebar();
    const aside = document.getElementById('sidebar');
    if (!aside || !role || typeof roleRules !== 'function') return;

    const groups = groupsForRole(role);
    let html = '<div class="side-brand"><div class="brand-mark">L</div><h1>Loopline</h1></div>';
    html += '<div class="side-nav-scroll">';

    groups.forEach((group) => {
      const visible = group.items.filter((item) => roleRules(role)[item.page]);
      if (!visible.length) return;
      html += `<div class="nav-group"><div class="nav-group-label">${group.label}</div>`;
      visible.forEach((item) => {
        const active = item.page === activePage ? ' active' : '';
        let lockHtml = '';
        if (item.lock === 'revenue' && REVENUE_ROLES.includes(role)) lockHtml = '';
        else if (item.lock === 'tl' && role === 'TL') lockHtml = '';
        else if (item.lock) lockHtml = ' <span class="nav-lock">🔒</span>';
        html += `<button type="button" class="nav-item${active}" data-page="${item.page}">${item.icon} ${item.label}${lockHtml}</button>`;
      });
      html += '</div>';
    });

    html += '</div>';

    html += `<div class="side-foot">
      <div class="side-profile-menu" id="side-profile-menu" hidden role="menu">
        <button type="button" class="switch-user" role="menuitem" onclick="openChangePasswordModal(); closeProfileMenu();">Change password</button>
        <button type="button" class="switch-user" role="menuitem" onclick="logout()">Logout</button>
      </div>
      <button type="button" class="who who-btn" id="side-profile-btn" aria-expanded="false" aria-haspopup="true" aria-controls="side-profile-menu" onclick="toggleProfileMenu(event)">
        <div class="avatar" id="side-avatar">?</div>
        <div class="who-meta">
          <div class="who-name" id="side-name">—</div>
          <div class="who-role" id="side-role">—</div>
        </div>
        <span class="who-caret" aria-hidden="true">▴</span>
      </button>
    </div>`;

    aside.innerHTML = html;
    aside.setAttribute('data-nav', 'v2');
    wireNavLinks(role);
  }

  function initSidebarEarly() {
    if (!window.LOOPLINE_PAGE) return;
    const user = cachedUser();
    if (user && user.role) buildSidebar(user.role, window.LOOPLINE_PAGE);
  }

  window.buildSidebar = buildSidebar;
  window.wireNavLinks = wireNavLinks;
  window.NAV_GROUPS = NAV;
  window.cachedLooplineUser = cachedUser;
  window.purgeLegacySidebar = purgeLegacySidebar;

  purgeLegacySidebar();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarEarly);
  } else {
    initSidebarEarly();
  }
})();
