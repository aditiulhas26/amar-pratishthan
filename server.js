/* =====================================================================
   Amar Pratishthan website - backend server (Node.js + Express)

   What this file does:
   1. Serves the website files from the /public folder.
   2. Provides an API the website talks to:
        GET    /api/photos            public   list gallery photos
        POST   /api/photos            admin    upload a photo (goes to Cloudinary)
        DELETE /api/photos/:id        admin    delete a photo
        POST   /api/contact           public   save an enquiry + email it to the trust
        GET    /api/messages          admin    list enquiries
        PATCH  /api/messages/:id/read admin    mark read / unread
        DELETE /api/messages/:id      admin    delete an enquiry
        POST   /api/admin/login|logout, GET /api/admin/me
   3. Stores data in MongoDB, images in Cloudinary.
   ===================================================================== */
require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const Photo = require('./Photo');
const Message = require('./Message');
const { CATEGORIES } = Photo;

/* ---------- settings from environment variables (.env) ---------- */
const {
  PORT = 3000,
  NODE_ENV,
  MONGODB_URI,
  JWT_SECRET,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  BREVO_API_KEY,
  ADMIN_EMAIL = 'pratishthanamar@gmail.com',
  MAIL_FROM = 'pratishthanamar@gmail.com'
} = process.env;
const isProd = NODE_ENV === 'production';

for (const [name, value] of Object.entries({ MONGODB_URI, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD })) {
  if (!value) { console.error(`Missing required setting: ${name} (see .env.example)`); process.exit(1); }
}
if (JWT_SECRET.length < 16) { console.error('JWT_SECRET is too short. Use a long random value.'); process.exit(1); }
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.warn('Cloudinary is not configured: photo uploads will fail until you add the CLOUDINARY_* settings.');
}
if (!BREVO_API_KEY) {
  console.warn('BREVO_API_KEY is not set: enquiries will be saved but no email will be sent.');
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true
});

/* ---------- app setup ---------- */
const app = express();
app.set('trust proxy', 1);   // we run behind Render's proxy: needed for correct visitor IPs
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ['https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

/* ---------- helpers ---------- */
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function sha(value) { return crypto.createHash('sha256').update(String(value)).digest(); }
function safeEqual(a, b) { return crypto.timingSafeEqual(sha(a), sha(b)); }   // constant-time compare

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const limiter = (windowMinutes, max, message) => rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: message })
});
const loginLimiter = limiter(15, 10, 'Too many login attempts. Please wait 15 minutes.');
const contactLimiter = limiter(60, 8, 'Too many messages sent. Please try again later.');

/* ---------- admin login (JWT stored in a secure cookie) ---------- */
const COOKIE = 'ap_admin';
const EIGHT_HOURS = 8 * 60 * 60 * 1000;

function requireAdmin(req, res, next) {
  try {
    jwt.verify(req.cookies[COOKIE] || '', JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in.' });
  }
}

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const userOk = safeEqual(username ?? '', ADMIN_USERNAME);
  const passOk = safeEqual(password ?? '', ADMIN_PASSWORD);
  if (!(userOk && passOk)) return res.status(401).json({ error: 'Wrong username or password.' });

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: isProd, maxAge: EIGHT_HOURS });
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });
app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ ok: true }));

/* ---------- photos ---------- */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED_TYPES.includes(file.mimetype) ? cb(null, true) : cb(httpError(400, 'Only JPG, PNG or WebP photos are allowed.'))
});

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'amar-pratishthan',
        resource_type: 'image',
        format: 'jpg',   // also converts phone HEIC photos so every browser can show them
        transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto' }]
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

app.get('/api/photos', wrap(async (req, res) => {
  const photos = await Photo.find().sort({ createdAt: -1 }).limit(300).lean();
  res.json(photos);
}));

app.post('/api/photos', requireAdmin, upload.single('photo'), wrap(async (req, res) => {
  if (!req.file) throw httpError(400, 'Please choose a photo.');
  const { category = '', area = '', caption = '' } = req.body;
  if (!CATEGORIES.includes(category)) throw httpError(400, 'Please choose a valid category.');
  if (area.length > 100 || caption.length > 200) throw httpError(400, 'Area or caption is too long.');
  if (!CLOUDINARY_CLOUD_NAME) throw httpError(500, 'Photo storage is not configured on the server.');

  const result = await uploadToCloudinary(req.file.buffer);
  const photo = await Photo.create({
    category, area, caption,
    imageUrl: result.secure_url,
    publicId: result.public_id
  });
  res.status(201).json(photo);
}));

