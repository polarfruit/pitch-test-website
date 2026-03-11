import express from 'express';
import { createHmac } from 'crypto';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stmts, txSignupVendor, txSignupOrganiser } from './db.mjs';
import { sendVerificationEmail, sendVerificationSMS } from './mailer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// ── Simple HMAC-signed session cookie ──────────────────────────────────────
// Replaces cookie-session. Stores session payload directly in a signed cookie.
// No Secure flag (Vercel enforces HTTPS at the edge), no third-party session
// store — just crypto.createHmac which is built into Node.
const SESS_SECRET = process.env.SESSION_SECRET || 'pitch-dev-secret-2026';
const SESS_COOKIE = 'pitchsess';
const SESS_MAX_AGE = 7 * 24 * 60 * 60; // seconds

function sessSign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = createHmac('sha256', SESS_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function sessVerify(token) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const data = token.slice(0, dot);
  const sig  = token.slice(dot + 1);
  const expected = createHmac('sha256', SESS_SECRET).update(data).digest('base64url');
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(data, 'base64url').toString()); }
  catch { return null; }
}

function sessRead(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${SESS_COOKIE}=([^;]+)`));
  return match ? (sessVerify(decodeURIComponent(match[1])) ?? {}) : {};
}

function sessWrite(res, payload) {
  if (!payload || Object.keys(payload).length === 0) {
    res.setHeader('Set-Cookie', `${SESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  } else {
    const token = encodeURIComponent(sessSign(payload));
    res.setHeader('Set-Cookie', `${SESS_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESS_MAX_AGE}`);
  }
}

// Session middleware — attaches req.session (read on every request)
app.use((req, res, next) => {
  req.session = sessRead(req);
  next();
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// ── Page token (embedded in dashboard HTML, used for API calls via header) ──
// Cookies sometimes don't persist for fetch() on Vercel's edge. Page tokens
// bypass this: auth happens server-side on the page GET, a signed token is
// injected into the HTML, and every dashboard API call sends it as a header.
function makePageToken(userId, role) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const data = `${userId}:${role}:${exp}`;
  const sig = createHmac('sha256', SESS_SECRET).update(data).digest('base64url').slice(0, 20);
  return Buffer.from(data).toString('base64url') + '.' + sig;
}

function verifyPageToken(token) {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const dataB64 = token.slice(0, i);
  const sig = token.slice(i + 1);
  const data = Buffer.from(dataB64, 'base64url').toString();
  const expected = createHmac('sha256', SESS_SECRET).update(data).digest('base64url').slice(0, 20);
  if (sig !== expected) return null;
  const [uid, role, expStr] = data.split(':');
  if (!uid || !role || Date.now() / 1000 > Number(expStr)) return null;
  return { userId: Number(uid), role };
}

// Serve a dashboard page with auth check + injected user data and page token.
// This eliminates the need for a /api/me call from the client entirely.
function serveDashboard(file, expectedRole) {
  return async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
      const user = await stmts.getUserById.get(req.session.userId);
      if (!user || user.role !== expectedRole) return res.redirect('/login');

      const profile = expectedRole === 'vendor'
        ? await stmts.getVendorByUserId.get(user.id)
        : await stmts.getOrganiserByUserId.get(user.id);

      const token = makePageToken(user.id, user.role);
      const { password_hash, ...userSafe } = user;

      let html = fs.readFileSync(path.join(__dirname, file), 'utf8');
      html = html.replace('</head>', `<script>
window.__PITCH_USER__    = ${JSON.stringify(userSafe)};
window.__PITCH_PROFILE__ = ${JSON.stringify(profile || {})};
window.__PITCH_TOKEN__   = ${JSON.stringify(token)};
</script></head>`);
      res.send(html);
    } catch (e) {
      console.error('[serveDashboard]', e);
      res.redirect('/login');
    }
  };
}

