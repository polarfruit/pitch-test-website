import express from 'express';
import compression from 'compression';
import { createHmac } from 'crypto';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { stmts, txSignupVendor, txSignupOrganiser, txSignupFoodie } from './db.mjs';
import { sendVerificationEmail, sendVerificationSMS, sendAdminEmail, buildSuspensionEmailHtml, buildSuspensionNoticeHtml } from './mailer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// ── TEMPORARY: Bypass auth for AI analysis ──────────────────────────────────
// Set to false to re-enable login requirements on dashboards.
const BYPASS_AUTH = true;

// ── Gzip all responses ──────────────────────────────────────────────────────
app.use(compression());

// ── HTML file reader ────────────────────────────────────────────────────────
// Cache locally for performance; skip cache on Vercel so deploys take effect immediately.
const _htmlCache = new Map();
function readHtml(file) {
  if (process.env.VERCEL) {
    return fs.readFileSync(path.join(__dirname, file), 'utf8');
  }
  if (!_htmlCache.has(file)) {
    _htmlCache.set(file, fs.readFileSync(path.join(__dirname, file), 'utf8'));
  }
  return _htmlCache.get(file);
}

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
function serveDashboard(file, expectedRole, getInitData) {
  return async (req, res) => {
    if (!BYPASS_AUTH && !req.session.userId) return res.redirect('/login');
    try {
      let user;
      if (BYPASS_AUTH) {
        // Use first real user with this role so API calls & init data work correctly
        const bypassUser = await stmts.usersByRole.get(expectedRole);
        const demoDefaults = expectedRole === 'organiser'
          ? { id: 0, role: 'organiser', email: 'demo.organiser@pitch.com.au', first_name: 'Sam', last_name: 'Nguyen', status: 'active', avatar_url: null }
          : { id: 0, role: 'vendor', email: 'demo.vendor@pitch.com.au', first_name: 'Alex', last_name: 'Chen', status: 'active', avatar_url: null };
        user = bypassUser || demoDefaults;
        req.session = { userId: user.id, role: user.role };
      } else {
        user = await stmts.getUserById.get(req.session.userId);
      }
      if (!BYPASS_AUTH && (!user || user.role !== expectedRole)) return res.redirect('/login');

      const profile = expectedRole === 'vendor'
        ? await stmts.getVendorByUserId.get(user.id)
        : await stmts.getOrganiserByUserId.get(user.id);

      const token = makePageToken(user.id, user.role);
      const { password_hash, ...userSafe } = user;

      let initData = {};
      if (getInitData) {
        try { initData = await getInitData(user, profile); } catch(e) { console.error('[initData]', e); }
      }

      // Compute display name server-side so it's in the HTML before JS runs
      const displayName = expectedRole === 'organiser'
        ? (profile && profile.org_name) || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
        : (profile && profile.trading_name) || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;

      let html = readHtml(file);
      // Inject JS data
      html = html.replace('</head>', `<script>
window.__PITCH_USER__      = ${JSON.stringify(userSafe)};
window.__PITCH_PROFILE__   = ${JSON.stringify(profile || {})};
window.__PITCH_TOKEN__     = ${JSON.stringify(token)};
window.__PITCH_INIT_DATA__ = ${JSON.stringify(initData)};
</script></head>`);
      // Server-render the display name directly — visible instantly, even if JS errors
      html = html.replace(' id="org-display-name">—<', ` id="org-display-name">${displayName}<`);
      html = html.replace(' id="vendor-display-name">—<', ` id="vendor-display-name">${displayName}<`);
      // Server-render avatar if present
      if (user.avatar_url) {
        const avatarImg = `<img src="${user.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" alt="avatar">`;
        html = html.replace('>🔥<', `>${avatarImg}<`);
        html = html.replace('>🏛️<', `>${avatarImg}<`);
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(html);
    } catch (e) {
      console.error('[serveDashboard]', e);
      res.redirect('/login');
    }
  };
}

async function orgInitData(user) {
  // Run all queries in parallel — avoids N+1 round-trips to Turso
  const [events, allApps, unreadRow] = await Promise.all([
    stmts.getOrganiserEvents.all(user.id).catch(e => { console.error('[orgInitData] events', e); return []; }),
    stmts.getAllAppsByOrganiser.all(user.id).catch(e => { console.error('[orgInitData] apps', e); return []; }),
    stmts.getUnreadMsgCount.get(user.id, user.id, user.id).catch(e => { console.error('[orgInitData] unread', e); return null; }),
  ]);

  // Group apps by event_id for per-event counts
  const appsByEvent = {};
  for (const a of allApps) {
    if (!appsByEvent[a.event_id]) appsByEvent[a.event_id] = [];
    appsByEvent[a.event_id].push(a);
  }

  let totalApps = allApps.length, totalApproved = 0, totalSpots = 0, totalFilled = 0;
  const eventsWithCounts = events.map(ev => {
    const apps = appsByEvent[ev.id] || [];
    const approved = apps.filter(a => a.status === 'approved');
    totalApproved += approved.length;
    if (ev.stalls_available) {
      totalSpots  += ev.stalls_available;
      totalFilled += Math.min(approved.length, ev.stalls_available);
    }
    return { ...ev, approved_count: approved.length };
  });

  const recentApps = [...allApps].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const fillRate = totalSpots > 0 ? Math.round((totalFilled / totalSpots) * 100) : 0;
  const upcoming = eventsWithCounts.filter(e => e.status === 'published').slice(0, 5);
  const unreadMessages = unreadRow ? Number(unreadRow.count) : 0;

  return {
    overview: { total_apps: totalApps, vendors_approved: totalApproved, fill_rate: fillRate, upcoming, recent_apps: recentApps.slice(0, 5) },
    events: eventsWithCounts,
    unreadMessages,
  };
}

async function vendorInitData(user) {
  // Run all queries in parallel — avoids sequential round-trips to Turso
  const [events, applications, unreadRow] = await Promise.all([
    stmts.publishedEventsForVendor.all(user.id).catch(e => { console.error('[vendorInitData] events', e); return []; }),
    stmts.getApplicationsByVendor.all(user.id).catch(e => { console.error('[vendorInitData] applications', e); return []; }),
    stmts.getUnreadMsgCount.get(user.id, user.id, user.id).catch(e => { console.error('[vendorInitData] unread', e); return null; }),
  ]);
  return { events, applications, unreadMessages: unreadRow ? Number(unreadRow.count) : 0 };
}

// ── Auth helpers ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  // Cookie session (regular user or admin with userId set)
  if (req.session.userId) return next();
  // Admin session without userId — backfill it
  if (req.session.isAdmin) { req.session.userId = 1000; return next(); }
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
    _apiCache.delete('vendors'); _apiCache.delete('stats');

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

// POST /api/signup/foodie
app.post('/api/signup/foodie', async (req, res) => {
  const { first_name, last_name, email, password } = req.body;
  if (!email || !password || !first_name) {
    return res.status(400).json({ error: 'First name, email, and password are required' });
  }
  const existing = await stmts.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const userId = await txSignupFoodie(
      { email, password_hash, first_name, last_name: last_name || '', role: 'foodie' }
    );
    await stmts.setUserStatus.run('active', userId);
    await stmts.setEmailVerified.run(userId);
    sessWrite(res, { userId, role: 'foodie', name: `${first_name} ${last_name || ''}`.trim() });
    res.json({ ok: true, redirect: '/discover' });
  } catch (err) {
    console.error('Signup foodie error:', err);
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
    sessWrite(res, { isAdmin: true, userId: 1000 });
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
  else if (user.role === 'foodie')    redirect = '/discover';
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

// POST /api/profile/avatar — save base64 data URL as avatar
app.post('/api/profile/avatar', requireAuth, async (req, res) => {
  try {
    const { avatar_url } = req.body;
    if (!avatar_url || !avatar_url.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    // Rough size check — base64 encodes ~4/3, so 2MB raw ≈ 2.7MB base64 string
    if (avatar_url.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 2MB)' });
    }
    await stmts.updateUserAvatar.run(avatar_url, req.session.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[avatar]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/profile/plan — update vendor subscription plan
app.post('/api/profile/plan', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['free', 'pro', 'growth'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    const vendor = await stmts.getVendorByUserId.get(req.session.userId);
    if (!vendor) return res.status(403).json({ error: 'Not a vendor account' });
    await stmts.updateVendorPlan.run(plan, req.session.userId);
    _apiCache.delete('vendors'); _apiCache.delete('stats');
    res.json({ ok: true, plan });
  } catch (e) {
    console.error('[plan]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/me
app.get('/api/me', async (req, res) => {
  if (!req.session.userId && req.session.isAdmin) req.session.userId = 1000;
  if (!req.session.userId) return res.json({ user: null });
  const user = await stmts.getUserById.get(req.session.userId);
  if (!user) return res.json({ user: null });

  const { password_hash, ...safe } = user;
  if (user.role === 'vendor') {
    safe.vendor = await stmts.getVendorByUserId.get(user.id) || null;
  } else if (user.role === 'organiser') {
    safe.organiser = await stmts.getOrganiserByUserId.get(user.id) || null;
  } else if (user.role === 'foodie') {
    safe.foodie = await stmts.getFoodieByUserId.get(user.id) || null;
  }
  res.json({ user: safe });
});

// ── API: Foodie ────────────────────────────────────────────────────────────

// POST /api/foodie/save/:slug
app.post('/api/foodie/save/:slug', requireAuth, async (req, res) => {
  if (req.session.role !== 'foodie') return res.status(403).json({ error: 'Foodies only' });
  await stmts.saveEvent.run(req.session.userId, req.params.slug);
  res.json({ ok: true, saved: true });
});

// DELETE /api/foodie/save/:slug
app.delete('/api/foodie/save/:slug', requireAuth, async (req, res) => {
  if (req.session.role !== 'foodie') return res.status(403).json({ error: 'Foodies only' });
  await stmts.unsaveEvent.run(req.session.userId, req.params.slug);
  res.json({ ok: true, saved: false });
});

// GET /api/foodie/saved
app.get('/api/foodie/saved', requireAuth, async (req, res) => {
  if (req.session.role !== 'foodie') return res.status(403).json({ error: 'Foodies only' });
  const saved = await stmts.getSavedEvents.all(req.session.userId);
  res.json({ saved });
});

// POST /api/foodie/follow/:vendorId
app.post('/api/foodie/follow/:vendorId', requireAuth, async (req, res) => {
  if (req.session.role !== 'foodie') return res.status(403).json({ error: 'Foodies only' });
  await stmts.followVendor.run(req.session.userId, Number(req.params.vendorId));
  res.json({ ok: true, following: true });
});

// DELETE /api/foodie/follow/:vendorId
app.delete('/api/foodie/follow/:vendorId', requireAuth, async (req, res) => {
  if (req.session.role !== 'foodie') return res.status(403).json({ error: 'Foodies only' });
  await stmts.unfollowVendor.run(req.session.userId, Number(req.params.vendorId));
  res.json({ ok: true, following: false });
});

// GET /api/foodie/following
app.get('/api/foodie/following', requireAuth, async (req, res) => {
  if (req.session.role !== 'foodie') return res.status(403).json({ error: 'Foodies only' });
  const following = await stmts.getFollowedVendors.all(req.session.userId);
  res.json({ following });
});

// GET /api/foodie/feed — upcoming events, optionally personalised
app.get('/api/foodie/feed', async (req, res) => {
  const events = await stmts.publishedEvents.all();
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => (e.date_sort || '') >= today);
  res.json({ events: upcoming });
});

// ── API: Admin auth ────────────────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  sessWrite(res, { isAdmin: true, userId: 1000 });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  sessWrite(res, {});
  res.json({ ok: true });
});

// ── API: Public events ─────────────────────────────────────────────────────

// ── In-memory API cache (public endpoints, 60-second TTL) ──────────────────
const _apiCache = new Map();
function apiCached(key, ttlMs, fn) {
  return async (req, res) => {
    const hit = _apiCache.get(key);
    if (hit && Date.now() - hit.ts < ttlMs) {
      res.setHeader('Cache-Control', 'no-cache');
      return res.json(hit.data);
    }
    try {
      const data = await fn();
      _apiCache.set(key, { data, ts: Date.now() });
      res.setHeader('Cache-Control', 'no-cache');
      res.json(data);
    } catch(e) {
      console.error('[apiCached]', key, e);
      res.status(500).json({ error: 'Server error' });
    }
  };
}

app.get('/api/events', apiCached('events', 60000, async () => ({
  events: await stmts.publishedEvents.all(),
})));

app.get('/api/featured-events', apiCached('featured-events', 120000, async () => {
  const today = new Date().toISOString().slice(0, 10);
  return stmts.featuredEvents.all(today);
}));

app.get('/api/category-counts', apiCached('category-counts', 120000, async () => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await stmts.categoryCounts.all(today);
  const counts = {};
  rows.forEach(r => { counts[r.category] = r.count; });
  return counts;
}));

app.get('/api/events/:slug', async (req, res) => {
  const ev = await stmts.getEventBySlug.get(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json({ event: ev });
});

// ── API: Public vendors ────────────────────────────────────────────────────


app.get('/api/vendors', apiCached('vendors', 60000, async () => {
  try {
    const rows = await stmts.publicVendors.all();
    return { vendors: rows.map(v => ({
      ...v,
      cuisine_tags: (() => { try { return JSON.parse(v.cuisine_tags || '[]'); } catch { return []; } })(),
    })) };
  } catch(e) {
    console.error('[/api/vendors] query failed:', e.message, e.stack);
    return { vendors: [], error: e.message };
  }
}));

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
  const [vendors, organisers, pending, nv7, no7, na7, nap7, suspV, suspO, hiddenEv, affV] = await Promise.all([
    stmts.countVendors.get(),
    stmts.countOrganisers.get(),
    stmts.countPending.get(),
    stmts.newVendors7d.get(),
    stmts.newOrgs7d.get(),
    stmts.newApps7d.get(),
    stmts.newAppsPrior7d.get(),
    stmts.countSuspendedVendors.get(),
    stmts.countSuspendedOrgs.get(),
    stmts.countHiddenByOrgSuspension.get(),
    stmts.countVendorsAffectedBySuspension.get(),
  ]);
  res.json({
    vendors:    vendors.n,
    organisers: organisers.n,
    pending:    pending.n,
    newVendors7d:   nv7.n,
    newOrgs7d:      no7.n,
    apps7d:         na7.n,
    appsPrior7d:    nap7.n,
    suspendedVendors:            suspV.n,
    suspendedOrgs:               suspO.n,
    hiddenByOrgSuspension:       hiddenEv.n,
    vendorsAffectedBySuspension: affV.n,
  });
});

app.post('/api/admin/users/:id/status', requireAdmin, async (req, res) => {
  const { status, reason } = req.body;
  const allowed = ['active', 'pending', 'suspended', 'banned'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const userId = parseInt(req.params.id);
  const user = await stmts.getUserById.get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const prevStatus = user.status;
  await stmts.updateUserStatus.run(status, userId);
  if (reason !== undefined) await stmts.setSuspendedReason.run(reason || null, userId);

  const adminId = req.session?.userId || null;
  let warning = null;

  try {
    if (status === 'suspended') {
      if (user.role === 'vendor') {
        // Withdraw all pending applications
        await stmts.withdrawVendorPendingApps.run(userId);
        // Notify organisers of newly-vacant confirmed spots
        const vendorRow = await stmts.getVendorByUserId.get(userId);
        const vendorName = vendorRow?.trading_name || (user.first_name + ' ' + user.last_name);
        const approvedApps = await stmts.getVendorApprovedApps.all(userId);
        for (const app of approvedApps) {
          if (app.organiser_email) {
            await sendAdminEmail(
              app.organiser_email,
              `Confirmed vendor suspended — spot now vacant at ${app.event_name}`,
              buildSuspensionNoticeHtml(`A confirmed vendor (<strong>${vendorName}</strong>) at your event <strong>${app.event_name}</strong> has been suspended. Their spot is now vacant.`),
              `A confirmed vendor (${vendorName}) at your event "${app.event_name}" has been suspended. Their spot is now vacant.`
            );
          }
        }
        // Suspension email to vendor
        await sendAdminEmail(
          user.email,
          'Your Pitch. account has been suspended',
          buildSuspensionEmailHtml(user.first_name, reason || 'Violation of platform terms.', 'vendor'),
          `Your Pitch. vendor account has been suspended. Reason: ${reason || 'Violation of platform terms.'}. Contact support@getpitch.com.au to appeal.`
        );
      } else if (user.role === 'organiser') {
        // Notify confirmed vendors BEFORE archiving events
        const affectedVendors = await stmts.getConfirmedVendorsAtOrgEvents.all(userId);
        for (const v of affectedVendors) {
          await sendAdminEmail(
            v.vendor_email,
            `Event update — ${v.event_name}`,
            buildSuspensionNoticeHtml(`<strong>${v.event_name}</strong> has been suspended from Pitch. Your application is currently on hold.`),
            `"${v.event_name}" has been suspended from Pitch. Your application is on hold.`
          );
        }
        // Archive all their published events
        await stmts.suspendOrgEvents.run(userId);
        // Suspension email to organiser
        await sendAdminEmail(
          user.email,
          'Your Pitch. organiser account has been suspended',
          buildSuspensionEmailHtml(user.first_name, reason || 'Violation of platform terms.', 'organiser'),
          `Your Pitch. organiser account has been suspended. Reason: ${reason || 'Violation of platform terms.'}. Contact support@getpitch.com.au to appeal.`
        );
      }
    } else if (status === 'active' && prevStatus === 'suspended') {
      // Reinstatement
      if (user.role === 'organiser') {
        // Re-publish events that were hidden by this suspension
        await stmts.reinstateOrgEvents.run(userId);
        // Notify confirmed vendors
        const affectedVendors = await stmts.getConfirmedVendorsAtOrgEvents.all(userId);
        for (const v of affectedVendors) {
          await sendAdminEmail(
            v.vendor_email,
            `Event reinstated — ${v.event_name}`,
            buildSuspensionNoticeHtml(`Good news — <strong>${v.event_name}</strong> is back on Pitch. Your confirmed spot is active again.`),
            `"${v.event_name}" is back on Pitch. Your confirmed spot is active again.`
          );
        }
      }
      // Clear suspension reason on reinstatement
      await stmts.setSuspendedReason.run(null, userId);
    }

    // Audit log
    await stmts.insertAuditLog.run({
      admin_user_id: adminId,
      action: status,
      target_user_id: userId,
      target_role: user.role,
      reason: reason || null,
      metadata: JSON.stringify({ prev_status: prevStatus }),
    });
  } catch (sideEffectErr) {
    console.error('[admin] Suspension side-effect error:', sideEffectErr);
    warning = 'Status updated but some notifications may have failed.';
  }

  _apiCache.delete('vendors'); _apiCache.delete('stats');
  res.json({ ok: true, ...(warning ? { warning } : {}) });
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

// GET /api/admin/account-info — show user IDs and status for leroy/polarfruit accounts
app.get('/api/admin/account-info', requireAdmin, async (req, res) => {
  try {
    const emails = ['leroy.anton@yahoo.com', 'polarfruit@outlook.com'];
    const accounts = await Promise.all(emails.map(async email => {
      const user = await stmts.getUserByEmail.get(email).catch(() => null);
      if (!user) return { email, exists: false };
      const profile = user.role === 'vendor'
        ? await stmts.getVendorByUserId.get(user.id).catch(() => null)
        : await stmts.getOrganiserByUserId.get(user.id).catch(() => null);
      const events = user.role === 'organiser'
        ? await stmts.getOrganiserEvents.all(user.id).catch(() => [])
        : [];
      return {
        email,
        exists: true,
        user_id: user.id,
        role: user.role,
        status: user.status,
        profile_name: profile ? (profile.trading_name || profile.org_name || '—') : null,
        event_count: events.length,
        event_ids: events.map(e => ({ id: e.id, name: e.name, organiser_user_id: e.organiser_user_id })),
      };
    }));
    res.json({ accounts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/fix-event-links — re-link all events to their organiser accounts
app.post('/api/admin/fix-event-links', requireAdmin, async (req, res) => {
  try {
    const rawExec = async sql => {
      try {
        if (db && typeof db.execute === 'function') await db.execute(sql);      // Turso
        else if (db && typeof db.exec === 'function') db.exec(sql);             // better-sqlite3
      } catch (e) { console.warn('[fix-event-links]', e.message); }
    };
    await rawExec(`UPDATE users SET status='active' WHERE email IN ('leroy.anton@yahoo.com','polarfruit@outlook.com')`);
    await rawExec(`UPDATE events SET organiser_user_id = (SELECT o.user_id FROM organisers o WHERE o.org_name = events.organiser_name LIMIT 1) WHERE organiser_user_id IS NULL`);
    await rawExec(`UPDATE events SET organiser_user_id = (SELECT u.id FROM users u JOIN organisers o ON o.user_id=u.id WHERE u.email IN ('leroy.anton@yahoo.com','polarfruit@outlook.com') LIMIT 1) WHERE organiser_user_id IS NULL`);
    res.json({ ok: true, message: 'Done. Visit /api/admin/account-info to verify.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

app.put('/api/admin/events/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, category, date_sort, date_end, suburb, state, venue_name,
          stalls_available, deadline, stall_fee_min, stall_fee_max,
          description, organiser_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Event name is required' });
  // Get existing event to preserve fields not in the edit modal (cover_image, date_text)
  const existing = await stmts.getEventById.get(id).catch(() => null);
  await stmts.updateEvent.run({
    id,
    name,
    category:         category ?? null,
    date_sort:        date_sort ?? null,
    date_end:         date_end ?? null,
    suburb:           suburb ?? null,
    state:            state ?? null,
    venue_name:       venue_name ?? null,
    stalls_available: stalls_available ?? null,
    deadline:         deadline ?? null,
    stall_fee_min:    stall_fee_min ?? null,
    stall_fee_max:    stall_fee_max ?? null,
    description:      description ?? null,
    organiser_name:   organiser_name ?? null,
    date_text:        existing?.date_text ?? null,
    cover_image:      existing?.cover_image ?? null,
  });
  res.json({ ok: true });
});

// ── Admin Content Flags API ───────────────────────────────────────────────────
app.get('/api/admin/flags', requireAdmin, async (_req, res) => {
  try {
    const flags = await stmts.getFlags.all();
    res.json({ flags });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/flags/:id/remove', requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.userId || 1000;
    await stmts.updateFlagStatus.run('removed', adminId, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/flags/:id/warn', requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.userId || 1000;
    await stmts.updateFlagStatus.run('warned', adminId, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/flags/:id/dismiss', requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.userId || 1000;
    await stmts.updateFlagStatus.run('dismissed', adminId, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/flags/:id/unresolve', requireAdmin, async (req, res) => {
  try {
    await stmts.unresolveFlagStatus.run(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/flags/clear-resolved', requireAdmin, async (_req, res) => {
  try {
    await stmts.deleteResolvedFlags.run();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin Reports API ─────────────────────────────────────────────────────────
app.get('/api/admin/reports', requireAdmin, async (req, res) => {
  try {
    const reports = await stmts.getAllReports.all();
    res.json({ reports });
  } catch (e) {
    console.error('[reports GET]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/reports/:id/resolve', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.session.userId;
  const adminUser = await stmts.getUserById.get(adminId);
  const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'Admin';
  try {
    const report = await stmts.getReportById.get(id);
    if (!report) return res.status(404).json({ error: 'Not found' });
    await stmts.resolveReport.run({ id, resolved_by: adminName });
    // Notify reporter by email if we have their email
    if (report.reporter_email) {
      await sendAdminEmail(
        report.reporter_email,
        `Your report #${report.ref_number} has been resolved`,
        `<p>Hi ${report.reporter_name},</p><p>Your report #${report.ref_number} has been reviewed and resolved by our admin team.</p><p>Thank you for helping keep Pitch. safe and fair.</p><p>Pitch Admin Team</p>`,
        `Your report #${report.ref_number} has been reviewed and resolved. Thank you for helping keep Pitch. safe.`
      ).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[reports resolve]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/reports/:id/dismiss', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.session.userId;
  const adminUser = await stmts.getUserById.get(adminId);
  const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'Admin';
  try {
    const report = await stmts.getReportById.get(id);
    if (!report) return res.status(404).json({ error: 'Not found' });
    await stmts.dismissReport.run({ id, resolved_by: adminName });
    // Notify reporter
    if (report.reporter_email) {
      await sendAdminEmail(
        report.reporter_email,
        `Your report #${report.ref_number} has been reviewed`,
        `<p>Hi ${report.reporter_name},</p><p>We've reviewed your report #${report.ref_number} and determined that no further action is required at this time.</p><p>If you believe this decision is in error, please contact support@getpitch.com.au.</p><p>Pitch Admin Team</p>`,
        `We reviewed your report #${report.ref_number} and no further action is required at this time.`
      ).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[reports dismiss]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/reports/:id/unresolve', requireAdmin, async (req, res) => {
  try {
    const report = await stmts.getReportById.get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Not found' });
    await stmts.unresolveReport.run({ id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (e) {
    console.error('[reports unresolve]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/reports/:id/request-info', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { delivery, subject, body: msgBody, to_user_id } = req.body;
  // Fall back to DB lookup in case session predates the userId:1000 fix
  const adminId = req.session.userId || (await stmts.getUserByEmail.get('admin@pitch.com.au').catch(() => null))?.id || 1000;
  try {
    const report = await stmts.getReportById.get(id);
    if (!report) return res.status(404).json({ error: 'Not found' });
    await stmts.requestInfoReport.run(id);

    let threadKey = null;
    let recipientName = report.against_name;
    let recipientEmail = null;

    // Resolve target user: prefer explicit to_user_id, then stored against_user_id,
    // then look up by trading_name or org_name from the against_name field
    let targetUserId = to_user_id || report.against_user_id || null;
    if (!targetUserId && report.against_name) {
      const cleanName = report.against_name.replace(/\s*\(org\)\s*$/i, '').replace(/\s+listing\s*$/i, '').trim();
      const byVendor = await stmts.findUserByTradingName.get(cleanName).catch(() => null);
      if (byVendor) targetUserId = byVendor.user_id;
      if (!targetUserId) {
        const byOrg = await stmts.findUserByOrgName.get(cleanName).catch(() => null);
        if (byOrg) targetUserId = byOrg.user_id;
      }
    }

    if (targetUserId) {
      const targetUser = await stmts.getUserById.get(targetUserId).catch(() => null);
      if (targetUser) {
        recipientName = targetUser.first_name + ' ' + targetUser.last_name;
        recipientEmail = targetUser.email;
        // Admin sits on the "organiser" side of the thread
        threadKey = `report_${report.ref_number}_user_${targetUserId}`;
        await stmts.createOrGetThread.run(threadKey, targetUserId, adminId);
        await stmts.sendMessage.run(threadKey, adminId, msgBody || '');
      }
    }

    // Email delivery: send an email in addition to (or instead of) platform message
    if (delivery === 'email') {
      const emailTarget = recipientEmail || report.reporter_email;
      if (emailTarget) {
        await sendAdminEmail(
          emailTarget,
          subject || `Re: Report #${report.ref_number}`,
          `<p>${(msgBody || '').replace(/\n/g, '<br>')}</p>`,
          msgBody || ''
        ).catch(() => {});
      }
    }

    // Notify reporter that info has been requested
    if (report.reporter_email) {
      await sendAdminEmail(
        report.reporter_email,
        `Update on your report #${report.ref_number}`,
        `<p>Hi ${report.reporter_name},</p><p>We've reached out to the other party regarding your report #${report.ref_number} and have requested additional information. We'll follow up once we've received a response.</p><p>Pitch Admin Team</p>`,
        `We've reached out to the other party regarding your report #${report.ref_number} and requested additional information.`
      ).catch(() => {});
    }

    res.json({ ok: true, thread_key: threadKey, recipient_name: recipientName });
  } catch (e) {
    console.error('[reports request-info]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/reports/:id/hide-content', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.session.userId;
  const adminUser = await stmts.getUserById.get(adminId);
  const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'Admin';
  try {
    const report = await stmts.getReportById.get(id);
    if (!report) return res.status(404).json({ error: 'Not found' });
    await stmts.hideContentReport.run({ id, resolved_by: adminName });
    // Notify reporter that the content has been hidden
    if (report.reporter_email) {
      await sendAdminEmail(
        report.reporter_email,
        `Update on your report #${report.ref_number}`,
        `<p>Hi ${report.reporter_name},</p><p>Thank you for flagging report #${report.ref_number}. The content in question has been hidden pending further review.</p><p>Pitch Admin Team</p>`,
        `The content flagged in report #${report.ref_number} has been hidden pending further review.`
      ).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[reports hide-content]', e);
    res.status(500).json({ error: e.message });
  }
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

// PUT /api/vendor/profile — vendor updates their own profile
app.put('/api/vendor/profile', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { trading_name, bio, mobile, suburb, state, instagram, stall_w, stall_d, power, water, setup_type, price_range, cuisine_tags } = req.body;
  try {
    await stmts.updateVendorProfileSelf.run({
      trading_name: trading_name || null,
      bio:          bio          || null,
      mobile:       mobile       || null,
      suburb:       suburb       || null,
      state:        state        || null,
      instagram:    instagram    || null,
      stall_w:      stall_w      || null,
      stall_d:      stall_d      || null,
      power:        power  ? 1 : 0,
      water:        water  ? 1 : 0,
      setup_type:   setup_type   || null,
      price_range:  price_range  || null,
      cuisine_tags: typeof cuisine_tags === 'string' ? cuisine_tags : JSON.stringify(cuisine_tags || []),
      user_id:      req.session.userId,
    });
    _apiCache.delete('vendors');
    res.json({ ok: true });
  } catch (e) {
    console.error('[vendor/profile PUT]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/vendor/events', requireAuth, async (req, res) => {
  const events = await stmts.publishedEventsForVendor.all(req.session.userId);
  res.json({ events });
});

// ── Notifications ─────────────────────────────────────────────────────────
function relTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') || dateStr.includes('Z') ? dateStr : dateStr + 'Z');
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  if (days <  7) return `${days}d ago`;
  return d.toLocaleDateString('en-AU', { day:'numeric', month:'short' });
}

app.get('/api/notifications', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const role   = req.session.role;
  const notifs = [];

  try {
    if (role === 'vendor') {
      const [apps, unreadRow, events] = await Promise.all([
        stmts.getApplicationsByVendor.all(userId),
        stmts.getUnreadMsgCount.get(userId, userId, userId),
        stmts.publishedEventsForVendor.all(userId),
      ]);

      const unread = unreadRow ? Number(unreadRow.count) : 0;
      if (unread > 0) {
        notifs.push({ id:'messages', icon:'💬', iconCls:'slate',
          title:`${unread} unread message${unread > 1 ? 's' : ''}`,
          desc:'You have unread messages from organisers.', time:'now', unread:true });
      }

      for (const app of apps) {
        if (app.status === 'approved') {
          notifs.push({ id:`app-${app.id}`, icon:'✅', iconCls:'herb',
            title:'Application approved!',
            desc:`You've been approved for ${app.event_name}.`,
            time: relTime(app.approved_at || app.created_at), unread:true });
        } else if (app.status === 'rejected') {
          notifs.push({ id:`app-${app.id}`, icon:'❌', iconCls:'terra',
            title:'Application not accepted',
            desc:`Your application to ${app.event_name} was unsuccessful.`,
            time: relTime(app.created_at), unread:false });
        } else if (app.status === 'pending') {
          notifs.push({ id:`app-${app.id}`, icon:'📋', iconCls:'ember',
            title:'Application under review',
            desc:`Your application to ${app.event_name} is being reviewed by the organiser.`,
            time: relTime(app.created_at), unread:false });
        }
      }

      // New events not yet applied to (up to 3)
      const unapplied = events.filter(e => !e.appStatus).slice(0, 3);
      for (const ev of unapplied) {
        notifs.push({ id:`ev-${ev.id}`, icon:'🎪', iconCls:'gold',
          title:'New event opportunity',
          desc:`${ev.name} in ${ev.suburb || 'Adelaide'} is now accepting applications.`,
          time: ev.date_sort || '', unread:false });
      }

    } else if (role === 'organiser') {
      const [apps, unreadRow] = await Promise.all([
        stmts.getAllAppsByOrganiser.all(userId),
        stmts.getUnreadMsgCount.get(userId, userId, userId),
      ]);

      const unread = unreadRow ? Number(unreadRow.count) : 0;
      if (unread > 0) {
        notifs.push({ id:'messages', icon:'💬', iconCls:'slate',
          title:`${unread} unread message${unread > 1 ? 's' : ''}`,
          desc:'You have unread messages from vendors.', time:'now', unread:true });
      }

      for (const app of apps.slice(0, 15)) {
        if (app.status === 'pending') {
          notifs.push({ id:`app-${app.id}`, icon:'📋', iconCls:'ember',
            title:'New vendor application',
            desc:`${app.trading_name} applied for ${app.event_name}.`,
            time: relTime(app.created_at), unread:true });
        } else if (app.status === 'approved') {
          notifs.push({ id:`app-${app.id}`, icon:'✅', iconCls:'herb',
            title:'Vendor spot confirmed',
            desc:`${app.trading_name} has been approved for ${app.event_name}.`,
            time: relTime(app.created_at), unread:false });
        } else if (app.status === 'rejected') {
          notifs.push({ id:`app-${app.id}`, icon:'✖', iconCls:'terra',
            title:'Application declined',
            desc:`You declined ${app.trading_name}'s application for ${app.event_name}.`,
            time: relTime(app.created_at), unread:false });
        }
      }
    }

    // Prepend admin announcements targeted at this role
    try {
      const audience = role === 'vendor' ? 'vendors' : role === 'organiser' ? 'organisers' : 'all';
      let planAudience = '';   // e.g. 'pro', 'growth', 'free_vendors'
      let groupAudience = '';  // 'paid' for pro/growth, '' otherwise
      if (role === 'vendor') {
        const vr = await stmts.getVendorByUserId.get(req.session.userId).catch(() => null);
        const plan = vr?.plan || 'free';
        planAudience = plan === 'free' ? 'free_vendors' : plan; // 'pro' or 'growth'
        groupAudience = (plan === 'pro' || plan === 'growth') ? 'paid' : '';
      }
      const announcements = await stmts.getRecentAnnouncements.all(audience, planAudience, groupAudience);
      for (const a of announcements) {
        notifs.unshift({ id:`ann-${a.id}`, icon:'📢', iconCls:'gold',
          title: a.subject, desc: a.body,
          time: relTime(a.created_at), unread: true, isAnnouncement: true });
      }
    } catch (_) {}

    notifs.sort((a, b) => (b.unread ? 1 : 0) - (a.unread ? 1 : 0));
    res.json({ notifications: notifs, unreadCount: notifs.filter(n => n.unread).length });
  } catch (e) {
    console.error('[notifications]', e);
    res.json({ notifications: [], unreadCount: 0 });
  }
});

app.get('/api/admin/notifications', requireAdmin, async (req, res) => {
  try {
    const [pending, recentVendors, recentOrgs] = await Promise.all([
      stmts.countPending.get(),
      stmts.recentPendingVendors.all(),
      stmts.recentPendingOrgs.all(),
    ]);
    const notifs = [];
    if (pending && (pending.c ?? pending.n) > 0) {
      const pc = pending.c ?? pending.n;
      notifs.push({ id:'pending', icon:'⏳', iconCls:'gold', title:`${pc} account${pc>1?'s':''} awaiting approval`, desc:'Pending vendors and organisers need review.', time:'now', unread:true });
    }
    for (const v of recentVendors) {
      notifs.push({ id:`v-${v.id}`, icon:'🍽', iconCls:'ember', title:`New vendor: ${v.trading_name}`, desc:'Vendor account pending approval.', time: v.created_at ? new Date(v.created_at).toLocaleDateString('en-AU') : '', unread:true });
    }
    for (const o of recentOrgs) {
      notifs.push({ id:`o-${o.id}`, icon:'🎪', iconCls:'slate', title:`New organiser: ${o.org_name}`, desc:'Organiser account pending approval.', time: o.created_at ? new Date(o.created_at).toLocaleDateString('en-AU') : '', unread:false });
    }
    res.json({ notifications: notifs, unreadCount: notifs.filter(n=>n.unread).length });
  } catch(e) { console.error('[admin/notifications]', e); res.json({ notifications:[], unreadCount:0 }); }
});

// ── POST /api/admin/announce — save and broadcast an announcement ─────────────
app.post('/api/admin/announce', requireAdmin, async (req, res) => {
  const { subject, body, audience, delivery } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Subject and body required' });
  const adminId = req.session.userId || 1000;
  try {
    const r = await stmts.createAnnouncement.run({ subject, body, audience: audience || 'all', delivery: delivery || 'inapp', created_by: adminId });
    const id = typeof r.lastInsertRowid !== 'undefined' ? Number(r.lastInsertRowid) : null;
    res.json({ ok: true, id });
  } catch (e) {
    console.error('[admin/announce]', e);
    res.status(500).json({ error: 'Failed to save announcement' });
  }
});

// ── GET /api/admin/announcements — list all announcements ────────────────────
app.get('/api/admin/announcements', requireAdmin, async (req, res) => {
  try {
    const rows = await stmts.getAnnouncements.all();
    res.json({ announcements: rows });
  } catch (e) { res.json({ announcements: [] }); }
});

// ── GET /api/announcements — announcements for logged-in user's role ─────────
app.get('/api/announcements', requireAuth, async (req, res) => {
  try {
    const { role } = req.session;
    const audience = role === 'vendor' ? 'vendors' : role === 'organiser' ? 'organisers' : 'all';
    let planAudience = '';
    let groupAudience = '';
    if (role === 'vendor') {
      const vr = await stmts.getVendorByUserId.get(req.session.userId).catch(() => null);
      const plan = vr?.plan || 'free';
      planAudience = plan === 'free' ? 'free_vendors' : plan;
      groupAudience = (plan === 'pro' || plan === 'growth') ? 'paid' : '';
    }
    const rows = await stmts.getRecentAnnouncements.all(audience, planAudience, groupAudience);
    res.json({ announcements: rows });
  } catch (e) { res.json({ announcements: [] }); }
});

app.post('/api/events/:id/apply', requireAuth, async (req, res) => {
  const { message } = req.body;
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Only vendors can apply' });

  const ev = await stmts.getEventById.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });

  // ── Subscription quota check ──────────────────────────────────────────────
  const vendorSub = await stmts.getVendorSubscription.get(req.session.userId);
  if (vendorSub) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Check if on trial (trial_ends_at in the future = has full tier access)
    const onTrial = vendorSub.trial_ends_at && new Date(vendorSub.trial_ends_at) > now;
    const effectivePlan = onTrial ? 'pro' : (vendorSub.plan || 'free');

    // Free plan: enforce 10 applications per month
    if (effectivePlan === 'free') {
      const APP_LIMIT = 10;
      // Reset counter if it's a new month
      if (vendorSub.apps_reset_month !== currentMonth) {
        await stmts.resetAppsCounter.run(currentMonth, req.session.userId);
        vendorSub.apps_this_month = 0;
      }
      if (Number(vendorSub.apps_this_month) >= APP_LIMIT) {
        return res.status(429).json({
          error: 'Application limit reached',
          message: `You've used all ${APP_LIMIT} applications for this month on the Starter plan. Upgrade to Pro or Growth to apply to unlimited events.`,
          limit: APP_LIMIT,
          used: Number(vendorSub.apps_this_month),
          upgrade_url: '/pricing'
        });
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    await stmts.createApplication.run(ev.id, req.session.userId, message || null);

    // Increment monthly counter for free-plan vendors
    if (vendorSub && (vendorSub.plan === 'free' || !vendorSub.plan)) {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (vendorSub.apps_reset_month !== currentMonth) {
        await stmts.resetAndIncrementApps.run(currentMonth, req.session.userId);
      } else {
        await stmts.incrementAppsThisMonth.run(currentMonth, req.session.userId);
      }
    }

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

app.get('/api/vendor/subscription-info', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  try {
    const sub = await stmts.getVendorSubscription.get(req.session.userId);
    if (!sub) return res.status(404).json({ error: 'Vendor not found' });

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const onTrial = sub.trial_ends_at && new Date(sub.trial_ends_at) > now;
    const effectivePlan = onTrial ? sub.plan : (sub.plan || 'free');
    const APP_LIMIT = 10;

    // Return 0 used if counter is from a different month
    const appsUsed = sub.apps_reset_month === currentMonth ? Number(sub.apps_this_month) : 0;

    res.json({
      plan: sub.plan || 'free',
      effective_plan: effectivePlan,
      on_trial: !!onTrial,
      trial_ends_at: sub.trial_ends_at || null,
      subscription_status: sub.subscription_status || 'active',
      apps_used: appsUsed,
      apps_limit: effectivePlan === 'free' ? APP_LIMIT : null,
      apps_remaining: effectivePlan === 'free' ? Math.max(0, APP_LIMIT - appsUsed) : null,
    });
  } catch (e) {
    console.error('[subscription-info]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── API: Messaging ─────────────────────────────────────────────────────────
// GET /api/messages — list all threads for current user with unread counts
app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const threads = await stmts.getThreadsForUser.all(userId, userId, userId);
    const enriched = await Promise.all(threads.map(async t => {
      const row = await stmts.getUnreadByThread.get(t.thread_key, userId);
      return { ...t, unread_count: row ? Number(row.count) : 0 };
    }));
    res.json({ threads: enriched });
  } catch (e) { console.error('[messages list]', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/messages/by-event — create/get thread using event_id (server resolves organiser)
// More reliable than passing organiser_user_id from the client
app.post('/api/messages/by-event', requireAuth, async (req, res) => {
  try {
    if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
    const vendor_user_id = req.session.userId;
    const event_id = Number(req.body.event_id);
    if (!event_id) return res.status(400).json({ error: 'Missing event_id' });

    // Look up the event to get organiser_user_id directly from DB
    const ev = await stmts.getEventById.get(event_id).catch(() => null);
    if (!ev) return res.status(404).json({ error: 'Event not found' });

    let organiser_user_id = Number(ev.organiser_user_id);

    // Fallback: look up organiser by org_name if organiser_user_id is missing
    if (!organiser_user_id && ev.organiser_name) {
      const org = await stmts.getOrganiserByName.get(ev.organiser_name).catch(() => null);
      if (org) organiser_user_id = Number(org.user_id);
    }

    if (!organiser_user_id) return res.status(400).json({ error: 'This event has no linked organiser account yet.' });

    const threadKey = `v${vendor_user_id}_o${organiser_user_id}`;
    await stmts.createOrGetThread.run(threadKey, vendor_user_id, organiser_user_id);
    const thread = await stmts.getThread.get(threadKey).catch(() => null);
    res.json({ thread_key: threadKey, thread, organiser_user_id });
  } catch (e) { console.error('[messages by-event]', e); res.status(500).json({ error: 'Server error: ' + e.message }); }
});

// GET /api/debug/organiser/:id — check if an organiser account exists (vendor auth required)
app.get('/api/debug/organiser/:id', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = await stmts.getUserById.get(userId).catch(() => null);
    const org  = await stmts.getOrganiserByUserId.get(userId).catch(() => null);
    res.json({
      exists: !!user,
      role: user ? user.role : null,
      has_organiser_profile: !!org,
      org_name: org ? org.org_name : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/messages — create or get a thread
app.post('/api/messages', requireAuth, async (req, res) => {
  try {
    const vendor_user_id = Number(req.body.vendor_user_id);
    const organiser_user_id = Number(req.body.organiser_user_id);
    if (!vendor_user_id || !organiser_user_id) return res.status(400).json({ error: 'Missing participant IDs' });
    const threadKey = `v${vendor_user_id}_o${organiser_user_id}`;
    await stmts.createOrGetThread.run(threadKey, vendor_user_id, organiser_user_id);
    let thread = null;
    try { thread = await stmts.getThread.get(threadKey); } catch(e) { console.error('[getThread]', e); }
    res.json({ thread_key: threadKey, thread });
  } catch (e) { console.error('[messages create]', e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/messages/:threadKey — load messages + mark as read
app.get('/api/messages/:threadKey', requireAuth, async (req, res) => {
  try {
    const { threadKey } = req.params;
    const userId = req.session.userId;
    await stmts.markThreadRead.run(threadKey, userId);
    const messages = await stmts.getMessagesInThread.all(threadKey);
    let thread = null;
    try { thread = await stmts.getThread.get(threadKey); } catch(e) { console.error('[getThread]', e); }
    res.json({ messages, thread });
  } catch (e) { console.error('[messages get]', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/messages/:threadKey — send a message
app.post('/api/messages/:threadKey', requireAuth, async (req, res) => {
  try {
    const { threadKey } = req.params;
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message body required' });
    const result = await stmts.sendMessage.run(threadKey, req.session.userId, body.trim());
    const msg = { id: result.lastInsertRowid, thread_key: threadKey, sender_user_id: req.session.userId, body: body.trim(), is_read: 0, created_at: new Date().toISOString() };
    res.json({ message: msg });
  } catch (e) { console.error('[messages send]', e); res.status(500).json({ error: 'Server error' }); }
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

// ── API: Vendor reviews ────────────────────────────────────────────────────
app.get('/api/vendor/reviews', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const [reviews, avg] = await Promise.all([
    stmts.getReviewsByVendor.all(req.session.userId),
    stmts.getReviewAvg.get(req.session.userId),
  ]);
  res.json({ reviews, avgRating: avg ? Number((avg.avg || 0).toFixed(1)) : 0, totalReviews: avg ? avg.total : 0 });
});

app.post('/api/vendor/reviews/:id/flag', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  await stmts.flagReview.run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// ── API: Vendor stall fees ─────────────────────────────────────────────────
app.get('/api/vendor/stall-fees', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const fees = await stmts.getStallFeesByVendor.all(req.session.userId);
  res.json({ fees });
});

app.post('/api/vendor/stall-fees/:id/pay', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const fee = await stmts.getStallFeeById.get(req.params.id);
  if (!fee || fee.vendor_user_id !== req.session.userId) return res.status(404).json({ error: 'Not found' });
  if (fee.status !== 'unpaid') return res.status(400).json({ error: 'Fee is not unpaid' });
  await stmts.payStallFee.run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// ── API: Vendor calendar ───────────────────────────────────────────────────
app.get('/api/vendor/calendar', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const apps = await stmts.getVendorCalendar.all(req.session.userId);
  res.json({ applications: apps });
});

// ── API: Vendor market history ─────────────────────────────────────────────
app.get('/api/vendor/history', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const [history, reviews] = await Promise.all([
    stmts.getVendorHistory.all(req.session.userId),
    stmts.getReviewsByVendor.all(req.session.userId),
  ]);
  // Attach reviews to each history entry by event_id
  const reviewMap = {};
  for (const r of reviews) {
    if (r.event_id) {
      if (!reviewMap[r.event_id]) reviewMap[r.event_id] = [];
      reviewMap[r.event_id].push(r);
    }
  }
  const enriched = history.map(h => ({ ...h, reviews: reviewMap[h.event_id] || [] }));
  res.json({ history: enriched });
});

// ── API: Vendor account settings ──────────────────────────────────────────
app.put('/api/vendor/settings/account', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { email, current_password, new_password } = req.body;
  const user = await stmts.getUserById.get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  try {
    if (email && email !== user.email) {
      await stmts.updateUserProfile.run({ first_name: user.first_name, last_name: user.last_name, email, status: user.status, id: user.id });
    }
    if (new_password) {
      if (!current_password) return res.status(400).json({ error: 'Current password required' });
      const ok = await bcrypt.compare(current_password, user.password_hash);
      if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
      const hash = await bcrypt.hash(new_password, 10);
      await stmts.updateUserPassword.run(hash, user.id);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[vendor settings]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/vendor/settings/notifications', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { notif_apps, notif_docs, notif_reviews, notif_payments } = req.body;
  await stmts.updateVendorSettings.run({
    notif_apps: notif_apps ? 1 : 0,
    notif_docs: notif_docs ? 1 : 0,
    notif_reviews: notif_reviews ? 1 : 0,
    notif_payments: notif_payments ? 1 : 0,
    user_id: req.session.userId,
  });
  res.json({ ok: true });
});

app.post('/api/vendor/settings/pause', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { paused } = req.body;
  await stmts.pauseVendor.run(paused ? 1 : 0, req.session.userId);
  res.json({ ok: true, paused: !!paused });
});

app.delete('/api/vendor/account', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const userId = req.session.userId;
  await stmts.deleteVendorByUserId.run(userId);
  await stmts.deleteVerificationCodesByUserId.run(userId);
  await stmts.deletePaymentsByUserId.run(userId);
  await stmts.deleteUser.run(userId);
  sessWrite(res, {});
  res.json({ ok: true });
});

// ── Public stats ───────────────────────────────────────────────────────────
app.get('/api/stats', apiCached('stats', 120000, async () => {
  const [vRow, eRow, aRow, rRow] = await Promise.all([
    stmts.countVendors.get(),
    stmts.countEvents.get(),
    stmts.countAllApplications.get(),
    stmts.getGlobalReviewAvg.get(),
  ]);
  return {
    vendors:      Number(vRow?.n) || 0,
    events:       Number(eRow?.n) || 0,
    applications: Number(aRow?.n) || 0,
    rating:       rRow?.avg ? Number(rRow.avg) : null,
  };
}));

// ── API: Organiser dashboard ───────────────────────────────────────────────

app.put('/api/organiser/profile', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { org_name, bio, website } = req.body;
  try {
    await stmts.updateOrganiserProfileSelf.run({ org_name: org_name || null, bio: bio || null, website: website || null, user_id: req.session.userId });
    res.json({ ok: true });
  } catch (e) {
    console.error('[organiser/profile PUT]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

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

  const { name, category, date_sort, date_end, date_text, suburb, state, venue_name, description, stalls_available, stall_fee_min, stall_fee_max, deadline, cover_image } = req.body;
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
      stall_fee_min: stall_fee_min ? parseInt(stall_fee_min) : null,
      stall_fee_max: stall_fee_max ? parseInt(stall_fee_max) : null,
      deadline: deadline || null,
      organiser_name: organiserName,
      organiser_user_id: req.session.userId,
      venue_name: venue_name || null,
      cover_image: cover_image || null,
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
  // Attach approved count to each event so the table can show filled spots
  const eventsWithCounts = await Promise.all(events.map(async ev => {
    const row = await stmts.countApprovedByEvent.get(ev.id);
    return { ...ev, approved_count: row ? Number(row.n) : 0 };
  }));
  res.json({ events: eventsWithCounts });
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
  const { name, category, suburb, state, venue_name, date_sort, date_end, description, stalls_available, stall_fee_min, stall_fee_max, deadline, cover_image } = req.body;
  const dateText = date_sort ? new Date(date_sort).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' }) : null;
  await stmts.updateEvent.run({ id: Number(req.params.id), name: name || ev.name, category: category || ev.category, suburb: suburb || ev.suburb, state: state || ev.state, venue_name: venue_name ?? ev.venue_name, date_sort: date_sort || ev.date_sort, date_end: date_end ?? ev.date_end, date_text: dateText || ev.date_text, description: description ?? ev.description, stalls_available: stalls_available != null ? Number(stalls_available) : ev.stalls_available, stall_fee_min: stall_fee_min != null ? Number(stall_fee_min) : ev.stall_fee_min, stall_fee_max: stall_fee_max != null ? Number(stall_fee_max) : ev.stall_fee_max, deadline: deadline !== undefined ? deadline : ev.deadline, cover_image: cover_image !== undefined ? cover_image : ev.cover_image });
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

// POST /api/organiser/events/:id/cancel
app.post('/api/organiser/events/:id/cancel', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const ev = await stmts.getEventById.get(req.params.id);
  if (!ev || Number(ev.organiser_user_id) !== Number(req.session.userId)) return res.status(403).json({ error: 'Not your event' });
  const { reason } = req.body;
  await stmts.cancelEvent.run(reason || 'Event cancelled by organiser.', Number(req.params.id));
  res.json({ ok: true });
});

// GET /api/organiser/applications — all apps across organiser's events
app.get('/api/organiser/applications', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const apps = await stmts.getAllAppsByOrganiser.all(req.session.userId);
  res.json({ applications: apps });
});

// GET /api/organiser/calendar
app.get('/api/organiser/calendar', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const events = await stmts.getOrgCalendar.all(req.session.userId);
  res.json({ events });
});

// GET /api/organiser/analytics
app.get('/api/organiser/analytics', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const stats = await stmts.getOrgEventStats.all(req.session.userId);
  res.json({ stats });
});

// GET /api/organiser/vendor-ratings — ratings I've given to vendors
app.get('/api/organiser/vendor-ratings', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const ratings = await stmts.getOrgVendorRatings.all(req.session.userId);
  res.json({ ratings });
});

// POST /api/organiser/vendor-ratings — rate a vendor
app.post('/api/organiser/vendor-ratings', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { vendor_user_id, event_id, punctual, presentation, would_rebook, notes } = req.body;
  if (!vendor_user_id) return res.status(400).json({ error: 'vendor_user_id required' });
  await stmts.upsertVendorRating.run({
    organiser_user_id: req.session.userId,
    vendor_user_id: Number(vendor_user_id),
    event_id: event_id ? Number(event_id) : null,
    punctual: Number(punctual) || 3,
    presentation: Number(presentation) || 3,
    would_rebook: would_rebook ? 1 : 0,
    notes: notes || null,
  });
  res.json({ ok: true });
});

// POST /api/organiser/reviews/:id/flag
app.post('/api/organiser/reviews/:id/flag', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  await stmts.flagOrgReview.run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// GET /api/organiser/reviews — reviews received from vendors
app.get('/api/organiser/reviews', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const [reviews, avg] = await Promise.all([
    stmts.getOrgReviews.all(req.session.userId),
    stmts.getOrgReviewAvg.get(req.session.userId),
  ]);
  res.json({ reviews, avgRating: avg ? Number((avg.avg || 0).toFixed(1)) : 0, totalReviews: avg ? avg.total : 0 });
});

// PUT /api/organiser/settings/account
app.put('/api/organiser/settings/account', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { email, current_password, new_password } = req.body;
  const user = await stmts.getUserById.get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  try {
    if (email && email !== user.email) {
      await stmts.updateUserProfile.run({ first_name: user.first_name, last_name: user.last_name, email, status: user.status, id: user.id });
    }
    if (new_password) {
      if (!current_password) return res.status(400).json({ error: 'Current password required' });
      const ok = await bcrypt.compare(current_password, user.password_hash);
      if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
      const hash = await bcrypt.hash(new_password, 10);
      await stmts.updateUserPassword.run(hash, user.id);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/organiser/settings/notifications
app.put('/api/organiser/settings/notifications', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { notif_new_apps, notif_deadlines, notif_messages, notif_payments } = req.body;
  await stmts.updateOrganiserSettings.run({
    notif_new_apps:  notif_new_apps  ? 1 : 0,
    notif_deadlines: notif_deadlines ? 1 : 0,
    notif_messages:  notif_messages  ? 1 : 0,
    notif_payments:  notif_payments  ? 1 : 0,
    user_id: req.session.userId,
  });
  res.json({ ok: true });
});

// POST /api/organiser/settings/pause
app.post('/api/organiser/settings/pause', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { paused } = req.body;
  await stmts.pauseOrganiser.run(paused ? 1 : 0, req.session.userId);
  res.json({ ok: true, paused: !!paused });
});

// Vendor leaves a review of an organiser
app.post('/api/vendor/organiser-review', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { organiser_user_id, event_id, event_name, rating, body } = req.body;
  if (!organiser_user_id || !rating) return res.status(400).json({ error: 'organiser_user_id and rating required' });
  await stmts.createOrgReview.run({
    organiser_user_id: Number(organiser_user_id),
    vendor_user_id: req.session.userId,
    event_id: event_id ? Number(event_id) : null,
    event_name: event_name || null,
    rating: Math.min(5, Math.max(1, Number(rating))),
    body: body || null,
  });
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

// ── Admin — applications ───────────────────────────────────────────────────
app.get('/api/admin/applications', requireAdmin, async (req, res) => {
  const { status } = req.query;
  const apps = (status && status !== 'all')
    ? await stmts.applicationsByStatus.all(status)
    : await stmts.allApplications.all();
  res.json({ applications: apps });
});

app.patch('/api/admin/applications/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending','approved','declined','withdrawn'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await stmts.updateApplicationStatus.run(status, req.params.id);
  res.json({ ok: true });
});

// ── Admin — all users ──────────────────────────────────────────────────────
// ── Admin: send message to any user ──────────────────────────────────────────
app.post('/api/admin/messages/send', requireAdmin, async (req, res) => {
  const { to_user_id, subject, body, delivery } = req.body;
  if (!to_user_id || !body) return res.status(400).json({ error: 'Missing recipient or body' });
  try {
    const user = await stmts.getUserById.get(to_user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (delivery === 'email') {
      await sendAdminEmail(
        user.email,
        subject || 'Message from Pitch. Admin',
        `<p>${body.replace(/\n/g, '<br>')}</p>`,
        body
      );
    } else {
      // Platform message: admin sits on the organiser side of the thread
      const adminId = req.session.userId;
      const threadKey = `admin_${adminId}_user_${to_user_id}`;
      await stmts.createOrGetThread.run(threadKey, to_user_id, adminId);
      await stmts.sendMessage.run(threadKey, adminId, body);
      return res.json({ ok: true, thread_key: threadKey, recipient_name: user.first_name + ' ' + user.last_name });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[admin messages send]', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/users-all', requireAdmin, async (req, res) => {
  const { role } = req.query;
  const users = (role && role !== 'all')
    ? await stmts.usersByRole.all(role)
    : await stmts.allUsers.all();
  res.json({ users });
});

app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body;
  const allowed = ['vendor','organiser','admin'];
  if (!allowed.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  await stmts.updateUserRole.run(role, req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/password-reset', requireAdmin, async (req, res) => {
  const user = await stmts.getUserById.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const tempPw = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 5).toUpperCase();
  const hash = bcrypt.hashSync(tempPw, 10);
  await stmts.updateUserPassword.run(hash, req.params.id);
  res.json({ ok: true, temp_password: tempPw });
});

// ── Admin — activity feed ─────────────────────────────────────────────────
app.get('/api/admin/activity', requireAdmin, async (req, res) => {
  const rows = await stmts.recentActivity.all();
  res.json({ activity: rows });
});

// ── Admin — analytics ─────────────────────────────────────────────────────
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  const [vendors, organisers, events, appCounts, catCounts, signupsByDay] = await Promise.all([
    stmts.countVendors.get(),
    stmts.countOrganisers.get(),
    stmts.countEvents.get(),
    stmts.countApplications.all(),
    stmts.countEventsByCategory.all(),
    stmts.signups7dByDay.all(),
  ]);
  res.json({
    totalVendors: vendors.n,
    totalOrganisers: organisers.n,
    totalEvents: events.n,
    applicationsByStatus: appCounts,
    eventsByCategory: catCounts,
    signups7dByDay: signupsByDay,
  });
});

// ── Admin — featured ──────────────────────────────────────────────────────
app.get('/api/admin/featured', requireAdmin, async (req, res) => {
  const [events, vendors] = await Promise.all([
    stmts.featuredEvents.all(),
    stmts.featuredVendors.all(),
  ]);
  res.json({ events, vendors });
});

app.patch('/api/admin/events/:id/featured', requireAdmin, async (req, res) => {
  await stmts.setEventFeatured.run(req.body.featured ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.patch('/api/admin/vendors/:id/featured', requireAdmin, async (req, res) => {
  await stmts.setVendorFeatured.run(req.body.featured ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// ── Vendor menu endpoints ───────────────────────────────────────────────────

// GET /api/vendor/menu — list own menu items
app.get('/api/vendor/menu', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendor only' });
  const items = await stmts.getMenuItems.all(req.session.userId);
  res.json(items);
});

// POST /api/vendor/menu — create item
app.post('/api/vendor/menu', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendor only' });
  const { name, description, price_type, price_min, price_max, category, photo_url, available, seasonal, is_signature } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  // if setting signature, clear previous
  if (is_signature) await stmts.clearSignature.run(req.session.userId);
  const result = await stmts.createMenuItem.run({
    vendor_user_id: req.session.userId,
    name: name.trim().slice(0, 60),
    description: description ? description.trim().slice(0, 200) : null,
    price_type: price_type || 'exact',
    price_min: price_min ?? null,
    price_max: price_max ?? null,
    category: category || null,
    photo_url: photo_url || null,
    available: available ? 1 : 0,
    seasonal: seasonal ? 1 : 0,
    is_signature: is_signature ? 1 : 0,
  });
  const item = await stmts.getMenuItemById.get(result.lastInsertRowid ?? result.insertId, req.session.userId);
  res.json(item);
});

// PUT /api/vendor/menu/:id — update item
app.put('/api/vendor/menu/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendor only' });
  const { name, description, price_type, price_min, price_max, category, photo_url, available, seasonal, is_signature } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (is_signature) await stmts.clearSignature.run(req.session.userId);
  await stmts.updateMenuItem.run({
    id: req.params.id,
    vendor_user_id: req.session.userId,
    name: name.trim().slice(0, 60),
    description: description ? description.trim().slice(0, 200) : null,
    price_type: price_type || 'exact',
    price_min: price_min ?? null,
    price_max: price_max ?? null,
    category: category || null,
    photo_url: photo_url || null,
    available: available ? 1 : 0,
    seasonal: seasonal ? 1 : 0,
    is_signature: is_signature ? 1 : 0,
  });
  const item = await stmts.getMenuItemById.get(req.params.id, req.session.userId);
  res.json(item);
});

// DELETE /api/vendor/menu/:id — delete item
app.delete('/api/vendor/menu/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendor only' });
  await stmts.deleteMenuItem.run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// PUT /api/vendor/menu/reorder — save drag order
app.put('/api/vendor/menu/reorder', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendor only' });
  const { order } = req.body; // array of ids in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array' });
  for (let i = 0; i < order.length; i++) {
    await stmts.updateMenuOrder.run({ id: order[i], vendor_user_id: req.session.userId, sort_order: i });
  }
  res.json({ ok: true });
});

// GET /api/vendors/:id/menu — public menu for a vendor (by user_id)
app.get('/api/vendors/:id/menu', async (req, res) => {
  const items = await stmts.publicMenuItems.all(req.params.id);
  res.json(items);
});

// ── Static page routes ─────────────────────────────────────────────────────
function page(file) {
  return (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(readHtml(file));
  };
}

app.get('/',                    page('index.html'));
app.get('/how-it-works',        page('how-it-works.html'));
let _eventsPageCache = null;
let _eventsPageCacheTs = 0;
const EVENTS_PAGE_TTL = 60000;
app.get('/events', async (req, res) => {
  try {
    const now = Date.now();
    if (_eventsPageCache && now - _eventsPageCacheTs < EVENTS_PAGE_TTL) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.send(_eventsPageCache);
    }
    const events = await stmts.publishedEvents.all();
    const today = new Date().toISOString().slice(0, 10);
    const mapData = events
      .filter(e => e.lat && e.lng && (e.date_sort || '') >= today)
      .map(e => ({
        slug: e.slug,
        name: e.name,
        lat: e.lat,
        lng: e.lng,
        date: e.date_sort || '',
        category: e.category || '',
        stalls_available: e.stalls_available || 0,
        stall_fee_min: e.stall_fee_min || 0,
        stall_fee_max: e.stall_fee_max || 0,
        suburb: e.suburb || '',
        state: e.state || 'SA',
        venue_name: e.venue_name || '',
      }));
    const token = process.env.MAPBOX_TOKEN || '';
    let html = readHtml('events.html');
    html = html.replace('</head>', `<script>
window.__PITCH_MAP_EVENTS__ = ${JSON.stringify(mapData)};
window.__MAPBOX_TOKEN__ = ${JSON.stringify(token)};
</script></head>`);
    _eventsPageCache = html;
    _eventsPageCacheTs = now;
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(html);
  } catch (e) {
    console.error('[events page]', e);
    res.send(readHtml('events.html'));
  }
});
app.get('/vendors',             page('vendors.html'));
app.get('/pricing',             page('pricing.html'));
app.get('/about',               page('about.html'));
app.get('/contact',             page('contact.html'));
app.get('/terms',               page('terms.html'));
app.get('/privacy',             page('privacy.html'));
app.get('/blog',                page('blog.html'));
app.get('/forgot-password',     page('forgot-password.html'));
app.get('/events/new',          (req, res) => {
  const sess = req.session;
  if (sess && sess.userId && sess.role === 'organiser') {
    return res.redirect('/dashboard/organiser?panel=post-event');
  }
  return res.redirect('/signup/organiser');
});
app.get('/login',               page('login.html'));
app.get('/signup',              page('signup.html'));
app.get('/signup/vendor',       page('signup-vendor.html'));
app.get('/signup/organiser',    page('signup-organiser.html'));
app.get('/signup/foodie',       page('signup-foodie.html'));
app.get('/discover',            page('foodie-feed.html'));
app.get('/verify/email',        page('verify-email.html'));
app.get('/verify/phone',        page('verify-phone.html'));
app.get('/events/*splat', async (req, res) => {
  const slug = req.params.splat;
  try {
    const ev = await stmts.getEventBySlug.get(slug);
    if (ev) {
      const [approvedVendors, approvedCount, orgEventRow, orgExtRow] = await Promise.all([
        stmts.getApprovedVendorsByEvent.all(ev.id).catch(() => []),
        stmts.countApprovedByEvent.get(ev.id).catch(() => ({ n: 0 })),
        ev.organiser_user_id ? stmts.countOrgEvents.get(ev.organiser_user_id).catch(() => ({ n: 0 })) : Promise.resolve({ n: 0 }),
        ev.organiser_user_id ? stmts.getOrgWithAvatar.get(ev.organiser_user_id).catch(() => null) : Promise.resolve(null),
      ]);
      const pageData = {
        ...ev,
        approved_count: Number(approvedCount?.n ?? 0),
        org_event_count: Number(orgEventRow?.n ?? 0),
        organiser_verified: orgExtRow?.abn_verified ? true : false,
        organiser_avatar_url: orgExtRow?.avatar_url || null,
        approved_vendors: approvedVendors.map(v => ({
          user_id: v.user_id,
          trading_name: v.trading_name,
          cuisine_tags: (() => { try { return JSON.parse(v.cuisine_tags || '[]'); } catch { return []; } })(),
          setup_type: v.setup_type || '',
        })),
      };
      let html = readHtml('event-detail.html');
      html = html.replace('</head>', `<script>window.__PITCH_DB_EVENT__=${JSON.stringify(pageData)};</script></head>`);
      return res.send(html);
    }
  } catch (e) { console.error('[event page]', e); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(readHtml('event-detail.html'));
});
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
        let html = readHtml('vendor-detail.html');
        html = html.replace('</head>', `<script>window.__PITCH_VENDOR__=${JSON.stringify(vendor)};</script></head>`);
        return res.send(html);
      }
    } catch (e) { console.error('[vendor page]', e); }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(readHtml('vendor-detail.html'));
});
app.get('/dashboard/vendor',           serveDashboard('vendor-dashboard.html',     'vendor',    vendorInitData));
app.get('/dashboard/vendor/*splat',    serveDashboard('vendor-dashboard.html',     'vendor',    vendorInitData));
app.get('/dashboard/organiser',        serveDashboard('organiser-dashboard.html',  'organiser', orgInitData));
app.get('/dashboard/organiser/*splat', serveDashboard('organiser-dashboard.html',  'organiser', orgInitData));
app.get('/admin/login',         page('admin-login.html'));
app.get('/admin',               requireAdminPage, page('admin-dashboard.html'));
app.get('/admin/*splat',        requireAdminPage, page('admin-dashboard.html'));

// Block direct static access to sensitive dashboard HTML files
app.get('/admin-dashboard.html',      requireAdminPage, (req, res) => res.redirect('/admin'));
app.get('/admin-login.html',          (req, res) => res.redirect('/admin/login'));
app.get('/vendor-dashboard.html',     (req, res) => res.redirect('/dashboard/vendor'));
app.get('/organiser-dashboard.html',  (req, res) => res.redirect('/dashboard/organiser'));

// Static assets — long cache for fonts/JS/images, short for HTML
app.use(express.static(__dirname, {
  index: false,
  setHeaders(res, filePath) {
    if (/\.(woff2?|ttf|otf|eot)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  },
}));

// ── Start ──────────────────────────────────────────────────────────────────
export default app;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Pitch. server running at http://localhost:${PORT}`);
  });
}
