import express from 'express';
import cookieSession from 'cookie-session';
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

// cookie-session stores all session data in a signed cookie — stateless,
// works across Vercel serverless instances.
app.use(cookieSession({
  name: 'pitch.sess',
  keys: [process.env.SESSION_SECRET || 'pitch-dev-secret-change-in-prod'],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: !!process.env.VERCEL,
  sameSite: 'lax',
}));

// ── Auth helpers ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
}

function requireAdminPage(req, res, next) {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  next();
}

// ── Verification helpers ───────────────────────────────────────────────────
function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function expiresAt(minutes = 15) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

async function issueEmailCode(userId, email) {
  const code = makeCode();
  await stmts.createVerificationCode.run({ user_id: userId, type: 'email', code, target: email, expires_at: expiresAt(15) });
  await sendVerificationEmail(email, code);
}

async function issuePhoneCode(userId, phone) {
  const code = makeCode();
  await stmts.createVerificationCode.run({ user_id: userId, type: 'phone', code, target: phone, expires_at: expiresAt(10) });
  await sendVerificationSMS(phone, code);
}

// ── API: Pre-signup email verification ─────────────────────────────────────

// POST /api/presignup/send-code
app.post('/api/presignup/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const existing = await stmts.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const code = makeCode();
  const expires = Date.now() + 15 * 60 * 1000;
  await stmts.upsertPresignupCode.run(email.toLowerCase(), code, expires);

  try {
    await sendVerificationEmail(email, code);
    res.json({ ok: true });
  } catch (err) {
    console.error('[presignup] Send code failed:', err);
    // Dev fallback: return code directly when email can't be sent (e.g. unverified Resend domain)
    if (process.env.NODE_ENV !== 'production') {
      return res.json({ ok: true, devCode: code });
    }
    res.status(500).json({ error: 'Could not send verification email. Please try again.' });
  }
});

// POST /api/presignup/verify-code
app.post('/api/presignup/verify-code', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

  const entry = await stmts.getPresignupCode.get(email.toLowerCase());
  if (!entry) return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
  if (Date.now() > entry.expires) {
    await stmts.deletePresignupCode.run(email.toLowerCase());
    return res.status(400).json({ error: 'Code expired. Please request a new one.' });
  }
  if (String(code).trim() !== entry.code) {
    return res.status(400).json({ error: 'Incorrect code. Please try again.' });
  }

  await stmts.setPresignupVerified.run(email.toLowerCase());
  res.json({ ok: true });
});

