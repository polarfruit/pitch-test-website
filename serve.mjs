import express from 'express';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stmts, txSignupVendor, txSignupOrganiser } from './db.mjs';
import { sendVerificationEmail, sendVerificationSMS } from './mailer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SQLiteStore = connectSqlite3(session);
const SESSION_DIR = process.env.VERCEL ? '/tmp' : __dirname;
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: SESSION_DIR }),
  secret: process.env.SESSION_SECRET || 'pitch-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));

// ── Auth helpers ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function requireAdminPage(req, res, next) {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  next();
}

// ── API: Auth ──────────────────────────────────────────────────────────────

// POST /api/signup/vendor
app.post('/api/signup/vendor', async (req, res) => {
  const {
    // account
    first_name, last_name, email, password,
    // business
    trading_name, abn, mobile, state, suburb, bio,
    // setup
    cuisine_tags, setup_type, stall_w, stall_d, power, water, price_range, instagram,
    // plan
    plan,
  } = req.body;

  if (!email || !password || !first_name || !last_name || !trading_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = stmts.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const userId = txSignupVendor(
      { email, password_hash, first_name, last_name, role: 'vendor' },
      {
        trading_name,
        abn: abn || null,
        abn_verified: abn ? 1 : 0,
        mobile: mobile || null,
        state: state || null,
        suburb: suburb || null,
        bio: bio || null,
        cuisine_tags: JSON.stringify(cuisine_tags || []),
        setup_type: setup_type || null,
        stall_w: stall_w || null,
        stall_d: stall_d || null,
        power: power ? 1 : 0,
        water: water ? 1 : 0,
        price_range: price_range || null,
        instagram: instagram || null,
        plan: plan || 'free',
      }
    );
    req.session.userId = userId;
    req.session.role = 'vendor';
    req.session.name = `${first_name} ${last_name}`;

    // Send email verification (non-blocking — don't fail signup if email fails)
    issueEmailCode(userId, email).catch(err => console.error('Email verification send error:', err));

    res.json({ ok: true, redirect: `/verify/email?email=${encodeURIComponent(email)}` });
  } catch (err) {
    console.error('Signup vendor error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// POST /api/signup/organiser
app.post('/api/signup/organiser', async (req, res) => {
  const {
    // account
    first_name, last_name, email, password,
    // org details
    org_name, abn, website, state, suburb, phone, bio,
    // event prefs
    event_types, event_scale, stall_range, referral,
  } = req.body;

  if (!email || !password || !first_name || !last_name || !org_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = stmts.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const userId = txSignupOrganiser(
      { email, password_hash, first_name, last_name, role: 'organiser' },
      {
        org_name,
        abn: abn || null,
        abn_verified: abn ? 1 : 0,
        website: website || null,
        state: state || null,
        suburb: suburb || null,
        phone: phone || null,
        bio: bio || null,
        event_types: JSON.stringify(event_types || []),
        event_scale: event_scale || null,
        stall_range: stall_range || null,
        referral: referral || null,
      }
    );
    req.session.userId = userId;
    req.session.role = 'organiser';
    req.session.name = `${first_name} ${last_name}`;

    // Send email verification (non-blocking)
    issueEmailCode(userId, email).catch(err => console.error('Email verification send error:', err));

    res.json({ ok: true, redirect: `/verify/email?email=${encodeURIComponent(email)}` });
  } catch (err) {
    console.error('Signup organiser error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// ── Verification helpers ───────────────────────────────────────────────────

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function expiresAt(minutes = 15) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

async function issueEmailCode(userId, email) {
  const code = makeCode();
  stmts.createVerificationCode.run({ user_id: userId, type: 'email', code, target: email, expires_at: expiresAt(15) });
  await sendVerificationEmail(email, code);
}

async function issuePhoneCode(userId, phone) {
  const code = makeCode();
  stmts.createVerificationCode.run({ user_id: userId, type: 'phone', code, target: phone, expires_at: expiresAt(10) });
  await sendVerificationSMS(phone, code);
}

// GET /api/verify/status
app.get('/api/verify/status', requireAuth, (req, res) => {
  const user = stmts.getUserById.get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ email_verified: !!user.email_verified, phone_verified: !!user.phone_verified });
});

// POST /api/verify/email  — verify code
app.post('/api/verify/email', requireAuth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });

  const row = stmts.getVerificationCode.get(req.session.userId, 'email');
  if (!row || row.code !== String(code).trim()) {
    return res.status(400).json({ error: 'Invalid or expired code. Please request a new one.' });
  }
  stmts.markCodeUsed.run(row.id);
  stmts.setEmailVerified.run(req.session.userId);

  // Determine redirect — if they have a phone to verify, go there
  const user = stmts.getUserById.get(req.session.userId);
  const hasPhone = user.role === 'vendor'
    ? (stmts.getVendorByUserId.get(user.id) || {}).mobile
    : null;

  res.json({ ok: true, redirect: '/verify/phone' });
});

// POST /api/verify/email/resend
app.post('/api/verify/email/resend', requireAuth, async (req, res) => {
  try {
    const user = stmts.getUserById.get(req.session.userId);
    if (!user) return res.status(404).json({ error: 'Not found' });
    await issueEmailCode(user.id, user.email);
    res.json({ ok: true });
  } catch (err) {
    console.error('Resend email code error:', err);
    res.status(500).json({ error: 'Could not send email' });
  }
});

// POST /api/verify/phone/send  — request SMS code
app.post('/api/verify/phone/send', requireAuth, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  try {
    await issuePhoneCode(req.session.userId, phone);
    req.session.pendingPhone = phone; // remember for verification step
    res.json({ ok: true });
  } catch (err) {
    console.error('Send SMS error:', err);
    res.status(500).json({ error: 'Could not send SMS' });
  }
});

// POST /api/verify/phone  — verify code
app.post('/api/verify/phone', requireAuth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });

  const row = stmts.getVerificationCode.get(req.session.userId, 'phone');
  if (!row || row.code !== String(code).trim()) {
    return res.status(400).json({ error: 'Invalid or expired code.' });
  }
  stmts.markCodeUsed.run(row.id);
  stmts.setPhoneVerified.run(req.session.userId);

  const user = stmts.getUserById.get(req.session.userId);
  const redirect = user.role === 'vendor' ? '/dashboard/vendor' : '/dashboard/organiser';
  res.json({ ok: true, redirect });
});