app.delete('/api/photos/:id', requireAdmin, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, 'Invalid id.');
  const photo = await Photo.findById(req.params.id);
  if (!photo) throw httpError(404, 'Photo not found.');
  try { await cloudinary.uploader.destroy(photo.publicId); }
  catch (e) { console.error('Cloudinary delete failed:', e.message); }   // still remove it from the site
  await photo.deleteOne();
  res.json({ ok: true });
}));

/* ---------- contact form ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+\-()\s]{0,20}$/;

async function sendEnquiryEmail(m) {
  if (!BREVO_API_KEY) return false;
  const subject = `New website enquiry from ${m.name}`.replace(/[\r\n]+/g, ' ').slice(0, 150);
  const text = `Name: ${m.name}\nEmail: ${m.email}\nPhone: ${m.phone || '-'}\n\nMessage:\n${m.message}`;
  const html = `<h3>New enquiry from the Amar Pratishthan website</h3>
    <p><b>Name:</b> ${escapeHtml(m.name)}<br>
    <b>Email:</b> ${escapeHtml(m.email)}<br>
    <b>Phone:</b> ${escapeHtml(m.phone || '-')}</p>
    <p style="white-space:pre-wrap">${escapeHtml(m.message)}</p>
    <p style="color:#666">Press Reply to answer this person directly.</p>`;

  // Brevo's HTTPS API is used instead of SMTP because Render's free plan blocks SMTP ports.
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Amar Pratishthan Website', email: MAIL_FROM },
      to: [{ email: ADMIN_EMAIL }],
      replyTo: { email: m.email, name: m.name },
      subject, textContent: text, htmlContent: html
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Brevo responded ${res.status}: ${await res.text()}`);
  return true;
}

app.post('/api/contact', contactLimiter, wrap(async (req, res) => {
  const body = req.body || {};
  if (body.website) return res.json({ ok: true });   // honeypot filled in = a bot; pretend success

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  const message = String(body.message ?? '').trim();

  if (!name || name.length > 100) throw httpError(400, 'Please enter your name.');
  if (!EMAIL_RE.test(email) || email.length > 150) throw httpError(400, 'Please enter a valid email address.');
  if (!PHONE_RE.test(phone)) throw httpError(400, 'Please enter a valid phone number.');
  if (message.length < 5 || message.length > 2000) throw httpError(400, 'Please write a message (5 to 2000 characters).');

  const saved = await Message.create({ name, email, phone, message });   // saved first, so nothing is lost

  try {
    if (await sendEnquiryEmail(saved)) await Message.updateOne({ _id: saved._id }, { emailSent: true });
  } catch (e) {
    console.error('Enquiry email failed (message is still saved in the admin panel):', e.message);
  }
  res.status(201).json({ ok: true });
}));

/* ---------- admin: enquiries ---------- */
app.get('/api/messages', requireAdmin, wrap(async (req, res) => {
  res.json(await Message.find().sort({ createdAt: -1 }).limit(500).lean());
}));

app.patch('/api/messages/:id/read', requireAdmin, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, 'Invalid id.');
  const msg = await Message.findById(req.params.id);
  if (!msg) throw httpError(404, 'Message not found.');
  msg.read = !msg.read;
  await msg.save();
  res.json({ ok: true, read: msg.read });
}));

app.delete('/api/messages/:id', requireAdmin, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, 'Invalid id.');
  const result = await Message.deleteOne({ _id: req.params.id });
  if (!result.deletedCount) throw httpError(404, 'Message not found.');
  res.json({ ok: true });
}));

/* ---------- static website + error handling ---------- */
app.get('/healthz', (req, res) => res.send('ok'));
// Only these files are public. Everything else (server.js, package.json...) stays private.
const PUBLIC_FILES = ['index.html', 'admin.html', 'style.css', 'admin.css', 'script.js', 'admin.js', 'logo.png',
  'PAN_Card_and_Trust_Registration.pdf', 'Societies_Registration_Certificate.pdf',
  '12A_Registration_Certificate.pdf', '80G_Approval_Certificate.pdf'];
PUBLIC_FILES.forEach((f) => app.get('/' + f, (req, res) => res.sendFile(path.join(__dirname, f))));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large (maximum 8 MB).' : 'Upload failed.';
    return res.status(400).json({ error: msg });
  }
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : err.message });
});

/* ---------- start ---------- */
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Website running on port ${PORT}`));
  })
  .catch((err) => { console.error('Could not connect to MongoDB:', err.message); process.exit(1); });
