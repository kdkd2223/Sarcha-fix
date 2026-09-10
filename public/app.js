// SIDEBAR_FIX_MARKER_v4
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = {
  admin: null,
  permissions: {},
  page: 'dashboard',
  clearance: null,
  pollTimer: null
};

const PAGE_TITLES = {
  dashboard: 'Главная',
  notes: 'Заметки администрации',
  news: 'Новости',
  events: 'События / Собрания',
  rules: 'Правила администрации',
  stats: 'Статистика',
  logs: 'Журнал действий',
  notifications: 'Уведомления',
  roster: 'Состав администрации',
  admins: 'Управление администраторами',
  profile: 'Профиль',
  scp: 'SCP Database',
  terminal: 'SCP Terminal'
};

const CLEARANCE_BY_ROLE = {
  GA: { level: 5, label: 'LEVEL-5 · Administrator' },
  ZGA: { level: 4, label: 'LEVEL-4 · Command Access' },
  SENIOR: { level: 3, label: 'LEVEL-3 · Personnel Access' },
  MODERATOR: { level: 2, label: 'LEVEL-2 · Research Access' }
};

const ROLE_PILL = {
  GA: 'pill-ga',
  ZGA: 'pill-zga',
  SENIOR: 'pill-senior',
  MODERATOR: 'pill-moderator'
};

const CATEGORY_LABELS = {
  general: 'Общие правила',
  moderation: 'Правила модерации',
  punishments: 'Наказания',
  duties: 'Обязанности',
  discord: 'Discord',
  other: 'Другие инструкции'
};

async function api(path, options = {}) {
  const opts = {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  };
  if (opts.body && typeof opts.body === 'object') {
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str.includes('T') ? str : str + 'Z');
  if (isNaN(d)) return str;
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDateOnly(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('ru-RU');
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showLogin() {
  $('#setup-view').classList.add('hidden');
  $('#login-view').classList.remove('hidden');
  $('#main-view').classList.add('hidden');
}

function showSetup() {
  $('#login-view').classList.add('hidden');
  $('#setup-view').classList.remove('hidden');
  $('#main-view').classList.add('hidden');
}

function showMain() {
  $('#login-view').classList.add('hidden');
  $('#setup-view').classList.add('hidden');
  $('#main-view').classList.remove('hidden');
  $('#sidebar-name').textContent = state.admin.display_name;
  $('#sidebar-role').textContent = state.admin.role_label || state.admin.role;
  $('#topbar-user').textContent = state.admin.display_name;

  const clr = state.admin.clearance || CLEARANCE_BY_ROLE[state.admin.role] || { level: 1, label: 'LEVEL-1 · Basic Access' };
  state.clearance = clr;
  const clrEl = $('#sidebar-clearance');
  if (clrEl) clrEl.textContent = clr.label || `LEVEL-${clr.level || 1}`;

  // Hide nav items without permission
  $$('.nav-item[data-perm]').forEach(el => {
    const perm = el.dataset.perm;
    const allowed = state.permissions[perm] || state.permissions.full_access;
    el.style.display = allowed ? '' : 'none';
  });

  startLivePolling();
}

async function checkAuth() {
  try {
    const me = await api('/me');
    state.admin = me;
    state.permissions = me.permissions || {};
    showMain();
    route();
    loadNotifBadge();
  } catch {
    try {
      const status = await api('/setup/status');
      if (status.needsSetup) {
        showSetup();
        return;
      }
    } catch {}
    showLogin();
  }
}

// ---- Login / Logout ----
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#login-error');
  errEl.classList.add('hidden');
  const username = $('#username').value.trim();
  const password = $('#password').value;
  try {
    const data = await api('/login', { method: 'POST', body: { username, password } });
    state.admin = data.admin;
    state.permissions = {}; // will be filled by /me
    await checkAuth();
  } catch (err) {
    errEl.textContent = err.message || 'Ошибка входа';
    errEl.classList.remove('hidden');
  }
});

$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#setup-error');
  errEl.classList.add('hidden');
  const display_name = $('#setup-display-name').value.trim();
  const username = $('#setup-username').value.trim();
  const password = $('#setup-password').value;
  try {
    await api('/setup', { method: 'POST', body: { username, password, display_name } });
    // Аккаунт создан — сразу входим под ним
    const data = await api('/login', { method: 'POST', body: { username, password } });
    state.admin = data.admin;
    await checkAuth();
  } catch (err) {
    errEl.textContent = err.message || 'Ошибка настройки';
    errEl.classList.remove('hidden');
  }
});

$('#logout-btn').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch {}
  state.admin = null;
  showLogin();
  location.hash = '';
});

// ---- Sidebar mobile ----
function openSidebar() {
  const sidebar = $('#sidebar');
  sidebar.classList.add('open');
  sidebar.style.transform = 'translateX(0)';
  $('#menu-toggle').classList.add('active');
}

function closeSidebar() {
  const sidebar = $('#sidebar');
  sidebar.classList.remove('open');
  sidebar.style.transform = '';
  $('#menu-toggle').classList.remove('active');
}

$('#menu-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
});
$('#sidebar-close').addEventListener('click', closeSidebar);
$$('.nav-item').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const href = el.getAttribute('href'); // e.g. "#/events"
    closeSidebar();
    if (location.hash === href) {
      route(); // hash unchanged -> hashchange won't fire, render manually
    } else {
      location.hash = href;
    }
  });
});
// Tap/click anywhere outside the open sidebar closes it.
document.addEventListener('click', (e) => {
  const sidebar = $('#sidebar');
  if (!sidebar.classList.contains('open')) return;
  if (sidebar.contains(e.target) || $('#menu-toggle').contains(e.target)) return;
  closeSidebar();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSidebar();
});