// POST /api/verify/phone/skip
app.post('/api/verify/phone/skip', requireAuth, (req, res) => {
  const user = stmts.getUserById.get(req.session.userId);
  const redirect = user && user.role === 'vendor' ? '/dashboard/vendor' : '/dashboard/organiser';
  res.json({ ok: true, redirect });
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  // Allow admin login from the general login page
  if (email === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.adminFresh = true;
    return res.json({ ok: true, redirect: '/admin' });
  }

  const user = stmts.getUserByEmail.get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });

  if (user.status === 'banned') return res.status(403).json({ error: 'This account has been banned' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'This account is suspended' });

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.name = `${user.first_name} ${user.last_name}`;

  let redirect = '/';
  if (user.role === 'vendor') redirect = '/dashboard/vendor';
  else if (user.role === 'organiser') redirect = '/dashboard/organiser';
  else if (user.role === 'admin') redirect = '/admin';

  res.json({ ok: true, redirect });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/me
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = stmts.getUserById.get(req.session.userId);
  if (!user) return res.json({ user: null });

  const { password_hash, ...safe } = user;
  // Attach profile data
  if (user.role === 'vendor') {
    safe.vendor = stmts.getVendorByUserId.get(user.id) || null;
  } else if (user.role === 'organiser') {
    safe.organiser = stmts.getOrganiserByUserId.get(user.id) || null;
  }
  res.json({ user: safe });
});

// ── API: Admin login ────────────────────────────────────────────────────────

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.isAdmin = true;
  req.session.adminFresh = true; // consumed on first /admin load
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── API: Public events ─────────────────────────────────────────────────────

app.get('/api/events', (req, res) => {
  res.json({ events: stmts.publishedEvents.all() });
});

app.get('/api/events/:slug', (req, res) => {
  const ev = stmts.getEventBySlug.get(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json({ event: ev });
});

// ── API: Public vendors ────────────────────────────────────────────────────

app.get('/api/vendors', (req, res) => {
  const rows = stmts.publicVendors.all();
  const vendors = rows.map(v => ({
    ...v,
    cuisine_tags: (() => { try { return JSON.parse(v.cuisine_tags || '[]'); } catch { return []; } })(),
  }));
  res.json({ vendors });
});

app.get('/api/vendors/:userId', (req, res) => {
  const row = stmts.publicVendorById.get(req.params.userId);
  if (!row) return res.status(404).json({ error: 'Vendor not found' });
  const vendor = { ...row };
  vendor.cuisine_tags = (() => { try { return JSON.parse(row.cuisine_tags || '[]'); } catch { return []; } })();
  delete vendor.password_hash;
  res.json({ vendor });
});

// ── API: Admin ─────────────────────────────────────────────────────────────

app.get('/api/admin/vendors', requireAdmin, (req, res) => {
  const { status } = req.query;
  const rows = status
    ? stmts.vendorsByStatus.all(status)
    : stmts.allVendors.all();
  res.json({ vendors: rows });
});

app.get('/api/admin/organisers', requireAdmin, (req, res) => {
  const { status } = req.query;
  const rows = status
    ? stmts.organisersByStatus.all(status)
    : stmts.allOrganisers.all();
  res.json({ organisers: rows });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({
    vendors:    stmts.countVendors.get().n,
    organisers: stmts.countOrganisers.get().n,
    pending:    stmts.countPending.get().n,
  });
});

app.post('/api/admin/users/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ['active', 'pending', 'suspended', 'banned'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  stmts.updateUserStatus.run(status, req.params.id);
  res.json({ ok: true });
});

