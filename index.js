import bcrypt from 'bcryptjs';

const ROLE_PERMISSIONS = {
  GA: {
    view_dashboard: true,
    manage_notes: true,
    manage_news: true,
    manage_events: true,
    manage_rules: true,
    view_stats: true,
    view_logs: true,
    view_notifications: true,
    view_roster: true,
    manage_admins: true,
    full_access: true
  },
  ZGA: {
    view_dashboard: true,
    manage_notes: true,
    manage_news: true,
    manage_events: true,
    manage_rules: true,
    view_stats: true,
    view_logs: true,
    view_notifications: true,
    view_roster: true,
    manage_admins: true,
    full_access: false
  },
  SENIOR: {
    view_dashboard: true,
    manage_notes: true,
    manage_news: true,
    manage_events: true,
    manage_rules: false,
    view_stats: true,
    view_logs: true,
    view_notifications: true,
    view_roster: true,
    manage_admins: false,
    full_access: false
  },
  MODERATOR: {
    view_dashboard: true,
    manage_notes: true,
    manage_news: false,
    manage_events: false,
    manage_rules: false,
    view_stats: false,
    view_logs: false,
    view_notifications: true,
    view_roster: true,
    manage_admins: false,
    full_access: false
  }
};

const ROLE_LABELS = {
  GA: 'ГА',
  ZGA: 'ЗГА',
  SENIOR: 'Старший администратор',
  MODERATOR: 'Модератор'
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function generateId(length = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function getSession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session_id=([a-zA-Z0-9]+)/);
  if (!match) return null;
  const sessionId = match[1];
  const row = await env.DB.prepare(
    `SELECT s.id, s.admin_id, s.expires_at, a.username, a.display_name, a.role, a.status
     FROM sessions s
     JOIN admins a ON a.id = s.admin_id
     WHERE s.id = ? AND s.expires_at > datetime('now') AND a.status = 'active'`
  ).bind(sessionId).first();
  if (!row) return null;
  return row;
}

async function requireAuth(request, env, permission = null) {
  const session = await getSession(request, env);
  if (!session) {
    return { error: error('Unauthorized', 401) };
  }
  if (permission) {
    const perms = ROLE_PERMISSIONS[session.role] || {};
    if (!perms[permission] && !perms.full_access) {
      return { error: error('Forbidden', 403) };
    }
  }
  return { session };
}

async function logAction(env, adminId, action, targetType = null, targetId = null, details = null) {
  await env.DB.prepare(
    `INSERT INTO action_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`
  ).bind(adminId, action, targetType, targetId, details).run();
}

async function createNotificationForAll(env, type, title, message, relatedType = null, relatedId = null) {
  const admins = await env.DB.prepare(`SELECT id FROM admins WHERE status = 'active'`).all();
  for (const a of admins.results || []) {
    await env.DB.prepare(
      `INSERT INTO notifications (admin_id, type, title, message, related_type, related_id) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(a.id, type, title, message, relatedType, relatedId).run();
  }
}

// ---- Первичная настройка (создание первого аккаунта ГА) ----
async function handleSetupStatus(request, env) {
  const row = await env.DB.prepare(`SELECT COUNT(*) as c FROM admins`).first();
  return json({ needsSetup: row.c === 0 });
}

async function handleSetup(request, env) {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  const row = await env.DB.prepare(`SELECT COUNT(*) as c FROM admins`).first();
  if (row.c > 0) return error('Настройка уже выполнена', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON');
  }
  const { username, password, display_name } = body;
  if (!username || !/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return error('Логин: 3-32 символа, латиница/цифры/._-');
  }
  if (!password || password.length < 8) {
    return error('Пароль должен быть не короче 8 символов');
  }
  if (!display_name || display_name.trim().length < 2) {
    return error('Укажите отображаемое имя');
  }

  const hash = await hashPassword(password);
  const res = await env.DB.prepare(
    `INSERT INTO admins (username, password_hash, display_name, role, status) VALUES (?, ?, ?, 'GA', 'active')`
  ).bind(username.trim(), hash, display_name.trim()).run();

  await logAction(env, res.meta.last_row_id, 'setup', 'admin', res.meta.last_row_id, 'Создан первый аккаунт ГА');

  return json({ ok: true });
}

async function handleLogin(request, env) {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON');
  }
  const { username, password } = body;
  if (!username || !password) return error('Username and password required');

  const admin = await env.DB.prepare(
    `SELECT id, username, password_hash, display_name, role, status FROM admins WHERE username = ?`
  ).bind(username.trim()).first();

  if (!admin || admin.status === 'blocked') {
    return error('Invalid credentials', 401);
  }

  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) return error('Invalid credentials', 401);

  const sessionId = generateId(48);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO sessions (id, admin_id, expires_at) VALUES (?, ?, ?)`
  ).bind(sessionId, admin.id, expires).run();

  await logAction(env, admin.id, 'login', 'session', null, null);

  const headers = {
    'Set-Cookie': `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`
  };

  return json({
    ok: true,
    admin: {
      id: admin.id,
      username: admin.username,
      display_name: admin.display_name,
      role: admin.role,
      role_label: ROLE_LABELS[admin.role]
    }
  }, 200, headers);
}

async function handleLogout(request, env) {
  const session = await getSession(request, env);
  if (session) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(session.id).run();
    await logAction(env, session.admin_id, 'logout', 'session', null, null);
  }
  const headers = {
    'Set-Cookie': 'session_id=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
  };
  return json({ ok: true }, 200, headers);
}