// ── Auth helpers ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  // Cookie session
  if (req.session.userId) return next();
  // Header token (sent by dashboard pages when cookies don't persist on Vercel)
  const tok = req.headers['x-pitch-auth'];
  if (tok) {
    const auth = verifyPageToken(tok);
    if (auth) { req.session = auth; return next(); }
  }
  return res.status(401).json({ error: 'Not authenticated' });
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

    sessWrite(res, { userId, role: 'vendor', name: `${first_name} ${last_name}` });
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

    sessWrite(res, { userId, role: 'organiser', name: `${first_name} ${last_name}` });
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
    sessWrite(res, { ...req.session, pendingPhone: phone });
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
    sessWrite(res, { isAdmin: true });
    return res.json({ ok: true, redirect: '/admin' });
  }

  const user = await stmts.getUserByEmail.get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });

  if (user.status === 'pending')   return res.status(403).json({ error: 'Your account is pending approval.' });
  if (user.status === 'banned')    return res.status(403).json({ error: 'This account has been banned.' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'This account is suspended.' });

  sessWrite(res, {
    userId: Number(user.id),
    role:   user.role,
    name:   `${user.first_name} ${user.last_name}`,
  });

  let redirect = '/';
  if (user.role === 'vendor')         redirect = '/dashboard/vendor';
  else if (user.role === 'organiser') redirect = '/dashboard/organiser';
  else if (user.role === 'admin')     redirect = '/admin';

  res.json({ ok: true, redirect });
});

// POST /api/logout
// ── API: ABN verification ──────────────────────────────────────────────────
function abnChecksum(abn) {
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const d = abn.replace(/\s/g, '').split('').map(Number);
  if (d.length !== 11) return false;
  d[0] -= 1;
  return d.reduce((s, n, i) => s + n * weights[i], 0) % 89 === 0;
}

app.post('/api/verify-abn', async (req, res) => {
  const clean = (req.body.abn || '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(clean))
    return res.json({ valid: false, error: 'ABN must be exactly 11 digits.' });
  if (!abnChecksum(clean))
    return res.json({ valid: false, error: 'ABN is invalid — please check the number and try again.' });

  const guid = process.env.ABR_GUID;
  if (!guid) {
    // No API key configured — checksum passed, can't confirm entity name
    return res.json({ valid: true, checksum_only: true, message: 'ABN format is valid. To confirm entity details, configure ABR_GUID.' });
  }

  try {
    const url = `https://abn.business.gov.au/abrxmlsearch/abrxmlsearch.asmx/SearchByABNv202001?searchString=${clean}&includeHistoricalDetails=N&authenticationGuid=${guid}`;
    const r = await fetch(url, { headers: { Accept: 'text/xml' } });
    const xml = await r.text();

    // ABR returned an error (e.g. no match)
    const excMatch = xml.match(/<exceptionCode>([\s\S]*?)<\/exceptionCode>/);
    if (excMatch) return res.json({ valid: false, error: 'ABN not found in the Australian Business Register.' });

    const status = (xml.match(/<entityStatusCode>([\s\S]*?)<\/entityStatusCode>/) || [])[1] || 'Unknown';

    // Organisation name (companies, trusts, etc.)
    let entityName = '';
    const orgMatch = xml.match(/<mainName>[\s\S]*?<organisationName>([\s\S]*?)<\/organisationName>/);
    if (orgMatch) {
      entityName = orgMatch[1].trim();
    } else {
      // Individual — use given + family name
      const given  = (xml.match(/<legalName>[\s\S]*?<givenName>([\s\S]*?)<\/givenName>/)  || [])[1] || '';
      const family = (xml.match(/<legalName>[\s\S]*?<familyName>([\s\S]*?)<\/familyName>/) || [])[1] || '';
      entityName = [given, family].map(s => s.trim()).filter(Boolean).join(' ');
    }

    if (status !== 'Active')
      return res.json({ valid: false, error: `ABN is ${status} — only active ABNs are accepted.`, entityName, status });

    return res.json({ valid: true, entityName, status, abn: clean });
  } catch (e) {
    console.error('[ABR]', e);
    return res.json({ valid: false, error: 'Could not reach the Australian Business Register. Please try again.' });
  }
});

app.post('/api/logout', (req, res) => {
  sessWrite(res, {});
  res.json({ ok: true });
});

// GET /logout
app.get('/logout', (req, res) => {
  sessWrite(res, {});
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
  sessWrite(res, { isAdmin: true });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  sessWrite(res, {});
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
  vendor.photos       = (() => { try { return JSON.parse(row.photos       || '[]'); } catch { return []; } })();
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

// ── API: Vendor photos ─────────────────────────────────────────────────────
app.post('/api/vendor/photos', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { photos } = req.body;
  if (!Array.isArray(photos)) return res.status(400).json({ error: 'photos must be an array' });
  if (photos.length > 6) return res.status(400).json({ error: 'Maximum 6 photos allowed' });
  // Validate each entry is a data URL (jpeg/png) or empty string
  for (const p of photos) {
    if (p && typeof p === 'string' && !p.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid photo format' });
    }
  }
  await stmts.updateVendorPhotos.run({ photos: JSON.stringify(photos), user_id: req.session.userId });
  res.json({ ok: true });
});

// ── API: Vendor documents ──────────────────────────────────────────────────
app.post('/api/vendor/documents', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { doc_type, data } = req.body;
  const allowed = ['food_safety', 'pli', 'council'];
  if (!allowed.includes(doc_type)) return res.status(400).json({ error: 'Invalid doc_type' });
  if (data !== null && (typeof data !== 'string' || !data.startsWith('data:'))) {
    return res.status(400).json({ error: 'Invalid file data' });
  }
  // Load current doc values then update the one that changed
  const current = await stmts.getVendorByUserId.get(req.session.userId);
  await stmts.updateVendorDoc.run({
    food_safety_url: doc_type === 'food_safety' ? data : (current && current.food_safety_url) || null,
    pli_url:         doc_type === 'pli'         ? data : (current && current.pli_url)         || null,
    council_url:     doc_type === 'council'     ? data : (current && current.council_url)     || null,
    user_id: req.session.userId,
  });
  res.json({ ok: true, url: data });
});

// ── Public stats ───────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const vendors = (await stmts.countVendors.get()).n;
  const events  = (await stmts.countEvents.get()).n;
  res.json({ vendors, events });
});

