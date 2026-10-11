/* Admin page: login, upload/delete photos, read enquiries.
   All data comes from the server API; the login is a secure cookie set by the server. */
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
function setStatus(node, text, kind) {
  node.textContent = text || '';
  node.className = 'status' + (kind ? ' ' + kind : '');
}
async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/admin/login') { showLogin(); throw new Error('Please log in again.'); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ---------- views ---------- */
function showLogin() {
  $('loginView').hidden = false; $('dashView').hidden = true; $('logoutBtn').hidden = true;
}
function showDash() {
  $('loginView').hidden = true; $('dashView').hidden = false; $('logoutBtn').hidden = false;
  loadPhotos(); loadMessages();
}

/* ---------- login / logout ---------- */
async function login() {
  setStatus($('loginStatus'), 'Checking...');
  try {
    await api('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('username').value, password: $('password').value })
    });
    $('password').value = '';
    setStatus($('loginStatus'), '');
    showDash();
  } catch (e) { setStatus($('loginStatus'), e.message, 'error'); }
}
$('loginBtn').addEventListener('click', login);
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  showLogin();
});

/* ---------- photos ---------- */
async function loadPhotos() {
  const grid = $('photoGrid');
  const photos = await api('/api/photos');
  $('photoCount').textContent = `(${photos.length})`;
  grid.innerHTML = '';
  if (!photos.length) { grid.appendChild(el('p', 'empty', 'No photos uploaded yet.')); return; }
  photos.forEach(p => {
    const card = el('div', 'admin-photo');
    const img = el('img'); img.src = p.imageUrl; img.alt = p.caption || p.category; img.loading = 'lazy';
    const meta = el('div', 'meta');
    meta.appendChild(el('b', '', p.category));
    meta.appendChild(document.createTextNode(p.area || ''));
    const del = el('button', 'btn-danger', 'Delete');
    del.addEventListener('click', async () => {
      if (!confirm('Delete this photo permanently?')) return;
      try { await api('/api/photos/' + p._id, { method: 'DELETE' }); loadPhotos(); }
      catch (e) { alert(e.message); }
    });
    card.append(img, meta, del);
    grid.appendChild(card);
  });
}

$('uploadBtn').addEventListener('click', async () => {
  const file = $('pFile').files[0];
  if (!file) { setStatus($('uploadStatus'), 'Please choose a photo first.', 'error'); return; }
  const fd = new FormData();
  fd.append('category', $('pCategory').value);
  fd.append('area', $('pArea').value);
  fd.append('caption', $('pCaption').value);
  fd.append('photo', file);               // the file must be added last
  $('uploadBtn').disabled = true;
  setStatus($('uploadStatus'), 'Uploading...');
  try {
    await api('/api/photos', { method: 'POST', body: fd });
    setStatus($('uploadStatus'), 'Photo added. It is now live on the website.', 'ok');
    $('pFile').value = ''; $('pArea').value = ''; $('pCaption').value = '';
    loadPhotos();
  } catch (e) { setStatus($('uploadStatus'), e.message, 'error'); }
  finally { $('uploadBtn').disabled = false; }
});

/* ---------- enquiries ---------- */
async function loadMessages() {
  const list = $('msgList');
  const msgs = await api('/api/messages');
  const unread = msgs.filter(m => !m.read).length;
  $('msgCount').textContent = `(${msgs.length} total, ${unread} unread)`;
  list.innerHTML = '';
  if (!msgs.length) { list.appendChild(el('li', 'empty', 'No enquiries yet.')); return; }
  msgs.forEach(m => {
    const li = el('li', 'admin-msg' + (m.read ? '' : ' unread'));
    const top = el('div', 'top');
    top.appendChild(el('span', 'who', m.name));
    top.appendChild(el('span', '', new Date(m.createdAt).toLocaleString()));
    const contact = el('div', 'top');
    const mail = el('a', '', m.email); mail.href = 'mailto:' + m.email;
    contact.appendChild(mail);
    if (m.phone) contact.appendChild(el('span', '', m.phone));
    const body = el('div', 'body', m.message);
    const actions = el('div', 'actions');
    const readBtn = el('button', '', m.read ? 'Mark as unread' : 'Mark as read');
    readBtn.addEventListener('click', async () => {
      try { await api(`/api/messages/${m._id}/read`, { method: 'PATCH' }); loadMessages(); }
      catch (e) { alert(e.message); }
    });
    const delBtn = el('button', 'del', 'Delete');
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this enquiry permanently?')) return;
      try { await api('/api/messages/' + m._id, { method: 'DELETE' }); loadMessages(); }
      catch (e) { alert(e.message); }
    });
    actions.append(readBtn, delBtn);
    li.append(top, contact, body, actions);
    list.appendChild(li);
  });
}

/* ---------- start: are we already logged in? ---------- */
(async function init() {
  try { await api('/api/admin/me'); showDash(); }
  catch { showLogin(); }
})();
