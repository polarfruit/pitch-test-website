import express from 'express';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stmts, txSignupVendor, txSignupOrganiser } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SQLiteStore = connectSqlite3(session);
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: 'pitch-dev-secret-change-in-prod',
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
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
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
    res.json({ ok: true, redirect: '/dashboard/vendor' });
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
    res.json({ ok: true, redirect: '/dashboard/organiser' });
  } catch (err) {
    console.error('Signup organiser error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

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

// ── API: Admin ─────────────────────────────────────────────────────────────

app.get('/api/admin/vendors', (req, res) => {
  const { status } = req.query;
  const rows = status
    ? stmts.vendorsByStatus.all(status)
    : stmts.allVendors.all();
  res.json({ vendors: rows });
});

app.get('/api/admin/organisers', (req, res) => {
  const { status } = req.query;
  const rows = status
    ? stmts.organisersByStatus.all(status)
    : stmts.allOrganisers.all();
  res.json({ organisers: rows });
});

app.get('/api/admin/stats', (req, res) => {
  res.json({
    vendors:    stmts.countVendors.get().n,
    organisers: stmts.countOrganisers.get().n,
    pending:    stmts.countPending.get().n,
  });
});

app.post('/api/admin/users/:id/status', (req, res) => {
  const { status } = req.body;
  const allowed = ['active', 'pending', 'suspended', 'banned'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  stmts.updateUserStatus.run(status, req.params.id);
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
app.get('/signup/vendor',       page('signup-vendor.html'));
app.get('/signup/organiser',    page('signup-organiser.html'));
app.get('/events/*splat',       page('event-detail.html'));
app.get('/vendors/*splat',      page('vendor-detail.html'));
app.get('/dashboard/vendor',    page('vendor-dashboard.html'));
app.get('/dashboard/vendor/*splat', page('vendor-dashboard.html'));
app.get('/dashboard/organiser', page('organiser-dashboard.html'));
app.get('/dashboard/organiser/*splat', page('organiser-dashboard.html'));
app.get('/admin',               page('admin-dashboard.html'));
app.get('/admin/*splat',        page('admin-dashboard.html'));

// Static assets (fonts, images, brand_assets, etc.)
app.use(express.static(__dirname, { index: false }));

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Pitch. server running at http://localhost:${PORT}`);
});