async function handleMe(request, env) {
  const { session, error: err } = await requireAuth(request, env);
  if (err) return err;
  const admin = await env.DB.prepare(
    `SELECT id, username, display_name, role, discord, status, joined_at, extra_info FROM admins WHERE id = ?`
  ).bind(session.admin_id).first();
  return json({
    ...admin,
    role_label: ROLE_LABELS[admin.role],
    permissions: ROLE_PERMISSIONS[admin.role]
  });
}

// ---- Dashboard ----
async function handleDashboard(request, env) {
  const { session, error: err } = await requireAuth(request, env, 'view_dashboard');
  if (err) return err;

  const adminCount = await env.DB.prepare(`SELECT COUNT(*) as c FROM admins WHERE status = 'active'`).first();
  const notesCount = await env.DB.prepare(`SELECT COUNT(*) as c FROM notes`).first();
  const newsCount = await env.DB.prepare(`SELECT COUNT(*) as c FROM news`).first();
  const eventsCount = await env.DB.prepare(`SELECT COUNT(*) as c FROM events`).first();

  const upcoming = await env.DB.prepare(
    `SELECT e.*, a.display_name as author_name FROM events e
     LEFT JOIN admins a ON a.id = e.author_id
     WHERE e.event_date >= date('now')
     ORDER BY e.event_date ASC, e.event_time ASC LIMIT 5`
  ).all();

  const latestNews = await env.DB.prepare(
    `SELECT n.*, a.display_name as author_name FROM news n
     LEFT JOIN admins a ON a.id = n.author_id
     ORDER BY n.is_pinned DESC, n.created_at DESC LIMIT 5`
  ).all();

  const recentActions = await env.DB.prepare(
    `SELECT l.*, a.display_name as admin_name FROM action_log l
     LEFT JOIN admins a ON a.id = l.admin_id
     ORDER BY l.created_at DESC LIMIT 10`
  ).all();

  const unreadNotifs = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM notifications WHERE admin_id = ? AND is_read = 0`
  ).bind(session.admin_id).first();

  return json({
    admin: {
      display_name: session.display_name,
      role: session.role,
      role_label: ROLE_LABELS[session.role]
    },
    stats: {
      admins: adminCount.c,
      notes: notesCount.c,
      news: newsCount.c,
      events: eventsCount.c,
      unread_notifications: unreadNotifs.c
    },
    upcoming_events: upcoming.results || [],
    latest_news: latestNews.results || [],
    recent_actions: recentActions.results || []
  });
}

// ---- Notes ----
async function handleNotes(request, env) {
  const { session, error: err } = await requireAuth(request, env, 'manage_notes');
  if (err) return err;

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    let query, binds;
    if (q) {
      query = `SELECT n.*, a.display_name as author_name FROM notes n
               LEFT JOIN admins a ON a.id = n.author_id
               WHERE n.title LIKE ? OR n.content LIKE ?
               ORDER BY n.updated_at DESC`;
      binds = [`%${q}%`, `%${q}%`];
    } else {
      query = `SELECT n.*, a.display_name as author_name FROM notes n
               LEFT JOIN admins a ON a.id = n.author_id
               ORDER BY n.updated_at DESC`;
      binds = [];
    }
    const stmt = env.DB.prepare(query);
    const result = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
    return json(result.results || []);
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const { title, content } = body;
    if (!title || !content) return error('Title and content required');
    const res = await env.DB.prepare(
      `INSERT INTO notes (title, content, author_id) VALUES (?, ?, ?)`
    ).bind(title, content, session.admin_id).run();
    await logAction(env, session.admin_id, 'create_note', 'note', res.meta.last_row_id, title);
    return json({ id: res.meta.last_row_id, ok: true });
  }

  return error('Method not allowed', 405);
}

async function handleNoteById(request, env, id) {
  const { session, error: err } = await requireAuth(request, env, 'manage_notes');
  if (err) return err;

  if (request.method === 'GET') {
    const note = await env.DB.prepare(
      `SELECT n.*, a.display_name as author_name FROM notes n
       LEFT JOIN admins a ON a.id = n.author_id WHERE n.id = ?`
    ).bind(id).first();
    if (!note) return error('Not found', 404);
    return json(note);
  }

  if (request.method === 'PUT') {
    const body = await request.json();
    const { title, content } = body;
    if (!title || !content) return error('Title and content required');
    await env.DB.prepare(
      `UPDATE notes SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(title, content, id).run();
    await logAction(env, session.admin_id, 'update_note', 'note', id, title);
    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    const note = await env.DB.prepare(`SELECT title FROM notes WHERE id = ?`).bind(id).first();
    await env.DB.prepare(`DELETE FROM notes WHERE id = ?`).bind(id).run();
    await logAction(env, session.admin_id, 'delete_note', 'note', id, note?.title || null);
    return json({ ok: true });
  }

  return error('Method not allowed', 405);
}