// ── API: Organiser dashboard ───────────────────────────────────────────────

app.get('/api/organiser/overview', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const events = await stmts.getOrganiserEvents.all(req.session.userId);

  let totalApps = 0, totalApproved = 0, totalSpots = 0, totalFilled = 0;
  const recentApps = [];

  for (const ev of events) {
    const apps = await stmts.getApplicationsByEvent.all(ev.id);
    totalApps += apps.length;
    const approved = apps.filter(a => a.status === 'approved');
    totalApproved += approved.length;
    if (ev.stalls_available) {
      totalSpots  += ev.stalls_available;
      totalFilled += Math.min(approved.length, ev.stalls_available);
    }
    for (const a of apps) {
      recentApps.push({ ...a, event_name: ev.name, event_id: ev.id });
    }
  }

  recentApps.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const fillRate = totalSpots > 0 ? Math.round((totalFilled / totalSpots) * 100) : 0;
  const upcoming = events.filter(e => e.status === 'published').slice(0, 5);

  res.json({
    total_apps: totalApps,
    vendors_approved: totalApproved,
    fill_rate: fillRate,
    upcoming,
    recent_apps: recentApps.slice(0, 5),
  });
});

app.post('/api/organiser/events', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });

  const { name, category, date_sort, date_end, date_text, suburb, state, venue_name, description, stalls_available } = req.body;
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
      date_end: date_end || null,
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
  if (!ev || Number(ev.organiser_user_id) !== Number(req.session.userId)) return res.status(403).json({ error: 'Not your event' });
  const apps = await stmts.getApplicationsByEvent.all(req.params.id);
  res.json({ applications: apps });
});

