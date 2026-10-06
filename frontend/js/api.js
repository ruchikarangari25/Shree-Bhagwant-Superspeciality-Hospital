// Shared API helper. If the page is opened from the backend (http://localhost:5000) it uses the same origin;
// otherwise it falls back to localhost:5000.
const API = location.port === '5000' ? '' : 'http://localhost:5000';

const Auth = {
  get() { try { return JSON.parse(localStorage.getItem('hms_auth')); } catch { return null; } },
  set(v) { localStorage.setItem('hms_auth', JSON.stringify(v)); },
  clear() { localStorage.removeItem('hms_auth'); },
  require(role) {
    const a = this.get();
    if (!a || a.role !== role) { location.href = 'login.html'; return null; }
    return a;
  }
};

async function api(path, opts = {}) {
  const a = Auth.get();
  const res = await fetch(API + '/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(a ? { Authorization: 'Bearer ' + a.token } : {}), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && a) { Auth.clear(); location.href = 'login.html'; }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function logout() {
  api('/logout', { method: 'POST' }).catch(() => {}).finally(() => { Auth.clear(); location.href = 'login.html'; });
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function showMsg(el, type, text) { el.className = 'msg ' + type; el.textContent = text; }
