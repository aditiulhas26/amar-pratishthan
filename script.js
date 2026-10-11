// ===== Footer year =====
document.getElementById('yr').textContent = new Date().getFullYear();

/* =========================================================
   GALLERY
   Photos are fetched from the server (GET /api/photos), so
   every visitor sees the photos the admin has uploaded.
   ========================================================= */
let allPhotos = [];
let currentFilter = 'all';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;   // textContent = safe from HTML injection
  return node;
}

function showMessage(grid, title, body) {
  const box = el('div', 'empty-state');
  box.appendChild(el('strong', '', title));
  box.appendChild(document.createTextNode(body));
  grid.appendChild(box);
}

function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = '';
  const list = currentFilter === 'all' ? allPhotos : allPhotos.filter(p => p.category === currentFilter);

  if (list.length === 0) {
    showMessage(grid, 'No photos yet', 'Photos from the field will appear here soon.');
    return;
  }
  list.forEach(p => {
    const card = el('div', 'photo-card');
    const img = el('img', 'thumb');
    img.src = p.imageUrl;
    img.alt = p.caption || `${p.category} - ${p.area || ''}`;
    img.loading = 'lazy';
    card.appendChild(img);
    const cap = el('div', 'cap');
    cap.appendChild(el('div', 'role', p.caption || p.category));
    cap.appendChild(el('div', 'area', p.area ? `${p.category} · ${p.area}` : p.category));
    card.appendChild(cap);
    grid.appendChild(card);
  });
}

async function loadGallery() {
  const grid = document.getElementById('galleryGrid');
  try {
    const res = await fetch('/api/photos');
    if (!res.ok) throw new Error('bad response');
    allPhotos = await res.json();
    renderGallery();
  } catch (err) {
    grid.innerHTML = '';
    showMessage(grid, 'Could not load photos', 'Please refresh the page in a moment.');
  }
}

document.getElementById('filterRow').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  document.querySelectorAll('#filterRow .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  renderGallery();
});

loadGallery();

/* =========================================================
   CONTACT FORM
   Sends the enquiry to the server (POST /api/contact). The
   server saves it in the database and emails the trust.
   ========================================================= */
const sendBtn = document.getElementById('sendMsgBtn');
const confirmBox = document.getElementById('msgConfirm');

function showStatus(text, isError) {
  confirmBox.textContent = text;
  confirmBox.classList.toggle('error', !!isError);
  confirmBox.classList.add('show');
}

sendBtn.addEventListener('click', async () => {
  const name = document.getElementById('cName').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const phone = document.getElementById('cPhone').value.trim();
  const message = document.getElementById('cMsg').value.trim();
  const website = document.getElementById('cWebsite').value;   // honeypot: real people leave it empty

  if (!name || !email || !message) {
    showStatus('Please fill in your name, email and message.', true);
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, message, website })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');

    ['cName', 'cEmail', 'cPhone', 'cMsg'].forEach(id => { document.getElementById(id).value = ''; });
    showStatus('Thank you. Your message has been sent to the trust and they will contact you soon.', false);
  } catch (err) {
    showStatus(err.message, true);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send message';
  }
});

/* =========================================================
   DOCUMENTS (PDFs live in public/assets/docs)
   ========================================================= */
const DOC_ICON = `<svg class="doc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
  <path d="M14 2v6h6"/>
</svg>`;

const DOCS = [
  { title: "PAN Card",               pdf: "PAN_Card_and_Trust_Registration.pdf" },
  { title: "Trust Registration",     pdf: "PAN_Card_and_Trust_Registration.pdf" },
  { title: "Societies Registration", pdf: "Societies_Registration_Certificate.pdf" },
  { title: "12A Form",               pdf: "12A_Registration_Certificate.pdf" },
  { title: "80G Form",               pdf: "80G_Approval_Certificate.pdf" }
];

(function renderDocs() {
  const grid = document.getElementById('docGrid');
  DOCS.forEach(d => {
    const card = document.createElement('a');
    card.className = 'doc-card';
    card.href = d.pdf;
    card.target = '_blank';
    card.rel = 'noopener';
    card.innerHTML = `${DOC_ICON}<h3>${d.title}</h3><span class="doc-open">Open document</span>`;
    grid.appendChild(card);
  });
})();