// ---- News ----
async function handleNews(request, env) {
  const { session, error: err } = await requireAuth(request, env);
  if (err) return err;

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT n.*, a.display_name as author_name FROM news n
       LEFT JOIN admins a ON a.id = n.author_id
       ORDER BY n.is_pinned DESC, n.created_at DESC`
    ).all();
    return json(result.results || []);
  }

  if (request.method === 'POST') {
    const perms = ROLE_PERMISSIONS[session.role] || {};
    if (!perms.manage_news && !perms.full_access) return error('Forbidden', 403);
    const body = await request.json();
    const { title, content, is_pinned } = body;
    if (!title || !content) return error('Title and content required');
    const res = await env.DB.prepare(
      `INSERT INTO news (title, content, author_id, is_pinned) VALUES (?, ?, ?, ?)`
    ).bind(title, content, session.admin_id, is_pinned ? 1 : 0).run();
    await logAction(env, session.admin_id, 'create_news', 'news', res.meta.last_row_id, title);
    await createNotificationForAll(env, 'news', 'Новая новость', title, 'news', res.meta.last_row_id);
    return json({ id: res.meta.last_row_id, ok: true });
  }

  return error('Method not allowed', 405);
}

async function handleNewsById(request, env, id) {
  const { session, error: err } = await requireAuth(request, env);
  if (err) return err;

  if (request.method === 'GET') {
    const item = await env.DB.prepare(
      `SELECT n.*, a.display_name as author_name FROM news n
       LEFT JOIN admins a ON a.id = n.author_id WHERE n.id = ?`
    ).bind(id).first();
    if (!item) return error('Not found', 404);
    return json(item);
  }

  const perms = ROLE_PERMISSIONS[session.role] || {};
  if (!perms.manage_news && !perms.full_access) return error('Forbidden', 403);

  if (request.method === 'PUT') {
    const body = await request.json();
    const { title, content, is_pinned } = body;
    if (!title || !content) return error('Title and content required');
    await env.DB.prepare(
      `UPDATE news SET title = ?, content = ?, is_pinned = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(title, content, is_pinned ? 1 : 0, id).run();
    await logAction(env, session.admin_id, 'update_news', 'news', id, title);
    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    const item = await env.DB.prepare(`SELECT title FROM news WHERE id = ?`).bind(id).first();
    await env.DB.prepare(`DELETE FROM news WHERE id = ?`).bind(id).run();
    await logAction(env, session.admin_id, 'delete_news', 'news', id, item?.title || null);
    return json({ ok: true });
  }

  return error('Method not allowed', 405);
}