// ---- Modal ----
function openModal(title, bodyHtml, footerHtml = '') {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="modal-close" data-close>×</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>`;
  root.querySelector('[data-close]').onclick = closeModal;
  root.querySelector('.modal-overlay').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) closeModal();
  });
  return root.querySelector('.modal');
}

function closeModal() {
  $('#modal-root').innerHTML = '';
}

// ---- Router ----
function route() {
  const hash = location.hash.slice(1) || '/dashboard';
  const page = hash.replace(/^\//, '').split('/')[0] || 'dashboard';
  state.page = page;

  $$('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  $('#page-title').textContent = PAGE_TITLES[page] || page;

  const content = $('#page-content');
  content.innerHTML = '<div class="empty">Загрузка…</div>';

  const handlers = {
    dashboard: renderDashboard,
    notes: renderNotes,
    news: renderNews,
    events: renderEvents,
    rules: renderRules,
    stats: renderStats,
    logs: renderLogs,
    notifications: renderNotifications,
    roster: renderRoster,
    admins: renderAdmins,
    profile: renderProfile,
    scp: renderScp,
    terminal: renderTerminal
  };

  const fn = handlers[page];
  if (fn) fn(content);
  else content.innerHTML = '<div class="empty">Страница не найдена</div>';
}

window.addEventListener('hashchange', route);

// ---- Dashboard ----
async function renderDashboard(el) {
  try {
    const data = await api('/dashboard');
    let systemStatus = null;
    try { systemStatus = await api('/system/status'); } catch { /* optional endpoint */ }

    const s = data.stats || {};
    const clr = state.clearance || CLEARANCE_BY_ROLE[state.admin?.role] || { label: 'LEVEL-1' };

    el.innerHTML = `
      <div class="welcome">
        <h1>Привет, ${escapeHtml(data.admin.display_name)}!</h1>
        <p>${escapeHtml(data.admin.role_label || data.admin.role)} · ${escapeHtml(clr.label || '')} · Arca-13 Admin</p>
      </div>
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="card stat-card">
          <div class="stat-value">${s.admins ?? '—'}</div>
          <div class="stat-label">Администраторов</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${s.notes ?? '—'}</div>
          <div class="stat-label">Заметок</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${s.news ?? '—'}</div>
          <div class="stat-label">Новостей</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${s.events ?? '—'}</div>
          <div class="stat-label">Событий</div>
        </div>
      </div>
      ${s.scp != null || s.notifications != null || s.actions_today != null ? `
      <div class="grid grid-4" style="margin-bottom:16px">
        ${s.scp != null ? `<div class="card stat-card"><div class="stat-value">${s.scp}</div><div class="stat-label">SCP объектов</div></div>` : ''}
        ${s.notifications != null ? `<div class="card stat-card"><div class="stat-value">${s.notifications}</div><div class="stat-label">Уведомлений</div></div>` : ''}
        ${s.actions_today != null ? `<div class="card stat-card"><div class="stat-value">${s.actions_today}</div><div class="stat-label">Действий сегодня</div></div>` : ''}
        ${s.actions_week != null ? `<div class="card stat-card"><div class="stat-value">${s.actions_week}</div><div class="stat-label">За неделю</div></div>` : ''}
      </div>` : ''}
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">System Status</span></div>
        <div class="status-grid" id="system-status-grid">
          ${renderSystemStatusHtml(systemStatus)}
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header"><span class="card-title">Ближайшие события</span></div>
          ${(data.upcoming_events || []).length ? data.upcoming_events.map(e => `
            <div class="list-item">
              <div class="list-item-title">${escapeHtml(e.title)}</div>
              <div class="list-item-meta">${formatDateOnly(e.event_date)}${e.event_time ? ' · ' + e.event_time : ''} · ${escapeHtml(e.author_name || '')}</div>
            </div>
          `).join('') : '<div class="empty" style="padding:20px">Нет ближайших событий</div>'}
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Последние новости</span></div>
          ${(data.latest_news || []).length ? data.latest_news.map(n => `
            <div class="list-item">
              <div class="list-item-title">${n.is_pinned ? '📌 ' : ''}${escapeHtml(n.title)}</div>
              <div class="list-item-meta">${formatDate(n.created_at)} · ${escapeHtml(n.author_name || '')}</div>
            </div>
          `).join('') : '<div class="empty" style="padding:20px">Нет новостей</div>'}
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header"><span class="card-title">Последние действия</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Админ</th><th>Действие</th><th>Объект</th><th>Время</th></tr></thead>
            <tbody>
              ${(data.recent_actions || []).map(a => `
                <tr>
                  <td>${escapeHtml(a.admin_name || '—')}</td>
                  <td>${escapeHtml(a.action)}</td>
                  <td>${escapeHtml(a.details || a.target_type || '—')}</td>
                  <td>${formatDate(a.created_at)}</td>
                </tr>
              `).join('') || '<tr><td colspan="4">Нет данных</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
  }
}

function renderSystemStatusHtml(status) {
  const defaults = [
    { name: 'DATABASE', key: 'database' },
    { name: 'API', key: 'api' },
    { name: 'AUTHENTICATION', key: 'auth' },
    { name: 'SYSTEM', key: 'system' }
  ];
  return defaults.map(d => {
    const val = status && status[d.key] != null ? String(status[d.key]).toUpperCase() : 'ONLINE';
    const cls = val.includes('OFF') ? 'status-offline' : (val.includes('DEGRAD') ? 'status-degraded' : 'status-online');
    return `<div class="status-item"><div class="status-name">${d.name}</div><div class="status-value ${cls}">${escapeHtml(val)}</div></div>`;
  }).join('');
}

// ---- Notes ----
async function renderNotes(el) {
  let search = '';
  const load = async () => {
    try {
      const list = await api('/notes' + (search ? `?q=${encodeURIComponent(search)}` : ''));
      el.innerHTML = `
        <div class="toolbar">
          <input class="search-input" id="notes-search" placeholder="Поиск заметок…" value="${escapeHtml(search)}" />
          <button class="btn btn-primary" id="note-create">+ Создать заметку</button>
        </div>
        <div class="grid">
          ${list.length ? list.map(n => `
            <div class="card" data-id="${n.id}">
              <div class="card-header">
                <span class="card-title">${escapeHtml(n.title)}</span>
                <div>
                  <button class="btn btn-ghost btn-sm note-edit" data-id="${n.id}">✎</button>
                  <button class="btn btn-danger btn-sm note-del" data-id="${n.id}">✕</button>
                </div>
              </div>
              <div style="white-space:pre-wrap;font-size:0.875rem;color:var(--text-muted);margin-bottom:10px">${escapeHtml(n.content)}</div>
              <div class="card-meta">${escapeHtml(n.author_name || '')} · ${formatDate(n.updated_at)}</div>
            </div>
          `).join('') : '<div class="empty"><div class="empty-icon">📝</div>Заметок пока нет</div>'}
        </div>
      `;

      $('#notes-search').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          search = e.target.value.trim();
          load();
        }
      });
      $('#note-create').onclick = () => openNoteModal();
      $$('.note-edit').forEach(b => b.onclick = () => openNoteModal(b.dataset.id));
      $$('.note-del').forEach(b => b.onclick = async () => {
        if (!confirm('Удалить заметку?')) return;
        await api(`/notes/${b.dataset.id}`, { method: 'DELETE' });
        load();
      });
    } catch (e) {
      el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
    }
  };

  async function openNoteModal(id = null) {
    let note = { title: '', content: '' };
    if (id) {
      note = await api(`/notes/${id}`);
    }
    openModal(id ? 'Редактировать заметку' : 'Новая заметка', `
      <div class="form-group"><label>Заголовок</label><input id="m-title" value="${escapeHtml(note.title)}" /></div>
      <div class="form-group"><label>Текст</label><textarea id="m-content">${escapeHtml(note.content)}</textarea></div>
    `, `
      <button class="btn btn-ghost" data-close>Отмена</button>
      <button class="btn btn-primary" id="m-save">Сохранить</button>
    `);
    $('[data-close]').onclick = closeModal;
    $('#m-save').onclick = async () => {
      const title = $('#m-title').value.trim();
      const content = $('#m-content').value.trim();
      if (!title || !content) return alert('Заполните все поля');
      if (id) {
        await api(`/notes/${id}`, { method: 'PUT', body: { title, content } });
      } else {
        await api('/notes', { method: 'POST', body: { title, content } });
      }
      closeModal();
      load();
    };
  }

  load();
}

