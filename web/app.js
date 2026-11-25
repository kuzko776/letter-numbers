import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

const el = (id) => document.getElementById(id);
const login = el('login-form');
const reservation = el('reservation-form');
const users = el('user-form');
const resetDialog = el('reset-dialog');
const resetForm = el('reset-form');
const dateFormat = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short',
});
let session = JSON.parse(sessionStorage.getItem('amr-session') ?? 'null');
let user;
let offset = 0;
let query = '';
let listRequest = 0;
let resetUser;

function notice(message, error = false) {
  const element = el('notice');
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('error', error);
}

function setSession(next) {
  session = next ? { access_token: next.access_token, refresh_token: next.refresh_token, expires_at: next.expires_at } : null;
  if (session) sessionStorage.setItem('amr-session', JSON.stringify(session));
  else sessionStorage.removeItem('amr-session');
}

async function refreshSession() {
  if (!session?.refresh_token) return false;
  const { response, payload } = await request('/auth/v1/token?grant_type=refresh_token', {
    data: { refresh_token: session.refresh_token },
  });
  if (!response.ok || !payload?.access_token) return false;
  setSession(payload);
  return true;
}

async function rpc(name, data = {}) {
  const sent = session;
  if (!sent) throw new Error('سجّل دخولك للمتابعة.');
  if (sent.expires_at * 1000 - Date.now() < 60_000) await refreshSession();
  let { response, payload } = await request(`/rest/v1/rpc/${name}`, { data, bearer: session?.access_token });
  if (response.status === 401 && session === sent && await refreshSession()) {
    ({ response, payload } = await request(`/rest/v1/rpc/${name}`, { data, bearer: session.access_token }));
  }
  if (response.status === 401 || payload?.details === '401') {
    if (session) showLogin();
    throw new Error('سجّل دخولك للمتابعة.');
  }
  if (!response.ok) {
    throw new Error(payload?.code === 'P0001' && payload.message ? payload.message : 'تعذر إكمال العملية.');
  }
  return payload;
}

async function signIn({ email, password }) {
  const { response, payload } = await request('/auth/v1/token?grant_type=password', {
    data: { email: String(email).trim().toLowerCase(), password },
  });
  if (response.status === 400 || response.status === 401) throw new Error(authError);
  if (response.status === 429) throw new Error('محاولات دخول كثيرة. حاول مرة أخرى بعد عدة دقائق.');
  if (!response.ok || !payload?.access_token) throw new Error('تعذر إكمال العملية.');
  setSession(payload);
}

async function api(path, { method = 'GET', data } = {}) {
  const url = new URL(path, 'http://x');
  const id = path.split('?')[0].split('/')[2];
  if (path === '/me') return rpc('me');
  if (path === '/login') return signIn(data);
  if (path === '/logout') {
    const current = session;
    showLogin();
    if (current) await request('/auth/v1/logout', { bearer: current.access_token }).catch(() => {});
    return {};
  }
  if (url.pathname === '/letters' && method === 'GET') {
    return rpc('list_letters', { p_query: url.searchParams.get('q') ?? '', p_offset: Number(url.searchParams.get('offset')) || 0 });
  }
  if (url.pathname === '/letters') return rpc('reserve_letter', { p_subject: data.subject, p_request_id: data.requestId });
  if (path === '/users' && method === 'GET') return rpc('list_employees');
  if (path === '/users') return rpc('create_employee', { p_name: data.name, p_email: data.email, p_password: data.password });
  if (Object.hasOwn(data, 'password')) return rpc('set_employee_password', { p_id: id, p_password: data.password });
  return rpc('set_employee_active', { p_id: id, p_active: data.active });
}

async function submit(event, action, onError = (error) => notice(error.message, true)) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  notice('');
  try {
    await action(Object.fromEntries(new FormData(form)));
  } catch (error) {
    onError(error);
  } finally {
    button.disabled = false;
  }
}

function appendRow(table, values) {
  const row = table.insertRow();
  for (const value of values) {
    const cell = row.insertCell();
    if (value instanceof Node) cell.append(value);
    else cell.textContent = value;
  }
}

function ltr(text) {
  const element = document.createElement('bdi');
  element.dir = 'ltr';
  element.textContent = text;
  return element;
}

function emptyRow(table, message) {
  const cell = table.insertRow().insertCell();
  cell.colSpan = 4;
  cell.className = 'empty';
  cell.textContent = message;
}

async function loadLetters(nextOffset = 0, nextQuery = query) {
  const request = ++listRequest;
  const params = new URLSearchParams({ q: nextQuery, offset: nextOffset });
  const { letters, more } = await api(`/letters?${params}`);
  if (request !== listRequest) return;
  offset = nextOffset;
  query = nextQuery;
  const table = el('letters');
  table.replaceChildren();
  if (!letters.length) emptyRow(table, query ? 'لا توجد حجوزات مطابقة.' : 'لا توجد حجوزات بعد.');
  for (const letter of letters) {
    const date = document.createElement('time');
    date.dateTime = letter.createdAt;
    date.textContent = dateFormat.format(new Date(letter.createdAt));
    appendRow(table, [ltr(letter.number), letter.subject, letter.requestedBy, date]);
  }
  el('pagination').hidden = !more && offset === 0;
  el('page-number').textContent = `صفحة ${offset / 25 + 1}`;
  el('previous').disabled = offset === 0;
  el('next').disabled = !more;
}