// Admin events
app.get('/api/admin/events', requireAdmin, (req, res) => {
  res.json({ events: stmts.allEvents.all() });
});

app.patch('/api/admin/events/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ['published', 'archived'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  stmts.updateEventStatus.run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/events/:id', requireAdmin, (req, res) => {
  stmts.deleteEvent.run(req.params.id);
  res.json({ ok: true });
});

// Admin vendor/organiser detail
app.get('/api/admin/vendors/:userId', requireAdmin, (req, res) => {
  const row = stmts.getVendorDetail.get(req.params.userId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { password_hash, ...safe } = row;
  res.json({ vendor: safe, user: { id: row.user_id, email: row.email, first_name: row.first_name, last_name: row.last_name, status: row.status, created_at: row.created_at } });
});

app.get('/api/admin/organisers/:userId', requireAdmin, (req, res) => {
  const row = stmts.getOrganiserDetail.get(req.params.userId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ organiser: row, user: { id: row.user_id, email: row.email, first_name: row.first_name, last_name: row.last_name, status: row.status, created_at: row.created_at } });
});

// Admin payments
app.get('/api/admin/payments/:userId', requireAdmin, (req, res) => {
  const payments = stmts.getPaymentsByUser.all(req.params.userId);
  res.json({ payments });
});

// Update profiles
app.put('/api/admin/users/:userId/profile', requireAdmin, (req, res) => {
  const { first_name, last_name, email, status } = req.body;
  stmts.updateUserProfile.run({ first_name, last_name, email, status, id: req.params.userId });
  res.json({ ok: true });
});

app.put('/api/admin/vendors/:userId', requireAdmin, (req, res) => {
  const { trading_name, mobile, suburb, state, bio, plan, instagram, setup_type, stall_w, stall_d, power, water, price_range, abn } = req.body;
  stmts.updateVendorProfile.run({ trading_name, mobile: mobile||null, suburb: suburb||null, state: state||null, bio: bio||null, plan: plan||'free', instagram: instagram||null, setup_type: setup_type||null, stall_w: stall_w||null, stall_d: stall_d||null, power: power?1:0, water: water?1:0, price_range: price_range||null, abn: abn||null, user_id: req.params.userId });
  res.json({ ok: true });
});

app.put('/api/admin/organisers/:userId', requireAdmin, (req, res) => {
  const { org_name, phone, website, suburb, state, bio, event_scale, stall_range, abn } = req.body;
  stmts.updateOrganiserProfile.run({ org_name, phone: phone||null, website: website||null, suburb: suburb||null, state: state||null, bio: bio||null, event_scale: event_scale||null, stall_range: stall_range||null, abn: abn||null, user_id: req.params.userId });
  res.json({ ok: true });
});

// ── Static page routes ─────────────────────────────────────────────────────
function page(file) {
  return (req, res) => res.sendFile(path.join(__dirname, file));
}

app.get('/',                    page('index.html'));
app.get('/events',              page('events.html'));
app.get('/vendors',             page('vendors.html'));
app.get('/login',               page('login.html'));
app.get('/signup',              page('signup.html'));
app.get('/signup/vendor',       page('signup-vendor.html'));
app.get('/signup/organiser',    page('signup-organiser.html'));
app.get('/verify/email',        page('verify-email.html'));
app.get('/verify/phone',        page('verify-phone.html'));
app.get('/events/*splat',       page('event-detail.html'));
app.get('/vendors/*splat',      page('vendor-detail.html'));
app.get('/dashboard/vendor',    page('vendor-dashboard.html'));
app.get('/dashboard/vendor/*splat', page('vendor-dashboard.html'));
app.get('/dashboard/organiser', page('organiser-dashboard.html'));
app.get('/dashboard/organiser/*splat', page('organiser-dashboard.html'));
app.get('/admin/login',         page('admin-login.html'));
app.get('/admin', (req, res) => {
  if (req.session.adminFresh) {
    req.session.adminFresh = false; // consume — next visit requires fresh login
    return res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
  }
  // No fresh login — clear admin auth and require re-login
  delete req.session.isAdmin;
  res.redirect('/admin/login');
});
app.get('/admin/*splat',        requireAdminPage, page('admin-dashboard.html'));

// Static assets (fonts, images, brand_assets, etc.)
app.use(express.static(__dirname, { index: false }));

// ── Start ──────────────────────────────────────────────────────────────────
// Export for Vercel serverless; listen locally otherwise
export default app;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Pitch. server running at http://localhost:${PORT}`);
  });
}
