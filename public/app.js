// SIDEBAR_FIX_MARKER_v4
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = {
  admin: null,
  permissions: {},
  page: 'dashboard'
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
  admins: 'Управление администраторами'
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
  $('#main-view').classList.remove('hidden');
  $('#sidebar-name').textContent = state.admin.display_name;
  $('#sidebar-role').textContent = state.admin.role_label || state.admin.role;
  $('#topbar-user').textContent = state.admin.display_name;

  // Hide nav items without permission
  $$('.nav-item[data-perm]').forEach(el => {
    const perm = el.dataset.perm;
    const allowed = state.permissions[perm] || state.permissions.full_access;
    el.style.display = allowed ? '' : 'none';
  });
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
    admins: renderAdmins
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
    el.innerHTML = `
      <div class="welcome">
        <h1>Привет, ${escapeHtml(data.admin.display_name)}!</h1>
        <p>${escapeHtml(data.admin.role_label)} · Arca-13 Admin</p>
      </div>
      <div class="grid grid-4" style="margin-bottom:24px">
        <div class="card stat-card">
          <div class="stat-value">${data.stats.admins}</div>
          <div class="stat-label">Администраторов</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${data.stats.notes}</div>
          <div class="stat-label">Заметок</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${data.stats.news}</div>
          <div class="stat-label">Новостей</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${data.stats.events}</div>
          <div class="stat-label">Событий</div>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header"><span class="card-title">Ближайшие события</span></div>
          ${data.upcoming_events.length ? data.upcoming_events.map(e => `
            <div class="list-item">
              <div class="list-item-title">${escapeHtml(e.title)}</div>
              <div class="list-item-meta">${formatDateOnly(e.event_date)}${e.event_time ? ' · ' + e.event_time : ''} · ${escapeHtml(e.author_name || '')}</div>
            </div>
          `).join('') : '<div class="empty" style="padding:20px">Нет ближайших событий</div>'}
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Последние новости</span></div>
          ${data.latest_news.length ? data.latest_news.map(n => `
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
              ${data.recent_actions.map(a => `
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

// ---- Logs ----
async function renderLogs(el) {
  try {
    const list = await api('/logs?limit=150');
    el.innerHTML = `
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Админ</th><th>Действие</th><th>Тип</th><th>Детали</th><th>Время</th></tr>
            </thead>
            <tbody>
              ${list.map(a => `
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
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
  }
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
        ${list.length ? list.map(n => `
          <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
            <div class="notif-content">
              <div class="notif-title">${escapeHtml(n.title)}</div>
              ${n.message ? `<div class="notif-msg">${escapeHtml(n.message)}</div>` : ''}
              <div class="notif-time">${formatDate(n.created_at)}</div>
            </div>
            ${!n.is_read ? `<button class="btn btn-ghost btn-sm mark-read" data-id="${n.id}">✓</button>` : ''}
          </div>
        `).join('') : '<div class="empty"><div class="empty-icon">🔔</div>Нет уведомлений</div>'}
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

// Init
checkAuth();