// ---- News ----
async function renderNews(el) {
  const canManage = state.permissions.manage_news || state.permissions.full_access;
  const load = async () => {
    try {
      const list = await api('/news');
      el.innerHTML = `
        <div class="toolbar">
          ${canManage ? '<button class="btn btn-primary" id="news-create">+ Создать новость</button>' : ''}
        </div>
        <div class="grid">
          ${list.length ? list.map(n => `
            <div class="card">
              <div class="card-header">
                <span class="card-title">${n.is_pinned ? '<span class="pill pill-pinned">Закрепл.</span> ' : ''}${escapeHtml(n.title)}</span>
                ${canManage ? `<div>
                  <button class="btn btn-ghost btn-sm news-edit" data-id="${n.id}">✎</button>
                  <button class="btn btn-danger btn-sm news-del" data-id="${n.id}">✕</button>
                </div>` : ''}
              </div>
              <div style="white-space:pre-wrap;font-size:0.875rem;color:var(--text-muted);margin-bottom:10px">${escapeHtml(n.content)}</div>
              <div class="card-meta">${escapeHtml(n.author_name || '')} · ${formatDate(n.created_at)}</div>
            </div>
          `).join('') : '<div class="empty"><div class="empty-icon">📢</div>Новостей пока нет</div>'}
        </div>
      `;
      if (canManage) {
        $('#news-create')?.addEventListener('click', () => openNewsModal());
        $$('.news-edit').forEach(b => b.onclick = () => openNewsModal(b.dataset.id));
        $$('.news-del').forEach(b => b.onclick = async () => {
          if (!confirm('Удалить новость?')) return;
          await api(`/news/${b.dataset.id}`, { method: 'DELETE' });
          load();
        });
      }
    } catch (e) {
      el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
    }
  };

  async function openNewsModal(id = null) {
    let item = { title: '', content: '', is_pinned: 0 };
    if (id) item = await api(`/news/${id}`);
    openModal(id ? 'Редактировать новость' : 'Новая новость', `
      <div class="form-group"><label>Заголовок</label><input id="m-title" value="${escapeHtml(item.title)}" /></div>
      <div class="form-group"><label>Текст</label><textarea id="m-content">${escapeHtml(item.content)}</textarea></div>
      <div class="form-group">
        <label><input type="checkbox" id="m-pinned" ${item.is_pinned ? 'checked' : ''} /> Закрепить</label>
      </div>
    `, `
      <button class="btn btn-ghost" data-close>Отмена</button>
      <button class="btn btn-primary" id="m-save">Сохранить</button>
    `);
    $('[data-close]').onclick = closeModal;
    $('#m-save').onclick = async () => {
      const title = $('#m-title').value.trim();
      const content = $('#m-content').value.trim();
      const is_pinned = $('#m-pinned').checked;
      if (!title || !content) return alert('Заполните все поля');
      if (id) {
        await api(`/news/${id}`, { method: 'PUT', body: { title, content, is_pinned } });
      } else {
        await api('/news', { method: 'POST', body: { title, content, is_pinned } });
      }
      closeModal();
      load();
    };
  }

  load();
}

// ---- Events ----
async function renderEvents(el) {
  const canManage = state.permissions.manage_events || state.permissions.full_access;
  const load = async () => {
    try {
      const list = await api('/events');
      el.innerHTML = `
        <div class="toolbar">
          ${canManage ? '<button class="btn btn-primary" id="event-create">+ Создать событие</button>' : ''}
        </div>
        <div class="grid">
          ${list.length ? list.map(e => `
            <div class="card">
              <div class="card-header">
                <span class="card-title">${escapeHtml(e.title)}</span>
                ${canManage ? `<div>
                  <button class="btn btn-ghost btn-sm event-edit" data-id="${e.id}">✎</button>
                  <button class="btn btn-danger btn-sm event-del" data-id="${e.id}">✕</button>
                </div>` : ''}
              </div>
              <div class="list-item-meta" style="margin-bottom:8px">
                📅 ${formatDateOnly(e.event_date)}${e.event_time ? ' · 🕐 ' + e.event_time : ''}
                ${e.location ? ' · 📍 ' + escapeHtml(e.location) : ''}
              </div>
              ${e.description ? `<div style="white-space:pre-wrap;font-size:0.875rem;color:var(--text-muted);margin-bottom:8px">${escapeHtml(e.description)}</div>` : ''}
              <div class="card-meta">${escapeHtml(e.author_name || '')} · ${formatDate(e.created_at)}</div>
            </div>
          `).join('') : '<div class="empty"><div class="empty-icon">📅</div>Событий пока нет</div>'}
        </div>
      `;
      if (canManage) {
        $('#event-create')?.addEventListener('click', () => openEventModal());
        $$('.event-edit').forEach(b => b.onclick = () => openEventModal(b.dataset.id));
        $$('.event-del').forEach(b => b.onclick = async () => {
          if (!confirm('Удалить событие?')) return;
          await api(`/events/${b.dataset.id}`, { method: 'DELETE' });
          load();
        });
      }
    } catch (e) {
      el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
    }
  };

  async function openEventModal(id = null) {
    let item = { title: '', description: '', event_date: '', event_time: '', location: '' };
    if (id) item = await api(`/events/${id}`);
    openModal(id ? 'Редактировать событие' : 'Новое событие', `
      <div class="form-group"><label>Название</label><input id="m-title" value="${escapeHtml(item.title)}" /></div>
      <div class="form-group"><label>Дата</label><input type="date" id="m-date" value="${escapeHtml(item.event_date || '')}" /></div>
      <div class="form-group"><label>Время</label><input type="time" id="m-time" value="${escapeHtml(item.event_time || '')}" /></div>
      <div class="form-group"><label>Место / ссылка Discord</label><input id="m-loc" value="${escapeHtml(item.location || '')}" /></div>
      <div class="form-group"><label>Описание</label><textarea id="m-desc">${escapeHtml(item.description || '')}</textarea></div>
    `, `
      <button class="btn btn-ghost" data-close>Отмена</button>
      <button class="btn btn-primary" id="m-save">Сохранить</button>
    `);
    $('[data-close]').onclick = closeModal;
    $('#m-save').onclick = async () => {
      const body = {
        title: $('#m-title').value.trim(),
        event_date: $('#m-date').value,
        event_time: $('#m-time').value || null,
        location: $('#m-loc').value.trim() || null,
        description: $('#m-desc').value.trim() || null
      };
      if (!body.title || !body.event_date) return alert('Название и дата обязательны');
      if (id) {
        await api(`/events/${id}`, { method: 'PUT', body });
      } else {
        await api('/events', { method: 'POST', body });
      }
      closeModal();
      load();
    };
  }

  load();
}