// ---- Events ----
async function handleEvents(request, env) {
  const { session, error: err } = await requireAuth(request, env);
  if (err) return err;

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT e.*, a.display_name as author_name FROM events e
       LEFT JOIN admins a ON a.id = e.author_id
       ORDER BY e.event_date ASC, e.event_time ASC`
    ).all();
    return json(result.results || []);
  }

  if (request.method === 'POST') {
    const perms = ROLE_PERMISSIONS[session.role] || {};
    if (!perms.manage_events && !perms.full_access) return error('Forbidden', 403);
    const body = await request.json();
    const { title, description, event_date, event_time, location } = body;
    if (!title || !event_date) return error('Title and date required');
    const res = await env.DB.prepare(
      `INSERT INTO events (title, description, event_date, event_time, location, author_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(title, description || null, event_date, event_time || null, location || null, session.admin_id).run();
    await logAction(env, session.admin_id, 'create_event', 'event', res.meta.last_row_id, title);
    await createNotificationForAll(env, 'event', 'Новое событие', title, 'event', res.meta.last_row_id);
    return json({ id: res.meta.last_row_id, ok: true });
  }

  return error('Method not allowed', 405);
}

async function handleEventById(request, env, id) {
  const { session, error: err } = await requireAuth(request, env);
  if (err) return err;

  if (request.method === 'GET') {
    const item = await env.DB.prepare(
      `SELECT e.*, a.display_name as author_name FROM events e
       LEFT JOIN admins a ON a.id = e.author_id WHERE e.id = ?`
    ).bind(id).first();
    if (!item) return error('Not found', 404);
    return json(item);
  }

  const perms = ROLE_PERMISSIONS[session.role] || {};
  if (!perms.manage_events && !perms.full_access) return error('Forbidden', 403);

  if (request.method === 'PUT') {
    const body = await request.json();
    const { title, description, event_date, event_time, location } = body;
    if (!title || !event_date) return error('Title and date required');
    await env.DB.prepare(
      `UPDATE events SET title = ?, description = ?, event_date = ?, event_time = ?, location = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(title, description || null, event_date, event_time || null, location || null, id).run();
    await logAction(env, session.admin_id, 'update_event', 'event', id, title);
    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    const item = await env.DB.prepare(`SELECT title FROM events WHERE id = ?`).bind(id).first();
    await env.DB.prepare(`DELETE FROM events WHERE id = ?`).bind(id).run();
    await logAction(env, session.admin_id, 'delete_event', 'event', id, item?.title || null);
    return json({ ok: true });
  }

  return error('Method not allowed', 405);
}

// ---- Rules ----
async function handleRules(request, env) {
  const { session, error: err } = await requireAuth(request, env);
  if (err) return err;

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT r.*, a.display_name as author_name FROM rules r
       LEFT JOIN admins a ON a.id = r.author_id
       ORDER BY r.category, r.sort_order, r.id`
    ).all();
    return json(result.results || []);
  }

  if (request.method === 'POST') {
    const perms = ROLE_PERMISSIONS[session.role] || {};
    if (!perms.manage_rules && !perms.full_access) return error('Forbidden', 403);
    const body = await request.json();
    const { category, title, content, sort_order } = body;
    if (!category || !title || !content) return error('Category, title and content required');
    const res = await env.DB.prepare(
      `INSERT INTO rules (category, title, content, sort_order, author_id) VALUES (?, ?, ?, ?, ?)`
    ).bind(category, title, content, sort_order || 0, session.admin_id).run();
    await logAction(env, session.admin_id, 'create_rule', 'rule', res.meta.last_row_id, title);
    return json({ id: res.meta.last_row_id, ok: true });
  }

  return error('Method not allowed', 405);
}