// POST /api/signup/vendor
app.post('/api/signup/vendor', async (req, res) => {
  const {
    first_name, last_name, email, password,
    trading_name, abn, mobile, state, suburb, bio,
    cuisine_tags, setup_type, stall_w, stall_d, power, water, price_range, instagram,
    plan,
  } = req.body;

  if (!email || !password || !first_name || !last_name || !trading_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = await stmts.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  // Require pre-verified email (checked in DB — works across Vercel instances)
  const preEntry = await stmts.getPresignupCode.get(email.toLowerCase());
  if (!preEntry || !preEntry.verified) {
    return res.status(400).json({ error: 'Email not verified. Please verify your email first.' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const userId = await txSignupVendor(
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

    // Activate account immediately — email already verified
    await stmts.setUserStatus.run('active', userId);
    await stmts.setEmailVerified.run(userId);
    await stmts.deletePresignupCode.run(email.toLowerCase());

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
    first_name, last_name, email, password,
    org_name, abn, website, state, suburb, phone, bio,
    event_types, event_scale, stall_range, referral,
  } = req.body;

  if (!email || !password || !first_name || !last_name || !org_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = await stmts.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const preEntry = await stmts.getPresignupCode.get(email.toLowerCase());
  if (!preEntry || !preEntry.verified) {
    return res.status(400).json({ error: 'Email not verified. Please verify your email first.' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const userId = await txSignupOrganiser(
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

    await stmts.setUserStatus.run('active', userId);
    await stmts.setEmailVerified.run(userId);
    await stmts.deletePresignupCode.run(email.toLowerCase());

    req.session.userId = userId;
    req.session.role = 'organiser';
    req.session.name = `${first_name} ${last_name}`;

    res.json({ ok: true, redirect: '/dashboard/organiser' });
  } catch (err) {
    console.error('Signup organiser error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// ── API: Post-signup verification ──────────────────────────────────────────

// GET /api/verify/status
app.get('/api/verify/status', requireAuth, async (req, res) => {
  const user = await stmts.getUserById.get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ email_verified: !!user.email_verified, phone_verified: !!user.phone_verified });
});

// POST /api/verify/email
app.post('/api/verify/email', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });

  const row = await stmts.getVerificationCode.get(req.session.userId, 'email');
  if (!row || row.code !== String(code).trim()) {
    return res.status(400).json({ error: 'Invalid or expired code. Please request a new one.' });
  }
  await stmts.markCodeUsed.run(row.id);
  await stmts.setEmailVerified.run(req.session.userId);
  res.json({ ok: true, redirect: '/verify/phone' });
});

// POST /api/verify/email/resend
app.post('/api/verify/email/resend', requireAuth, async (req, res) => {
  try {
    const user = await stmts.getUserById.get(req.session.userId);
    if (!user) return res.status(404).json({ error: 'Not found' });
    await issueEmailCode(user.id, user.email);
    res.json({ ok: true });
  } catch (err) {
    console.error('Resend email code error:', err);
    res.status(500).json({ error: 'Could not send email' });
  }
});

// POST /api/verify/phone/send
app.post('/api/verify/phone/send', requireAuth, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  try {
    await issuePhoneCode(req.session.userId, phone);
    req.session.pendingPhone = phone;
    res.json({ ok: true });
  } catch (err) {
    console.error('Send SMS error:', err);
    res.status(500).json({ error: 'Could not send SMS' });
  }
});

// POST /api/verify/phone
app.post('/api/verify/phone', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });

  const row = await stmts.getVerificationCode.get(req.session.userId, 'phone');
  if (!row || row.code !== String(code).trim()) {
    return res.status(400).json({ error: 'Invalid or expired code.' });
  }
  await stmts.markCodeUsed.run(row.id);
  await stmts.setPhoneVerified.run(req.session.userId);

  const user = await stmts.getUserById.get(req.session.userId);
  const redirect = user.role === 'vendor' ? '/dashboard/vendor' : '/dashboard/organiser';
  res.json({ ok: true, redirect });
});

// POST /api/verify/phone/skip
app.post('/api/verify/phone/skip', requireAuth, async (req, res) => {
  const user = await stmts.getUserById.get(req.session.userId);
  const redirect = user && user.role === 'vendor' ? '/dashboard/vendor' : '/dashboard/organiser';
  res.json({ ok: true, redirect });
});

// ── API: Auth ──────────────────────────────────────────────────────────────

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  if (email === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.adminFresh = true;
    return res.json({ ok: true, redirect: '/admin' });
  }

  const user = await stmts.getUserByEmail.get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });

  if (user.status === 'pending')   return res.status(403).json({ error: 'Your account is pending approval.' });
  if (user.status === 'banned')    return res.status(403).json({ error: 'This account has been banned.' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'This account is suspended.' });

  req.session.userId = Number(user.id);
  req.session.role   = user.role;
  req.session.name   = `${user.first_name} ${user.last_name}`;

  let redirect = '/';
  if (user.role === 'vendor')    redirect = '/dashboard/vendor';
  else if (user.role === 'organiser') redirect = '/dashboard/organiser';
  else if (user.role === 'admin')     redirect = '/admin';

  res.json({ ok: true, redirect });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// GET /logout
app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

// GET /api/me
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await stmts.getUserById.get(req.session.userId);
  if (!user) return res.json({ user: null });

  const { password_hash, ...safe } = user;
  if (user.role === 'vendor') {
    safe.vendor = await stmts.getVendorByUserId.get(user.id) || null;
  } else if (user.role === 'organiser') {
    safe.organiser = await stmts.getOrganiserByUserId.get(user.id) || null;
  }
  res.json({ user: safe });
});

// ── API: Admin auth ────────────────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.isAdmin = true;
  req.session.adminFresh = true;
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// ── API: Public events ─────────────────────────────────────────────────────