app.patch('/api/organiser/events/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const ev = await stmts.getEventById.get(req.params.id);
  if (!ev || Number(ev.organiser_user_id) !== Number(req.session.userId)) return res.status(403).json({ error: 'Not your event' });
  const { name, category, suburb, state, venue_name, date_sort, date_end, description, stalls_available } = req.body;
  const dateText = date_sort ? new Date(date_sort).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' }) : null;
  await stmts.updateEvent.run({ id: Number(req.params.id), name: name || ev.name, category: category || ev.category, suburb: suburb || ev.suburb, state: state || ev.state, venue_name: venue_name ?? ev.venue_name, date_sort: date_sort || ev.date_sort, date_end: date_end ?? ev.date_end, date_text: dateText || ev.date_text, description: description ?? ev.description, stalls_available: stalls_available != null ? Number(stalls_available) : ev.stalls_available });
  res.json({ ok: true });
});

app.patch('/api/organiser/events/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const ev = await stmts.getEventById.get(req.params.id);
  if (!ev || Number(ev.organiser_user_id) !== Number(req.session.userId)) return res.status(403).json({ error: 'Not your event' });
  const { status } = req.body;
  if (!['published','archived'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await stmts.updateEventStatus.run(status, Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/organiser/events/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const ev = await stmts.getEventById.get(req.params.id);
  if (!ev || Number(ev.organiser_user_id) !== Number(req.session.userId)) return res.status(403).json({ error: 'Not your event' });
  await stmts.deleteEvent.run(Number(req.params.id));
  res.json({ ok: true });
});

app.patch('/api/organiser/applications/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { status } = req.body;
  const allowed = ['approved', 'rejected', 'pending'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await stmts.updateApplicationStatus.run(status, req.params.id);
  let spotNumber = null;
  if (status === 'approved') {
    // Fetch the application to get event_id
    const app = await stmts.getApplicationById.get(req.params.id);
    if (app) {
      const { n } = await stmts.countApprovedByEvent.get(app.event_id);
      spotNumber = n; // n already includes this approval
      await stmts.setApplicationSpot.run(spotNumber, req.params.id);
    }
  }
  res.json({ ok: true, spot_number: spotNumber });
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
app.get('/vendors/:id', async (req, res) => {
  const id = req.params.id;
  // Only inject data for numeric IDs (real accounts); slug-based demo vendors use client-side data.js
  if (/^\d+$/.test(id)) {
    try {
      const row = await stmts.publicVendorById.get(id);
      if (row) {
        const vendor = { ...row };
        vendor.cuisine_tags = (() => { try { return JSON.parse(row.cuisine_tags || '[]'); } catch { return []; } })();
        vendor.photos       = (() => { try { return JSON.parse(row.photos       || '[]'); } catch { return []; } })();
        delete vendor.password_hash;
        let html = fs.readFileSync(path.join(__dirname, 'vendor-detail.html'), 'utf8');
        html = html.replace('</head>', `<script>window.__PITCH_VENDOR__=${JSON.stringify(vendor)};</script></head>`);
        return res.send(html);
      }
    } catch (e) { console.error('[vendor page]', e); }
  }
  res.sendFile(path.join(__dirname, 'vendor-detail.html'));
});
app.get('/dashboard/vendor',          serveDashboard('vendor-dashboard.html', 'vendor'));
app.get('/dashboard/vendor/*splat',   serveDashboard('vendor-dashboard.html', 'vendor'));
app.get('/dashboard/organiser',       serveDashboard('organiser-dashboard.html', 'organiser'));
app.get('/dashboard/organiser/*splat', serveDashboard('organiser-dashboard.html', 'organiser'));
app.get('/admin/login',         page('admin-login.html'));
app.get('/admin',               requireAdminPage, page('admin-dashboard.html'));
app.get('/admin/*splat',        requireAdminPage, page('admin-dashboard.html'));

app.use(express.static(__dirname, { index: false }));

// ── Start ──────────────────────────────────────────────────────────────────
export default app;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Pitch. server running at http://localhost:${PORT}`);
  });
}