async function handleRuleById(request, env, id) {
  const { session, error: err } = await requireAuth(request, env);
  if (err) return err;

  if (request.method === 'GET') {
    const item = await env.DB.prepare(
      `SELECT r.*, a.display_name as author_name FROM rules r
       LEFT JOIN admins a ON a.id = r.author_id WHERE r.id = ?`
    ).bind(id).first();
    if (!item) return error('Not found', 404);
    return json(item);
  }

  const perms = ROLE_PERMISSIONS[session.role] || {};
  if (!perms.manage_rules && !perms.full_access) return error('Forbidden', 403);

  if (request.method === 'PUT') {
    const body = await request.json();
    const { category, title, content, sort_order } = body;
    if (!category || !title || !content) return error('Category, title and content required');
    await env.DB.prepare(
      `UPDATE rules SET category = ?, title = ?, content = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(category, title, content, sort_order || 0, id).run();
    await logAction(env, session.admin_id, 'update_rule', 'rule', id, title);
    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    const item = await env.DB.prepare(`SELECT title FROM rules WHERE id = ?`).bind(id).first();
    await env.DB.prepare(`DELETE FROM rules WHERE id = ?`).bind(id).run();
    await logAction(env, session.admin_id, 'delete_rule', 'rule', id, item?.title || null);
    return json({ ok: true });
  }

  return error('Method not allowed', 405);
}

// ---- Stats ----
async function handleStats(request, env) {
  const { session, error: err } = await requireAuth(request, env, 'view_stats');
  if (err) return err;

  const admins = await env.DB.prepare(`SELECT COUNT(*) as c FROM admins WHERE status = 'active'`).first();
  const notes = await env.DB.prepare(`SELECT COUNT(*) as c FROM notes`).first();
  const news = await env.DB.prepare(`SELECT COUNT(*) as c FROM news`).first();
  const events = await env.DB.prepare(`SELECT COUNT(*) as c FROM events`).first();
  const rules = await env.DB.prepare(`SELECT COUNT(*) as c FROM rules`).first();

  const actions7 = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM action_log WHERE created_at >= datetime('now', '-7 days')`
  ).first();
  const actions30 = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM action_log WHERE created_at >= datetime('now', '-30 days')`
  ).first();

  const byRole = await env.DB.prepare(
    `SELECT role, COUNT(*) as c FROM admins WHERE status = 'active' GROUP BY role`
  ).all();

  const topActors = await env.DB.prepare(
    `SELECT a.display_name, COUNT(*) as actions FROM action_log l
     JOIN admins a ON a.id = l.admin_id
     WHERE l.created_at >= datetime('now', '-30 days')
     GROUP BY l.admin_id ORDER BY actions DESC LIMIT 10`
  ).all();

  return json({
    totals: {
      admins: admins.c,
      notes: notes.c,
      news: news.c,
      events: events.c,
      rules: rules.c
    },
    activity: {
      last_7_days: actions7.c,
      last_30_days: actions30.c
    },
    by_role: byRole.results || [],
    top_actors: topActors.results || []
  });
}

// ---- Action Log ----
async function handleLogs(request, env) {
  const { session, error: err } = await requireAuth(request, env, 'view_logs');
  if (err) return err;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  const result = await env.DB.prepare(
    `SELECT l.*, a.display_name as admin_name FROM action_log l
     LEFT JOIN admins a ON a.id = l.admin_id
     ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  return json(result.results || []);
}

// ---- Notifications ----
async function handleNotifications(request, env) {
  const { session, error: err } = await requireAuth(request, env, 'view_notifications');
  if (err) return err;

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT * FROM notifications WHERE admin_id = ? ORDER BY created_at DESC LIMIT 50`
    ).bind(session.admin_id).all();
    return json(result.results || []);
  }

  if (request.method === 'POST') {
    const body = await request.json();
    if (body.action === 'mark_read' && body.id) {
      await env.DB.prepare(
        `UPDATE notifications SET is_read = 1 WHERE id = ? AND admin_id = ?`
      ).bind(body.id, session.admin_id).run();
      return json({ ok: true });
    }
    if (body.action === 'mark_all_read') {
      await env.DB.prepare(
        `UPDATE notifications SET is_read = 1 WHERE admin_id = ?`
      ).bind(session.admin_id).run();
      return json({ ok: true });
    }
    return error('Invalid action');
  }

  return error('Method not allowed', 405);
}

// ---- System Status (real checks, read-only, no schema changes) ----
async function handleSystemStatus(request, env) {
  const { session, error: err } = await requireAuth(request, env);
  if (err) return err;

  let database = 'offline';
  let dbLatencyMs = null;
  try {
    const t0 = Date.now();
    await env.DB.prepare('SELECT 1 as ok').first();
    dbLatencyMs = Date.now() - t0;
    database = 'online';
  } catch (e) {
    console.error('system-status db check failed', e);
    database = 'offline';
  }

  return json({
    database,
    db_latency_ms: dbLatencyMs,
    api: 'online',
    authentication: 'online',
    checked_at: new Date().toISOString()
  });
}

// ---- Roster ----
async function handleRoster(request, env) {
  const { session, error: err } = await requireAuth(request, env, 'view_roster');
  if (err) return err;

  const result = await env.DB.prepare(
    `SELECT id, username, display_name, role, discord, status, joined_at, extra_info
     FROM admins ORDER BY
       CASE role WHEN 'GA' THEN 1 WHEN 'ZGA' THEN 2 WHEN 'SENIOR' THEN 3 ELSE 4 END,
       joined_at ASC`
  ).all();

  const list = (result.results || []).map(a => ({
    ...a,
    role_label: ROLE_LABELS[a.role]
  }));

  return json(list);
}

// ---- Admin Management ----
async function handleAdmins(request, env) {
  const { session, error: err } = await requireAuth(request, env, 'manage_admins');
  if (err) return err;

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT id, username, display_name, role, discord, status, joined_at, extra_info, created_at
       FROM admins ORDER BY id`
    ).all();
    return json((result.results || []).map(a => ({ ...a, role_label: ROLE_LABELS[a.role] })));
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const { username, password, display_name, role, discord, extra_info } = body;
    if (!username || !password || !display_name || !role) {
      return error('username, password, display_name and role required');
    }
    if (!['GA', 'ZGA', 'SENIOR', 'MODERATOR'].includes(role)) {
      return error('Invalid role');
    }
    // Only GA can create another GA
    if (role === 'GA' && session.role !== 'GA') {
      return error('Only GA can create GA accounts', 403);
    }
    const hash = await hashPassword(password);
    try {
      const res = await env.DB.prepare(
        `INSERT INTO admins (username, password_hash, display_name, role, discord, extra_info)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(username.trim(), hash, display_name.trim(), role, discord || null, extra_info || null).run();
      await logAction(env, session.admin_id, 'create_admin', 'admin', res.meta.last_row_id, username);
      return json({ id: res.meta.last_row_id, ok: true });
    } catch (e) {
      if (String(e).includes('UNIQUE')) return error('Username already exists');
      throw e;
    }
  }

  return error('Method not allowed', 405);
}

async function handleAdminById(request, env, id) {
  const { session, error: err } = await requireAuth(request, env, 'manage_admins');
  if (err) return err;

  const target = await env.DB.prepare(`SELECT * FROM admins WHERE id = ?`).bind(id).first();
  if (!target) return error('Not found', 404);

  // Prevent non-GA from modifying GA
  if (target.role === 'GA' && session.role !== 'GA') {
    return error('Cannot modify GA account', 403);
  }

  if (request.method === 'PUT') {
    const body = await request.json();
    const { display_name, role, discord, status, extra_info, password } = body;

    if (role && !['GA', 'ZGA', 'SENIOR', 'MODERATOR'].includes(role)) {
      return error('Invalid role');
    }
    if (role === 'GA' && session.role !== 'GA') {
      return error('Only GA can assign GA role', 403);
    }
    if (status && !['active', 'blocked', 'inactive'].includes(status)) {
      return error('Invalid status');
    }

    // Cannot demote/block last GA
    if ((role && role !== 'GA') || status === 'blocked') {
      if (target.role === 'GA') {
        const gaCount = await env.DB.prepare(
          `SELECT COUNT(*) as c FROM admins WHERE role = 'GA' AND status = 'active'`
        ).first();
        if (gaCount.c <= 1) return error('Cannot remove the last active GA');
      }
    }

    const updates = [];
    const binds = [];
    if (display_name !== undefined) { updates.push('display_name = ?'); binds.push(display_name); }
    if (role !== undefined) { updates.push('role = ?'); binds.push(role); }
    if (discord !== undefined) { updates.push('discord = ?'); binds.push(discord); }
    if (status !== undefined) { updates.push('status = ?'); binds.push(status); }
    if (extra_info !== undefined) { updates.push('extra_info = ?'); binds.push(extra_info); }
    if (password) {
      const hash = await hashPassword(password);
      updates.push('password_hash = ?');
      binds.push(hash);
    }
    if (updates.length === 0) return error('Nothing to update');

    updates.push(`updated_at = datetime('now')`);
    binds.push(id);

    await env.DB.prepare(
      `UPDATE admins SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...binds).run();

    await logAction(env, session.admin_id, 'update_admin', 'admin', id, target.username);
    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    if (target.role === 'GA') {
      const gaCount = await env.DB.prepare(
        `SELECT COUNT(*) as c FROM admins WHERE role = 'GA' AND status = 'active'`
      ).first();
      if (gaCount.c <= 1) return error('Cannot delete the last GA');
    }
    if (Number(id) === session.admin_id) return error('Cannot delete yourself');
    await env.DB.prepare(`DELETE FROM sessions WHERE admin_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM admins WHERE id = ?`).bind(id).run();
    await logAction(env, session.admin_id, 'delete_admin', 'admin', id, target.username);
    return json({ ok: true });
  }

  return error('Method not allowed', 405);
}