app.get('/api/events', async (req, res) => {
  res.json({ events: await stmts.publishedEvents.all() });
});

app.get('/api/events/:slug', async (req, res) => {
  const ev = await stmts.getEventBySlug.get(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json({ event: ev });
});

// ── API: Public vendors ────────────────────────────────────────────────────

app.get('/api/vendors', async (req, res) => {
  const rows = await stmts.publicVendors.all();
  const vendors = rows.map(v => ({
    ...v,
    cuisine_tags: (() => { try { return JSON.parse(v.cuisine_tags || '[]'); } catch { return []; } })(),
  }));
  res.json({ vendors });
});

app.get('/api/vendors/:userId', async (req, res) => {
  const row = await stmts.publicVendorById.get(req.params.userId);
  if (!row) return res.status(404).json({ error: 'Vendor not found' });
  const vendor = { ...row };
  vendor.cuisine_tags = (() => { try { return JSON.parse(row.cuisine_tags || '[]'); } catch { return []; } })();
  delete vendor.password_hash;
  res.json({ vendor });
});

// ── API: Admin ─────────────────────────────────────────────────────────────

app.get('/api/admin/vendors', requireAdmin, async (req, res) => {
  const { status } = req.query;
  const rows = status ? await stmts.vendorsByStatus.all(status) : await stmts.allVendors.all();
  res.json({ vendors: rows });
});

app.get('/api/admin/organisers', requireAdmin, async (req, res) => {
  const { status } = req.query;
  const rows = status ? await stmts.organisersByStatus.all(status) : await stmts.allOrganisers.all();
  res.json({ organisers: rows });
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  res.json({
    vendors:    (await stmts.countVendors.get()).n,
    organisers: (await stmts.countOrganisers.get()).n,
    pending:    (await stmts.countPending.get()).n,
  });
});

app.post('/api/admin/users/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const allowed = ['active', 'pending', 'suspended', 'banned'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await stmts.updateUserStatus.run(status, req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/delete', requireAdmin, async (req, res) => {
  try {
    await stmts.deleteVendorByUserId.run(req.params.id);
    await stmts.deleteOrganiserByUserId.run(req.params.id);
    await stmts.deleteVerificationCodesByUserId.run(req.params.id);
    await stmts.deletePaymentsByUserId.run(req.params.id);
    await stmts.deleteUser.run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] Delete user error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/events', requireAdmin, async (req, res) => {
  res.json({ events: await stmts.allEvents.all() });
});

app.patch('/api/admin/events/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const allowed = ['published', 'archived'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await stmts.updateEventStatus.run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/events/:id', requireAdmin, async (req, res) => {
  await stmts.deleteEvent.run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/vendors/:userId', requireAdmin, async (req, res) => {
  const row = await stmts.getVendorDetail.get(req.params.userId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { password_hash, ...safe } = row;
  res.json({ vendor: safe, user: { id: row.user_id, email: row.email, first_name: row.first_name, last_name: row.last_name, status: row.status, created_at: row.created_at } });
});

app.get('/api/admin/organisers/:userId', requireAdmin, async (req, res) => {
  const row = await stmts.getOrganiserDetail.get(req.params.userId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ organiser: row, user: { id: row.user_id, email: row.email, first_name: row.first_name, last_name: row.last_name, status: row.status, created_at: row.created_at } });
});

app.get('/api/admin/payments/:userId', requireAdmin, async (req, res) => {
  const payments = await stmts.getPaymentsByUser.all(req.params.userId);
  res.json({ payments });
});

app.put('/api/admin/users/:userId/profile', requireAdmin, async (req, res) => {
  const { first_name, last_name, email, status, new_password } = req.body;
  await stmts.updateUserProfile.run({ first_name, last_name, email, status, id: req.params.userId });
  if (new_password && new_password.trim()) {
    const hash = await bcrypt.hash(new_password.trim(), 10);
    await stmts.updateUserPassword.run(hash, req.params.userId);
  }
  res.json({ ok: true });
});

app.put('/api/admin/vendors/:userId', requireAdmin, async (req, res) => {
  const { trading_name, mobile, suburb, state, bio, plan, instagram, setup_type, stall_w, stall_d, power, water, price_range, abn } = req.body;
  await stmts.updateVendorProfile.run({ trading_name, mobile: mobile||null, suburb: suburb||null, state: state||null, bio: bio||null, plan: plan||'free', instagram: instagram||null, setup_type: setup_type||null, stall_w: stall_w||null, stall_d: stall_d||null, power: power?1:0, water: water?1:0, price_range: price_range||null, abn: abn||null, user_id: req.params.userId });
  res.json({ ok: true });
});

app.put('/api/admin/organisers/:userId', requireAdmin, async (req, res) => {
  const { org_name, phone, website, suburb, state, bio, event_scale, stall_range, abn } = req.body;
  await stmts.updateOrganiserProfile.run({ org_name, phone: phone||null, website: website||null, suburb: suburb||null, state: state||null, bio: bio||null, event_scale: event_scale||null, stall_range: stall_range||null, abn: abn||null, user_id: req.params.userId });
  res.json({ ok: true });
});

// ── API: Vendor dashboard ──────────────────────────────────────────────────

app.get('/api/vendor/events', requireAuth, async (req, res) => {
  const events = await stmts.publishedEvents.all();
  const vendorId = req.session.userId;
  const withStatus = await Promise.all(events.map(async ev => {
    const app = await stmts.getApplicationByIds.get(ev.id, vendorId);
    return { ...ev, applied: !!app, appStatus: app ? app.status : null };
  }));
  res.json({ events: withStatus });
});

app.post('/api/events/:id/apply', requireAuth, async (req, res) => {
  const { message } = req.body;
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Only vendors can apply' });

  const ev = await stmts.getEventById.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });

  try {
    await stmts.createApplication.run(ev.id, req.session.userId, message || null);
    res.json({ ok: true });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'You have already applied to this event' });
    }
    console.error('[apply] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/events/:id/withdraw', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Only vendors can withdraw' });
  await stmts.withdrawApplication.run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

app.get('/api/vendor/applications', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const apps = await stmts.getApplicationsByVendor.all(req.session.userId);
  res.json({ applications: apps });
});