// ---- Rules ----
async function renderRules(el) {
  const canManage = state.permissions.manage_rules || state.permissions.full_access;
  let activeCat = 'general';

  const load = async () => {
    try {
      const list = await api('/rules');
      const cats = [...new Set(list.map(r => r.category))];
      if (!cats.includes(activeCat) && cats.length) activeCat = cats[0];

      const filtered = list.filter(r => r.category === activeCat);

      el.innerHTML = `
        <div class="toolbar">
          ${canManage ? '<button class="btn btn-primary" id="rule-create">+ Добавить правило</button>' : ''}
        </div>
        <div class="rules-tabs">
          ${Object.entries(CATEGORY_LABELS).map(([k, v]) => `
            <button class="rules-tab ${k === activeCat ? 'active' : ''}" data-cat="${k}">${v}</button>
          `).join('')}
        </div>
        <div class="card">
          ${filtered.length ? filtered.map(r => `
            <div class="rule-block">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <h4>${escapeHtml(r.title)}</h4>
                ${canManage ? `<div>
                  <button class="btn btn-ghost btn-sm rule-edit" data-id="${r.id}">✎</button>
                  <button class="btn btn-danger btn-sm rule-del" data-id="${r.id}">✕</button>
                </div>` : ''}
              </div>
              <pre>${escapeHtml(r.content)}</pre>
            </div>
          `).join('') : '<div class="empty">В этой категории пока нет правил</div>'}
        </div>
      `;

      $$('.rules-tab').forEach(t => {
        t.onclick = () => { activeCat = t.dataset.cat; load(); };
      });
      if (canManage) {
        $('#rule-create')?.addEventListener('click', () => openRuleModal(null, activeCat));
        $$('.rule-edit').forEach(b => b.onclick = () => openRuleModal(b.dataset.id));
        $$('.rule-del').forEach(b => b.onclick = async () => {
          if (!confirm('Удалить правило?')) return;
          await api(`/rules/${b.dataset.id}`, { method: 'DELETE' });
          load();
        });
      }
    } catch (e) {
      el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
    }
  };

  async function openRuleModal(id = null, defaultCat = 'general') {
    let item = { category: defaultCat, title: '', content: '', sort_order: 0 };
    if (id) item = await api(`/rules/${id}`);
    openModal(id ? 'Редактировать правило' : 'Новое правило', `
      <div class="form-group">
        <label>Категория</label>
        <select id="m-cat">
          ${Object.entries(CATEGORY_LABELS).map(([k, v]) =>
            `<option value="${k}" ${item.category === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group"><label>Заголовок</label><input id="m-title" value="${escapeHtml(item.title)}" /></div>
      <div class="form-group"><label>Текст</label><textarea id="m-content">${escapeHtml(item.content)}</textarea></div>
      <div class="form-group"><label>Порядок</label><input type="number" id="m-order" value="${item.sort_order || 0}" /></div>
    `, `
      <button class="btn btn-ghost" data-close>Отмена</button>
      <button class="btn btn-primary" id="m-save">Сохранить</button>
    `);
    $('[data-close]').onclick = closeModal;
    $('#m-save').onclick = async () => {
      const body = {
        category: $('#m-cat').value,
        title: $('#m-title').value.trim(),
        content: $('#m-content').value.trim(),
        sort_order: parseInt($('#m-order').value, 10) || 0
      };
      if (!body.title || !body.content) return alert('Заполните все поля');
      if (id) {
        await api(`/rules/${id}`, { method: 'PUT', body });
      } else {
        await api('/rules', { method: 'POST', body });
      }
      closeModal();
      load();
    };
  }

  load();
}

// ---- Stats ----
async function renderStats(el) {
  try {
    const data = await api('/stats');
    el.innerHTML = `
      <div class="grid grid-4" style="margin-bottom:24px">
        <div class="card stat-card"><div class="stat-value">${data.totals.admins}</div><div class="stat-label">Админов</div></div>
        <div class="card stat-card"><div class="stat-value">${data.totals.notes}</div><div class="stat-label">Заметок</div></div>
        <div class="card stat-card"><div class="stat-value">${data.totals.news}</div><div class="stat-label">Новостей</div></div>
        <div class="card stat-card"><div class="stat-value">${data.totals.events}</div><div class="stat-label">Событий</div></div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header"><span class="card-title">Активность</span></div>
          <div class="list-item"><div class="list-item-title">За 7 дней</div><div class="list-item-meta">${data.activity.last_7_days} действий</div></div>
          <div class="list-item"><div class="list-item-title">За 30 дней</div><div class="list-item-meta">${data.activity.last_30_days} действий</div></div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">По должностям</span></div>
          ${(data.by_role || []).map(r => `
            <div class="list-item">
              <div class="list-item-title"><span class="pill ${ROLE_PILL[r.role] || ''}">${r.role}</span></div>
              <div class="list-item-meta">${r.c} чел.</div>
            </div>
          `).join('') || '<div class="empty">Нет данных</div>'}
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header"><span class="card-title">Топ активности (30 дней)</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Администратор</th><th>Действий</th></tr></thead>
            <tbody>
              ${(data.top_actors || []).map(a => `
                <tr><td>${escapeHtml(a.display_name)}</td><td>${a.actions}</td></tr>
              `).join('') || '<tr><td colspan="2">Нет данных</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
  }
}

// ---- Logs (Audit) ----
async function renderLogs(el) {
  let page = 1;
  let filters = { user: '', action: '', object: '' };

  const load = async () => {
    try {
      const params = new URLSearchParams({ limit: '50', page: String(page) });
      if (filters.user) params.set('user', filters.user);
      if (filters.action) params.set('action', filters.action);
      if (filters.object) params.set('object', filters.object);
      const list = await api('/logs?' + params.toString());
      const rows = Array.isArray(list) ? list : (list.items || []);
      const totalPages = list.total_pages || 1;

      el.innerHTML = `
        <div class="logs-filters">
          <input type="text" id="log-user" placeholder="Пользователь" value="${escapeHtml(filters.user)}" />
          <input type="text" id="log-action" placeholder="Действие" value="${escapeHtml(filters.action)}" />
          <input type="text" id="log-object" placeholder="Объект" value="${escapeHtml(filters.object)}" />
          <button class="btn btn-primary btn-sm" id="log-apply">Фильтр</button>
          <button class="btn btn-ghost btn-sm" id="log-reset">Сброс</button>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Админ</th><th>Действие</th><th>Тип</th><th>Детали</th><th>Время</th></tr>
              </thead>
              <tbody>
                ${rows.map(a => `
                  <tr>
                    <td>${escapeHtml(a.admin_name || '—')}</td>
                    <td>${escapeHtml(a.action)}</td>
                    <td>${escapeHtml(a.target_type || '—')}</td>
                    <td>${escapeHtml(a.details || '—')}</td>
                    <td>${formatDate(a.created_at)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="5">Нет записей</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="pagination">
            <button class="btn btn-ghost btn-sm" id="log-prev" ${page <= 1 ? 'disabled' : ''}>←</button>
            <span>Стр. ${page}${totalPages > 1 ? ' / ' + totalPages : ''}</span>
            <button class="btn btn-ghost btn-sm" id="log-next" ${page >= totalPages ? 'disabled' : ''}>→</button>
          </div>
        </div>
      `;
      $('#log-apply').onclick = () => {
        filters.user = $('#log-user').value.trim();
        filters.action = $('#log-action').value.trim();
        filters.object = $('#log-object').value.trim();
        page = 1;
        load();
      };
      $('#log-reset').onclick = () => { filters = { user: '', action: '', object: '' }; page = 1; load(); };
      $('#log-prev')?.addEventListener('click', () => { if (page > 1) { page--; load(); } });
      $('#log-next')?.addEventListener('click', () => { page++; load(); });
    } catch (e) {
      el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
    }
  };
  load();
}

// ---- Notifications ----
async function loadNotifBadge() {
  try {
    const list = await api('/notifications');
    const unread = list.filter(n => !n.is_read).length;
    const badge = $('#notif-badge');
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch {}
}

async function renderNotifications(el) {
  const load = async () => {
    try {
      const list = await api('/notifications');
      el.innerHTML = `
        <div class="toolbar">
          <button class="btn btn-ghost btn-sm" id="mark-all">Отметить все прочитанными</button>
        </div>
        ${list.length ? list.map(n => {
          const type = (n.type || 'info').toLowerCase();
          const typeClass = type === 'warning' ? 'pill-type-warning' : type === 'error' || type === 'danger' ? 'pill-type-error' : type === 'system' ? 'pill-type-system' : 'pill-type-info';
          const prio = (n.priority || '').toLowerCase();
          return `
          <div class="notif-item ${n.is_read ? '' : 'unread'} ${prio === 'high' ? 'pill-priority-high' : ''}" data-id="${n.id}">
            <div class="notif-content">
              <div class="notif-title">
                <span class="pill ${typeClass}" style="margin-right:6px">${escapeHtml((n.type || 'INFO').toUpperCase())}</span>
                ${escapeHtml(n.title)}
              </div>
              ${n.message ? `<div class="notif-msg">${escapeHtml(n.message)}</div>` : ''}
              <div class="notif-time">${formatDate(n.created_at)}${prio ? ' · ' + escapeHtml(prio) : ''}</div>
            </div>
            ${!n.is_read ? `<button class="btn btn-ghost btn-sm mark-read" data-id="${n.id}">✓</button>` : ''}
          </div>`;
        }).join('') : '<div class="empty"><div class="empty-icon">🔔</div>Нет уведомлений</div>'}
      `;
      $('#mark-all')?.addEventListener('click', async () => {
        await api('/notifications', { method: 'POST', body: { action: 'mark_all_read' } });
        load();
        loadNotifBadge();
      });
      $$('.mark-read').forEach(b => b.onclick = async () => {
        await api('/notifications', { method: 'POST', body: { action: 'mark_read', id: Number(b.dataset.id) } });
        load();
        loadNotifBadge();
      });
    } catch (e) {
      el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
    }
  };
  load();
}

// ---- Roster ----
async function renderRoster(el) {
  try {
    const list = await api('/roster');
    el.innerHTML = `
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Имя</th><th>Должность</th><th>Статус</th><th>Discord</th><th>Вступил</th><th>Инфо</th></tr>
            </thead>
            <tbody>
              ${list.map(a => `
                <tr>
                  <td><strong>${escapeHtml(a.display_name)}</strong><br><span style="font-size:0.75rem;color:var(--text-dim)">${escapeHtml(a.username)}</span></td>
                  <td><span class="pill ${ROLE_PILL[a.role] || ''}">${escapeHtml(a.role_label || a.role)}</span></td>
                  <td><span class="pill ${a.status === 'active' ? 'pill-active' : 'pill-blocked'}">${a.status}</span></td>
                  <td>${escapeHtml(a.discord || '—')}</td>
                  <td>${formatDateOnly(a.joined_at)}</td>
                  <td style="max-width:180px;font-size:0.8rem;color:var(--text-muted)">${escapeHtml(a.extra_info || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
  }
}

// ---- Admins management ----
async function renderAdmins(el) {
  const load = async () => {
    try {
      const list = await api('/admins');
      el.innerHTML = `
        <div class="toolbar">
          <button class="btn btn-primary" id="admin-create">+ Создать администратора</button>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Логин</th><th>Имя</th><th>Должность</th><th>Статус</th><th>Discord</th><th>Действия</th></tr>
              </thead>
              <tbody>
                ${list.map(a => `
                  <tr>
                    <td>${escapeHtml(a.username)}</td>
                    <td>${escapeHtml(a.display_name)}</td>
                    <td><span class="pill ${ROLE_PILL[a.role] || ''}">${escapeHtml(a.role_label || a.role)}</span></td>
                    <td><span class="pill ${a.status === 'active' ? 'pill-active' : 'pill-blocked'}">${a.status}</span></td>
                    <td>${escapeHtml(a.discord || '—')}</td>
                    <td>
                      <button class="btn btn-ghost btn-sm admin-edit" data-id="${a.id}">✎</button>
                      <button class="btn btn-danger btn-sm admin-del" data-id="${a.id}">✕</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      $('#admin-create').onclick = () => openAdminModal();
      $$('.admin-edit').forEach(b => b.onclick = () => openAdminModal(b.dataset.id, list.find(x => x.id == b.dataset.id)));
      $$('.admin-del').forEach(b => b.onclick = async () => {
        if (!confirm('Удалить аккаунт администратора? Это необратимо.')) return;
        try {
          await api(`/admins/${b.dataset.id}`, { method: 'DELETE' });
          load();
        } catch (e) { alert(e.message); }
      });
    } catch (e) {
      el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
    }
  };

  function openAdminModal(id = null, existing = null) {
    const isEdit = !!id;
    openModal(isEdit ? 'Редактировать администратора' : 'Новый администратор', `
      ${!isEdit ? `<div class="form-group"><label>Логин</label><input id="m-user" /></div>` : ''}
      <div class="form-group"><label>Отображаемое имя</label><input id="m-name" value="${escapeHtml(existing?.display_name || '')}" /></div>
      <div class="form-group">
        <label>Должность</label>
        <select id="m-role">
          <option value="MODERATOR" ${existing?.role === 'MODERATOR' ? 'selected' : ''}>Модератор</option>
          <option value="SENIOR" ${existing?.role === 'SENIOR' ? 'selected' : ''}>Старший администратор</option>
          <option value="ZGA" ${existing?.role === 'ZGA' ? 'selected' : ''}>Зга</option>
          <option value="GA" ${existing?.role === 'GA' ? 'selected' : ''}>ГА</option>
        </select>
      </div>
      <div class="form-group"><label>Discord</label><input id="m-discord" value="${escapeHtml(existing?.discord || '')}" /></div>
      ${isEdit ? `
        <div class="form-group">
          <label>Статус</label>
          <select id="m-status">
            <option value="active" ${existing?.status === 'active' ? 'selected' : ''}>active</option>
            <option value="blocked" ${existing?.status === 'blocked' ? 'selected' : ''}>blocked</option>
            <option value="inactive" ${existing?.status === 'inactive' ? 'selected' : ''}>inactive</option>
          </select>
        </div>
      ` : ''}
      <div class="form-group"><label>Доп. информация</label><input id="m-extra" value="${escapeHtml(existing?.extra_info || '')}" /></div>
      <div class="form-group"><label>${isEdit ? 'Новый пароль (оставьте пустым, чтобы не менять)' : 'Пароль'}</label><input type="password" id="m-pass" /></div>
    `, `
      <button class="btn btn-ghost" data-close>Отмена</button>
      <button class="btn btn-primary" id="m-save">Сохранить</button>
    `);
    $('[data-close]').onclick = closeModal;
    $('#m-save').onclick = async () => {
      try {
        if (isEdit) {
          const body = {
            display_name: $('#m-name').value.trim(),
            role: $('#m-role').value,
            discord: $('#m-discord').value.trim() || null,
            status: $('#m-status').value,
            extra_info: $('#m-extra').value.trim() || null
          };
          const pass = $('#m-pass').value;
          if (pass) body.password = pass;
          await api(`/admins/${id}`, { method: 'PUT', body });
        } else {
          const body = {
            username: $('#m-user').value.trim(),
            display_name: $('#m-name').value.trim(),
            role: $('#m-role').value,
            discord: $('#m-discord').value.trim() || null,
            extra_info: $('#m-extra').value.trim() || null,
            password: $('#m-pass').value
          };
          if (!body.username || !body.password || !body.display_name) {
            return alert('Логин, пароль и имя обязательны');
          }
          await api('/admins', { method: 'POST', body });
        }
        closeModal();
        load();
      } catch (e) {
        alert(e.message);
      }
    };
  }

  load();
}


// ---- Profile ----
async function renderProfile(el) {
  try {
    let profile = null;
    try { profile = await api('/profile'); } catch { /* fallback to /me data */ }
    const a = profile || state.admin || {};
    const clr = a.clearance || state.clearance || CLEARANCE_BY_ROLE[a.role] || { level: 1, label: 'LEVEL-1 · Basic Access' };
    const initials = (a.display_name || a.username || '?').slice(0, 2).toUpperCase();

    el.innerHTML = `
      <div class="profile-grid">
        <div class="card" style="text-align:center">
          <div class="profile-avatar">${escapeHtml(initials)}</div>
          <div style="font-size:1.1rem;font-weight:700;margin-bottom:4px">${escapeHtml(a.display_name || '—')}</div>
          <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-dim);margin-bottom:12px">@${escapeHtml(a.username || '—')}</div>
          <span class="pill ${ROLE_PILL[a.role] || ''}">${escapeHtml(a.role_label || a.role || '—')}</span>
          <div style="margin-top:10px"><span class="pill pill-type-warning">${escapeHtml(clr.label || 'LEVEL-1')}</span></div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Данные аккаунта</span></div>
          <div class="profile-field"><span class="profile-field-label">Username</span><span class="profile-field-value">${escapeHtml(a.username || '—')}</span></div>
          <div class="profile-field"><span class="profile-field-label">Роль</span><span class="profile-field-value">${escapeHtml(a.role_label || a.role || '—')}</span></div>
          <div class="profile-field"><span class="profile-field-label">Clearance</span><span class="profile-field-value">${escapeHtml(clr.label || '—')}</span></div>
          <div class="profile-field"><span class="profile-field-label">Статус</span><span class="profile-field-value"><span class="pill ${a.status === 'active' || !a.status ? 'pill-active' : 'pill-blocked'}">${escapeHtml(a.status || 'active')}</span></span></div>
          <div class="profile-field"><span class="profile-field-label">Discord</span><span class="profile-field-value">${escapeHtml(a.discord || '—')}</span></div>
          <div class="profile-field"><span class="profile-field-label">Регистрация</span><span class="profile-field-value">${formatDateOnly(a.joined_at || a.created_at)}</span></div>
          <div class="profile-field"><span class="profile-field-label">Последняя активность</span><span class="profile-field-value">${formatDate(a.last_activity || a.updated_at)}</span></div>
          ${a.actions_count != null ? `<div class="profile-field"><span class="profile-field-label">Действий</span><span class="profile-field-value">${a.actions_count}</span></div>` : ''}
          ${a.extra_info ? `<div class="profile-field"><span class="profile-field-label">Инфо</span><span class="profile-field-value">${escapeHtml(a.extra_info)}</span></div>` : ''}
        </div>
      </div>
      ${Array.isArray(a.recent_actions) && a.recent_actions.length ? `
      <div class="card" style="margin-top:14px">
        <div class="card-header"><span class="card-title">История действий</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Действие</th><th>Объект</th><th>Время</th></tr></thead>
            <tbody>
              ${a.recent_actions.map(x => `
                <tr>
                  <td>${escapeHtml(x.action)}</td>
                  <td>${escapeHtml(x.details || x.target_type || '—')}</td>
                  <td>${formatDate(x.created_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    `;
  } catch (e) {
    el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
  }
}

// ---- SCP Database ----
async function renderScp(el) {
  const canManage = state.permissions.manage_scp || state.permissions.full_access || state.permissions.manage_admins;
  let filters = { q: '', object_class: '', threat: '', status: '' };

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.object_class) params.set('object_class', filters.object_class);
      if (filters.threat) params.set('threat_level', filters.threat);
      if (filters.status) params.set('status', filters.status);
      let list = [];
      try {
        const data = await api('/scp' + (params.toString() ? '?' + params.toString() : ''));
        list = Array.isArray(data) ? data : (data.items || []);
      } catch (err) {
        el.innerHTML = `
          <div class="card">
            <div class="card-header"><span class="card-title">SCP Database</span></div>
            <div class="empty">
              <div class="empty-icon">🧪</div>
              API /scp пока недоступен на бэкенде.<br>
              <span style="font-size:0.75rem;opacity:0.7">Добавьте endpoint и таблицу scp_objects в D1.</span>
            </div>
            ${canManage ? '<div style="text-align:center;margin-top:12px"><button class="btn btn-primary" id="scp-create">+ Создать объект (когда API готов)</button></div>' : ''}
          </div>`;
        $('#scp-create')?.addEventListener('click', () => openScpModal());
        return;
      }

      el.innerHTML = `
        <div class="toolbar">
          <input class="search-input" id="scp-search" placeholder="Поиск SCP…" value="${escapeHtml(filters.q)}" />
          ${canManage ? '<button class="btn btn-primary" id="scp-create">+ Создать объект</button>' : ''}
        </div>
        <div class="scp-filters">
          <select id="scp-class">
            <option value="">Класс</option>
            <option value="Safe" ${filters.object_class === 'Safe' ? 'selected' : ''}>Safe</option>
            <option value="Euclid" ${filters.object_class === 'Euclid' ? 'selected' : ''}>Euclid</option>
            <option value="Keter" ${filters.object_class === 'Keter' ? 'selected' : ''}>Keter</option>
          </select>
          <select id="scp-threat">
            <option value="">Угроза</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
          <select id="scp-status">
            <option value="">Статус</option>
            <option value="Contained">Contained</option>
            <option value="Under Investigation">Under Investigation</option>
            <option value="Uncontained">Uncontained</option>
          </select>
          <button class="btn btn-ghost btn-sm" id="scp-filter-btn">Применить</button>
        </div>
        <div class="grid">
          ${list.length ? list.map(o => {
            const cls = (o.object_class || '').toLowerCase();
            const threat = (o.threat_level || '').toLowerCase();
            return `
            <div class="card scp-card">
              <div class="card-header">
                <span class="scp-id">${escapeHtml(o.scp_id || o.code || 'SCP-???')}</span>
                ${canManage ? `<div>
                  <button class="btn btn-ghost btn-sm scp-edit" data-id="${o.id}">✎</button>
                  <button class="btn btn-danger btn-sm scp-del" data-id="${o.id}">✕</button>
                </div>` : ''}
              </div>
              <div class="scp-meta-row">
                <span class="pill ${cls === 'safe' ? 'pill-safe' : cls === 'euclid' ? 'pill-euclid' : 'pill-keter'}">${escapeHtml(o.object_class || '—')}</span>
                <span class="pill pill-threat-${threat || 'low'}">${escapeHtml(o.threat_level || '—')}</span>
                <span class="pill pill-type-system">${escapeHtml(o.status || '—')}</span>
              </div>
              <div class="scp-desc">${escapeHtml((o.description || '').slice(0, 280))}${(o.description || '').length > 280 ? '…' : ''}</div>
              <div class="card-meta">Обновлено: ${formatDate(o.updated_at || o.created_at)}</div>
            </div>`;
          }).join('') : '<div class="empty"><div class="empty-icon">🧪</div>SCP-объектов пока нет</div>'}
        </div>
      `;

      $('#scp-search')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { filters.q = e.target.value.trim(); load(); }
      });
      $('#scp-filter-btn')?.addEventListener('click', () => {
        filters.object_class = $('#scp-class').value;
        filters.threat = $('#scp-threat').value;
        filters.status = $('#scp-status').value;
        filters.q = $('#scp-search')?.value.trim() || filters.q;
        load();
      });
      if (canManage) {
        $('#scp-create')?.addEventListener('click', () => openScpModal());
        $$('.scp-edit').forEach(b => b.onclick = () => openScpModal(b.dataset.id));
        $$('.scp-del').forEach(b => b.onclick = async () => {
          if (!confirm('Удалить SCP-объект?')) return;
          await api(`/scp/${b.dataset.id}`, { method: 'DELETE' });
          load();
        });
      }
    } catch (e) {
      el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
    }
  };

  async function openScpModal(id = null) {
    let item = { scp_id: '', object_class: 'Safe', threat_level: 'Low', status: 'Contained', description: '', containment_procedures: '' };
    if (id) {
      try { item = await api(`/scp/${id}`); } catch { alert('Не удалось загрузить объект'); return; }
    }
    openModal(id ? 'Редактировать SCP' : 'Новый SCP-объект', `
      <div class="form-group"><label>SCP ID</label><input id="m-scpid" value="${escapeHtml(item.scp_id || item.code || '')}" placeholder="SCP-173" /></div>
      <div class="form-group"><label>Object Class</label>
        <select id="m-class">
          <option value="Safe" ${item.object_class === 'Safe' ? 'selected' : ''}>Safe</option>
          <option value="Euclid" ${item.object_class === 'Euclid' ? 'selected' : ''}>Euclid</option>
          <option value="Keter" ${item.object_class === 'Keter' ? 'selected' : ''}>Keter</option>
        </select>
      </div>
      <div class="form-group"><label>Threat Level</label>
        <select id="m-threat">
          <option value="Low">Low</option><option value="Medium">Medium</option>
          <option value="High">High</option><option value="Critical">Critical</option>
        </select>
      </div>
      <div class="form-group"><label>Status</label>
        <select id="m-status">
          <option value="Contained">Contained</option>
          <option value="Under Investigation">Under Investigation</option>
          <option value="Uncontained">Uncontained</option>
        </select>
      </div>
      <div class="form-group"><label>Description</label><textarea id="m-desc">${escapeHtml(item.description || '')}</textarea></div>
      <div class="form-group"><label>Containment Procedures</label><textarea id="m-contain">${escapeHtml(item.containment_procedures || '')}</textarea></div>
    `, `
      <button class="btn btn-ghost" data-close>Отмена</button>
      <button class="btn btn-primary" id="m-save">Сохранить</button>
    `);
    if (item.threat_level) $('#m-threat').value = item.threat_level;
    if (item.status) $('#m-status').value = item.status;
    $('[data-close]').onclick = closeModal;
    $('#m-save').onclick = async () => {
      const body = {
        scp_id: $('#m-scpid').value.trim(),
        object_class: $('#m-class').value,
        threat_level: $('#m-threat').value,
        status: $('#m-status').value,
        description: $('#m-desc').value.trim(),
        containment_procedures: $('#m-contain').value.trim() || null
      };
      if (!body.scp_id || !body.description) return alert('SCP ID и описание обязательны');
      try {
        if (id) await api(`/scp/${id}`, { method: 'PUT', body });
        else await api('/scp', { method: 'POST', body });
        closeModal();
        load();
      } catch (e) { alert(e.message); }
    };
  }

  load();
}

// ---- Terminal ----
async function renderTerminal(el) {
  const history = [];
  let histIdx = -1;

  el.innerHTML = `
    <div class="terminal-wrap">
      <div class="terminal-header">
        <span class="terminal-dot"></span>
        SCP FOUNDATION SECURE TERMINAL · Arca-13
      </div>
      <div class="terminal-body" id="terminal-out"></div>
      <div class="terminal-input-row">
        <span class="prompt">></span>
        <input type="text" id="terminal-input" autocomplete="off" spellcheck="false" placeholder="help" />
      </div>
    </div>
  `;

  const out = $('#terminal-out');
  const input = $('#terminal-input');

  function print(line, cls = 'terminal-out') {
    const div = document.createElement('div');
    div.className = 'terminal-line ' + cls;
    div.textContent = line;
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
  }

  print('╔══════════════════════════════════════════╗', 'terminal-out');
  print('║  SCP FOUNDATION SECURE TERMINAL          ║', 'terminal-out');
  print('║  Site-Arca-13 · Access Restricted        ║', 'terminal-out');
  print('╚══════════════════════════════════════════╝', 'terminal-out');
  print('');
  print('Type "help" for available commands.', 'terminal-out');

  const commands = {
    help: () => {
      print('Available commands:', 'terminal-out');
      print('  help           — this list', 'terminal-out');
      print('  status         — system status', 'terminal-out');
      print('  profile        — current user profile', 'terminal-out');
      print('  notifications  — unread count', 'terminal-out');
      print('  logs           — recent audit entries', 'terminal-out');
      print('  scp [id]       — list or show SCP', 'terminal-out');
      print('  clear          — clear screen', 'terminal-out');
    },
    status: async () => {
      print('> SYSTEM STATUS', 'terminal-cmd');
      try {
        const s = await api('/system/status');
        Object.entries(s).forEach(([k, v]) => print(`  ${k.toUpperCase()}: ${String(v).toUpperCase()}`, 'terminal-out'));
      } catch {
        print('  DATABASE: ONLINE (assumed)', 'terminal-out');
        print('  API: ONLINE', 'terminal-out');
        print('  AUTHENTICATION: ONLINE', 'terminal-out');
        print('  SYSTEM: OPERATIONAL', 'terminal-out');
        print('  (endpoint /system/status optional)', 'terminal-out');
      }
    },
    profile: () => {
      const a = state.admin || {};
      const clr = state.clearance || CLEARANCE_BY_ROLE[a.role] || {};
      print(`  USER: ${a.display_name || '—'} (@${a.username || '—'})`, 'terminal-out');
      print(`  ROLE: ${a.role_label || a.role || '—'}`, 'terminal-out');
      print(`  CLEARANCE: ${clr.label || 'LEVEL-1'}`, 'terminal-out');
      print(`  STATUS: ${a.status || 'active'}`, 'terminal-out');
    },
    notifications: async () => {
      try {
        const list = await api('/notifications');
        const unread = list.filter(n => !n.is_read).length;
        print(`  Unread notifications: ${unread}`, 'terminal-out');
        list.filter(n => !n.is_read).slice(0, 5).forEach(n => {
          print(`  · ${n.title}`, 'terminal-out');
        });
      } catch (e) {
        print(`  Error: ${e.message}`, 'terminal-err');
      }
    },
    logs: async () => {
      try {
        const list = await api('/logs?limit=8');
        const rows = Array.isArray(list) ? list : (list.items || []);
        rows.forEach(a => {
          print(`  ${formatDate(a.created_at)}  ${a.admin_name || '—'}  ${a.action}  ${a.details || a.target_type || ''}`, 'terminal-out');
        });
        if (!rows.length) print('  No entries', 'terminal-out');
      } catch (e) {
        print(`  Error: ${e.message}`, 'terminal-err');
      }
    },
    scp: async (arg) => {
      try {
        if (arg) {
          const data = await api('/scp?q=' + encodeURIComponent(arg));
          const list = Array.isArray(data) ? data : (data.items || []);
          const o = list[0];
          if (!o) { print('  Object not found', 'terminal-err'); return; }
          print(`  ${o.scp_id || o.code}  [${o.object_class}]  Threat: ${o.threat_level}  Status: ${o.status}`, 'terminal-out');
          print(`  ${(o.description || '').slice(0, 200)}`, 'terminal-out');
        } else {
          const data = await api('/scp');
          const list = Array.isArray(data) ? data : (data.items || []);
          print(`  SCP objects: ${list.length}`, 'terminal-out');
          list.slice(0, 10).forEach(o => print(`  · ${o.scp_id || o.code}  ${o.object_class}  ${o.status}`, 'terminal-out'));
        }
      } catch {
        print('  SCP API not available yet. Add /api/scp on backend.', 'terminal-err');
      }
    },
    clear: () => { out.innerHTML = ''; }
  };

  async function run(cmdLine) {
    const trimmed = cmdLine.trim();
    if (!trimmed) return;
    history.push(trimmed);
    histIdx = history.length;
    print('> ' + trimmed, 'terminal-cmd');
    const [cmd, ...rest] = trimmed.split(/\s+/);
    const arg = rest.join(' ');
    const fn = commands[cmd.toLowerCase()];
    if (fn) await fn(arg);
    else print(`Unknown command: ${cmd}. Type "help".`, 'terminal-err');
  }

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const v = input.value;
      input.value = '';
      await run(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histIdx > 0) { histIdx--; input.value = history[histIdx] || ''; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx < history.length - 1) { histIdx++; input.value = history[histIdx] || ''; }
      else { histIdx = history.length; input.value = ''; }
    }
  });
  setTimeout(() => input.focus(), 100);
}

// ---- Global Search ----
function openGlobalSearch() {
  const overlay = $('#search-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  const input = $('#global-search-input');
  input.value = '';
  $('#search-results').innerHTML = '<div class="search-hint">Начните вводить запрос… · Ctrl+K</div>';
  setTimeout(() => input.focus(), 50);
}

function closeGlobalSearch() {
  const overlay = $('#search-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

let searchDebounce = null;
async function runGlobalSearch(q) {
  const box = $('#search-results');
  if (!q || q.length < 2) {
    box.innerHTML = '<div class="search-hint">Введите минимум 2 символа…</div>';
    return;
  }
  box.innerHTML = '<div class="search-loading">Поиск…</div>';
  try {
    let data = null;
    try {
      data = await api('/search?q=' + encodeURIComponent(q));
    } catch {
      data = await clientSideSearch(q);
    }
    renderSearchResults(data, q);
  } catch (e) {
    box.innerHTML = `<div class="search-error">Ошибка: ${escapeHtml(e.message)}</div>`;
  }
}

async function clientSideSearch(q) {
  const lower = q.toLowerCase();
  const groups = {};
  const tryFetch = async (path, key, mapFn) => {
    try {
      const list = await api(path);
      const arr = Array.isArray(list) ? list : (list.items || []);
      const matched = arr.filter(mapFn).slice(0, 8);
      if (matched.length) groups[key] = matched;
    } catch {}
  };
  await Promise.all([
    tryFetch('/notes', 'notes', n => (n.title + ' ' + (n.content || '')).toLowerCase().includes(lower)),
    tryFetch('/news', 'news', n => (n.title + ' ' + (n.content || '')).toLowerCase().includes(lower)),
    tryFetch('/events', 'events', e => (e.title + ' ' + (e.description || '')).toLowerCase().includes(lower)),
    tryFetch('/roster', 'roster', a => ((a.display_name || '') + ' ' + (a.username || '')).toLowerCase().includes(lower)),
    tryFetch('/scp', 'scp', o => ((o.scp_id || o.code || '') + ' ' + (o.description || '')).toLowerCase().includes(lower))
  ]);
  return groups;
}

function renderSearchResults(data, q) {
  const box = $('#search-results');
  const labels = { notes: 'Заметки', news: 'Новости', events: 'События', roster: 'Состав', scp: 'SCP', admins: 'Админы' };
  const routes = { notes: '#/notes', news: '#/news', events: '#/events', roster: '#/roster', scp: '#/scp', admins: '#/admins' };
  const keys = Object.keys(data || {}).filter(k => (data[k] || []).length);
  if (!keys.length) {
    box.innerHTML = `<div class="search-empty">Ничего не найдено по «${escapeHtml(q)}»</div>`;
    return;
  }
  box.innerHTML = keys.map(k => `
    <div class="search-group">
      <div class="search-group-title">${labels[k] || k}</div>
      ${(data[k] || []).map(item => {
        const title = item.title || item.display_name || item.scp_id || item.code || item.username || '—';
        const meta = item.author_name || item.role_label || item.object_class || item.event_date || item.username || '';
        return `<div class="search-item" data-route="${routes[k] || '#/dashboard'}">
          <div>
            <div class="search-item-title">${escapeHtml(title)}</div>
            ${meta ? `<div class="search-item-meta">${escapeHtml(String(meta))}</div>` : ''}
          </div>
          <span class="search-item-type">${labels[k] || k}</span>
        </div>`;
      }).join('')}
    </div>
  `).join('');
  $$('.search-item', box).forEach(el => {
    el.onclick = () => {
      closeGlobalSearch();
      location.hash = el.dataset.route;
    };
  });
}

// ---- Live polling (notifications badge) ----
function startLivePolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    if (!state.admin) return;
    loadNotifBadge();
  }, 45000);
}

// ---- Hotkeys ----
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (state.admin) openGlobalSearch();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault();
    if (state.admin) openGlobalSearch();
    return;
  }
  if (e.key === 'Escape') {
    if (!$('#search-overlay')?.classList.contains('hidden')) {
      closeGlobalSearch();
      return;
    }
    if ($('#modal-root')?.innerHTML) {
      closeModal();
      return;
    }
    closeSidebar();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  $('#global-search-btn')?.addEventListener('click', () => openGlobalSearch());
  $('#search-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'search-overlay') closeGlobalSearch();
  });
  $('#global-search-input')?.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => runGlobalSearch(e.target.value.trim()), 280);
  });
  $('#global-search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGlobalSearch();
  });
});

// Init
checkAuth();