// ---- Router ----
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // API routes
    if (path.startsWith('/api/')) {
      try {
        if (path === '/api/setup/status') {
          return await handleSetupStatus(request, env);
        }
        if (path === '/api/setup' && request.method === 'POST') {
          return await handleSetup(request, env);
        }
        if (path === '/api/login' && request.method === 'POST') {
          return await handleLogin(request, env);
        }
        if (path === '/api/logout' && request.method === 'POST') {
          return await handleLogout(request, env);
        }
        if (path === '/api/me') {
          return await handleMe(request, env);
        }
        if (path === '/api/dashboard') {
          return await handleDashboard(request, env);
        }
        if (path === '/api/notes') {
          return await handleNotes(request, env);
        }
        if (path.match(/^\/api\/notes\/\d+$/)) {
          const id = path.split('/').pop();
          return await handleNoteById(request, env, id);
        }
        if (path === '/api/news') {
          return await handleNews(request, env);
        }
        if (path.match(/^\/api\/news\/\d+$/)) {
          const id = path.split('/').pop();
          return await handleNewsById(request, env, id);
        }
        if (path === '/api/events') {
          return await handleEvents(request, env);
        }
        if (path.match(/^\/api\/events\/\d+$/)) {
          const id = path.split('/').pop();
          return await handleEventById(request, env, id);
        }
        if (path === '/api/rules') {
          return await handleRules(request, env);
        }
        if (path.match(/^\/api\/rules\/\d+$/)) {
          const id = path.split('/').pop();
          return await handleRuleById(request, env, id);
        }
        if (path === '/api/stats') {
          return await handleStats(request, env);
        }
        if (path === '/api/logs') {
          return await handleLogs(request, env);
        }
        if (path === '/api/notifications') {
          return await handleNotifications(request, env);
        }
        if (path === '/api/roster') {
          return await handleRoster(request, env);
        }
        if (path === '/api/system-status') {
          return await handleSystemStatus(request, env);
        }
        if (path === '/api/admins') {
          return await handleAdmins(request, env);
        }
        if (path.match(/^\/api\/admins\/\d+$/)) {
          const id = path.split('/').pop();
          return await handleAdminById(request, env, id);
        }

        return error('Not found', 404);
      } catch (e) {
        console.error(e);
        return error('Internal server error', 500);
      }
    }

    // Serve static assets (SPA fallback)
    if (env.ASSETS) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
      // SPA: serve index.html for non-API routes
      if (request.method === 'GET' && !path.startsWith('/api/')) {
        return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
      }
    }

    return new Response('Not found', { status: 404 });
  }
};