function makeButton(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = label;
  return button;
}

async function loadUsers() {
  const active = session;
  const accounts = await api('/users');
  if (active !== session) return;
  const table = el('users');
  table.replaceChildren();
  if (!accounts.length) emptyRow(table, 'لا توجد حسابات موظفين بعد.');
  for (const account of accounts) {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const toggle = makeButton(account.active ? 'تعطيل' : 'تفعيل');
    const reset = makeButton('تعيين كلمة مرور');
    toggle.addEventListener('click', async () => {
      notice('');
      toggle.disabled = true;
      try {
        await api(`/users/${account.id}`, { method: 'PATCH', data: { active: !account.active } });
        await loadUsers();
        notice(account.active ? 'تم تعطيل الحساب.' : 'تم تفعيل الحساب.');
      } catch (error) {
        notice(error.message, true);
      } finally {
        toggle.disabled = false;
      }
    });
    reset.addEventListener('click', () => {
      resetUser = account.id;
      el('reset-name').textContent = account.name;
      resetDialog.showModal();
    });
    actions.append(toggle, reset);
    appendRow(table, [account.name, ltr(account.email), account.active ? 'مفعّل' : 'معطّل', actions]);
  }
}

async function showWorkspace() {
  user = await api('/me');
  query = '';
  offset = 0;
  el('welcome').textContent = `مرحبًا، ${user.name}`;
  el('letters-title').textContent = user.role === 'admin' ? 'سجل حجوزات الشركة' : 'حجوزاتي';
  el('admin-toggle').hidden = user.role !== 'admin';
  el('login-view').hidden = true;
  el('workspace').hidden = false;
  el('logout').hidden = false;
  await loadLetters();
}

login.addEventListener('submit', (event) => submit(event, async (data) => {
  await api('/login', { method: 'POST', data });
  login.reset();
  await showWorkspace();
}));

reservation.addEventListener('submit', (event) => submit(event, async ({ subject }) => {
  const key = `amr-reservation-${user.id}`;
  subject = subject.trim();
  const pending = JSON.parse(sessionStorage.getItem(key) ?? 'null');
  const requestId = pending?.subject === subject ? pending.requestId : crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ subject, requestId }));
  el('receipt').hidden = true;
  const letter = await api('/letters', { method: 'POST', data: { subject, requestId } });
  sessionStorage.removeItem(key);
  reservation.reset();
  el('letter-number').textContent = letter.number;
  el('receipt').hidden = false;
  notice(`تم حجز رقم الخطاب ${letter.number}.`);
  el('search-form').reset();
  await loadLetters(0, '');
}));

el('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el('letter-number').textContent);
    notice('تم نسخ رقم الخطاب.');
  } catch {
    notice('تعذر النسخ تلقائيًا. يمكنك تحديد الرقم ونسخه.', true);
  }
});

el('search-form').addEventListener('submit', (event) => submit(event, () => loadLetters(0, el('query').value.trim())));
el('previous').addEventListener('click', () => {
  loadLetters(Math.max(0, offset - 25)).catch((error) => notice(error.message, true));
});
el('next').addEventListener('click', () => {
  loadLetters(offset + 25).catch((error) => notice(error.message, true));
});

el('admin-toggle').addEventListener('click', () => {
  const view = el('admin-view');
  view.hidden = !view.hidden;
  el('admin-toggle').setAttribute('aria-expanded', String(!view.hidden));
  if (!view.hidden) loadUsers().catch((error) => notice(error.message, true));
});

users.addEventListener('submit', (event) => submit(event, async (data) => {
  await api('/users', { method: 'POST', data });
  users.reset();
  notice('تم إنشاء الحساب.');
  await loadUsers();
}));

resetForm.addEventListener('submit', (event) => submit(event, async (data) => {
  el('reset-error').hidden = true;
  await api(`/users/${resetUser}`, { method: 'PATCH', data });
  resetDialog.close();
  notice('تم تغيير كلمة المرور.');
}, (error) => {
  if (!resetDialog.open) return notice(error.message, true);
  el('reset-error').textContent = error.message;
  el('reset-error').hidden = false;
}));

el('cancel-reset').addEventListener('click', () => resetDialog.close());
resetDialog.addEventListener('close', () => {
  resetForm.reset();
  el('reset-error').hidden = true;
});

el('logout').addEventListener('click', async () => {
  try {
    await api('/logout', { method: 'POST' });
    notice('');
  } catch (error) {
    notice(error.message, true);
  } finally {
    showLogin();
  }
});

if (!session) {
  showLogin();
} else {
  showWorkspace().catch((error) => {
    if (el('workspace').hidden) showLogin();
    notice(error.message, true);
  });
}
