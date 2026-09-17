function setLoginLoading(loading) {
  const btn = document.getElementById('login-submit-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
}

function toggleLoginPassword() {
  const input = document.getElementById('login-password');
  const btn = document.getElementById('login-pass-toggle');
  if (!input || !btn) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.innerHTML = show
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}

function fillDemoAccount(email, password, chip) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = password;
  document.getElementById('login-error').textContent = '';
  document.querySelectorAll('.role-card').forEach((c) => c.classList.remove('active'));
  if (chip) chip.classList.add('active');
  const preview = document.getElementById('login-role-preview');
  if (preview && chip) {
    const name = chip.querySelector('.role-card-name')?.textContent || 'Role';
    const desc = chip.dataset.desc || '';
    preview.textContent = `${name} access: ${desc}`;
    preview.classList.add('active');
  }
  document.getElementById('login-password').focus();
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !password) {
    errEl.textContent = 'Enter your email and password.';
    return;
  }
  setLoginLoading(true);
  try {
    const res = await Api.login(email, password);
    Api.setToken(res.token);
    localStorage.setItem('loopline_user', JSON.stringify(res.user));
    location.href = resolvePagePath(res.landingPage || pageUrl(landingPageKey(res.user.role), res.user.role));
  } catch (e) {
    errEl.textContent = e.message;
    setLoginLoading(false);
  }
}

window.doLogin = doLogin;
window.toggleLoginPassword = toggleLoginPassword;

document.getElementById('login-email')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});

document.getElementById('login-password')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});

document.querySelectorAll('.role-card').forEach((chip) => {
  chip.addEventListener('click', () => {
    fillDemoAccount(chip.dataset.email, chip.dataset.pass, chip);
  });
});

(async function initLogin() {
  if (Api.getToken()) {
    try {
      const me = await Api.me();
      location.href = resolvePagePath(me.landingPage || pageUrl(landingPageKey(me.user.role), me.user.role));
      return;
    } catch (_) {
      Api.setToken(null);
    }
  }
})();