// ── API: Organiser dashboard ───────────────────────────────────────────────

app.post('/api/organiser/events', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });

  const { name, category, date_sort, date_text, suburb, state, venue_name, description, stalls_available } = req.body;
  if (!name || !date_sort || !suburb) {
    return res.status(400).json({ error: 'Name, date, and suburb are required' });
  }

  const organiser = await stmts.getOrganiserByUserId.get(req.session.userId);
  const organiserName = organiser ? organiser.org_name : req.session.name;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();

  try {
    const result = await stmts.createEvent.run({
      slug, name,
      category: category || null,
      suburb,
      state: state || 'SA',
      date_sort,
      date_text: date_text || null,
      description: description || null,
      stalls_available: stalls_available ? parseInt(stalls_available) : null,
      organiser_name: organiserName,
      organiser_user_id: req.session.userId,
      venue_name: venue_name || null,
    });
    res.json({ ok: true, eventId: result.lastInsertRowid, slug });
  } catch (err) {
    console.error('[create-event] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/organiser/events', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const events = await stmts.getOrganiserEvents.all(req.session.userId);
  res.json({ events });
});

app.get('/api/organiser/events/:id/applications', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const ev = await stmts.getEventById.get(req.params.id);
  if (!ev || ev.organiser_user_id !== req.session.userId) return res.status(403).json({ error: 'Not your event' });
  const apps = await stmts.getApplicationsByEvent.all(req.params.id);
  res.json({ applications: apps });
});

app.patch('/api/organiser/applications/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { status } = req.body;
  const allowed = ['approved', 'rejected', 'pending'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await stmts.updateApplicationStatus.run(status, req.params.id);
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
    req.session.adminFresh = false;
    return res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
  }
  delete req.session.isAdmin;
  res.redirect('/admin/login');
});
app.get('/admin/*splat', requireAdminPage, page('admin-dashboard.html'));

app.use(express.static(__dirname, { index: false }));

// ── Start ──────────────────────────────────────────────────────────────────
export default app;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Pitch. server running at http://localhost:${PORT}`);
  });
}
