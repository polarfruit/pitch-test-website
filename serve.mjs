import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import { createHmac, createHash, randomBytes } from 'crypto';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { stmts, txSignupVendor, txSignupOrganiser, txSignupFoodie, prepare } from './server/db.mjs';
import { sendVerificationEmail, sendVerificationSMS, sendAdminEmail, sendDowngradeConfirmationEmail, sendUpgradeConfirmationEmail, sendPaymentFailedEmail, sendSubscriptionCancelledEmail, buildSuspensionNoticeHtml, buildPostEventOrgHtml, buildPostEventVendorHtml } from './server/mailer.mjs';
import { sendNewVendorSignupAdminEmail, sendNewOrganiserSignupAdminEmail, sendStallFeePaidEmail, sendNewMessageEmail, sendAccountApprovedEmail, sendAccountSuspendedEmail, sendApplicationSubmittedEmail, sendApplicationApprovedEmail, sendApplicationRejectedEmail, sendNewApplicationOrganiserEmail, sendDocumentUploadedAdminEmail } from './server/email/index.mjs';

// Lazy-loaded heavy modules (deferred to first use — saves ~1s cold start)
let _Stripe = null;
let _analysePli = null;
async function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_Stripe) {
    const mod = await import('stripe');
    _Stripe = new mod.default(process.env.STRIPE_SECRET_KEY);
  }
  return _Stripe;
}
async function analysePli(...args) {
  if (!_analysePli) {
    const mod = await import('./server/pli-analyser.mjs');
    _analysePli = mod.analysePli;
  }
  return _analysePli(...args);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', true);   // Vercel/reverse proxy — req.protocol returns 'https'
const PORT = process.env.PORT || 3000;

// ── TEMPORARY: Bypass auth for AI analysis ──────────────────────────────────
// Set to false to re-enable login requirements on dashboards.
const BYPASS_AUTH = false;

// ── Stripe (lazy-loaded via getStripe()) ──────────────────────────────────
const STRIPE_PRICES = {
  pro:    process.env.STRIPE_PRICE_PRO    || '',
  growth: process.env.STRIPE_PRICE_GROWTH || '',
};
console.log('[stripe] Deferred load | Prices:', JSON.stringify(STRIPE_PRICES));
const STRIPE_PLAN_FOR_PRICE = Object.fromEntries(
  Object.entries(STRIPE_PRICES).map(([plan, priceId]) => [priceId, plan])
);

// ── Stripe webhook needs raw body — must come before express.json ─────────
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = await getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  const sig = req.headers['stripe-signature'];
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret && process.env.NODE_ENV === 'production') {
    console.error(
      '[stripe/webhook] CRITICAL: STRIPE_WEBHOOK_SECRET is not set. ' +
      'Webhook signature verification is disabled. ' +
      'All webhook events are being accepted without verification.'
    )
  }
  let event;
  try {
    if (whSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, whSecret);
    } else {
      // Dev mode — trust the payload (no signature verification)
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;
        const userId = Number(session.metadata?.user_id);
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        if (!userId) { console.error('[stripe-webhook] No user_id in metadata'); break; }
        const vendor = await stmts.getVendorByUserId.get(userId);
        if (!vendor) { console.error('[stripe-webhook] No vendor for user', userId); break; }
        // Fetch subscription to find the plan from the price
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items.data[0]?.price?.id;
        const newPlan = STRIPE_PLAN_FOR_PRICE[priceId] || 'pro';
        const oldPlan = vendor.plan || 'free';
        await stmts.updateVendorStripe.run({ stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, user_id: userId });
        await stmts.updateVendorPlan.run(newPlan, userId);
        await stmts.insertSubscriptionChange.run({
          user_id: userId, old_plan: oldPlan, new_plan: newPlan,
          changed_by: 'system', admin_user_id: null,
          reason: 'Stripe checkout completed', payment_status: 'paid',
          is_override: 0, override_expires: null,
        });
        // Record payment
        await stmts.createPayment.run({
          user_id: userId, plan: newPlan,
          amount: session.amount_total / 100, currency: 'aud',
          status: 'paid', description: `Subscription: ${newPlan}`,
        });
        console.log(`[stripe-webhook] User ${userId} upgraded to ${newPlan}`);

        // Fire-and-forget upgrade confirmation email
        const upgradeUser = await stmts.getUserById.get(userId);
        const upgradeAmount = (session.amount_total || 0) / 100;
        sendUpgradeConfirmationEmail(
          upgradeUser.email,
          upgradeUser.first_name,
          newPlan,
          upgradeAmount
        ).catch(err => console.error('[mailer] upgrade email failed:', err.message));

        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const vendor = await stmts.getVendorByStripeCustomerId.get(sub.customer);
        if (!vendor) break;
        const priceId = sub.items.data[0]?.price?.id;
        const newPlan = STRIPE_PLAN_FOR_PRICE[priceId] || 'pro';
        if (sub.status === 'active' && vendor.plan !== newPlan) {
          const oldPlan = vendor.plan || 'free';
          await stmts.updateVendorPlan.run(newPlan, vendor.user_id);
          await stmts.insertSubscriptionChange.run({
            user_id: vendor.user_id, old_plan: oldPlan, new_plan: newPlan,
            changed_by: 'system', admin_user_id: null,
            reason: 'Subscription updated', payment_status: 'paid',
            is_override: 0, override_expires: null,
          });
          console.log(`[stripe-webhook] Vendor ${vendor.user_id} plan changed to ${newPlan}`);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const vendor = await stmts.getVendorByStripeCustomerId.get(sub.customer);
        if (!vendor) break;
        const oldPlan = vendor.plan || 'free';
        await stmts.clearVendorStripeSubscription.run(vendor.user_id);
        await stmts.insertSubscriptionChange.run({
          user_id: vendor.user_id, old_plan: oldPlan, new_plan: 'free',
          changed_by: 'system', admin_user_id: null,
          reason: 'Subscription cancelled', payment_status: null,
          is_override: 0, override_expires: null,
        });
        console.log(`[stripe-webhook] Vendor ${vendor.user_id} subscription cancelled`);

        // Fire-and-forget cancellation confirmation email
        const cancelledUser = await stmts.getUserById.get(vendor.user_id);
        sendSubscriptionCancelledEmail(
          cancelledUser.email,
          cancelledUser.first_name,
          oldPlan
        ).catch(err => console.error('[mailer] cancellation email failed:', err.message));

        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const vendor = await stmts.getVendorByStripeCustomerId.get(invoice.customer);
        if (!vendor) break;
        console.error(
          '[stripe/webhook] Payment failed for vendor:', vendor.user_id,
          'Invoice:', invoice.id,
          'Amount:', invoice.amount_due
        )

        // Fire-and-forget payment failure notification email
        const failedUser = await stmts.getUserById.get(vendor.user_id);
        const retryDate = invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('en-AU', {
              day: 'numeric', month: 'long', year: 'numeric'
            })
          : 'soon';
        sendPaymentFailedEmail(
          failedUser.email,
          failedUser.first_name,
          (invoice.amount_due || 0) / 100,
          retryDate
        ).catch(err => console.error('[mailer] payment failed email failed:', err.message));

        // Don't downgrade immediately — Stripe retries. Log for monitoring.
        break;
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        if (pi.metadata?.type !== 'stall_fee') break;
        const fee = await stmts.getStallFeeByStripePI.get(pi.id);
        if (fee && fee.status === 'unpaid') {
          await stmts.markStallFeePaid.run(pi.id);
          console.log(`[stripe-webhook] Stall fee ${fee.id} paid via PI ${pi.id}`);

          // Notify vendor of successful payment (fire-and-forget)
          const feeVendorUser = await stmts.getUserById.get(fee.vendor_user_id);
          if (feeVendorUser) {
            sendStallFeePaidEmail(feeVendorUser.email, feeVendorUser.first_name, fee.event_name, fee.amount)
              .catch(err => console.error('[mailer] stall fee paid webhook email failed:', err.message));
          }
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        if (pi.metadata?.type !== 'stall_fee') break;
        console.log(`[stripe-webhook] Stall fee payment failed: PI ${pi.id}`);
        break;
      }
    }
  } catch (err) {
    console.error('[stripe-webhook] Handler error:', err);
  }

  res.json({ received: true });
});

// ── Gzip all responses ──────────────────────────────────────────────────────
app.use(compression());

// ── Google Analytics (GA4) ──────────────────────────────────────────────────
const GA_ID = process.env.GA_MEASUREMENT_ID || '';
const _gaSnippet = GA_ID ? `<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>` : '';

// ── HTML file reader (cached in memory — cleared on restart / deploy) ────
const _htmlCache = new Map();
function readHtml(file) {
  if (!_htmlCache.has(file)) {
    _htmlCache.set(file, fs.readFileSync(path.join(__dirname, file), 'utf8'));
  }
  let html = _htmlCache.get(file);
  // Inject GA4 snippet into public pages (skip dashboards to avoid noise)
  if (_gaSnippet && !file.includes('dashboard')) {
    html = html.replace('</head>', _gaSnippet + '\n</head>');
  }
  return html;
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
          ? { id: 0, role: 'organiser', email: 'demo.organiser@onpitch.com.au', first_name: 'Sam', last_name: 'Nguyen', status: 'active', avatar_url: null }
          : { id: 0, role: 'vendor', email: 'demo.vendor@onpitch.com.au', first_name: 'Alex', last_name: 'Chen', status: 'active', avatar_url: null };
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
      html = injectBanner(html);
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
  const [events, allApps, unreadRow, pendingRatings, stallsLimit, eventsLimit] = await Promise.all([
    stmts.getOrganiserEvents.all(user.id).catch(e => { console.error('[orgInitData] events', e); return []; }),
    stmts.getAllAppsByOrganiser.all(user.id).catch(e => { console.error('[orgInitData] apps', e); return []; }),
    stmts.getUnreadMsgCount.get(user.id, user.id, user.id).catch(e => { console.error('[orgInitData] unread', e); return null; }),
    stmts.getPendingRatingsForOrganiser.all(user.id).catch(() => []),
    stmts.getSetting.get('limit_stalls_per_event').catch(() => null),
    stmts.getSetting.get('limit_events_per_org').catch(() => null),
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
    pendingRatings,
    platformLimits: {
      limit_stalls_per_event: stallsLimit ? parseInt(stallsLimit.value, 10) || 0 : 0,
      limit_events_per_org: eventsLimit ? parseInt(eventsLimit.value, 10) || 0 : 0,
    },
  };
}

async function vendorInitData(user, profile) {
  // Run all queries in parallel — avoids sequential round-trips to Turso
  const [events, applications, unreadRow, viewsRow, reviews, reviewAvg, stallFees, earningsSummary, earningsHistory, pendingReviews, subRow, vendorHistory] = await Promise.all([
    stmts.publishedEventsForVendor.all(user.id).catch(e => { console.error('[vendorInitData] events', e); return []; }),
    stmts.getApplicationsByVendor.all(user.id).catch(e => { console.error('[vendorInitData] applications', e); return []; }),
    stmts.getUnreadMsgCount.get(user.id, user.id, user.id).catch(e => { console.error('[vendorInitData] unread', e); return null; }),
    stmts.getProfileViews30d.get(user.id).catch(() => ({ total: 0 })),
    stmts.getReviewsByVendor.all(user.id).catch(() => []),
    stmts.getReviewAvg.get(user.id).catch(() => null),
    stmts.getStallFeesByVendor.all(user.id).catch(() => []),
    stmts.getVendorEarningsSummary.get(user.id).catch(() => null),
    stmts.getVendorEarningsHistory.all(user.id).catch(() => []),
    stmts.getPendingReviewsForVendor.all(user.id).catch(() => []),
    stmts.getVendorSubscription.get(user.id).catch(() => null),
    stmts.getVendorHistory.all(user.id).catch(() => []),
  ]);

  // Build subscription info inline (same logic as /api/vendor/subscription-info)
  let subscriptionInfo = null;
  if (subRow) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const onTrial = subRow.trial_ends_at && new Date(subRow.trial_ends_at) > now;
    const effectivePlan = onTrial ? subRow.plan : (subRow.plan || 'free');
    const APP_LIMIT = 10;
    const appsUsed = subRow.apps_reset_month === currentMonth ? Number(subRow.apps_this_month) : 0;
    subscriptionInfo = {
      plan: subRow.plan || 'free', effective_plan: effectivePlan,
      on_trial: !!onTrial, trial_ends_at: subRow.trial_ends_at || null,
      subscription_status: subRow.subscription_status || 'active',
      apps_used: appsUsed, apps_limit: effectivePlan === 'free' ? APP_LIMIT : null,
      apps_remaining: effectivePlan === 'free' ? Math.max(0, APP_LIMIT - appsUsed) : null,
    };
  }

  // PLI status from the already-fetched profile
  const pliStatus = profile ? {
    status: profile.pli_status || 'none',
    insured_name: profile.pli_insured_name || null,
    policy_number: profile.pli_policy_number || null,
    coverage_amount: profile.pli_coverage_amount || null,
    expiry_date: profile.pli_expiry_date || null,
    flags: (() => { try { return JSON.parse(profile.pli_flags || '[]'); } catch { return []; } })(),
  } : null;

  // Enrich history with reviews (same logic as /api/vendor/history)
  const histReviewMap = {};
  for (const r of reviews) {
    if (r.event_id) { (histReviewMap[r.event_id] ||= []).push(r); }
  }
  const history = vendorHistory.map(h => ({ ...h, reviews: histReviewMap[h.event_id] || [] }));

  return {
    events, applications, stallFees, earningsSummary, earningsHistory, history,
    unreadMessages: unreadRow ? Number(unreadRow.count) : 0,
    viewCount30d: Number(viewsRow?.total ?? 0),
    reviews, avgRating: reviewAvg ? Number((reviewAvg.avg || 0).toFixed(1)) : 0, totalReviews: reviewAvg ? reviewAvg.total : 0,
    pendingReviews: pendingReviews.map(r => ({ event_id: r.event_id, event_name: r.event_name, completed_at: r.completed_at, organiser_user_id: r.organiser_user_id, organiser_name: r.org_name })),
    subscriptionInfo, pliStatus,
  };
}

// ── Auth helpers ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  // Header token takes priority — carries userId AND role reliably
  const tok = req.headers['x-pitch-auth'];
  if (tok) {
    const auth = verifyPageToken(tok);
    if (auth) { req.session = auth; _touchActive(auth.userId); return next(); }
  }
  // Cookie session (regular user or admin with userId set)
  if (req.session.userId) { _touchActive(req.session.userId); return next(); }
  // Admin session without userId — backfill it
  if (req.session.isAdmin) { req.session.userId = 1000; return next(); }
  return res.status(401).json({ error: 'Not authenticated' });
}
// Throttled last_active update — at most once per 60s per user
const _activeTimers = {};
function _touchActive(uid) {
  if (!uid || _activeTimers[uid]) return;
  _activeTimers[uid] = true;
  try { stmts.touchUserActive.run(uid); } catch {}
  setTimeout(() => { delete _activeTimers[uid]; }, 60000);
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
}

function requireAdminPage(req, res, next) {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  next();
}

// ── Helper: read a platform setting ───────────────────────────────────────
async function getPlatformFlag(key) {
  try {
    const row = await stmts.getSetting.get(key);
    return row ? row.value : null;
  } catch { return null; }
}

// ── Maintenance mode middleware (cached — checks DB at most every 30s) ────
let _maintenanceOn = false;
let _maintenanceTs = 0;
const MAINT_TTL = 30000;
async function maintenanceGuard(req, res, next) {
  if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin')) return next();
  // Skip DB check for static assets entirely
  if (/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|eot|map)$/i.test(req.path)) return next();
  try {
    const now = Date.now();
    if (now - _maintenanceTs > MAINT_TTL) {
      const row = await stmts.getSetting.get('flag_maintenance');
      _maintenanceOn = !!(row && row.value === '1');
      _maintenanceTs = now;
    }
    if (_maintenanceOn) {
      if (req.path.startsWith('/api/')) return res.status(503).json({ error: 'Site is under maintenance. Please try again later.' });
      return res.status(503).send(`<!DOCTYPE html><html><head><title>Maintenance</title><style>body{font-family:'Instrument Sans',sans-serif;background:#1A1612;color:#FDF4E7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;}.wrap{max-width:400px;padding:40px;}.dot{width:48px;height:48px;border-radius:50%;background:#E8500A;margin:0 auto 20px;}h1{font-family:'Fraunces',serif;font-size:28px;margin:0 0 12px;}p{color:#A89880;font-size:15px;line-height:1.6;}</style></head><body><div class="wrap"><div class="dot"></div><h1>We'll be right back</h1><p>Pitch. is undergoing scheduled maintenance. We'll be back shortly.</p></div></body></html>`);
    }
  } catch {}
  next();
}
app.use(maintenanceGuard);

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
  let {
    first_name, last_name, email, password,
    trading_name, abn, mobile, state, suburb, bio,
    cuisine_tags, setup_type, stall_w, stall_d, power, water, price_range, instagram,
    plan, oauth_provider, oauth_sub,
  } = req.body;

  const isOAuth = oauth_provider && oauth_sub;

  // If pro applications are disabled, force free plan
  const proFlag = await getPlatformFlag('flag_pro_apps');
  if (proFlag === '0' && plan && plan !== 'free') plan = 'free';

  if (!email || (!password && !isOAuth) || !first_name || !last_name || !trading_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = await stmts.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  // OAuth users skip email verification; regular users need it
  if (!isOAuth) {
    const preEntry = await stmts.getPresignupCode.get(email.toLowerCase());
    if (!preEntry || !preEntry.verified) {
      return res.status(400).json({ error: 'Email not verified. Please verify your email first.' });
    }
  }

  try {
    const password_hash = isOAuth ? '__oauth__' : await bcrypt.hash(password, 10);
    const userId = await txSignupVendor(
      { email, password_hash, first_name, last_name, role: 'vendor' },
      {
        trading_name,
        abn: abn || null,
        abn_verified: 0,
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
    if (isOAuth) {
      await stmts.setUserOAuth.run(oauth_provider, oauth_sub, userId);
    } else {
      await stmts.deletePresignupCode.run(email.toLowerCase());
    }
    _apiCache.delete('vendors'); _apiCache.delete('stats');

    // Auto-verify ABN in background (non-blocking)
    if (abn) autoVerifyAbn(abn.replace(/\s/g, ''), userId, 'vendor', { first_name, last_name, trading_name, email });

    // Notify admin of new vendor signup (fire-and-forget)
    sendNewVendorSignupAdminEmail(first_name, email, trading_name, suburb || '', plan || 'free')
      .catch(err => console.error('[mailer] vendor signup admin email failed:', err.message));

    sessWrite(res, { userId, role: 'vendor', name: `${first_name} ${last_name}` });
    res.json({ ok: true, redirect: '/dashboard/vendor' });
  } catch (err) {
    console.error('Signup vendor error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// POST /api/signup/organiser
app.post('/api/signup/organiser', async (req, res) => {
  // Check if organiser signups are enabled
  const orgSignupsFlag = await getPlatformFlag('flag_org_signups');
  if (orgSignupsFlag === '0') return res.status(403).json({ error: 'Organiser registrations are currently closed.' });

  const {
    first_name, last_name, email, password,
    org_name, abn, website, state, suburb, phone, bio,
    event_types, event_scale, stall_range, referral,
    oauth_provider, oauth_sub,
  } = req.body;

  const isOAuth = oauth_provider && oauth_sub;

  if (!email || (!password && !isOAuth) || !first_name || !last_name || !org_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = await stmts.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  if (!isOAuth) {
    const preEntry = await stmts.getPresignupCode.get(email.toLowerCase());
    if (!preEntry || !preEntry.verified) {
      return res.status(400).json({ error: 'Email not verified. Please verify your email first.' });
    }
  }

  try {
    const password_hash = isOAuth ? '__oauth__' : await bcrypt.hash(password, 10);
    const userId = await txSignupOrganiser(
      { email, password_hash, first_name, last_name, role: 'organiser' },
      {
        org_name,
        abn: abn || null,
        abn_verified: 0,
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
    if (isOAuth) {
      await stmts.setUserOAuth.run(oauth_provider, oauth_sub, userId);
    } else {
      await stmts.deletePresignupCode.run(email.toLowerCase());
    }

    // Auto-verify ABN in background (non-blocking)
    if (abn) autoVerifyAbn(abn.replace(/\s/g, ''), userId, 'organiser', { first_name, last_name, trading_name: org_name, email });

    // Notify admin of new organiser signup (fire-and-forget)
    sendNewOrganiserSignupAdminEmail(first_name, email, org_name, suburb || '')
      .catch(err => console.error('[mailer] organiser signup admin email failed:', err.message));

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

  const user = await stmts.getUserById.get(req.session.userId);
  const redirect = user && user.role === 'vendor' ? '/dashboard/vendor' : '/dashboard/organiser';
  res.json({ ok: true, redirect });
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

  if (user.password_hash === '__oauth__') {
    const provider = user.oauth_provider === 'apple' ? 'Apple' : 'Google';
    return res.status(401).json({ error: `This account uses ${provider} Sign-In. Please use the "${provider}" button above.` });
  }

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

// ── OAuth: Google Sign-In ──────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

async function verifyGoogleToken(idToken) {
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!r.ok) return null;
  const payload = await r.json();
  if (payload.aud !== GOOGLE_CLIENT_ID) return null;
  return { sub: payload.sub, email: payload.email, first_name: payload.given_name || '', last_name: payload.family_name || '' };
}

function oauthRedirect(role) {
  if (role === 'vendor')    return '/dashboard/vendor';
  if (role === 'organiser') return '/dashboard/organiser';
  if (role === 'foodie')    return '/discover';
  return '/';
}

app.post('/api/auth/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google Sign-In is not configured.' });
  const { credential, intent, role } = req.body; // intent: 'login' | 'signup', role: 'foodie'|'vendor'|'organiser'
  if (!credential) return res.status(400).json({ error: 'Missing credential' });

  const gUser = await verifyGoogleToken(credential);
  if (!gUser) return res.status(401).json({ error: 'Invalid Google token' });

  // Check if user already exists (by OAuth sub or email)
  let user = await stmts.getUserByOAuth.get('google', gUser.sub);
  if (!user) user = await stmts.getUserByEmail.get(gUser.email);

  if (user) {
    // Existing user — log them in
    if (user.status === 'banned')    return res.status(403).json({ error: 'This account has been banned.' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'This account is suspended.' });
    // Link OAuth if not already linked
    if (!user.oauth_provider) await stmts.setUserOAuth.run('google', gUser.sub, user.id);
    // Activate pending accounts (OAuth = verified email)
    if (user.status === 'pending') {
      await stmts.setUserStatus.run('active', user.id);
      await stmts.setEmailVerified.run(user.id);
    }
    sessWrite(res, { userId: Number(user.id), role: user.role, name: `${user.first_name} ${user.last_name}` });
    return res.json({ ok: true, redirect: oauthRedirect(user.role), existing: true });
  }

  // New user — signup flow
  if (intent === 'login') {
    // On login page with no account — tell them to sign up
    return res.json({ ok: true, needsSignup: true, email: gUser.email, first_name: gUser.first_name, last_name: gUser.last_name });
  }

  const targetRole = role || 'foodie';
  if (targetRole === 'vendor' || targetRole === 'organiser') {
    // For vendor/organiser, return pre-fill data — they still need to fill business details
    return res.json({ ok: true, prefill: true, email: gUser.email, first_name: gUser.first_name, last_name: gUser.last_name, oauth_provider: 'google', oauth_sub: gUser.sub });
  }

  // Foodie — create account directly
  try {
    const result = await stmts.createOAuthUser.run({ email: gUser.email, first_name: gUser.first_name, last_name: gUser.last_name || '', role: 'foodie', oauth_provider: 'google', oauth_sub: gUser.sub });
    const userId = Number(result.lastInsertRowid ?? result.lastrowid ?? result.insertId);
    sessWrite(res, { userId, role: 'foodie', name: `${gUser.first_name} ${gUser.last_name || ''}`.trim() });
    res.json({ ok: true, redirect: '/discover' });
  } catch (err) {
    console.error('[google auth] create user error:', err);
    res.status(500).json({ error: 'Could not create account' });
  }
});

// ── OAuth config endpoint (frontend needs client IDs) ─────────────────────
app.get('/api/auth/oauth-config', (req, res) => {
  res.json({
    google: GOOGLE_CLIENT_ID || null,
  });
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

// ── ABN cross-reference: compare ABR entity name against vendor account ─────
function abnNormalise(str) {
  return (str || '').toLowerCase()
    .replace(/\b(pty|ltd|limited|proprietary|trading\s+as|t\/a|trust|atf|as\s+trustee\s+for|the)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function abnCrossReference(entityName, tradingNames, context) {
  if (!context) return { match: 'unknown', details: [] };
  const entityNorm = abnNormalise(entityName);
  const allAbrNames = [entityNorm, ...tradingNames.map(abnNormalise)].filter(Boolean);
  const details = [];
  let bestMatch = 'mismatch';

  // Build account-side names to compare against
  const accountNames = [];
  if (context.first_name || context.last_name)
    accountNames.push({ label: 'Account name', value: abnNormalise(`${context.first_name || ''} ${context.last_name || ''}`) });
  if (context.trading_name)
    accountNames.push({ label: 'Trading name', value: abnNormalise(context.trading_name) });
  if (context.email) {
    const prefix = context.email.split('@')[0].replace(/[^a-z0-9]/gi, ' ').toLowerCase().trim();
    if (prefix.length > 2) accountNames.push({ label: 'Email', value: prefix });
  }

  for (const abrName of allAbrNames) {
    const abrWords = abrName.split(' ').filter(w => w.length > 2);
    for (const acct of accountNames) {
      const acctWords = acct.value.split(' ').filter(w => w.length > 2);
      // Full containment check
      if (abrName.includes(acct.value) || acct.value.includes(abrName)) {
        details.push({ field: acct.label, result: 'match', abrName, acctValue: acct.value });
        bestMatch = 'match';
        continue;
      }
      // Word overlap
      const overlap = abrWords.filter(w => acctWords.includes(w));
      if (overlap.length >= 2) {
        details.push({ field: acct.label, result: 'match', abrName, acctValue: acct.value, overlap });
        bestMatch = 'match';
      } else if (overlap.length === 1) {
        details.push({ field: acct.label, result: 'partial', abrName, acctValue: acct.value, overlap });
        if (bestMatch !== 'match') bestMatch = 'partial';
      }
    }
  }

  if (!accountNames.length) bestMatch = 'unknown';
  return { match: bestMatch, details };
}

// ── Server-side ABN auto-verify: call ABR + cross-reference + save ──────────
// Called after signup and profile save. Runs in background (non-blocking).
async function autoVerifyAbn(abn, userId, role, context) {
  if (!abn || !/^\d{11}$/.test(abn) || !abnChecksum(abn)) return;
  const guid = process.env.ABR_GUID;
  if (!guid) return;
  try {
    const url = `https://abn.business.gov.au/abrxmlsearch/abrxmlsearch.asmx/SearchByABNv202001?searchString=${abn}&includeHistoricalDetails=N&authenticationGuid=${guid}`;
    const r = await fetch(url, { headers: { Accept: 'text/xml' } });
    const xml = await r.text();
    const excMatch = xml.match(/<exceptionCode>([\s\S]*?)<\/exceptionCode>/);
    if (excMatch) return;
    const status = (xml.match(/<entityStatusCode>([\s\S]*?)<\/entityStatusCode>/) || [])[1] || 'Unknown';
    if (status !== 'Active') return;

    let entityName = '';
    const orgMatch = xml.match(/<mainName>[\s\S]*?<organisationName>([\s\S]*?)<\/organisationName>/);
    if (orgMatch) { entityName = orgMatch[1].trim(); }
    else {
      const given  = (xml.match(/<legalName>[\s\S]*?<givenName>([\s\S]*?)<\/givenName>/)  || [])[1] || '';
      const family = (xml.match(/<legalName>[\s\S]*?<familyName>([\s\S]*?)<\/familyName>/) || [])[1] || '';
      entityName = [given, family].map(s => s.trim()).filter(Boolean).join(' ');
    }
    const tradingNames = [];
    for (const m of xml.matchAll(/<mainTradingName>[\s\S]*?<organisationName>([\s\S]*?)<\/organisationName>/g)) tradingNames.push(m[1].trim());
    for (const m of xml.matchAll(/<otherTradingName>[\s\S]*?<organisationName>([\s\S]*?)<\/organisationName>/g)) tradingNames.push(m[1].trim());

    const xref = abnCrossReference(entityName, tradingNames, context);
    const abnVerified = xref.match === 'match' ? 1 : 0;
    const params = { abn_verified: abnVerified, abn_entity_name: entityName, abn_match: xref.match, user_id: userId };
    if (role === 'vendor') await stmts.updateVendorAbnVerification.run(params);
    else if (role === 'organiser') await stmts.updateOrganiserAbnVerification.run(params);
    console.log(`[ABR auto-verify] user=${userId} role=${role} abn=${abn} entity="${entityName}" match=${xref.match} verified=${abnVerified}`);
  } catch (e) { console.error('[ABR auto-verify]', e.message); }
}

app.post('/api/verify-abn', async (req, res) => {
  const clean = (req.body.abn || '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(clean))
    return res.json({ valid: false, error: 'ABN must be exactly 11 digits.' });
  if (!abnChecksum(clean))
    return res.json({ valid: false, error: 'ABN is invalid — please check the number and try again.' });

  const guid = process.env.ABR_GUID;
  if (!guid) {
    return res.json({ valid: true, checksum_only: true, message: 'ABN format is valid. To confirm entity details, configure ABR_GUID.' });
  }

  try {
    const url = `https://abn.business.gov.au/abrxmlsearch/abrxmlsearch.asmx/SearchByABNv202001?searchString=${clean}&includeHistoricalDetails=N&authenticationGuid=${guid}`;
    const r = await fetch(url, { headers: { Accept: 'text/xml' } });
    const xml = await r.text();

    const excMatch = xml.match(/<exceptionCode>([\s\S]*?)<\/exceptionCode>/);
    if (excMatch) return res.json({ valid: false, error: 'ABN not found in the Australian Business Register.' });

    const status = (xml.match(/<entityStatusCode>([\s\S]*?)<\/entityStatusCode>/) || [])[1] || 'Unknown';

    // Entity name — organisation or individual
    let entityName = '';
    const orgMatch = xml.match(/<mainName>[\s\S]*?<organisationName>([\s\S]*?)<\/organisationName>/);
    if (orgMatch) {
      entityName = orgMatch[1].trim();
    } else {
      const given  = (xml.match(/<legalName>[\s\S]*?<givenName>([\s\S]*?)<\/givenName>/)  || [])[1] || '';
      const family = (xml.match(/<legalName>[\s\S]*?<familyName>([\s\S]*?)<\/familyName>/) || [])[1] || '';
      entityName = [given, family].map(s => s.trim()).filter(Boolean).join(' ');
    }

    // Extract trading names from ABR XML
    const tradingNames = [];
    for (const m of xml.matchAll(/<mainTradingName>[\s\S]*?<organisationName>([\s\S]*?)<\/organisationName>/g))
      tradingNames.push(m[1].trim());
    for (const m of xml.matchAll(/<otherTradingName>[\s\S]*?<organisationName>([\s\S]*?)<\/organisationName>/g))
      tradingNames.push(m[1].trim());

    if (status !== 'Active')
      return res.json({ valid: false, error: `ABN is ${status} — only active ABNs are accepted.`, entityName, tradingNames, status });

    // Cross-reference against vendor account if context provided
    const context = req.body.context || null; // { first_name, last_name, trading_name, email }
    const xref = abnCrossReference(entityName, tradingNames, context);

    // Auto-save verification result if authenticated user
    if (req.session && req.session.userId) {
      const abnVerified = xref.match === 'match' ? 1 : 0; // green = auto-verified, partial/mismatch = not
      const saveParams = { abn_verified: abnVerified, abn_entity_name: entityName, abn_match: xref.match, user_id: req.session.userId };
      try {
        if (req.session.role === 'vendor') await stmts.updateVendorAbnVerification.run(saveParams);
        else if (req.session.role === 'organiser') await stmts.updateOrganiserAbnVerification.run(saveParams);
      } catch (e) { console.error('[ABR save]', e); }
    }

    return res.json({ valid: true, entityName, tradingNames, status, abn: clean, match: xref.match, matchDetails: xref.details });
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

// POST /api/contact — public contact form submission
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, role, subject, message } = req.body;
    if (!name || !email || !role || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
    }
    await stmts.insertContactMessage.run(name.trim(), email.trim(), role, subject.trim(), message.trim());
    // Send notification email to hello@onpitch.com.au
    const n = name.trim(), em = email.trim(), sub = subject.trim(), msg = message.trim();
    const roleLabel = role === 'foodie' ? 'Foodie' : role === 'vendor' ? 'Vendor' : role === 'organiser' ? 'Organiser' : 'Other';
    const ts = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Adelaide', dateStyle: 'medium', timeStyle: 'short' });
    try {
      await sendAdminEmail(
        'hello@onpitch.com.au',
        `New contact form: ${sub}`,
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#1A1612;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1A1612;padding:40px 20px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <!-- Logo -->
      <tr><td style="padding:0 0 32px;text-align:center;">
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:900;color:#FDF4E7;letter-spacing:-0.04em;">Pitch<span style="color:#E8500A;">.</span></span>
      </td></tr>
      <!-- Card -->
      <tr><td style="background-color:#231E19;border-radius:16px;border:1px solid rgba(255,255,255,0.035);overflow:hidden;">
        <!-- Header -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="background:linear-gradient(135deg,#2A1C12,#231E19);padding:28px 36px 24px;border-bottom:1px solid rgba(255,255,255,0.04);">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#E8500A;">New Contact Message</p>
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:900;color:#FDF4E7;letter-spacing:-0.02em;line-height:1.3;">${sub}</p>
          </td></tr>
        </table>
        <!-- Meta -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:24px 36px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
              <tr>
                <td style="padding:12px 16px;background-color:#2E2720;border-radius:10px 10px 0 0;border-bottom:1px solid rgba(255,255,255,0.03);">
                  <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#A89880;">From</p>
                  <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#FDF4E7;">${n}</p>
                </td>
                <td style="padding:12px 16px;background-color:#2E2720;border-radius:10px 10px 0 0;border-bottom:1px solid rgba(255,255,255,0.03);">
                  <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#A89880;">Role</p>
                  <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#FDF4E7;">${roleLabel}</p>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding:12px 16px;background-color:#2E2720;border-radius:0 0 10px 10px;">
                  <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#A89880;">Email</p>
                  <p style="margin:4px 0 0;font-size:15px;color:#FDF4E7;"><a href="mailto:${em}" style="color:#E8500A;text-decoration:none;">${em}</a></p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
        <!-- Message -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:24px 36px 32px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#A89880;">Message</p>
            <div style="background-color:#2E2720;border-radius:10px;padding:20px 20px;border-left:3px solid #E8500A;">
              <p style="margin:0;font-size:14px;color:#FDF4E7;line-height:1.7;white-space:pre-wrap;">${msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p>
            </div>
          </td></tr>
        </table>
        <!-- Reply button -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 36px 32px;" align="center">
            <a href="mailto:${em}?subject=Re: ${encodeURIComponent(sub)}" style="display:inline-block;background-color:#E8500A;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:9px;">Reply to ${n.split(' ')[0]}</a>
          </td></tr>
        </table>
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#6B5A4A;">Received ${ts} ACST via onpitch.com.au/contact</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
        `New contact form message\n\nFrom: ${n} (${em})\nRole: ${roleLabel}\nSubject: ${sub}\nReceived: ${ts}\n\n${msg}`
      );
    } catch (mailErr) {
      console.error('[contact] Email notification failed:', mailErr.message);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[contact] Submit error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
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

// POST /api/profile/plan — update vendor subscription plan via Stripe
app.post('/api/profile/plan', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['free', 'pro', 'growth'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    const vendor = await stmts.getVendorByUserId.get(req.session.userId);
    if (!vendor) return res.status(403).json({ error: 'Not a vendor account' });
    if (vendor.plan_override) {
      return res.status(403).json({ error: 'Your plan is managed by an administrator. Contact support to change your plan.' });
    }

    const hasStripeSub = !!vendor.stripe_subscription_id;
    console.log('[plan] Request:', { userId: req.session.userId, dbPlan: vendor.plan, requested: plan, hasStripeSub });

    // ── Upgrade to a paid plan ──
    if (plan !== 'free') {
      const stripe = await getStripe();
      if (!stripe || !STRIPE_PRICES[plan]) {
        console.error('[plan] Stripe not available:', { stripe: !!stripe, price: STRIPE_PRICES[plan] });
        return res.status(503).json({ error: 'Payment system is temporarily unavailable. Please try again shortly.' });
      }

      // If vendor already has a Stripe subscription, swap the price on it
      if (hasStripeSub) {
        try {
          const sub = await stripe.subscriptions.retrieve(vendor.stripe_subscription_id, {}, { timeout: 10000 });
          const currentPriceId = sub.items.data[0]?.price?.id;
          // Already on this exact price — nothing to do
          if (currentPriceId === STRIPE_PRICES[plan]) {
            await stmts.updateVendorPlan.run(plan, req.session.userId);
            return res.json({ ok: true, plan });
          }
          // Swap to the new price with proration
          await stripe.subscriptions.update(vendor.stripe_subscription_id, {
            items: [{ id: sub.items.data[0].id, price: STRIPE_PRICES[plan] }],
            proration_behavior: 'create_prorations',
            metadata: { user_id: String(req.session.userId), plan },
          }, { timeout: 10000 });
          // Plan update deferred — the customer.subscription.updated webhook
          // will write the new plan to the DB once Stripe confirms payment.
          return res.json({ ok: true, pending: true });
        } catch (subErr) {
          console.error('[plan] Subscription swap failed:', subErr.message);
          // If sub is invalid/cancelled, clear it and fall through to checkout
          await stmts.clearVendorStripeSubscription.run(req.session.userId);
        }
      }

      // No active Stripe subscription — create a Checkout session
      const user = await stmts.getUserById.get(req.session.userId);
      const planLabel = plan === 'growth' ? 'Growth' : 'Pro';
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const sessionParams = {
        mode: 'subscription',
        line_items: [{ price: STRIPE_PRICES[plan], quantity: 1 }],
        success_url: `${baseUrl}/dashboard/vendor?upgraded=${plan}`,
        cancel_url:  `${baseUrl}/dashboard/vendor#billing`,
        metadata: { user_id: String(req.session.userId) },
        subscription_data: {
          metadata: { user_id: String(req.session.userId), plan },
        },
        custom_text: {
          submit: { message: `You're subscribing to Pitch. ${planLabel}. Cancel anytime from your dashboard.` },
        },
        allow_promotion_codes: true,
        payment_method_collection: 'always',
      };
      if (vendor.stripe_customer_id) {
        sessionParams.customer = vendor.stripe_customer_id;
      } else if (user?.email) {
        sessionParams.customer_email = user.email;
      }

      try {
        const session = await stripe.checkout.sessions.create(sessionParams, { timeout: 10000 });
        console.log('[plan] Checkout session created:', session.id);
        return res.json({ ok: true, checkout_url: session.url });
      } catch (stripeErr) {
        // Stale customer ID — exists in DB but deleted from Stripe.
        // Clear it and retry without a customer so Stripe creates a new one.
        if (stripeErr.code === 'resource_missing' && sessionParams.customer) {
          console.warn('[plan] Stale stripe_customer_id cleared:', sessionParams.customer);
          await stmts.updateVendorStripe.run({
            stripe_customer_id: null,
            stripe_subscription_id: null,
            user_id: req.session.userId,
          });
          delete sessionParams.customer;
          if (user?.email) sessionParams.customer_email = user.email;
          try {
            const session = await stripe.checkout.sessions.create(sessionParams, { timeout: 10000 });
            console.log('[plan] Checkout session created (after customer reset):', session.id);
            return res.json({ ok: true, checkout_url: session.url });
          } catch (retryErr) {
            console.error('[plan] Stripe checkout FAILED on retry:', retryErr.message);
            return res.status(502).json({ error: `Payment error: ${retryErr.message}` });
          }
        }
        console.error('[plan] Stripe checkout FAILED:', stripeErr.message);
        return res.status(502).json({ error: `Payment error: ${stripeErr.message}` });
      }
    }

    // ── Downgrade to free ──
    if (hasStripeSub) {
      const stripe = await getStripe();
      if (stripe) {
        const subscription = await stripe.subscriptions.update(vendor.stripe_subscription_id, {
          cancel_at_period_end: true,
        }, { timeout: 10000 });

        const periodEnd = new Date(
          subscription.current_period_end * 1000
        ).toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })

        const downgradeUser = stmts.getUserById.get(req.session.userId)

        sendDowngradeConfirmationEmail(
          downgradeUser.email,
          downgradeUser.first_name,
          vendor.plan,
          periodEnd
        ).catch(err => console.error(
          '[mailer] downgrade email failed:',
          err.message
        ))

        return res.json({ ok: true, plan: vendor.plan, cancel_at_period_end: true });
      }
    }
    // No Stripe sub — just switch directly
    await stmts.updateVendorPlan.run('free', req.session.userId);
    await stmts.insertSubscriptionChange.run({
      user_id: req.session.userId, old_plan: vendor.plan || 'free', new_plan: 'free',
      changed_by: 'vendor', admin_user_id: null,
      reason: 'Downgrade to Starter', payment_status: null,
      is_override: 0, override_expires: null,
    });
    _apiCache.delete('vendors'); _apiCache.delete('stats');

    const downgradeUser = stmts.getUserById.get(req.session.userId)

    sendDowngradeConfirmationEmail(
      downgradeUser.email,
      downgradeUser.first_name,
      vendor.plan || 'free',
      'immediately'
    ).catch(err => console.error(
      '[mailer] downgrade email failed:',
      err.message
    ))

    return res.json({ ok: true, plan: 'free' });
  } catch (e) {
    console.error('[plan]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/stripe/portal — open Stripe customer portal for managing subscription
app.post('/api/stripe/portal', requireAuth, async (req, res) => {
  const stripe = await getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const vendor = await stmts.getVendorByUserId.get(req.session.userId);
    if (!vendor?.stripe_customer_id) return res.status(400).json({ error: 'No active subscription' });
    const session = await stripe.billingPortal.sessions.create({
      customer: vendor.stripe_customer_id,
      return_url: `${req.protocol}://${req.get('host')}/dashboard/vendor#billing`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[stripe-portal]', e);
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
  await stmts.followVendor.run(req.session.userId, req.params.vendorId);
  res.json({ ok: true, following: true });
});

// DELETE /api/foodie/follow/:vendorId
app.delete('/api/foodie/follow/:vendorId', requireAuth, async (req, res) => {
  if (req.session.role !== 'foodie') return res.status(403).json({ error: 'Foodies only' });
  await stmts.unfollowVendor.run(req.session.userId, req.params.vendorId);
  res.json({ ok: true, following: false });
});

// GET /api/foodie/following
app.get('/api/foodie/following', requireAuth, async (req, res) => {
  if (req.session.role !== 'foodie') return res.status(403).json({ error: 'Foodies only' });
  const following = await stmts.getFollowedVendorIds.all(req.session.userId);
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
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.json(hit.data);
    }
    try {
      const data = await fn();
      _apiCache.set(key, { data, ts: Date.now() });
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
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

app.get('/api/featured-vendors', apiCached('featured-vendors', 120000, async () => {
  return stmts.featuredVendors.all();
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

// Rate-limit search appearance tracking: max once per IP per 5 minutes
const _searchAppearanceCache = new Map();
setInterval(() => { const cutoff = Date.now() - 300000; for (const [k, t] of _searchAppearanceCache) if (t < cutoff) _searchAppearanceCache.delete(k); }, 60000);

// ── Post-event completion workflow ──────────────────────────────────────────

const SITE_URL = process.env.SITE_URL || 'https://onpitch.com.au';

/** Detect events that have ended, mark them completed, and notify participants. */
async function processCompletedEvents({ sendEmails = true } = {}) {
  let processed = 0, notified = 0;
  try {
    const events = await stmts.getCompletableEvents.all();
    for (const ev of events) {
      await stmts.markEventCompleted.run(ev.id);
      processed++;

      const vendors = await stmts.getApprovedVendorsForEvent.all(ev.id);
      if (!vendors.length) continue;

      // Notify organiser
      const orgInfo = await stmts.getEventWithOrganiser.get(ev.id);
      if (orgInfo) {
        const already = await stmts.hasCompletionNotif.get(ev.id, orgInfo.organiser_user_id, 'rate_prompt');
        if (!already) {
          let sentEmail = 0;
          if (sendEmails && orgInfo.notif_post_event && orgInfo.org_email) {
            try {
              const vendorNames = vendors.map(v => v.trading_name);
              const html = buildPostEventOrgHtml(orgInfo.org_first_name, ev.name, vendorNames, `${SITE_URL}/dashboard/organiser/ratings`);
              await sendAdminEmail(orgInfo.org_email, `${ev.name} has wrapped up — rate your vendors`, html, `Your event "${ev.name}" has ended. Log in to rate the vendors who participated.`);
              sentEmail = 1;
            } catch (e) { console.error('[post-event] org email error:', e.message); }
          }
          await stmts.insertCompletionNotif.run({ event_id: ev.id, user_id: orgInfo.organiser_user_id, user_role: 'organiser', notif_type: 'rate_prompt', sent_via_email: sentEmail });
          notified++;
        }
      }

      // Notify each approved vendor
      for (const v of vendors) {
        const already = await stmts.hasCompletionNotif.get(ev.id, v.vendor_user_id, 'rate_prompt');
        if (already) continue;
        let sentEmail = 0;
        if (sendEmails && v.notif_reviews && v.email) {
          try {
            const orgName = orgInfo?.org_name || 'the organiser';
            const html = buildPostEventVendorHtml(v.trading_name, ev.name, orgName, `${SITE_URL}/dashboard/vendor/reviews`);
            await sendAdminEmail(v.email, `How was ${ev.name}? Leave a review`, html, `You recently attended "${ev.name}". Log in to share your experience.`);
            sentEmail = 1;
          } catch (e) { console.error('[post-event] vendor email error:', e.message); }
        }
        await stmts.insertCompletionNotif.run({ event_id: ev.id, user_id: v.vendor_user_id, user_role: 'vendor', notif_type: 'rate_prompt', sent_via_email: sentEmail });
        notified++;
      }
    }
  } catch (e) { console.error('[post-event] processCompletedEvents error:', e.message); }
  if (processed) console.log(`[post-event] Processed ${processed} events, notified ${notified} users`);
  return { processed, notified };
}

/** Lightweight: just mark events as completed (no emails). Used in notification endpoint fallback. */
async function markCompletedEventsLazy() {
  try {
    const events = await stmts.getCompletableEvents.all();
    for (const ev of events) await stmts.markEventCompleted.run(ev.id);
    return events.length;
  } catch (e) { console.error('[post-event] lazy mark error:', e.message); return 0; }
}

// Process expired subscription overrides — auto-downgrade to free
async function processExpiredOverrides() {
  try {
    const expired = await stmts.getExpiredOverrides.all();
    for (const v of expired) {
      await stmts.updateVendorPlanOverride.run({
        plan: 'free', plan_override: 0,
        plan_override_by: null, plan_override_at: null,
        plan_override_reason: null, plan_override_expires: null,
        user_id: v.user_id,
      });
      await stmts.insertSubscriptionChange.run({
        user_id: v.user_id, old_plan: v.plan, new_plan: 'free',
        changed_by: 'system', admin_user_id: null,
        reason: 'Temporary upgrade expired', payment_status: null,
        is_override: 0, override_expires: null,
      });
    }
    if (expired.length) {
      console.log(`[subscription] Expired ${expired.length} temporary override(s)`);
      _apiCache.delete('vendors'); _apiCache.delete('stats');
    }
    return expired.length;
  } catch (e) { console.error('[subscription] processExpiredOverrides error:', e.message); return 0; }
}
// Run on boot + every hour
setTimeout(() => processExpiredOverrides(), 5000);
setInterval(() => processExpiredOverrides(), 3600000);

app.get('/api/vendors', async (req, res) => {
  // Use the cached data layer
  const hit = _apiCache.get('vendors');
  let data;
  if (hit && Date.now() - hit.ts < 60000) {
    data = hit.data;
  } else {
    try {
      const rows = await stmts.publicVendors.all();
      data = { vendors: rows.map(v => ({
        ...v,
        cuisine_tags: (() => { try { return JSON.parse(v.cuisine_tags || '[]'); } catch { return []; } })(),
      })) };
      _apiCache.set('vendors', { data, ts: Date.now() });
    } catch(e) {
      console.error('[/api/vendors] query failed:', e.message, e.stack);
      data = { vendors: [], error: e.message };
    }
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.json(data);
  // Fire-and-forget: track search appearances (rate-limited by IP)
  try {
    const ipKey = createHash('sha256').update(req.ip || '').digest('hex').slice(0, 12);
    if (!_searchAppearanceCache.has(ipKey) && data.vendors?.length) {
      _searchAppearanceCache.set(ipKey, Date.now());
      for (const v of data.vendors) {
        try { stmts.recordSearchAppearance.run(v.user_id, 'vendors_list'); } catch {}
      }
    }
  } catch {}
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
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const { status } = req.query;
    const rows = status ? await stmts.vendorsByStatus.all(status) : await stmts.allVendors.all();
    // Try to enrich with PLI status (columns may not exist yet on first deploy)
    try {
      const pliRows = await (prepare(`SELECT user_id, pli_status FROM vendors WHERE pli_status IS NOT NULL AND pli_status != 'none'`)).all();
      const pliMap = Object.fromEntries(pliRows.map(r => [r.user_id, r.pli_status]));
      for (const v of rows) { v.pli_status = pliMap[v.user_id] || null; }
    } catch (_) { /* pli columns not yet migrated — ignore */ }
    res.json({ vendors: rows });
  } catch (e) {
    console.error('[admin vendors]', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/organisers', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
        // Suspension email to vendor (branded template)
        sendAccountSuspendedEmail(user.email, user.first_name, reason || 'Violation of platform terms.')
          .catch(err => console.error('[mailer] account suspended email failed:', err.message));
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
        // Suspension email to organiser (branded template)
        sendAccountSuspendedEmail(user.email, user.first_name, reason || 'Violation of platform terms.')
          .catch(err => console.error('[mailer] account suspended email failed:', err.message));
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
    } else if (status === 'active' && prevStatus !== 'active') {
      // Activation from pending/banned = approval
      sendAccountApprovedEmail(user.email, user.first_name)
        .catch(err => console.error('[mailer] account approved email failed:', err.message));
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
  _apiCache.delete('featured-events');
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
        `<p>Hi ${report.reporter_name},</p><p>We've reviewed your report #${report.ref_number} and determined that no further action is required at this time.</p><p>If you believe this decision is in error, please contact support@onpitch.com.au.</p><p>Pitch Admin Team</p>`,
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
  const adminId = req.session.userId || (await stmts.getUserByEmail.get('admin@onpitch.com.au').catch(() => null))?.id || 1000;
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
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const row = await stmts.getVendorDetail.get(req.params.userId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { password_hash, ...safe } = row;
  res.json({ vendor: safe, user: { id: row.user_id, email: row.email, first_name: row.first_name, last_name: row.last_name, status: row.status, created_at: row.created_at } });
});

app.get('/api/admin/organisers/:userId', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
  const { trading_name, mobile, suburb, state, bio, instagram, setup_type, stall_w, stall_d, power, water, price_range, abn } = req.body;
  await stmts.updateVendorProfile.run({ trading_name, mobile: mobile||null, suburb: suburb||null, state: state||null, bio: bio||null, instagram: instagram||null, setup_type: setup_type||null, stall_w: stall_w||null, stall_d: stall_d||null, power: power?1:0, water: water?1:0, price_range: price_range||null, abn: abn||null, user_id: req.params.userId });
  _apiCache.delete('featured-vendors');
  res.json({ ok: true });
});

// POST /api/admin/vendors/:id/subscription — Admin subscription override
app.post('/api/admin/vendors/:id/subscription', requireAdmin, async (req, res) => {
  try {
    const { plan, reason, override_expires } = req.body;
    if (!['free', 'pro', 'growth'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
    const vendor = await stmts.getVendorByUserId.get(Number(req.params.id));
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    const oldPlan = vendor.plan || 'free';
    // Build payment warnings
    const warnings = [];
    const lastPayment = await stmts.getLastPayment.get(Number(req.params.id));
    if (plan !== 'free') {
      if (!lastPayment) {
        warnings.push({ type: 'no_payments', message: 'No payment records exist for this vendor.' });
      } else if (lastPayment.status === 'failed') {
        warnings.push({ type: 'last_payment_failed', message: `Last payment failed on ${new Date(lastPayment.created_at).toLocaleDateString('en-AU')}.` });
      } else if (lastPayment.status === 'refunded') {
        warnings.push({ type: 'last_payment_refunded', message: `Last payment was refunded on ${new Date(lastPayment.created_at).toLocaleDateString('en-AU')}.` });
      }
      if (lastPayment && lastPayment.status === 'paid' && lastPayment.plan !== plan) {
        warnings.push({ type: 'no_paid_for_tier', message: `Vendor has never paid for the ${plan === 'pro' ? 'Pro' : 'Growth'} tier.` });
      }
    }
    const isOverride = plan !== 'free' ? 1 : 0;
    const now = new Date().toISOString();
    await stmts.updateVendorPlanOverride.run({
      plan, plan_override: isOverride,
      plan_override_by: isOverride ? (req.session.userId || null) : null,
      plan_override_at: isOverride ? now : null,
      plan_override_reason: reason || null,
      plan_override_expires: override_expires || null,
      user_id: Number(req.params.id),
    });
    await stmts.insertSubscriptionChange.run({
      user_id: Number(req.params.id), old_plan: oldPlan, new_plan: plan,
      changed_by: 'admin', admin_user_id: req.session.userId || null,
      reason: reason || null, payment_status: lastPayment ? lastPayment.status : 'none',
      is_override: isOverride, override_expires: override_expires || null,
    });
    await stmts.insertAuditLog.run({
      admin_user_id: req.session.userId || null, action: 'plan_override',
      target_user_id: Number(req.params.id), target_role: 'vendor',
      reason: reason || `Plan changed from ${oldPlan} to ${plan}`,
      metadata: JSON.stringify({ old_plan: oldPlan, new_plan: plan, warnings }),
    });
    _apiCache.delete('vendors'); _apiCache.delete('stats'); _apiCache.delete('featured-vendors');
    res.json({ ok: true, warnings, change: { old_plan: oldPlan, new_plan: plan, is_override: isOverride } });
  } catch (e) { console.error('[admin-subscription]', e); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/admin/vendors/:id/subscription-override — Remove admin override (keep plan)
app.delete('/api/admin/vendors/:id/subscription-override', requireAdmin, async (req, res) => {
  try {
    const vendor = await stmts.getVendorByUserId.get(Number(req.params.id));
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    await stmts.clearVendorOverride.run(Number(req.params.id));
    await stmts.insertSubscriptionChange.run({
      user_id: Number(req.params.id), old_plan: vendor.plan || 'free', new_plan: vendor.plan || 'free',
      changed_by: 'admin', admin_user_id: req.session.userId || null,
      reason: 'Override removed', payment_status: null, is_override: 0, override_expires: null,
    });
    _apiCache.delete('vendors'); _apiCache.delete('stats');
    res.json({ ok: true });
  } catch (e) { console.error('[admin-clear-override]', e); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/admin/vendors/:id/trial — Extend or end trial
app.patch('/api/admin/vendors/:id/trial', requireAdmin, async (req, res) => {
  try {
    const { action, extend_days } = req.body;
    const vendor = await stmts.getVendorByUserId.get(Number(req.params.id));
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    let newTrialEnd;
    if (action === 'extend') {
      const days = extend_days || 14;
      const base = vendor.trial_ends_at && new Date(vendor.trial_ends_at) > new Date()
        ? new Date(vendor.trial_ends_at) : new Date();
      base.setDate(base.getDate() + days);
      newTrialEnd = base.toISOString();
    } else if (action === 'end') {
      newTrialEnd = new Date().toISOString();
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "extend" or "end".' });
    }
    await stmts.updateVendorTrialEnd.run(newTrialEnd, Number(req.params.id));
    await stmts.insertSubscriptionChange.run({
      user_id: Number(req.params.id), old_plan: vendor.plan || 'free', new_plan: vendor.plan || 'free',
      changed_by: 'admin', admin_user_id: req.session.userId || null,
      reason: action === 'extend' ? `Trial extended by ${extend_days || 14} days` : 'Trial ended by admin',
      payment_status: null, is_override: 0, override_expires: null,
    });
    res.json({ ok: true, trial_ends_at: newTrialEnd });
  } catch (e) { console.error('[admin-trial]', e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/admin/vendors/:id/subscription-history — Subscription audit log
app.get('/api/admin/vendors/:id/subscription-history', requireAdmin, async (req, res) => {
  try {
    const changes = await stmts.getSubscriptionChanges.all(Number(req.params.id));
    res.json({ changes });
  } catch (e) { console.error('[sub-history]', e); res.status(500).json({ error: 'Server error' }); }
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
  const { trading_name, bio, mobile, suburb, state, instagram, abn, stall_w, stall_d, power, water, setup_type, price_range, cuisine_tags } = req.body;
  try {
    await stmts.updateVendorProfileSelf.run({
      trading_name: trading_name || null,
      bio:          bio          || null,
      mobile:       mobile       || null,
      suburb:       suburb       || null,
      state:        state        || null,
      instagram:    instagram    || null,
      abn:          abn          || null,
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
    // Auto-verify ABN if provided (runs in background)
    if (abn) {
      const user = await stmts.getUserById.get(req.session.userId);
      autoVerifyAbn(abn.replace(/\s/g, ''), req.session.userId, 'vendor', {
        first_name: user?.first_name || '', last_name: user?.last_name || '',
        trading_name: trading_name || '', email: user?.email || '',
      });
    }
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

    // Post-event rating/review prompts (lazy detection — mark completed events without sending emails)
    try {
      await markCompletedEventsLazy();
      if (role === 'vendor') {
        const pending = await stmts.getPendingReviewsForVendor.all(userId);
        for (const p of pending.slice(0, 5)) {
          notifs.push({ id:`rate-${p.event_id}`, icon:'⭐', iconCls:'gold',
            title:`How was ${p.event_name}?`,
            desc:`Leave a review for ${p.org_name}.`,
            time: relTime(p.completed_at), unread: true,
            action: 'review-organiser', eventId: p.event_id, organiserId: p.organiser_user_id, orgName: p.org_name, eventName: p.event_name });
        }
      } else if (role === 'organiser') {
        const pending = await stmts.getPendingRatingsForOrganiser.all(userId);
        const byEvent = {};
        for (const p of pending) {
          if (!byEvent[p.event_id]) byEvent[p.event_id] = { ...p, count: 0 };
          byEvent[p.event_id].count++;
        }
        for (const ev of Object.values(byEvent).slice(0, 5)) {
          notifs.push({ id:`rate-${ev.event_id}`, icon:'⭐', iconCls:'gold',
            title:`Rate your vendors from ${ev.event_name}`,
            desc:`${ev.count} vendor${ev.count > 1 ? 's' : ''} awaiting your rating.`,
            time: relTime(ev.completed_at), unread: true,
            action: 'rate-vendors', eventId: ev.event_id });
        }
      }
    } catch (e) { console.error('[post-event notifs]', e.message); }

    // Prepend unread admin announcements targeted at this role
    try {
      const audience = role === 'vendor' ? 'vendors' : role === 'organiser' ? 'organisers' : 'all';
      let planAudience = '';   // e.g. 'pro', 'growth', 'free_vendors'
      let groupAudience = '';  // 'paid' for pro/growth, '' otherwise
      if (role === 'vendor') {
        const vr = await stmts.getVendorByUserId.get(userId).catch(() => null);
        const plan = vr?.plan || 'free';
        planAudience = plan === 'free' ? 'free_vendors' : plan; // 'pro' or 'growth'
        groupAudience = (plan === 'pro' || plan === 'growth') ? 'paid' : '';
      }
      const announcements = await stmts.getUnreadAnnouncements.all(audience, planAudience, groupAudience, userId);
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

// ── GET /api/announcements — unread announcements for logged-in user's role ──
app.get('/api/announcements', requireAuth, async (req, res) => {
  try {
    const { role, userId } = req.session;
    const audience = role === 'vendor' ? 'vendors' : role === 'organiser' ? 'organisers' : 'all';
    let planAudience = '';
    let groupAudience = '';
    if (role === 'vendor') {
      const vr = await stmts.getVendorByUserId.get(userId).catch(() => null);
      const plan = vr?.plan || 'free';
      planAudience = plan === 'free' ? 'free_vendors' : plan;
      groupAudience = (plan === 'pro' || plan === 'growth') ? 'paid' : '';
    }
    const rows = await stmts.getUnreadAnnouncements.all(audience, planAudience, groupAudience, userId);
    res.json({ announcements: rows });
  } catch (e) { res.json({ announcements: [] }); }
});

// ── POST /api/announcements/:id/dismiss — mark announcement as read ─────────
app.post('/api/announcements/:id/dismiss', requireAuth, async (req, res) => {
  try {
    await stmts.dismissAnnouncement.run(req.session.userId, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[dismiss announcement]', e);
    res.status(500).json({ error: 'Failed to dismiss' });
  }
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

    // Free plan: enforce application limit from platform settings
    if (effectivePlan === 'free') {
      const limitSetting = await getPlatformFlag('limit_free_apps');
      const APP_LIMIT = limitSetting ? parseInt(limitSetting, 10) : 10;
      if (APP_LIMIT > 0) { // 0 = unlimited, skip check
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

    // Pro/Growth plan: enforce pro application limit
    if (effectivePlan === 'pro' || effectivePlan === 'growth') {
      const proLimitSetting = await getPlatformFlag('limit_pro_apps');
      const PRO_LIMIT = proLimitSetting ? parseInt(proLimitSetting, 10) : 0;
      if (PRO_LIMIT > 0) { // 0 = unlimited
        if (vendorSub.apps_reset_month !== currentMonth) {
          await stmts.resetAppsCounter.run(currentMonth, req.session.userId);
          vendorSub.apps_this_month = 0;
        }
        if (Number(vendorSub.apps_this_month) >= PRO_LIMIT) {
          return res.status(429).json({
            error: 'Application limit reached',
            message: `You've used all ${PRO_LIMIT} applications for this month on your plan.`,
            limit: PRO_LIMIT,
            used: Number(vendorSub.apps_this_month),
          });
        }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    await stmts.createApplication.run(ev.id, req.session.userId, message || null);

    // Increment monthly counter for all vendors with subscription tracking
    if (vendorSub) {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (vendorSub.apps_reset_month !== currentMonth) {
        await stmts.resetAndIncrementApps.run(currentMonth, req.session.userId);
      } else {
        await stmts.incrementAppsThisMonth.run(currentMonth, req.session.userId);
      }
    }

    // Auto-response: if organiser has a template, send it via messaging
    try {
      const org = await stmts.getOrganiserByUserId.get(ev.organiser_user_id);
      if (org && org.auto_response_template) {
        const threadKey = `v${req.session.userId}_o${ev.organiser_user_id}`;
        await stmts.createOrGetThread.run(threadKey, req.session.userId, ev.organiser_user_id);
        await stmts.sendMessage.run(threadKey, ev.organiser_user_id, org.auto_response_template);
      }
    } catch (autoErr) { console.error('[auto-response]', autoErr); }

    res.json({ ok: true });

    // Email notifications — fire-and-forget
    try {
      const applyUser = await stmts.getUserById.get(req.session.userId);
      const applyVendor = await stmts.getVendorByUserId.get(req.session.userId);
      if (applyUser) {
        sendApplicationSubmittedEmail(applyUser.email, applyUser.first_name, ev.name, ev.date_text || '', ev.suburb || '')
          .catch(err => console.error('[mailer] application submitted email failed:', err.message));
      }
      const orgUser = await stmts.getUserById.get(ev.organiser_user_id);
      if (orgUser && applyVendor) {
        sendNewApplicationOrganiserEmail(orgUser.email, orgUser.first_name, applyUser?.first_name || '', applyVendor.trading_name || '', ev.name, applyVendor.cuisine_tags || '', applyVendor.plan || 'free')
          .catch(err => console.error('[mailer] new application organiser email failed:', err.message));
      }
    } catch (emailErr) { console.error('[mailer] application email lookup failed:', emailErr.message); }
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

// ── API: Vendor Analytics ──────────────────────────────────────────────────
app.get('/api/vendor/analytics', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const uid = req.session.userId;
  try {
    const vendorRow = await stmts.getVendorByUserId.get(uid);
    const plan = vendorRow?.plan || 'free';
    if (plan === 'free') return res.json({ locked: true });

    // Date range: ?from=YYYY-MM-DD&to=YYYY-MM-DD (optional)
    const fromQ = req.query.from, toQ = req.query.to;
    const hasRange = fromQ && toQ && /^\d{4}-\d{2}-\d{2}$/.test(fromQ) && /^\d{4}-\d{2}-\d{2}$/.test(toQ);
    // SQL date conditions for views and search tables
    const vDateCond = hasRange
      ? `AND created_at >= '${fromQ}' AND created_at < date('${toQ}','+1 day')`
      : `AND created_at >= datetime('now','-30 days')`;
    const appDateCond = hasRange
      ? `AND created_at >= '${fromQ}' AND created_at < date('${toQ}','+1 day')`
      : '';
    const revDateCond = hasRange
      ? `AND paid_at >= '${fromQ}' AND paid_at < date('${toQ}','+1 day')`
      : `AND paid_at >= datetime('now','-6 months')`;
    const reviewDateCond = hasRange
      ? `AND created_at >= '${fromQ}' AND created_at < date('${toQ}','+1 day')`
      : `AND created_at >= datetime('now','-6 months')`;

    // Dynamic queries for date-filtered analytics
    const q = (sql) => prepare(sql);

    const [viewsTotal, viewsUnique, viewsDaily, appStats, appsMonthly, avgResp, revTotals, revMonthly, reviewSum, reviewTrend] = await Promise.all([
      q(`SELECT COUNT(*) as total FROM vendor_profile_views WHERE vendor_user_id=? ${vDateCond}`).get(uid).catch(() => ({ total: 0 })),
      q(`SELECT COUNT(DISTINCT viewer_ip_hash) as unique_visitors FROM vendor_profile_views WHERE vendor_user_id=? ${vDateCond}`).get(uid).catch(() => ({ unique_visitors: 0 })),
      q(`SELECT date(created_at) as day, COUNT(*) as views FROM vendor_profile_views WHERE vendor_user_id=? ${vDateCond} GROUP BY date(created_at) ORDER BY day ASC`).all(uid).catch(() => []),
      q(`SELECT status, COUNT(*) as count FROM event_applications WHERE vendor_user_id=? ${appDateCond} GROUP BY status`).all(uid).catch(() => []),
      q(`SELECT strftime('%Y-%m', created_at) as month, status, COUNT(*) as count FROM event_applications WHERE vendor_user_id=? ${appDateCond.replace(/created_at/g, 'created_at')} GROUP BY month, status ORDER BY month ASC`).all(uid).catch(() => []),
      q(`SELECT AVG(julianday(e.date_sort) - julianday(ea.created_at)) as avg_days FROM event_applications ea JOIN events e ON e.id=ea.event_id WHERE ea.vendor_user_id=? AND ea.status IN ('approved','rejected') ${appDateCond.replace(/created_at/g, 'ea.created_at')}`).get(uid).catch(() => ({ avg_days: null })),
      q(`SELECT SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) as total_paid, SUM(CASE WHEN status IN ('unpaid','pending') THEN amount ELSE 0 END) as total_outstanding, COUNT(DISTINCT event_id) as events_count FROM stall_fees WHERE vendor_user_id=? ${hasRange ? appDateCond.replace(/created_at/g, 'created_at') : ''}`).get(uid).catch(() => ({ total_paid: 0, total_outstanding: 0, events_count: 0 })),
      q(`SELECT strftime('%Y-%m', paid_at) as month, SUM(amount) as total, COUNT(*) as events FROM stall_fees WHERE vendor_user_id=? AND status='paid' ${revDateCond} GROUP BY month ORDER BY month ASC`).all(uid).catch(() => []),
      q(`SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews FROM vendor_reviews WHERE vendor_user_id=? ${hasRange ? reviewDateCond : ''}`).get(uid).catch(() => ({ avg_rating: null, total_reviews: 0 })),
      q(`SELECT strftime('%Y-%m', created_at) as month, AVG(rating) as avg_rating, COUNT(*) as count FROM vendor_reviews WHERE vendor_user_id=? ${reviewDateCond} GROUP BY month ORDER BY month ASC`).all(uid).catch(() => []),
    ]);

    const result = {
      views: {
        total: Number(viewsTotal?.total ?? 0),
        unique: Number(viewsUnique?.unique_visitors ?? 0),
        daily: viewsDaily,
      },
      applications: {
        stats: appStats,
        monthly: appsMonthly,
        avgResponseDays: avgResp?.avg_days != null ? Math.round(avgResp.avg_days * 10) / 10 : null,
      },
      revenue: {
        total_paid: Number(revTotals?.total_paid ?? 0),
        total_outstanding: Number(revTotals?.total_outstanding ?? 0),
        events_count: Number(revTotals?.events_count ?? 0),
        monthly: revMonthly,
      },
      reviews: {
        avg_rating: reviewSum?.avg_rating != null ? Math.round(reviewSum.avg_rating * 10) / 10 : null,
        total_reviews: Number(reviewSum?.total_reviews ?? 0),
        trend: reviewTrend,
      },
    };

    if (hasRange) result.dateRange = { from: fromQ, to: toQ };

    // Growth-only features
    if (plan === 'growth') {
      const cuisineTags = (() => { try { return JSON.parse(vendorRow.cuisine_tags || '[]'); } catch { return []; } })();
      const primaryCuisine = cuisineTags[0] || '';

      const [viewsBySource, viewsByRole, viewsHourly, searchTotal, searchDaily, vendorRate, catRate, catCount, catRank] = await Promise.all([
        q(`SELECT COALESCE(referrer,'direct') as referrer, COUNT(*) as views FROM vendor_profile_views WHERE vendor_user_id=? ${vDateCond} GROUP BY referrer ORDER BY views DESC`).all(uid).catch(() => []),
        q(`SELECT COALESCE(viewer_role,'anonymous') as viewer_role, COUNT(*) as views FROM vendor_profile_views WHERE vendor_user_id=? ${vDateCond} GROUP BY viewer_role ORDER BY views DESC`).all(uid).catch(() => []),
        q(`SELECT CAST(strftime('%H', created_at, 'localtime') AS INTEGER) as hour, COUNT(*) as views FROM vendor_profile_views WHERE vendor_user_id=? ${vDateCond} GROUP BY hour ORDER BY hour ASC`).all(uid).catch(() => []),
        q(`SELECT COUNT(*) as total FROM vendor_search_appearances WHERE vendor_user_id=? ${vDateCond}`).get(uid).catch(() => ({ total: 0 })),
        q(`SELECT date(created_at) as day, COUNT(*) as appearances FROM vendor_search_appearances WHERE vendor_user_id=? ${vDateCond} GROUP BY date(created_at) ORDER BY day ASC`).all(uid).catch(() => []),
        stmts.getVendorAcceptanceRate.get(uid).catch(() => ({ total_apps: 0, approved_apps: 0 })),
        primaryCuisine ? stmts.getCategoryAcceptanceRate.get(primaryCuisine, uid).catch(() => ({ total_apps: 0, approved_apps: 0 })) : Promise.resolve({ total_apps: 0, approved_apps: 0 }),
        primaryCuisine ? stmts.getCategoryVendorCount.get(primaryCuisine).catch(() => ({ count: 0 })) : Promise.resolve({ count: 0 }),
        primaryCuisine ? stmts.getCategoryRank.get(primaryCuisine, uid, uid).catch(() => ({ rank: 0 })) : Promise.resolve({ rank: 0 }),
      ]);

      result.views.bySource = viewsBySource;
      result.views.byRole = viewsByRole;

      const searchCount = Number(searchTotal?.total ?? 0);
      const viewTotal = result.views.total;
      const totalApps = Number(vendorRate?.total_apps ?? 0);
      const approvedApps = Number(vendorRate?.approved_apps ?? 0);

      result.search = {
        appearances: searchCount,
        daily: searchDaily,
        conversionRate: searchCount > 0 ? Math.round((viewTotal / searchCount) * 100) : 0,
      };

      result.peakHours = viewsHourly;

      const catTotalApps = Number(catRate?.total_apps ?? 0);
      const catApproved = Number(catRate?.approved_apps ?? 0);
      result.competition = {
        yourRate: totalApps > 0 ? Math.round((approvedApps / totalApps) * 100) : 0,
        categoryRate: catTotalApps > 0 ? Math.round((catApproved / catTotalApps) * 100) : 0,
        categoryCount: Number(catCount?.count ?? 0),
        yourRank: Number(catRank?.rank ?? 0),
        primaryCuisine,
      };

      result.funnel = {
        searchAppearances: searchCount,
        profileViews: viewTotal,
        applicationsTotal: totalApps,
        acceptances: approvedApps,
      };
    }

    res.json(result);
  } catch (e) {
    console.error('[vendor/analytics]', e);
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
  // Check if messaging is enabled
  const msgFlag = await getPlatformFlag('flag_messaging');
  if (msgFlag === '0' && !req.session.isAdmin) return res.status(403).json({ error: 'Messaging is currently disabled.' });

  try {
    const { threadKey } = req.params;
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message body required' });
    const result = await stmts.sendMessage.run(threadKey, req.session.userId, body.trim());
    const msg = { id: result.lastInsertRowid, thread_key: threadKey, sender_user_id: req.session.userId, body: body.trim(), is_read: 0, created_at: new Date().toISOString() };
    res.json({ message: msg });

    // Notify recipient of new message (fire-and-forget, non-blocking)
    try {
      const thread = await stmts.getThread.get(threadKey);
      if (thread) {
        const recipientUserId = thread.vendor_user_id === req.session.userId
          ? thread.organiser_user_id
          : thread.vendor_user_id;
        const recipientUser = await stmts.getUserById.get(recipientUserId);
        const senderUser = await stmts.getUserById.get(req.session.userId);
        if (recipientUser && senderUser) {
          const senderDisplayName = senderUser.first_name || 'Someone';
          sendNewMessageEmail(recipientUser.email, recipientUser.first_name, senderDisplayName, body.trim().substring(0, 100), null)
            .catch(err => console.error('[mailer] new message email failed:', err.message));
        }
      }
    } catch (emailErr) { console.error('[mailer] message notification lookup failed:', emailErr.message); }
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

  // Auto-analyse PLI document on upload
  let pliAnalysis = null;
  if (doc_type === 'pli' && data) {
    try {
      pliAnalysis = await analysePli(data, {
        trading_name: current?.trading_name,
        abn_entity_name: current?.abn_entity_name || current?.trading_name,
      });
      await stmts.updateVendorPliAnalysis.run({
        pli_insured_name:    pliAnalysis.insured_name,
        pli_policy_number:   pliAnalysis.policy_number,
        pli_coverage_amount: pliAnalysis.coverage_amount,
        pli_expiry:          pliAnalysis.expiry,
        pli_status:          pliAnalysis.status,
        pli_flags:           JSON.stringify(pliAnalysis.flags),
        user_id: req.session.userId,
      });
    } catch (e) {
      console.error('[pli-analyser] Error:', e.message);
      pliAnalysis = { status: 'pending', flags: ['Analysis failed — manual review required'] };
    }
  } else if (doc_type === 'pli' && !data) {
    // Document removed — clear analysis
    await stmts.updateVendorPliAnalysis.run({
      pli_insured_name: null, pli_policy_number: null,
      pli_coverage_amount: null, pli_expiry: null,
      pli_status: 'none', pli_flags: '[]', user_id: req.session.userId,
    });
  }

  res.json({ ok: true, url: data, pli_analysis: pliAnalysis });

  // Notify admin of document upload — fire-and-forget
  try {
    const docUser = await stmts.getUserById.get(req.session.userId);
    if (docUser) {
      sendDocumentUploadedAdminEmail(current?.trading_name || docUser.first_name, docUser.email, doc_type)
        .catch(err => console.error('[mailer] document uploaded admin email failed:', err.message));
    }
  } catch (emailErr) { console.error('[mailer] doc upload email lookup failed:', emailErr.message); }
});

// ── API: PLI analysis status ──────────────────────────────────────────────
app.get('/api/vendor/pli-status', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const v = await stmts.getVendorByUserId.get(req.session.userId);
  if (!v) return res.json({ status: 'none' });
  res.json({
    status:          v.pli_status || 'none',
    insured_name:    v.pli_insured_name || null,
    policy_number:   v.pli_policy_number || null,
    coverage_amount: v.pli_coverage_amount || null,
    expiry:          v.pli_expiry || null,
    flags:           JSON.parse(v.pli_flags || '[]'),
    analysed_at:     v.pli_analysed_at || null,
  });
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
  try {
    const fee = await stmts.getStallFeeById.get(req.params.id);
    if (!fee || fee.vendor_user_id !== req.session.userId) return res.status(404).json({ error: 'Not found' });
    if (fee.status !== 'unpaid') return res.status(400).json({ error: 'Fee is not unpaid' });

    const stripe = await getStripe();
    if (!stripe) {
      // No Stripe configured — mock payment (dev/local)
      await stmts.payStallFee.run(req.params.id, req.session.userId);
      return res.json({ ok: true, mock: true });
    }

    // Get or create Stripe customer
    const vendor = await stmts.getVendorByUserId.get(req.session.userId);
    let customerId = vendor?.stripe_customer_id;
    if (!customerId) {
      const user = await stmts.getUserById.get(req.session.userId);
      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        name: vendor?.trading_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || undefined,
        metadata: { user_id: String(req.session.userId), role: 'vendor' },
      });
      customerId = customer.id;
      await stmts.updateVendorStripe.run({
        stripe_customer_id: customerId,
        stripe_subscription_id: vendor?.stripe_subscription_id || null,
        user_id: req.session.userId,
      });
    }

    // Create PaymentIntent
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(fee.amount * 100), // cents
      currency: 'aud',
      customer: customerId,
      metadata: { type: 'stall_fee', fee_id: String(fee.id), vendor_user_id: String(req.session.userId), event_name: fee.event_name },
      description: `Stall fee: ${fee.event_name}`,
    });

    // Save PI id to fee row
    await stmts.updateStallFeeStripePI.run(pi.id, fee.id, req.session.userId);

    res.json({ client_secret: pi.client_secret, publishable_key: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (e) {
    console.error('[stall-fee pay]', e);
    res.status(500).json({ error: 'Payment setup failed: ' + e.message });
  }
});

// Confirm stall fee payment after Stripe card submission
app.post('/api/vendor/stall-fees/:id/confirm', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  try {
    const fee = await stmts.getStallFeeById.get(req.params.id);
    if (!fee || fee.vendor_user_id !== req.session.userId) return res.status(404).json({ error: 'Not found' });
    if (fee.status === 'paid') return res.json({ ok: true, already_paid: true });
    if (!fee.stripe_payment_intent_id) return res.status(400).json({ error: 'No payment intent found' });

    const stripe = await getStripe();
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

    const pi = await stripe.paymentIntents.retrieve(fee.stripe_payment_intent_id);
    if (pi.status === 'succeeded') {
      await stmts.payStallFee.run(fee.id, req.session.userId);

      // Notify vendor of successful payment (fire-and-forget)
      const confirmUser = await stmts.getUserById.get(req.session.userId);
      if (confirmUser) {
        sendStallFeePaidEmail(confirmUser.email, confirmUser.first_name, fee.event_name, fee.amount)
          .catch(err => console.error('[mailer] stall fee paid confirm email failed:', err.message));
      }

      return res.json({ ok: true });
    }
    res.json({ ok: false, status: pi.status });
  } catch (e) {
    console.error('[stall-fee confirm]', e);
    res.status(500).json({ error: 'Confirmation failed: ' + e.message });
  }
});

// ── API: Vendor earnings ──────────────────────────────────────────────────
app.get('/api/vendor/earnings', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const uid = req.session.userId;
  const RATE = 0.05;
  // Australian FY: 1 July – 30 June
  const now = new Date();
  const fyStartYear = now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
  const fyStart = `${fyStartYear}-07-01`;
  const fyEnd = `${fyStartYear + 1}-07-01`;
  const fyLabel = `${fyStartYear}–${String(fyStartYear + 1).slice(2)}`;

  const [summary, history, fy] = await Promise.all([
    stmts.getVendorEarningsSummary.get(uid).catch(() => null),
    stmts.getVendorEarningsHistory.all(uid).catch(() => []),
    stmts.getVendorEarningsFY.get(uid, fyStart, fyEnd).catch(() => ({ fy_total: 0, fy_events: 0 })),
  ]);

  const s = summary || { total_earned: 0, events_completed: 0, this_month: 0, this_month_events: 0, last_month: 0, last_month_events: 0, pending: 0 };
  const applyFee = (amt) => { const pf = Math.round(amt * RATE * 100) / 100; return { platform_fee: pf, net: Math.round((amt - pf) * 100) / 100 }; };

  res.json({
    summary: {
      ...s,
      total_net: applyFee(s.total_earned).net,
      this_month_net: applyFee(s.this_month).net,
      last_month_net: applyFee(s.last_month).net,
      pending_net: applyFee(s.pending).net,
    },
    history: history.map(h => ({ ...h, ...applyFee(h.amount) })),
    tax: {
      fy_label: fyLabel,
      fy_total: fy.fy_total,
      fy_net: applyFee(fy.fy_total).net,
      fy_platform_fees: applyFee(fy.fy_total).platform_fee,
      fy_events: fy.fy_events,
    },
    platform_fee_rate: RATE,
  });
});

// ── API: Vendor calendar ───────────────────────────────────────────────────
app.get('/api/vendor/calendar', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const apps = await stmts.getVendorCalendar.all(req.session.userId);
  res.json({ applications: apps });
});

// ── API: Calendar feed token (generate/retrieve subscription URL) ──────────
app.post('/api/vendor/calendar-token', requireAuth, async (req, res) => {
  try {
    if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
    const vendor = await stmts.getVendorByUserId.get(req.session.userId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    if (!vendor.plan || vendor.plan === 'free') return res.status(403).json({ error: 'Calendar sync is available on Pro and Growth plans.' });

    let token = vendor.calendar_feed_token;
    if (!token) {
      token = randomBytes(24).toString('base64url');
      await stmts.setVendorCalToken.run({ token, user_id: req.session.userId });
    }
    const host = req.headers.host || 'onpitch.com.au';
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    res.json({ token, url: `${proto}://${host}/cal/${token}.ics` });
  } catch (e) {
    console.error('[calendar-token]', e);
    res.status(500).json({ error: 'Failed to generate calendar link.' });
  }
});

// ── Public calendar feed (.ics) ────────────────────────────────────────────
app.get('/cal/:token.ics', async (req, res) => {
  const icsEsc = s => (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const toD = iso => (iso || '').replace(/-/g, '');
  const nextD = iso => {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  };
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  // Check vendor first, then organiser
  let vevents = [];
  let calName = 'Pitch Events';
  const vendorRow = await stmts.getVendorByCalToken.get(req.params.token);
  if (vendorRow) {
    calName = 'Pitch — My Events';
    const apps = await stmts.getVendorCalendar.all(vendorRow.user_id);
    const exportable = apps.filter(a => a.status === 'pending' || a.status === 'approved');
    vevents = exportable.map(a => {
      const dtStart = toD(a.date_sort);
      const dtEnd = a.date_end ? nextD(a.date_end) : nextD(a.date_sort);
      const loc = [a.suburb, a.state].filter(Boolean).join(', ');
      const st = a.status === 'approved' ? 'CONFIRMED' : 'TENTATIVE';
      return [
        'BEGIN:VEVENT',
        `UID:pitch-${a.event_id}-${vendorRow.user_id}@onpitch.com.au`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${dtStart}`,
        `DTEND;VALUE=DATE:${dtEnd}`,
        `SUMMARY:${icsEsc(a.event_name)}`,
        loc ? `LOCATION:${icsEsc(loc)}` : null,
        `DESCRIPTION:${icsEsc('Status: ' + a.status + ' | Category: ' + (a.category || 'Event'))}`,
        `STATUS:${st}`,
        'END:VEVENT'
      ].filter(Boolean).join('\r\n');
    });
  } else {
    const orgRow = await stmts.getOrganiserByCalToken.get(req.params.token);
    if (!orgRow) return res.status(404).send('Calendar not found');

    calName = 'Pitch — My Events';
    const events = await stmts.getOrgCalendar.all(orgRow.user_id);
    vevents = events.map(e => {
      const dtStart = toD(e.date_sort);
      const dtEnd = e.date_end ? nextD(e.date_end) : nextD(e.date_sort);
      const loc = [e.suburb, e.state].filter(Boolean).join(', ');
      const st = e.status === 'published' ? 'CONFIRMED' : 'TENTATIVE';
      return [
        'BEGIN:VEVENT',
        `UID:pitch-org-${e.id}-${orgRow.user_id}@onpitch.com.au`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${dtStart}`,
        `DTEND;VALUE=DATE:${dtEnd}`,
        `SUMMARY:${icsEsc(e.name)}`,
        loc ? `LOCATION:${icsEsc(loc)}` : null,
        `DESCRIPTION:${icsEsc('Category: ' + (e.category || 'Event') + (e.deadline ? ' | Deadline: ' + e.deadline : ''))}`,
        `STATUS:${st}`,
        'END:VEVENT'
      ].filter(Boolean).join('\r\n');
    });
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pitch//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calName}`,
    'X-WR-TIMEZONE:Australia/Adelaide',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ...vevents,
    'END:VCALENDAR'
  ].join('\r\n');

  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="pitch-events.ics"',
    'Cache-Control': 'no-cache, max-age=0',
  });
  res.send(ics);
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

// ── API: Vendor extended settings (phone, 2FA, visibility, defaults, invoice) ─
app.put('/api/vendor/settings/extended', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { default_apply_message, timezone, invoice_business_name, invoice_address, hide_phone, hide_abn, hide_reviews } = req.body;
  try {
    await stmts.updateVendorExtSettings.run({
      default_apply_message: default_apply_message || null,
      timezone: timezone || 'Australia/Adelaide',
      invoice_business_name: invoice_business_name || null,
      invoice_address: invoice_address || null,
      hide_phone: hide_phone ? 1 : 0,
      hide_abn: hide_abn ? 1 : 0,
      hide_reviews: hide_reviews ? 1 : 0,
      user_id: req.session.userId,
    });
    res.json({ ok: true });
  } catch (e) { console.error('[vendor ext settings]', e); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/vendor/settings/phone', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { mobile } = req.body;
  if (!mobile || mobile.length < 8) return res.status(400).json({ error: 'Valid phone number required' });
  await stmts.updateVendorMobile.run(mobile.trim(), req.session.userId);
  res.json({ ok: true });
});

app.put('/api/vendor/settings/2fa', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { enabled } = req.body;
  await stmts.setTwoFactor.run(enabled ? 1 : 0, req.session.userId);
  res.json({ ok: true, two_factor_enabled: !!enabled });
});

app.get('/api/vendor/settings/connected', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const user = await stmts.getUserById.get(req.session.userId);
  res.json({
    google: user.oauth_provider === 'google' ? { linked: true, sub: user.oauth_sub } : { linked: false },
    email_login: user.password_hash !== '__oauth__',
  });
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
  const { org_name, bio, website, abn } = req.body;
  try {
    await stmts.updateOrganiserProfileSelf.run({ org_name: org_name || null, bio: bio || null, website: website || null, abn: abn || null, user_id: req.session.userId });
    // Auto-verify ABN if provided (runs in background)
    if (abn) {
      const user = await stmts.getUserById.get(req.session.userId);
      autoVerifyAbn(abn.replace(/\s/g, ''), req.session.userId, 'organiser', {
        first_name: user?.first_name || '', last_name: user?.last_name || '',
        trading_name: org_name || '', email: user?.email || '',
      });
    }
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

  // Enforce max events per organiser
  const evLimitSetting = await getPlatformFlag('limit_events_per_org');
  const EV_LIMIT = evLimitSetting ? parseInt(evLimitSetting, 10) : 50;
  if (EV_LIMIT > 0) {
    const evCount = await stmts.countOrganiserEvents.get(req.session.userId);
    if (evCount && Number(evCount.n) >= EV_LIMIT) {
      return res.status(429).json({ error: `You've reached the maximum of ${EV_LIMIT} events. Archive or delete existing events to create new ones.` });
    }
  }

  const { name, category, date_sort, date_end, date_text, suburb, state, venue_name, description, stalls_available, stall_fee_min, stall_fee_max, deadline, cover_image, booth_size, setup_time, packdown_time, power_available, power_amps, water_available, cuisines_wanted, exclusivity, looking_for, custom_requirements, cancel_policy, payment_terms } = req.body;
  if (!name || !date_sort || !suburb) {
    return res.status(400).json({ error: 'Name, date, and suburb are required' });
  }

  // Enforce max stalls per event
  if (stalls_available) {
    const stallLimitSetting = await getPlatformFlag('limit_stalls_per_event');
    const STALL_LIMIT = stallLimitSetting ? parseInt(stallLimitSetting, 10) : 200;
    if (STALL_LIMIT > 0 && parseInt(stalls_available) > STALL_LIMIT) {
      return res.status(400).json({ error: `Maximum stalls per event is ${STALL_LIMIT}.` });
    }
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
      booth_size: booth_size || null,
      setup_time: setup_time || null,
      packdown_time: packdown_time || null,
      power_available: power_available ? 1 : 0,
      power_amps: power_amps || null,
      water_available: water_available ? 1 : 0,
      cuisines_wanted: cuisines_wanted || '[]',
      exclusivity: exclusivity ? 1 : 0,
      looking_for: looking_for || null,
      custom_requirements: custom_requirements || null,
      cancel_policy: cancel_policy || null,
      payment_terms: payment_terms || null,
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
  // Enforce max stalls per event
  if (stalls_available != null) {
    const stallLimitSetting = await getPlatformFlag('limit_stalls_per_event');
    const STALL_LIMIT = stallLimitSetting ? parseInt(stallLimitSetting, 10) : 200;
    if (STALL_LIMIT > 0 && Number(stalls_available) > STALL_LIMIT) {
      return res.status(400).json({ error: `Maximum stalls per event is ${STALL_LIMIT}.` });
    }
  }
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

// POST /api/organiser/calendar-token — generate/retrieve subscription URL
app.post('/api/organiser/calendar-token', requireAuth, async (req, res) => {
  try {
    if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
    const org = await stmts.getOrganiserByUserId.get(req.session.userId);
    if (!org) return res.status(404).json({ error: 'Organiser not found' });

    let token = org.calendar_feed_token;
    if (!token) {
      token = randomBytes(24).toString('base64url');
      await stmts.setOrganiserCalToken.run({ token, user_id: req.session.userId });
    }
    const host = req.headers.host || 'onpitch.com.au';
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    res.json({ token, url: `${proto}://${host}/cal/${token}.ics` });
  } catch (e) {
    console.error('[organiser-calendar-token]', e);
    res.status(500).json({ error: 'Failed to generate calendar link.' });
  }
});

// GET /api/organiser/analytics (extended, with optional date range)
app.get('/api/organiser/analytics', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const uid = req.session.userId;
  const fromQ = req.query.from, toQ = req.query.to;
  const hasRange = fromQ && toQ && /^\d{4}-\d{2}-\d{2}$/.test(fromQ) && /^\d{4}-\d{2}-\d{2}$/.test(toQ);
  try {
    let stats, revCollected, revOutstanding, revByEvent, avgFee, appStats, avgResp, appsByMonth, topVendors, cuisineRaw, repeatVendors, vendorQuality, eventComp, catPerf, reviewDist, reviewAvg, recentReviews;
    let velocityBuckets, avgFirstApp, attendanceStats, noShowVendors, revForecast;

    if (!hasRange) {
      // ── All-time path: use prepared statements (fast) — single batch ──
      [stats, revCollected, revOutstanding, revByEvent, avgFee, appStats, avgResp, appsByMonth, topVendors, cuisineRaw, repeatVendors, vendorQuality, eventComp, catPerf, reviewDist, reviewAvg, recentReviews, velocityBuckets, avgFirstApp, attendanceStats, noShowVendors, revForecast] = await Promise.all([
        stmts.getOrgEventStats.all(uid),
        stmts.getOrgRevenueCollected.get(uid),
        stmts.getOrgRevenueOutstanding.get(uid),
        stmts.getOrgRevenueByEvent.all(uid),
        stmts.getOrgAvgStallFee.get(uid),
        stmts.getOrgAppStats.get(uid),
        stmts.getOrgAvgResponseTime.get(uid),
        stmts.getOrgAppsByMonth.all(uid),
        stmts.getOrgTopVendors.all(uid),
        stmts.getOrgCuisineMix.all(uid),
        stmts.getOrgRepeatVendors.get(uid),
        stmts.getOrgVendorQuality.get(uid),
        stmts.getOrgEventComparison.all(uid),
        stmts.getOrgCategoryPerformance.all(uid, uid),
        stmts.getOrgReviewDistribution.all(uid),
        stmts.getOrgReviewAvg.get(uid),
        stmts.getOrgReviews.all(uid),
        stmts.getOrgAppVelocityBuckets.all(uid).catch(() => []),
        stmts.getOrgAvgFirstApp.get(uid).catch(() => ({ avg_hours: null })),
        stmts.getOrgAttendanceStats.get(uid).catch(() => ({ showed: 0, no_show: 0, unmarked: 0 })),
        stmts.getOrgNoShowVendors.all(uid).catch(() => []),
        stmts.getOrgRevenueForecast.all(uid).catch(() => []),
      ]);
    } else {
      // ── Date-filtered path: dynamic SQL with date conditions — single batch ──
      const q = (sql) => prepare(sql);
      const eD  = `AND e.date_sort >= '${fromQ}' AND e.date_sort <= '${toQ}'`;
      const eaD = `AND ea.created_at >= '${fromQ}' AND ea.created_at < date('${toQ}','+1 day')`;
      const rD  = `AND or2.created_at >= '${fromQ}' AND or2.created_at < date('${toQ}','+1 day')`;
      const ovrD = `AND created_at >= '${fromQ}' AND created_at < date('${toQ}','+1 day')`;

      [stats, revCollected, revOutstanding, revByEvent, avgFee, appStats, avgResp, appsByMonth, topVendors, cuisineRaw, repeatVendors, vendorQuality, eventComp, catPerf, reviewDist, reviewAvg, recentReviews, velocityBuckets, avgFirstApp, attendanceStats, noShowVendors, revForecast] = await Promise.all([
        // stats (event-date filtered)
        q(`SELECT e.id,e.name,e.date_sort,e.category, COUNT(ea.id) as total_apps, SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END) as approved, SUM(CASE WHEN ea.status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN ea.status='rejected' THEN 1 ELSE 0 END) as rejected FROM events e LEFT JOIN event_applications ea ON ea.event_id=e.id WHERE e.organiser_user_id=? ${eD} GROUP BY e.id ORDER BY e.date_sort DESC`).all(uid).catch(() => []),
        // revenue collected (event-date filtered)
        q(`SELECT COALESCE(SUM(sf.amount),0) as total FROM stall_fees sf JOIN events e ON sf.event_id=e.id WHERE e.organiser_user_id=? AND sf.status='paid' ${eD}`).get(uid).catch(() => ({ total: 0 })),
        // revenue outstanding
        q(`SELECT COALESCE(SUM(sf.amount),0) as total FROM stall_fees sf JOIN events e ON sf.event_id=e.id WHERE e.organiser_user_id=? AND sf.status='unpaid' ${eD}`).get(uid).catch(() => ({ total: 0 })),
        // revenue by event
        q(`SELECT e.id,e.name,e.date_sort, COALESCE(SUM(CASE WHEN sf.status='paid' THEN sf.amount ELSE 0 END),0) as collected, COALESCE(SUM(CASE WHEN sf.status='unpaid' THEN sf.amount ELSE 0 END),0) as outstanding, COUNT(sf.id) as total_invoices FROM events e LEFT JOIN stall_fees sf ON sf.event_id=e.id WHERE e.organiser_user_id=? ${eD} GROUP BY e.id HAVING total_invoices>0 ORDER BY e.date_sort DESC`).all(uid).catch(() => []),
        // avg stall fee
        q(`SELECT ROUND(AVG(sf.amount),0) as avg_fee FROM stall_fees sf JOIN events e ON sf.event_id=e.id WHERE e.organiser_user_id=? AND sf.status IN ('paid','unpaid') ${eD}`).get(uid).catch(() => ({ avg_fee: 0 })),
        // app stats (application-date filtered)
        q(`SELECT COUNT(*) as total, SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END) as approved, SUM(CASE WHEN ea.status='rejected' THEN 1 ELSE 0 END) as rejected, SUM(CASE WHEN ea.status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN ea.status='withdrawn' THEN 1 ELSE 0 END) as withdrawn FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=? ${eaD}`).get(uid).catch(() => ({ total: 0, approved: 0, rejected: 0, pending: 0, withdrawn: 0 })),
        // avg response time
        q(`SELECT ROUND(AVG((julianday(ea.approved_at)-julianday(ea.created_at))*24),1) as avg_hours FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=? AND ea.approved_at IS NOT NULL AND ea.status IN ('approved','rejected') ${eaD}`).get(uid).catch(() => ({ avg_hours: null })),
        // apps by month (application-date filtered, no hardcoded 5-month limit)
        q(`SELECT strftime('%Y-%m',ea.created_at) as month, COUNT(*) as apps FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=? ${eaD} GROUP BY strftime('%Y-%m',ea.created_at) ORDER BY month ASC`).all(uid).catch(() => []),
        // top vendors
        q(`SELECT v.trading_name,v.cuisine_tags,v.suburb,v.state, COUNT(ea.id) as times_booked, MAX(e.date_sort) as last_event_date FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN vendors v ON v.user_id=ea.vendor_user_id WHERE e.organiser_user_id=? AND ea.status='approved' ${eaD} GROUP BY ea.vendor_user_id ORDER BY times_booked DESC LIMIT 10`).all(uid).catch(() => []),
        // cuisine mix
        q(`SELECT v.cuisine_tags FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN vendors v ON v.user_id=ea.vendor_user_id WHERE e.organiser_user_id=? AND ea.status='approved' ${eaD}`).all(uid).catch(() => []),
        // repeat vendors
        q(`SELECT COUNT(*) as total_unique, SUM(CASE WHEN cnt>=2 THEN 1 ELSE 0 END) as repeat_vendors FROM (SELECT ea.vendor_user_id, COUNT(DISTINCT ea.event_id) as cnt FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=? AND ea.status='approved' ${eaD} GROUP BY ea.vendor_user_id)`).get(uid).catch(() => ({ total_unique: 0, repeat_vendors: 0 })),
        // vendor quality
        q(`SELECT ROUND(AVG(punctual),1) as avg_punctual, ROUND(AVG(presentation),1) as avg_presentation, ROUND(SUM(would_rebook)*100.0/COUNT(*),0) as rebook_rate, COUNT(*) as total_rated FROM organiser_vendor_ratings WHERE organiser_user_id=? ${ovrD}`).get(uid).catch(() => ({ avg_punctual: null, avg_presentation: null, rebook_rate: null, total_rated: 0 })),
        // event comparison (event-date filtered)
        q(`SELECT e.id,e.name,e.date_sort,e.category,e.suburb, COALESCE(e.stalls_available,0) as stalls_available, COUNT(ea.id) as total_apps, SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END) as approved, CASE WHEN COALESCE(e.stalls_available,0)>0 THEN ROUND(SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END)*100.0/e.stalls_available,0) ELSE 0 END as fill_rate, CASE WHEN COALESCE(e.stalls_available,0)>0 THEN ROUND(COUNT(ea.id)*1.0/e.stalls_available,1) ELSE 0 END as demand_ratio FROM events e LEFT JOIN event_applications ea ON ea.event_id=e.id WHERE e.organiser_user_id=? AND e.status!='deleted' ${eD} GROUP BY e.id ORDER BY fill_rate DESC,total_apps DESC`).all(uid).catch(() => []),
        // category performance
        q(`SELECT COALESCE(e.category,'Uncategorised') as category, COUNT(DISTINCT e.id) as event_count, ROUND(AVG(sub.total_apps),1) as avg_apps, ROUND(AVG(sub.fill_rate),0) as avg_fill_rate FROM events e LEFT JOIN (SELECT ea.event_id, COUNT(ea.id) as total_apps, CASE WHEN COALESCE(e2.stalls_available,0)>0 THEN SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END)*100.0/e2.stalls_available ELSE 0 END as fill_rate FROM event_applications ea JOIN events e2 ON ea.event_id=e2.id WHERE e2.organiser_user_id=? GROUP BY ea.event_id) sub ON sub.event_id=e.id WHERE e.organiser_user_id=? AND e.status!='deleted' ${eD} GROUP BY e.category ORDER BY avg_apps DESC`).all(uid, uid).catch(() => []),
        // review distribution
        q(`SELECT rating, COUNT(*) as count FROM organiser_reviews WHERE organiser_user_id=? ${ovrD.replace(/created_at/g, 'created_at')}`).all(uid).catch(() => []),
        // review avg
        q(`SELECT AVG(rating) as avg, COUNT(*) as total FROM organiser_reviews WHERE organiser_user_id=? ${ovrD.replace(/created_at/g, 'created_at')}`).get(uid).catch(() => ({ avg: null, total: 0 })),
        // recent reviews
        q(`SELECT or2.*,v.trading_name FROM organiser_reviews or2 JOIN vendors v ON v.user_id=or2.vendor_user_id WHERE or2.organiser_user_id=? ${rD} ORDER BY or2.created_at DESC`).all(uid).catch(() => []),
        // velocity + attendance + forecast (with catch fallbacks)
        stmts.getOrgAppVelocityBuckets.all(uid).catch(() => []),
        stmts.getOrgAvgFirstApp.get(uid).catch(() => ({ avg_hours: null })),
        stmts.getOrgAttendanceStats.get(uid).catch(() => ({ showed: 0, no_show: 0, unmarked: 0 })),
        stmts.getOrgNoShowVendors.all(uid).catch(() => []),
        stmts.getOrgRevenueForecast.all(uid).catch(() => []),
      ]);
    }

    // Aggregate cuisine tags
    const cuisineCounts = {};
    for (const row of (cuisineRaw || [])) {
      try { const tags = JSON.parse(row.cuisine_tags || '[]'); for (const t of tags) { const tag = t.trim(); if (tag) cuisineCounts[tag] = (cuisineCounts[tag] || 0) + 1; } } catch (_) {}
    }
    const cuisineMix = Object.entries(cuisineCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, count]) => ({ tag, count }));
    // Review distribution 1-5
    const distMap = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of (reviewDist || [])) distMap[r.rating] = r.count;
    const collected = revCollected?.total || 0;
    const outstanding = revOutstanding?.total || 0;
    const result = {
      stats,
      revenue: { collected, outstanding, avg_fee: avgFee?.avg_fee || 0, collection_rate: (collected + outstanding) > 0 ? Math.round(collected / (collected + outstanding) * 100) : 0, by_event: revByEvent, forecast: (revForecast || []).map(e => { const avgF = Math.round((e.fee_min + e.fee_max) / 2) || e.fee_min || e.fee_max; return { name: e.name, date_sort: e.date_sort, suburb: e.suburb, stalls_available: e.stalls_available, avg_fee: avgF, approved: e.approved, pending: e.pending, confirmed: e.approved * avgF, potential: e.stalls_available * avgF }; }) },
      applications: { total: appStats?.total || 0, approved: appStats?.approved || 0, rejected: appStats?.rejected || 0, pending: appStats?.pending || 0, withdrawn: appStats?.withdrawn || 0, approval_rate: (appStats?.approved + appStats?.rejected) > 0 ? Math.round(appStats.approved / (appStats.approved + appStats.rejected) * 100) : 0, avg_response_hours: avgResp?.avg_hours || null, by_month: appsByMonth, velocity_buckets: velocityBuckets || [], avg_first_app_hours: avgFirstApp?.avg_hours || null },
      vendors: { total_unique: repeatVendors?.total_unique || 0, repeat_vendors: repeatVendors?.repeat_vendors || 0, repeat_rate: (repeatVendors?.total_unique || 0) > 0 ? Math.round((repeatVendors.repeat_vendors || 0) / repeatVendors.total_unique * 100) : 0, top_vendors: topVendors, cuisine_mix: cuisineMix, quality: vendorQuality || { avg_punctual: null, avg_presentation: null, rebook_rate: null, total_rated: 0 }, attendance: attendanceStats || { showed: 0, no_show: 0, unmarked: 0 }, no_show_vendors: noShowVendors || [] },
      events_comparison: { events: eventComp, by_category: catPerf },
      reputation: { avg_rating: reviewAvg?.avg ? Math.round(reviewAvg.avg * 10) / 10 : null, total_reviews: reviewAvg?.total || 0, distribution: distMap, recent_reviews: (recentReviews || []).slice(0, 5) },
    };
    if (hasRange) result.dateRange = { from: fromQ, to: toQ };
    res.json(result);
  } catch (e) { console.error('[analytics]', e); res.status(500).json({ error: 'Failed to load analytics' }); }
});

// GET /api/organiser/vendor-ratings — ratings I've given to vendors
app.get('/api/organiser/vendor-ratings', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const ratings = await stmts.getOrgVendorRatings.all(req.session.userId);
  res.json({ ratings });
});

// GET /api/organiser/pending-ratings — completed events with unrated approved vendors
app.get('/api/organiser/pending-ratings', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  try {
    const rows = await stmts.getPendingRatingsForOrganiser.all(req.session.userId);
    // Group by event
    const eventsMap = {};
    for (const r of rows) {
      if (!eventsMap[r.event_id]) {
        eventsMap[r.event_id] = { event_id: r.event_id, event_name: r.event_name, completed_at: r.completed_at, vendors: [] };
      }
      eventsMap[r.event_id].vendors.push({
        vendor_user_id: r.vendor_user_id,
        trading_name: r.trading_name,
      });
    }
    res.json({ pending: Object.values(eventsMap) });
  } catch (e) { console.error('[pending-ratings]', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/organiser/vendor-ratings — rate a vendor
app.post('/api/organiser/vendor-ratings', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { vendor_user_id, event_id, punctual, presentation, would_rebook, notes } = req.body;
  if (!vendor_user_id) return res.status(400).json({ error: 'vendor_user_id required' });
  // Validate event has ended if event_id provided
  if (event_id) {
    const ev = stmts.getEventById.get(Number(event_id));
    if (ev) {
      const endDate = ev.date_end || ev.date_sort;
      if (endDate && new Date(endDate) > new Date()) {
        return res.status(400).json({ error: 'Cannot rate vendors before the event has ended' });
      }
    }
  }
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

// POST /api/organiser/mark-attendance — mark a vendor as showed/no-show
app.post('/api/organiser/mark-attendance', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { application_id, event_id, attended } = req.body;
  if (!application_id || event_id == null || (attended !== 0 && attended !== 1)) return res.status(400).json({ error: 'application_id, event_id, and attended (0 or 1) required' });
  // Verify event belongs to organiser and is in the past
  const ev = stmts.getEventById.get(Number(event_id));
  if (!ev || ev.organiser_user_id !== req.session.userId) return res.status(403).json({ error: 'Not your event' });
  const endDate = ev.date_end || ev.date_sort;
  if (endDate && new Date(endDate) > new Date()) return res.status(400).json({ error: 'Event has not ended yet' });
  try {
    await stmts.markAttendance.run(attended, Number(application_id), req.session.userId);
    res.json({ ok: true });
  } catch (e) { console.error('[mark-attendance]', e); res.status(500).json({ error: 'Server error' }); }
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
  const { notif_new_apps, notif_deadlines, notif_messages, notif_payments, notif_post_event } = req.body;
  await stmts.updateOrganiserSettings.run({
    notif_new_apps:   notif_new_apps  ? 1 : 0,
    notif_deadlines:  notif_deadlines ? 1 : 0,
    notif_messages:   notif_messages  ? 1 : 0,
    notif_payments:   notif_payments  ? 1 : 0,
    notif_post_event: notif_post_event !== undefined ? (notif_post_event ? 1 : 0) : 1,
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

// DELETE /api/organiser/account — permanently delete organiser account
app.delete('/api/organiser/account', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const userId = req.session.userId;
  try {
    // Delete organiser profile, events, and user record
    const events = await stmts.getOrganiserEvents.all(userId);
    for (const ev of events) {
      await stmts.deleteEvent.run(ev.id);
    }
    await stmts.deleteOrganiserByUserId.run(userId);
    await stmts.deleteUser.run(userId);
    req.session.destroy(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error('[delete-org-account]', e);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// PUT /api/organiser/settings/defaults
app.put('/api/organiser/settings/defaults', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { default_stall_fee_min, default_stall_fee_max, default_spots, default_booth_size, default_power, default_water } = req.body;
  await stmts.updateOrganiserDefaults.run({
    default_stall_fee_min: default_stall_fee_min ? parseInt(default_stall_fee_min) : null,
    default_stall_fee_max: default_stall_fee_max ? parseInt(default_stall_fee_max) : null,
    default_spots: default_spots ? parseInt(default_spots) : null,
    default_booth_size: default_booth_size || null,
    default_power: default_power ? 1 : 0,
    default_water: default_water ? 1 : 0,
    user_id: req.session.userId,
  });
  res.json({ ok: true });
});

// PUT /api/organiser/settings/timezone
app.put('/api/organiser/settings/timezone', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const valid = ['Australia/Adelaide','Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Perth','Australia/Hobart','Australia/Darwin'];
  const { timezone } = req.body;
  if (!timezone || !valid.includes(timezone)) return res.status(400).json({ error: 'Invalid timezone' });
  await stmts.updateOrganiserTimezone.run({ timezone, user_id: req.session.userId });
  res.json({ ok: true });
});

// PUT /api/organiser/settings/time-format
app.put('/api/organiser/settings/time-format', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { format } = req.body;
  if (format !== '12' && format !== '24') return res.status(400).json({ error: 'Invalid format' });
  await stmts.updateOrganiserTimeFormat.run({ time_format: format, user_id: req.session.userId });
  res.json({ ok: true });
});

// PUT /api/organiser/settings/auto-response
app.put('/api/organiser/settings/auto-response', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { template } = req.body;
  if (template && template.length > 500) return res.status(400).json({ error: 'Max 500 characters' });
  await stmts.updateOrganiserAutoResponse.run({ template: template || null, user_id: req.session.userId });
  res.json({ ok: true });
});

// PUT /api/organiser/settings/banner
app.put('/api/organiser/settings/banner', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { banner_url } = req.body;
  await stmts.updateOrganiserBanner.run(banner_url || null, req.session.userId);
  res.json({ ok: true });
});

// GET /api/organiser/export/events — CSV download
app.get('/api/organiser/export/events', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const events = await stmts.getOrganiserEvents.all(req.session.userId);
  const headers = ['Name','Category','Suburb','State','Date','Status','Stalls Available','Stall Fee Min','Stall Fee Max','Venue'];
  const rows = events.map(e => [e.name, e.category, e.suburb, e.state, e.date_sort, e.status, e.stalls_available, e.stall_fee_min, e.stall_fee_max, e.venue_name].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="pitch-events.csv"');
  res.send([headers.join(','), ...rows].join('\n'));
});

// GET /api/organiser/export/applications — CSV download
app.get('/api/organiser/export/applications', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const apps = await stmts.getAllAppsByOrganiser.all(req.session.userId);
  const headers = ['Event','Vendor','Email','Status','Cuisine','Suburb','State','Applied At'];
  const rows = apps.map(a => [a.event_name, a.trading_name, a.email, a.status, a.cuisine_tags, a.v_suburb, a.v_state, a.created_at].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="pitch-applications.csv"');
  res.send([headers.join(','), ...rows].join('\n'));
});

// GET /api/organiser/team — list team members
app.get('/api/organiser/team', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const members = await stmts.getTeamMembers.all(req.session.userId);
  res.json({ members });
});

// POST /api/organiser/team/invite
app.post('/api/organiser/team/invite', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (role && !['editor','viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  try {
    await stmts.inviteTeamMember.run(req.session.userId, email.trim().toLowerCase(), role || 'editor');
    res.json({ ok: true });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Already invited' });
    console.error('[team-invite]', e); res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/organiser/team/:id
app.delete('/api/organiser/team/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'organiser') return res.status(403).json({ error: 'Organisers only' });
  await stmts.removeTeamMember.run(parseInt(req.params.id), req.session.userId);
  res.json({ ok: true });
});

// GET /api/vendor/pending-reviews — completed events where vendor hasn't reviewed organiser
app.get('/api/vendor/pending-reviews', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  try {
    const rows = await stmts.getPendingReviewsForVendor.all(req.session.userId);
    res.json({ pending: rows.map(r => ({
      event_id: r.event_id,
      event_name: r.event_name,
      completed_at: r.completed_at,
      organiser_user_id: r.organiser_user_id,
      organiser_name: r.org_name,
    })) });
  } catch (e) { console.error('[pending-reviews]', e); res.status(500).json({ error: 'Server error' }); }
});

// Vendor leaves a review of an organiser
app.post('/api/vendor/organiser-review', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendors only' });
  const { organiser_user_id, event_id, event_name, rating, body } = req.body;
  if (!organiser_user_id || !rating) return res.status(400).json({ error: 'organiser_user_id and rating required' });
  // Validate event has ended if event_id provided
  if (event_id) {
    const ev = stmts.getEventById.get(Number(event_id));
    if (ev) {
      const endDate = ev.date_end || ev.date_sort;
      if (endDate && new Date(endDate) > new Date()) {
        return res.status(400).json({ error: 'Cannot review before the event has ended' });
      }
    }
  }
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
      // Email: notify vendor of approval
      try {
        const approvedVendorUser = await stmts.getUserById.get(app.vendor_user_id);
        const approvedEvent = await stmts.getEventById.get(app.event_id);
        if (approvedVendorUser && approvedEvent) {
          sendApplicationApprovedEmail(approvedVendorUser.email, approvedVendorUser.first_name, approvedEvent.name, approvedEvent.date_text || '', approvedEvent.suburb || '', '', '')
            .catch(err => console.error('[mailer] application approved email failed:', err.message));
        }
      } catch (emailErr) { console.error('[mailer] approval email lookup failed:', emailErr.message); }
    }
  } else if (status === 'rejected') {
    const rejApp = await stmts.getApplicationById.get(req.params.id);
    if (rejApp) {
      try {
        const rejVendorUser = await stmts.getUserById.get(rejApp.vendor_user_id);
        const rejEvent = await stmts.getEventById.get(rejApp.event_id);
        if (rejVendorUser && rejEvent) {
          sendApplicationRejectedEmail(rejVendorUser.email, rejVendorUser.first_name, rejEvent.name, rejEvent.date_text || '', '')
            .catch(err => console.error('[mailer] application rejected email failed:', err.message));
        }
      } catch (emailErr) { console.error('[mailer] rejection email lookup failed:', emailErr.message); }
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
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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

// Admin force-verify entire user account (email + ABN + PLI status)
app.post('/api/admin/users/:id/force-verify', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await stmts.getUserById.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 1. Mark email + phone as verified + set force_verified flag
    await stmts.setEmailVerified.run(userId);
    await prepare(`UPDATE users SET phone_verified=1, force_verified=1 WHERE id=?`).run(userId);

    // 2. If vendor — force ABN verified + set PLI status to verified
    if (user.role === 'vendor') {
      const vendor = await stmts.getVendorByUserId.get(userId);
      if (vendor) {
        // If no ABN exists, set a placeholder so the badge doesn't show "Incomplete"
        if (!vendor.abn) {
          await prepare(`UPDATE vendors SET abn='00000000000' WHERE user_id=?`).run(userId);
        }
        await stmts.updateVendorAbnVerification.run({
          abn_verified: 1,
          abn_entity_name: vendor.abn_entity_name || vendor.trading_name || 'Force verified',
          abn_match: 'match',
          user_id: userId,
        });
        // Mark PLI as verified
        await stmts.updateVendorPliAnalysis.run({
          pli_insured_name: vendor.pli_insured_name || vendor.trading_name || '',
          pli_policy_number: vendor.pli_policy_number || 'FORCE-VERIFIED',
          pli_coverage_amount: vendor.pli_coverage_amount || '',
          pli_expiry: vendor.pli_expiry || '',
          pli_status: 'verified',
          pli_flags: '',
          user_id: userId,
        });
      }
    }

    // 3. If organiser — force ABN verified
    if (user.role === 'organiser') {
      const org = await stmts.getOrganiserByUserId.get(userId);
      if (org) {
        if (!org.abn) {
          await prepare(`UPDATE organisers SET abn='00000000000' WHERE user_id=?`).run(userId);
        }
        await stmts.updateOrganiserAbnVerification.run({
          abn_verified: 1,
          abn_entity_name: org.abn_entity_name || org.org_name || 'Force verified',
          abn_match: 'match',
          user_id: userId,
        });
      }
    }

    // 4. Activate the user if they're still pending
    if (user.status === 'pending') {
      await prepare(`UPDATE users SET status='active' WHERE id=?`).run(userId);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[force-verify] Error:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
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
let _analyticsCache = null;
let _analyticsCacheTs = 0;
const ANALYTICS_TTL = 60000; // 60s cache

async function _computeAnalyticsAllTime() {
  const cached = _analyticsCache;
  if (cached && Date.now() - _analyticsCacheTs < ANALYTICS_TTL) return cached;

    const [
      vendors, organisers, events, appCounts, catCounts, signupsByDay,
      totalRev, revThisMonth, revLastMonth, avgTx, revByMonth, planBreakdown,
      signups30d,
      gvThis, gvLast, goThis, goLast, geThis, geLast, gaThis, gaLast,
      fillRates, avgFee, avgApps,
      evtSuburb, vndSuburb,
      oReports, oFlags, avgResolve, msgTotal, msg7d, docComp,
      vApproved, vPaid, oWithEvent, oWithApps,
      topVendors,
    ] = await Promise.all([
      stmts.countVendors.get(), stmts.countOrganisers.get(), stmts.countEvents.get(),
      stmts.countApplications.all(), stmts.countEventsByCategory.all(), stmts.signups7dByDay.all(),
      stmts.totalRevenue.get(), stmts.revenueThisMonth.get(), stmts.revenueLastMonth.get(),
      stmts.avgTransaction.get(), stmts.revenueByMonth.all(), stmts.vendorsByPlan.all(),
      stmts.signups30dByDay.all(),
      stmts.growthVendorsThisMonth.get(), stmts.growthVendorsLastMonth.get(),
      stmts.growthOrgsThisMonth.get(), stmts.growthOrgsLastMonth.get(),
      stmts.growthEventsThisMonth.get(), stmts.growthEventsLastMonth.get(),
      stmts.growthAppsThisMonth.get(), stmts.growthAppsLastMonth.get(),
      stmts.eventFillRates.all(), stmts.avgStallFee.get(), stmts.avgAppsPerEvent.get(),
      stmts.eventsBySuburb.all(), stmts.vendorsBySuburb.all(),
      stmts.openReports.get(), stmts.openFlags.get(), stmts.avgResolutionTime.get(),
      stmts.messagesTotal.get(), stmts.messages7d.get(), stmts.docCompliance.get(),
      stmts.vendorsWithApprovedApp.get(), stmts.vendorsPaidPlan.get(),
      stmts.organisersWithEvent.get(), stmts.organisersWithApps.get(),
      stmts.topVendorsByApps.all(),
    ]);
    // ── New panels: verification, retention, reviews, events lifecycle, response time ──
    const [
      verTrust, subRetention, revQuality, evtLifecycle, appResponse,
    ] = await Promise.all([
      // 1. Verification & Trust
      (async () => {
        const vTotal = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active'`).get();
        const vFullyVerified = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active' AND v.abn_verified=1 AND v.pli_status='verified' AND (v.food_safety_url IS NOT NULL AND v.food_safety_url!='')`).get();
        const vPartial = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active' AND (v.abn_verified=1 OR v.pli_status='verified' OR (v.food_safety_url IS NOT NULL AND v.food_safety_url!='')) AND NOT (v.abn_verified=1 AND v.pli_status='verified' AND (v.food_safety_url IS NOT NULL AND v.food_safety_url!=''))`).get();
        const oTotal = prepare(`SELECT COUNT(*) as n FROM organisers o JOIN users u ON o.user_id=u.id WHERE u.role='organiser' AND u.status='active'`).get();
        const oVerified = prepare(`SELECT COUNT(*) as n FROM organisers o JOIN users u ON o.user_id=u.id WHERE u.role='organiser' AND u.status='active' AND o.abn_verified=1`).get();
        const forceCount = prepare(`SELECT COUNT(*) as n FROM users WHERE force_verified=1`).get();
        return {
          vendorTotal: vTotal.n, fullyVerified: vFullyVerified.n, partiallyVerified: vPartial.n,
          unverified: vTotal.n - vFullyVerified.n - vPartial.n,
          orgTotal: oTotal.n, orgVerified: oVerified.n,
          forceVerified: forceCount.n,
        };
      })(),
      // 2. Subscription & Retention
      (async () => {
        const active = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active' AND v.paused=0`).get();
        const paused = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active' AND v.paused=1`).get();
        const subBreakdown = prepare(`SELECT subscription_status as status, COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' GROUP BY subscription_status`).all();
        const trialExpiring = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND v.trial_ends_at IS NOT NULL AND v.trial_ends_at > datetime('now') AND v.trial_ends_at <= datetime('now','+7 days')`).get();
        const trialList = prepare(`SELECT v.trading_name, v.trial_ends_at FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND v.trial_ends_at IS NOT NULL AND v.trial_ends_at > datetime('now') AND v.trial_ends_at <= datetime('now','+7 days') ORDER BY v.trial_ends_at ASC LIMIT 5`).all();
        return {
          active: active.n, paused: paused.n,
          subscriptionBreakdown: subBreakdown,
          trialExpiring: trialExpiring.n, trialList,
        };
      })(),
      // 3. Reviews & Quality
      (async () => {
        const vAvg = prepare(`SELECT ROUND(AVG(rating),1) as avg, COUNT(*) as total FROM vendor_reviews`).get();
        const oAvg = prepare(`SELECT ROUND(AVG(rating),1) as avg, COUNT(*) as total FROM organiser_reviews`).get();
        const vDist = prepare(`SELECT rating, COUNT(*) as count FROM vendor_reviews GROUP BY rating ORDER BY rating DESC`).all();
        const vendorsWithReviews = prepare(`SELECT COUNT(DISTINCT vendor_user_id) as n FROM vendor_reviews`).get();
        const vendorsTotal = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor'`).get();
        const rebookRate = prepare(`SELECT ROUND(SUM(would_rebook)*100.0/NULLIF(COUNT(*),0),0) as rate, COUNT(*) as total FROM organiser_vendor_ratings`).get();
        return {
          vendorAvg: vAvg.avg || 0, vendorTotal: vAvg.total || 0,
          orgAvg: oAvg.avg || 0, orgTotal: oAvg.total || 0,
          ratingDistribution: vDist,
          vendorsWithReviews: vendorsWithReviews.n, vendorsNoReviews: vendorsTotal.n - vendorsWithReviews.n,
          rebookRate: rebookRate.rate || 0, totalRatings: rebookRate.total || 0,
        };
      })(),
      // 4. Event Lifecycle
      (async () => {
        const totalEvts = prepare(`SELECT COUNT(*) as n FROM events WHERE status IN ('published','archived')`).get();
        const cancelled = prepare(`SELECT COUNT(*) as n FROM events WHERE cancelled_at IS NOT NULL`).get();
        const recurring = prepare(`SELECT COUNT(*) as n FROM events WHERE is_recurring=1 AND status='published'`).get();
        const oneOff = prepare(`SELECT COUNT(*) as n FROM events WHERE (is_recurring=0 OR is_recurring IS NULL) AND status='published'`).get();
        const upcoming = prepare(`SELECT COUNT(*) as n FROM events WHERE status='published' AND deadline IS NOT NULL AND deadline >= date('now') AND deadline <= date('now','+7 days')`).get();
        const upcomingList = prepare(`SELECT name, deadline FROM events WHERE status='published' AND deadline IS NOT NULL AND deadline >= date('now') AND deadline <= date('now','+7 days') ORDER BY deadline ASC LIMIT 5`).all();
        const avgLeadTime = prepare(`SELECT ROUND(AVG(julianday(date_sort)-julianday(created_at)),0) as n FROM events WHERE status='published' AND date_sort IS NOT NULL`).get();
        return {
          total: totalEvts.n, cancelled: cancelled.n,
          cancelRate: totalEvts.n > 0 ? Math.round((cancelled.n / totalEvts.n) * 100) : 0,
          recurring: recurring.n, oneOff: oneOff.n,
          upcomingDeadlines: upcoming.n, upcomingList,
          avgLeadTimeDays: avgLeadTime.n || 0,
        };
      })(),
      // 5. Application Response Time
      (async () => {
        const total = prepare(`SELECT COUNT(*) as n FROM event_applications`).get();
        const responded = prepare(`SELECT COUNT(*) as n FROM event_applications WHERE status IN ('approved','rejected')`).get();
        const pending = prepare(`SELECT COUNT(*) as n FROM event_applications WHERE status='pending'`).get();
        // Best responding organisers (most approved apps)
        const fastest = prepare(`SELECT o.org_name, COUNT(CASE WHEN ea.status='approved' THEN 1 END) as approved, COUNT(ea.id) as total FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN organisers o ON o.user_id=e.organiser_user_id GROUP BY e.organiser_user_id HAVING COUNT(ea.id)>0 ORDER BY approved DESC LIMIT 3`).all();
        // Least responsive (most pending)
        const slowest = prepare(`SELECT o.org_name, COUNT(CASE WHEN ea.status='pending' THEN 1 END) as pending_count, COUNT(ea.id) as total FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN organisers o ON o.user_id=e.organiser_user_id GROUP BY e.organiser_user_id HAVING COUNT(CASE WHEN ea.status='pending' THEN 1 END)>0 ORDER BY pending_count DESC LIMIT 3`).all();
        return {
          total: total.n, responded: responded.n, pending: pending.n,
          responseRate: total.n > 0 ? Math.round((responded.n / total.n) * 100) : 0,
          mostResponsive: fastest, leastResponsive: slowest,
        };
      })(),
    ]);

    const result = {
      dateRange: null,
      totalVendors: vendors.n, totalOrganisers: organisers.n, totalEvents: events.n,
      applicationsByStatus: appCounts, eventsByCategory: catCounts, signups7dByDay: signupsByDay,
      revenue: { total: totalRev.n, thisMonth: revThisMonth.n, lastMonth: revLastMonth.n, avgTransaction: avgTx.n, byMonth: revByMonth },
      vendorsByPlan: planBreakdown, signups30dByDay: signups30d,
      growth: { vendorsThis: gvThis.n, vendorsLast: gvLast.n, orgsThis: goThis.n, orgsLast: goLast.n, eventsThis: geThis.n, eventsLast: geLast.n, appsThis: gaThis.n, appsLast: gaLast.n },
      eventFillRates: fillRates, avgStallFee: avgFee.n, avgAppsPerEvent: avgApps.n,
      eventsBySuburb: evtSuburb, vendorsBySuburb: vndSuburb,
      moderation: { openReports: oReports.n, openFlags: oFlags.n, avgResolutionHours: avgResolve.n },
      messaging: { total: msgTotal.n, last7d: msg7d.n },
      docCompliance: docComp,
      funnels: { vendorsApproved: vApproved.n, vendorsPaid: vPaid.n, orgsWithEvent: oWithEvent.n, orgsWithApps: oWithApps.n },
      topVendors,
      verification: verTrust, subscription: subRetention, reviews: revQuality, eventLifecycle: evtLifecycle, appResponseTime: appResponse,
    };
    _analyticsCache = result;
    _analyticsCacheTs = Date.now();
    return result;
}

app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  const from = req.query.from || null;
  const to   = req.query.to   || null;
  const hasRange = !!(from && to);

  if (!hasRange) {
    try {
      const data = await _computeAnalyticsAllTime();
      return res.json(data);
    } catch (e) {
      console.error('[analytics]', e);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // ── Date-filtered path — dynamic queries ──
  const dq = (sql, args) => prepare(sql).get(...(args||[]));
  const dqAll = (sql, args) => prepare(sql).all(...(args||[]));
  const D = `AND created_at >= ? AND created_at < date(?, '+1 day')`;
  const uD = `AND u.created_at >= ? AND u.created_at < date(?, '+1 day')`;
  const eD = `AND e.created_at >= ? AND e.created_at < date(?, '+1 day')`;
  const eaD = `AND ea.created_at >= ? AND ea.created_at < date(?, '+1 day')`;
  const dp = [from, to];

  const [
    vendors, organisers, events, appCounts, catCounts, signupsByDay,
    totalRev, avgTx, revByMonth, planBreakdown, signups30d,
    fillRates, avgFee, avgApps,
    evtSuburb, vndSuburb,
    oReports, oFlags, avgResolve, msgTotal, msg7d, docComp,
    vApproved, vPaid, oWithEvent, oWithApps, topVendors,
  ] = await Promise.all([
    dq(`SELECT COUNT(*) as n FROM users WHERE role='vendor' ${D}`, dp),
    dq(`SELECT COUNT(*) as n FROM users WHERE role='organiser' ${D}`, dp),
    dq(`SELECT COUNT(*) as n FROM events WHERE status='published' ${D}`, dp),
    dqAll(`SELECT status, COUNT(*) as n FROM event_applications WHERE 1=1 ${D} GROUP BY status`, dp),
    dqAll(`SELECT COALESCE(category,'Other') as category, COUNT(*) as n FROM events WHERE status='published' ${D} GROUP BY category ORDER BY n DESC`, dp),
    dqAll(`SELECT date(created_at) as day, COUNT(*) as n FROM users WHERE created_at >= ? AND created_at < date(?, '+1 day') GROUP BY date(created_at) ORDER BY day ASC`, dp),
    dq(`SELECT COALESCE(SUM(amount),0) as n FROM payments WHERE status='paid' ${D}`, dp),
    dq(`SELECT COALESCE(ROUND(AVG(amount),2),0) as n FROM payments WHERE status='paid' ${D}`, dp),
    dqAll(`SELECT strftime('%Y-%m',created_at) as month, COALESCE(SUM(amount),0) as total FROM payments WHERE status='paid' ${D} GROUP BY strftime('%Y-%m',created_at) ORDER BY month ASC`, dp),
    dqAll(`SELECT COALESCE(v.plan,'free') as plan, COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' ${uD} GROUP BY v.plan ORDER BY CASE COALESCE(v.plan,'free') WHEN 'growth' THEN 1 WHEN 'pro' THEN 2 WHEN 'basic' THEN 3 ELSE 4 END`, dp),
    dqAll(`SELECT date(created_at) as day, role, COUNT(*) as n FROM users WHERE created_at >= ? AND created_at < date(?, '+1 day') GROUP BY date(created_at), role ORDER BY day ASC`, dp),
    dqAll(`SELECT e.id, e.name, e.date_sort, COALESCE(e.stalls_available,0) as stalls_available, COUNT(CASE WHEN ea.status='approved' THEN 1 END) as approved_count, COUNT(ea.id) as total_apps FROM events e LEFT JOIN event_applications ea ON ea.event_id=e.id WHERE e.status='published' ${eD} GROUP BY e.id ORDER BY CASE WHEN e.stalls_available > 0 THEN ROUND(COUNT(CASE WHEN ea.status='approved' THEN 1 END)*100.0/e.stalls_available,0) ELSE 0 END DESC LIMIT 10`, dp),
    dq(`SELECT ROUND(AVG((COALESCE(stall_fee_min,0)+COALESCE(stall_fee_max,0))/2.0),0) as n FROM events WHERE status='published' AND (stall_fee_min>0 OR stall_fee_max>0) ${D}`, dp),
    dq(`SELECT ROUND(CAST(total_apps AS REAL)/CASE WHEN total_events=0 THEN 1 ELSE total_events END,1) as n FROM (SELECT COUNT(ea.id) as total_apps, COUNT(DISTINCT e.id) as total_events FROM events e LEFT JOIN event_applications ea ON ea.event_id=e.id WHERE e.status='published' ${eD})`, dp),
    dqAll(`SELECT COALESCE(suburb,'Unknown') as suburb, COUNT(*) as n FROM events WHERE status='published' ${D} GROUP BY suburb ORDER BY n DESC LIMIT 10`, dp),
    dqAll(`SELECT COALESCE(v.suburb,'Unknown') as suburb, COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active' ${uD} GROUP BY v.suburb ORDER BY n DESC LIMIT 10`, dp),
    dq(`SELECT COUNT(*) as n FROM reports WHERE status='open' ${D}`, dp),
    dq(`SELECT COUNT(*) as n FROM content_flags WHERE status='pending' ${D}`, dp),
    dq(`SELECT ROUND(AVG((julianday(resolved_at)-julianday(created_at))*24),1) as n FROM reports WHERE resolved_at IS NOT NULL ${D}`, dp),
    dq(`SELECT COUNT(*) as n FROM messages WHERE 1=1 ${D}`, dp),
    dq(`SELECT COUNT(*) as n FROM messages WHERE 1=1 ${D}`, dp),
    dqAll(`SELECT COUNT(*) as total, SUM(CASE WHEN food_safety_url IS NOT NULL AND food_safety_url!='' THEN 1 ELSE 0 END) as has_food_safety, SUM(CASE WHEN pli_url IS NOT NULL AND pli_url!='' THEN 1 ELSE 0 END) as has_pli, SUM(CASE WHEN council_url IS NOT NULL AND council_url!='' THEN 1 ELSE 0 END) as has_council FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.status='active' AND u.role='vendor' ${uD}`, dp).then(r => r[0] || { total:0, has_food_safety:0, has_pli:0, has_council:0 }),
    dq(`SELECT COUNT(DISTINCT vendor_user_id) as n FROM event_applications ea WHERE ea.status='approved' ${eaD}`, dp),
    dq(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND v.plan IN ('pro','growth') ${uD}`, dp),
    dq(`SELECT COUNT(DISTINCT organiser_user_id) as n FROM events WHERE status='published' AND organiser_user_id IS NOT NULL ${D}`, dp),
    dq(`SELECT COUNT(DISTINCT e.organiser_user_id) as n FROM events e JOIN event_applications ea ON ea.event_id=e.id WHERE e.status='published' ${eD}`, dp),
    dqAll(`SELECT v.trading_name, COUNT(ea.id) as total_apps, SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END) as approved FROM event_applications ea JOIN vendors v ON v.user_id=ea.vendor_user_id WHERE 1=1 ${eaD} GROUP BY ea.vendor_user_id ORDER BY total_apps DESC LIMIT 5`, dp),
  ]);
  // New panels (not date-filtered — always show current state)
  const [verTrust, subRetention, revQuality, evtLifecycle, appResponse] = await Promise.all([
    (async () => {
      const vTotal = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active'`).get();
      const vFull = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active' AND v.abn_verified=1 AND v.pli_status='verified' AND (v.food_safety_url IS NOT NULL AND v.food_safety_url!='')`).get();
      const vPart = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active' AND (v.abn_verified=1 OR v.pli_status='verified' OR (v.food_safety_url IS NOT NULL AND v.food_safety_url!='')) AND NOT (v.abn_verified=1 AND v.pli_status='verified' AND (v.food_safety_url IS NOT NULL AND v.food_safety_url!=''))`).get();
      const oT = prepare(`SELECT COUNT(*) as n FROM organisers o JOIN users u ON o.user_id=u.id WHERE u.role='organiser' AND u.status='active'`).get();
      const oV = prepare(`SELECT COUNT(*) as n FROM organisers o JOIN users u ON o.user_id=u.id WHERE u.role='organiser' AND u.status='active' AND o.abn_verified=1`).get();
      const fc = prepare(`SELECT COUNT(*) as n FROM users WHERE force_verified=1`).get();
      return { vendorTotal: vTotal.n, fullyVerified: vFull.n, partiallyVerified: vPart.n, unverified: vTotal.n - vFull.n - vPart.n, orgTotal: oT.n, orgVerified: oV.n, forceVerified: fc.n };
    })(),
    (async () => {
      const active = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active' AND v.paused=0`).get();
      const paused = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active' AND v.paused=1`).get();
      const subB = prepare(`SELECT subscription_status as status, COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' GROUP BY subscription_status`).all();
      const trExp = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND v.trial_ends_at IS NOT NULL AND v.trial_ends_at > datetime('now') AND v.trial_ends_at <= datetime('now','+7 days')`).get();
      const trList = prepare(`SELECT v.trading_name, v.trial_ends_at FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND v.trial_ends_at IS NOT NULL AND v.trial_ends_at > datetime('now') AND v.trial_ends_at <= datetime('now','+7 days') ORDER BY v.trial_ends_at ASC LIMIT 5`).all();
      return { active: active.n, paused: paused.n, subscriptionBreakdown: subB, trialExpiring: trExp.n, trialList: trList };
    })(),
    (async () => {
      const vA = prepare(`SELECT ROUND(AVG(rating),1) as avg, COUNT(*) as total FROM vendor_reviews`).get();
      const oA = prepare(`SELECT ROUND(AVG(rating),1) as avg, COUNT(*) as total FROM organiser_reviews`).get();
      const vD = prepare(`SELECT rating, COUNT(*) as count FROM vendor_reviews GROUP BY rating ORDER BY rating DESC`).all();
      const vWR = prepare(`SELECT COUNT(DISTINCT vendor_user_id) as n FROM vendor_reviews`).get();
      const vT = prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor'`).get();
      const rb = prepare(`SELECT ROUND(SUM(would_rebook)*100.0/NULLIF(COUNT(*),0),0) as rate, COUNT(*) as total FROM organiser_vendor_ratings`).get();
      return { vendorAvg: vA.avg||0, vendorTotal: vA.total||0, orgAvg: oA.avg||0, orgTotal: oA.total||0, ratingDistribution: vD, vendorsWithReviews: vWR.n, vendorsNoReviews: vT.n-vWR.n, rebookRate: rb.rate||0, totalRatings: rb.total||0 };
    })(),
    (async () => {
      const tE = prepare(`SELECT COUNT(*) as n FROM events WHERE status IN ('published','archived')`).get();
      const cE = prepare(`SELECT COUNT(*) as n FROM events WHERE cancelled_at IS NOT NULL`).get();
      const rec = prepare(`SELECT COUNT(*) as n FROM events WHERE is_recurring=1 AND status='published'`).get();
      const oo = prepare(`SELECT COUNT(*) as n FROM events WHERE (is_recurring=0 OR is_recurring IS NULL) AND status='published'`).get();
      const ud = prepare(`SELECT COUNT(*) as n FROM events WHERE status='published' AND deadline IS NOT NULL AND deadline >= date('now') AND deadline <= date('now','+7 days')`).get();
      const ul = prepare(`SELECT name, deadline FROM events WHERE status='published' AND deadline IS NOT NULL AND deadline >= date('now') AND deadline <= date('now','+7 days') ORDER BY deadline ASC LIMIT 5`).all();
      const lt = prepare(`SELECT ROUND(AVG(julianday(date_sort)-julianday(created_at)),0) as n FROM events WHERE status='published' AND date_sort IS NOT NULL`).get();
      return { total: tE.n, cancelled: cE.n, cancelRate: tE.n>0?Math.round((cE.n/tE.n)*100):0, recurring: rec.n, oneOff: oo.n, upcomingDeadlines: ud.n, upcomingList: ul, avgLeadTimeDays: lt.n||0 };
    })(),
    (async () => {
      const t = prepare(`SELECT COUNT(*) as n FROM event_applications`).get();
      const r = prepare(`SELECT COUNT(*) as n FROM event_applications WHERE status IN ('approved','rejected')`).get();
      const p = prepare(`SELECT COUNT(*) as n FROM event_applications WHERE status='pending'`).get();
      const f = prepare(`SELECT o.org_name, COUNT(CASE WHEN ea.status='approved' THEN 1 END) as approved, COUNT(ea.id) as total FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN organisers o ON o.user_id=e.organiser_user_id GROUP BY e.organiser_user_id HAVING COUNT(ea.id)>0 ORDER BY approved DESC LIMIT 3`).all();
      const s = prepare(`SELECT o.org_name, COUNT(CASE WHEN ea.status='pending' THEN 1 END) as pending_count, COUNT(ea.id) as total FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN organisers o ON o.user_id=e.organiser_user_id GROUP BY e.organiser_user_id HAVING COUNT(CASE WHEN ea.status='pending' THEN 1 END)>0 ORDER BY pending_count DESC LIMIT 3`).all();
      return { total: t.n, responded: r.n, pending: p.n, responseRate: t.n>0?Math.round((r.n/t.n)*100):0, mostResponsive: f, leastResponsive: s };
    })(),
  ]);

  res.json({
    dateRange: { from, to },
    totalVendors: vendors.n, totalOrganisers: organisers.n, totalEvents: events.n,
    applicationsByStatus: appCounts, eventsByCategory: catCounts, signups7dByDay: signupsByDay,
    revenue: { total: totalRev.n, thisMonth: 0, lastMonth: 0, avgTransaction: avgTx.n, byMonth: revByMonth },
    vendorsByPlan: planBreakdown, signups30dByDay: signups30d,
    growth: { vendorsThis: 0, vendorsLast: 0, orgsThis: 0, orgsLast: 0, eventsThis: 0, eventsLast: 0, appsThis: 0, appsLast: 0 },
    eventFillRates: fillRates, avgStallFee: avgFee.n, avgAppsPerEvent: avgApps.n,
    eventsBySuburb: evtSuburb, vendorsBySuburb: vndSuburb,
    moderation: { openReports: oReports.n, openFlags: oFlags.n, avgResolutionHours: avgResolve.n },
    messaging: { total: msgTotal.n, last7d: msg7d.n },
    docCompliance: docComp,
    funnels: { vendorsApproved: vApproved.n, vendorsPaid: vPaid.n, orgsWithEvent: oWithEvent.n, orgsWithApps: oWithApps.n },
    topVendors,
    verification: verTrust, subscription: subRetention, reviews: revQuality, eventLifecycle: evtLifecycle, appResponseTime: appResponse,
  });
});

// ── Admin — platform settings ─────────────────────────────────────────────
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const rows = await stmts.getAllSettings.all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (e) { console.error('[settings GET]', e); res.status(500).json({ error: 'Failed to load settings' }); }
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const allowed = [
      'flag_pro_apps','flag_messaging','flag_reviews','flag_org_signups','flag_maintenance',
      'flag_auto_approve','flag_manual_org_review',
      'banner_message','banner_show',
      'limit_free_apps','limit_pro_apps','limit_events_per_org','limit_stalls_per_event',
    ];
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) await stmts.upsertSetting.run(key, String(value));
    }
    // Clear public caches so banner changes take effect immediately
    _apiCache.clear();
    res.json({ ok: true });
  } catch (e) { console.error('[settings PUT]', e); res.status(500).json({ error: 'Failed to save settings' }); }
});

app.post('/api/admin/settings/purge-drafts', requireAdmin, async (req, res) => {
  try {
    const count = await stmts.countDraftEvents.get();
    const result = await stmts.purgeDraftEvents.run();
    _apiCache.clear();
    res.json({ ok: true, deleted: count.n });
  } catch (e) { console.error('[purge-drafts]', e); res.status(500).json({ error: 'Failed to purge drafts' }); }
});

app.post('/api/admin/settings/reset-approvals', requireAdmin, async (req, res) => {
  try {
    const count = await stmts.countPendingUsers.get();
    const result = await stmts.resetPendingApprovals.run();
    _apiCache.clear();
    res.json({ ok: true, approved: count.n });
  } catch (e) { console.error('[reset-approvals]', e); res.status(500).json({ error: 'Failed to reset approvals' }); }
});

// ── Public banner endpoint (for all pages) ────────────────────────────────
app.get('/api/banner', async (req, res) => {
  try {
    const show = await getPlatformFlag('banner_show');
    if (show !== '1') return res.json({ show: false });
    const msg = await getPlatformFlag('banner_message');
    res.json({ show: true, message: msg || '' });
  } catch { res.json({ show: false }); }
});

// ── Public — platform limits (for frontend validation) ───────────────────
app.get('/api/platform-limits', async (req, res) => {
  try {
    const [stallsRow, eventsRow] = await Promise.all([
      stmts.getSetting.get('limit_stalls_per_event'),
      stmts.getSetting.get('limit_events_per_org'),
    ]);
    res.json({
      limit_stalls_per_event: stallsRow ? parseInt(stallsRow.value, 10) || 0 : 0,
      limit_events_per_org: eventsRow ? parseInt(eventsRow.value, 10) || 0 : 0,
    });
  } catch { res.json({ limit_stalls_per_event: 0, limit_events_per_org: 0 }); }
});

// ── Admin — featured ──────────────────────────────────────────────────────
app.get('/api/admin/featured', requireAdmin, async (req, res) => {
  const [events, vendors] = await Promise.all([
    stmts.adminFeaturedEvents.all(),
    stmts.featuredVendors.all(),
  ]);
  res.json({ events, vendors });
});

app.get('/api/admin/featured/recommendations', requireAdmin, async (req, res) => {
  const { type, sort } = req.query; // type=vendor|event, sort=plan|events|apps|newest
  try {
    if (type === 'event') {
      const events = await stmts.recommendedEvents.all();
      // Re-sort based on criteria
      if (sort === 'apps') events.sort((a,b) => b.app_count - a.app_count);
      else if (sort === 'organiser') events.sort((a,b) => b.org_event_count - a.org_event_count);
      else if (sort === 'newest') events.sort((a,b) => (a.date_sort||'').localeCompare(b.date_sort||''));
      res.json({ recommendations: events });
    } else {
      const vendors = await stmts.recommendedVendors.all();
      if (sort === 'events') vendors.sort((a,b) => b.event_count - a.event_count);
      else if (sort === 'plan') {} // already sorted by plan
      else if (sort === 'name') vendors.sort((a,b) => a.trading_name.localeCompare(b.trading_name));
      res.json({ recommendations: vendors });
    }
  } catch(e) { console.error('[recommendations]', e); res.json({ recommendations: [] }); }
});

app.patch('/api/admin/events/:id/featured', requireAdmin, async (req, res) => {
  const val = req.body.featured ? 1 : 0;
  await stmts.setEventFeatured.run(val, val, req.params.id);
  _apiCache.delete('featured-events');
  res.json({ ok: true });
});

app.patch('/api/admin/vendors/:id/featured', requireAdmin, async (req, res) => {
  const val = req.body.featured ? 1 : 0;
  await stmts.setVendorFeatured.run(val, val, req.params.id);
  _apiCache.delete('featured-vendors');
  res.json({ ok: true });
});

app.patch('/api/admin/events/:id/rename', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  await stmts.renameEvent.run(name.trim(), req.params.id);
  _apiCache.delete('featured-events');
  res.json({ ok: true });
});

app.patch('/api/admin/vendors/:id/abn', requireAdmin, async (req, res) => {
  const { abn } = req.body;
  const clean = abn ? abn.replace(/\s/g, '') : null;
  if (clean && !/^\d{11}$/.test(clean)) return res.status(400).json({ error: 'ABN must be exactly 11 digits.' });
  await (prepare(`UPDATE vendors SET abn=? WHERE user_id=?`)).run(clean, req.params.id);
  res.json({ ok: true });
});

// Admin force-verify ABN (override cross-reference result)
app.patch('/api/admin/vendors/:id/abn-verify', requireAdmin, async (req, res) => {
  const { verified } = req.body; // true = force green, false = force unverified
  await stmts.updateVendorAbnVerification.run({
    abn_verified: verified ? 1 : 0,
    abn_entity_name: req.body.entity_name || null,
    abn_match: verified ? 'match' : (req.body.abn_match || 'unknown'),
    user_id: req.params.id,
  });
  // Clear force_verified flag when removing verification
  if (!verified) {
    await prepare(`UPDATE users SET force_verified=0 WHERE id=?`).run(req.params.id);
  }
  res.json({ ok: true });
});

app.patch('/api/admin/organisers/:id/abn-verify', requireAdmin, async (req, res) => {
  const { verified } = req.body;
  await stmts.updateOrganiserAbnVerification.run({
    abn_verified: verified ? 1 : 0,
    abn_entity_name: req.body.entity_name || null,
    abn_match: verified ? 'match' : (req.body.abn_match || 'unknown'),
    user_id: req.params.id,
  });
  // Clear force_verified flag when removing verification
  if (!verified) {
    await prepare(`UPDATE users SET force_verified=0 WHERE id=?`).run(req.params.id);
  }
  res.json({ ok: true });
});

app.patch('/api/admin/vendors/:id/rename', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  await stmts.renameVendor.run(name.trim(), req.params.id);
  _apiCache.delete('featured-vendors');
  res.json({ ok: true });
});

// ── Vendor menu endpoints ───────────────────────────────────────────────────

// GET /api/vendor/menu — list own menu items
app.get('/api/vendor/menu', requireAuth, async (req, res) => {
  if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendor only' });
  const items = await stmts.getMenuItems.all(req.session.userId);
  res.json(items);
});

// Self-healing: runs ALTER TABLE once per process if dietary_tags column missing
let _menuDietMigrated = false;
async function _ensureMenuDietCol() {
  if (_menuDietMigrated) return;
  await safeExec('ALTER TABLE menu_items ADD COLUMN dietary_tags TEXT');
  _menuDietMigrated = true;
}

// POST /api/vendor/menu — create item
app.post('/api/vendor/menu', requireAuth, async (req, res) => {
  try {
    if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendor only' });
    const { name, description, price_type, price_min, price_max, category, photo_url, available, seasonal, is_signature, dietary_tags } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
    if (is_signature) await stmts.clearSignature.run(req.session.userId);
    const params = {
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
      dietary_tags: Array.isArray(dietary_tags) ? JSON.stringify(dietary_tags) : null,
    };
    let result;
    try {
      result = await stmts.createMenuItem.run(params);
    } catch(insertErr) {
      // Self-heal: if dietary_tags column missing, add it and retry
      if (insertErr.message?.includes('dietary_tags')) {
        await _ensureMenuDietCol();
        result = await stmts.createMenuItem.run(params);
      } else throw insertErr;
    }
    const item = await stmts.getMenuItemById.get(result.lastInsertRowid, req.session.userId);
    res.json(item);
  } catch(e) { console.error('[POST /api/vendor/menu]', e); res.status(500).json({ error: e.message }); }
});

// PUT /api/vendor/menu/:id — update item
app.put('/api/vendor/menu/:id', requireAuth, async (req, res) => {
  try {
    if (req.session.role !== 'vendor') return res.status(403).json({ error: 'Vendor only' });
    const { name, description, price_type, price_min, price_max, category, photo_url, available, seasonal, is_signature, dietary_tags } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
    if (is_signature) await stmts.clearSignature.run(req.session.userId);
    const updateParams = {
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
      dietary_tags: Array.isArray(dietary_tags) ? JSON.stringify(dietary_tags) : null,
    };
    try {
      await stmts.updateMenuItem.run(updateParams);
    } catch(upErr) {
      if (upErr.message?.includes('dietary_tags')) {
        await _ensureMenuDietCol();
        await stmts.updateMenuItem.run(updateParams);
      } else throw upErr;
    }
    const item = await stmts.getMenuItemById.get(req.params.id, req.session.userId);
    res.json(item);
  } catch(e) { console.error('[PUT /api/vendor/menu]', e); res.status(500).json({ error: e.message }); }
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
// ── Banner injection (cached — avoids per-request DB + client fetch) ──────
let _bannerCache = { show: false, message: '' };
let _bannerTs = 0;
const BANNER_TTL = 30000;
async function _refreshBanner() {
  try {
    const now = Date.now();
    if (now - _bannerTs < BANNER_TTL) return;
    const showRow = await stmts.getSetting.get('banner_show');
    if (showRow && showRow.value === '1') {
      const msgRow = await stmts.getSetting.get('banner_message');
      _bannerCache = { show: true, message: (msgRow && msgRow.value) || '' };
    } else {
      _bannerCache = { show: false, message: '' };
    }
    _bannerTs = now;
  } catch {}
}

function injectBanner(html) {
  // Show banner immediately in HTML if cached state says it's on — no client fetch needed
  const isVisible = _bannerCache.show && _bannerCache.message;
  const displayStyle = isVisible ? 'block' : 'none';
  const msgText = isVisible ? _bannerCache.message.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  const bannerDiv = `<div id="site-banner" style="display:${displayStyle};background:#E8500A;color:#fff;text-align:center;padding:10px 48px 10px 20px;font-size:13px;font-weight:600;position:relative;z-index:999;letter-spacing:0.01em;font-family:'Instrument Sans',sans-serif;"><span id="site-banner-msg">${msgText}</span><button onclick="this.parentElement.style.display='none'" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:none;color:#fff;font-size:16px;cursor:pointer;opacity:0.7;line-height:1;">✕</button></div>`;
  if (html.includes('<div class="main">')) {
    html = html.replace('<div class="main">', '<div class="main">' + bannerDiv);
  } else if (html.includes('<body>')) {
    html = html.replace('<body>', '<body>' + bannerDiv);
  } else if (html.includes('<body ')) {
    html = html.replace(/<body[^>]*>/, '$&' + bannerDiv);
  }
  return html;
}

// ── Admin dashboard with server-side data injection (eliminates 7 client-side fetches) ──
function serveAdminDashboard() {
  return async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin/login');
    try {
      // Pre-fetch all initial data in parallel — same queries the client would make
      const [
        statsData, vendorsRows, organisersRows, activityRows, reportsRows,
        pendingRow, recentVendors, recentOrgs, pliRows,
      ] = await Promise.all([
        // Stats (same as GET /api/admin/stats)
        Promise.all([
          stmts.countVendors.get(), stmts.countOrganisers.get(), stmts.countPending.get(),
          stmts.newVendors7d.get(), stmts.newOrgs7d.get(), stmts.newApps7d.get(), stmts.newAppsPrior7d.get(),
          stmts.countSuspendedVendors.get(), stmts.countSuspendedOrgs.get(),
          stmts.countHiddenByOrgSuspension.get(), stmts.countVendorsAffectedBySuspension.get(),
        ]),
        // Vendors
        stmts.allVendors.all().catch(() => []),
        // Organisers
        stmts.allOrganisers.all().catch(() => []),
        // Activity feed
        stmts.recentActivity.all().catch(() => []),
        // Reports
        stmts.getAllReports.all().catch(() => []),
        // Notifications pieces
        stmts.countPending.get().catch(() => ({ n: 0 })),
        stmts.recentPendingVendors.all().catch(() => []),
        stmts.recentPendingOrgs.all().catch(() => []),
        // PLI enrichment for vendors
        (prepare(`SELECT user_id, pli_status FROM vendors WHERE pli_status IS NOT NULL AND pli_status != 'none'`)).all().catch(() => []),
      ]);

      // Build stats object
      const [vendors, organisers, pending, nv7, no7, na7, nap7, suspV, suspO, hiddenEv, affV] = statsData;
      const stats = {
        vendors: vendors.n, organisers: organisers.n, pending: pending.n,
        newVendors7d: nv7.n, newOrgs7d: no7.n, apps7d: na7.n, appsPrior7d: nap7.n,
        suspendedVendors: suspV.n, suspendedOrgs: suspO.n,
        hiddenByOrgSuspension: hiddenEv.n, vendorsAffectedBySuspension: affV.n,
      };

      // Enrich vendors with PLI status
      const pliMap = Object.fromEntries(pliRows.map(r => [r.user_id, r.pli_status]));
      for (const v of vendorsRows) { v.pli_status = pliMap[v.user_id] || null; }

      // Build notifications
      const notifs = [];
      const pc = pendingRow.c ?? pendingRow.n ?? 0;
      if (pc > 0) {
        notifs.push({ id:'pending', icon:'⏳', iconCls:'gold', title:`${pc} account${pc>1?'s':''} awaiting approval`, desc:'Pending vendors and organisers need review.', time:'now', unread:true });
      }
      for (const v of recentVendors) {
        notifs.push({ id:`v-${v.id}`, icon:'🍽', iconCls:'ember', title:`New vendor: ${v.trading_name}`, desc:'Vendor account pending approval.', time: v.created_at ? new Date(v.created_at).toLocaleDateString('en-AU') : '', unread:true });
      }
      for (const o of recentOrgs) {
        notifs.push({ id:`o-${o.id}`, icon:'🎪', iconCls:'slate', title:`New organiser: ${o.org_name}`, desc:'Organiser account pending approval.', time: o.created_at ? new Date(o.created_at).toLocaleDateString('en-AU') : '', unread:false });
      }

      // Fetch analytics in parallel with the rest (cached, 60s TTL)
      let analytics = null;
      try { analytics = await _computeAnalyticsAllTime(); } catch(e) { /* fallback to client fetch */ }

      const initData = {
        stats,
        vendors: vendorsRows,
        organisers: organisersRows,
        activity: activityRows,
        reports: reportsRows,
        notifications: { notifications: notifs, unreadCount: notifs.filter(n => n.unread).length },
        analytics,
      };

      let html = readHtml('pages/admin-dashboard.html');
      html = html.replace('</head>', `<script>window.__ADMIN_INIT__=${JSON.stringify(initData)};</script>\n</head>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(html);
    } catch (e) {
      console.error('[serveAdminDashboard]', e);
      // Fallback to serving without pre-injected data
      let html = readHtml('pages/admin-dashboard.html');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(html);
    }
  };
}

function injectSession(html, req) {
  const s = req.session;
  if (s && s.userId && s.role) {
    const u = JSON.stringify({ id: s.userId, role: s.role, name: s.name || '' });
    html = html.replace('</head>', `<script>window.__PITCH_USER__=${u};</script>\n</head>`);
  }
  return html;
}

function page(file, opts) {
  const skipBanner = opts && opts.skipBanner;
  return (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    let html = readHtml(file);
    if (!skipBanner) html = injectBanner(html);
    html = injectSession(html, req);
    // Edge-cache public pages for anonymous visitors
    if (!req.session || !req.session.userId) {
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=900');
    }
    res.send(html);
  };
}

let _homeCache = null;
let _homeCacheTs = 0;
const HOME_TTL = 60000;
app.get('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const isLoggedIn = req.session && req.session.userId;
  if (isLoggedIn) {
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=900');
  }
  const now = Date.now();
  if (_homeCache && now - _homeCacheTs < HOME_TTL) return res.send(injectSession(_homeCache, req));
  let html = readHtml('pages/index.html');
  html = injectBanner(html);
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [featuredEvents, allEvents, featuredVendors, catRows, vRow, eRow, aRow, rRow] = await Promise.all([
      stmts.featuredEvents.all(today),
      stmts.publishedEvents.all(),
      stmts.featuredVendors.all(),
      stmts.categoryCounts.all(today),
      stmts.countVendors.get(),
      stmts.countEvents.get(),
      stmts.countAllApplications.get(),
      stmts.getGlobalReviewAvg.get(),
    ]);
    const catCounts = {};
    catRows.forEach(r => { catCounts[r.category] = r.count; });
    const stats = {
      vendors: Number(vRow?.n) || 0,
      events: Number(eRow?.n) || 0,
      applications: Number(aRow?.n) || 0,
      rating: rRow?.avg ? Number(rRow.avg) : null,
    };
    const homeInit = { featuredEvents, events: allEvents, featuredVendors, categoryCounts: catCounts, stats };
    html = html.replace('</head>', `<script>window.__HOME_INIT__=${JSON.stringify(homeInit)};</script>\n</head>`);
  } catch(e) { /* fallback to client fetch */ }
  _homeCache = html;
  _homeCacheTs = now;
  res.send(injectSession(html, req));
});
app.get('/how-it-works',        page('pages/how-it-works.html'));
let _eventsPageCache = null;
let _eventsPageCacheTs = 0;
const EVENTS_PAGE_TTL = 60000;
app.get('/events', async (req, res) => {
  try {
    const now = Date.now();
    if (_eventsPageCache && now - _eventsPageCacheTs < EVENTS_PAGE_TTL) {
      if (!req.session || !req.session.userId) {
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=900');
      }
      return res.send(injectSession(_eventsPageCache, req));
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
    let html = readHtml('pages/events.html');
    html = html.replace('</head>', `<script>
window.__PITCH_MAP_EVENTS__ = ${JSON.stringify(mapData)};
</script></head>`);
    html = injectBanner(html);
    _eventsPageCache = html;
    _eventsPageCacheTs = now;
    if (!req.session || !req.session.userId) {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=900');
    }
    res.send(injectSession(html, req));
  } catch (e) {
    console.error('[events page]', e);
    res.send(injectSession(injectBanner(readHtml('pages/events.html')), req));
  }
});
app.get('/vendors',             page('pages/vendors.html'));
app.get('/pricing',             page('pages/pricing.html'));
app.get('/about',               page('pages/about.html'));
app.get('/contact',             page('pages/contact.html'));
app.get('/terms',               page('pages/terms.html'));
app.get('/privacy',             page('pages/privacy.html'));
app.get('/forgot-password',     page('pages/forgot-password.html', { skipBanner: true }));
app.get('/events/new',          (req, res) => {
  const sess = req.session;
  if (sess && sess.userId && sess.role === 'organiser') {
    return res.redirect('/dashboard/organiser?panel=post-event');
  }
  return res.redirect('/signup/organiser');
});
app.get('/login',               page('pages/login.html', { skipBanner: true }));
app.get('/signup',              page('pages/signup.html', { skipBanner: true }));
app.get('/signup/vendor',       page('pages/signup-vendor.html', { skipBanner: true }));
app.get('/signup/organiser',    page('pages/signup-organiser.html', { skipBanner: true }));
app.get('/signup/foodie',       page('pages/signup-foodie.html', { skipBanner: true }));
app.get('/discover', async (req, res) => {
  let html = readHtml('pages/foodie-feed.html');
  html = injectBanner(html);

  // Pre-inject data server-side so the client doesn't need API round-trips
  const initData = {};
  const today = new Date().toISOString().slice(0, 10);

  try {
    const feedPromise = stmts.publishedEvents.all().then(evs => evs.filter(e => (e.date_sort || '') >= today));

    if (req.session && req.session.userId && req.session.role === 'foodie') {
      const user = await stmts.getUserById.get(req.session.userId);
      if (user) {
        const { password_hash, ...userSafe } = user;
        initData.user = userSafe;
        const [events, saved, following] = await Promise.all([
          feedPromise,
          stmts.getSavedEvents.all(user.id).catch(() => []),
          stmts.getFollowedVendorIds.all(user.id).catch(() => []),
        ]);
        initData.events = events;
        initData.saved = saved;
        initData.following = following;
      } else {
        initData.events = await feedPromise;
      }
    } else {
      initData.events = await feedPromise;
    }
  } catch (e) {
    console.error('[discover init]', e);
  }

  html = html.replace('</head>', `<script>window.__FOODIE_INIT__=${JSON.stringify(initData)};</script></head>`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(html);
});
app.get('/verify/email',        page('pages/verify-email.html', { skipBanner: true }));
app.get('/verify/phone',        page('pages/verify-phone.html', { skipBanner: true }));
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
      let html = readHtml('pages/event-detail.html');
      html = html.replace('</head>', `<script>window.__PITCH_DB_EVENT__=${JSON.stringify(pageData)};</script></head>`);
      return res.send(html);
    }
  } catch (e) { console.error('[event page]', e); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(readHtml('pages/event-detail.html'));
});
// GET /organisers/:id — public organiser profile
app.get('/organisers/:id', async (req, res) => {
  const id = req.params.id;
  if (/^\d+$/.test(id)) {
    try {
      const row = await stmts.publicOrganiserById.get(Number(id));
      if (row && row.status !== 'suspended') {
        const organiser = { ...row };
        delete organiser.password_hash;
        // Get upcoming public events
        const events = await stmts.getOrgPublicEvents.all(Number(id));
        organiser.events = events || [];
        // Get review stats
        const reviewDist = await stmts.getOrgReviewDistribution.all(Number(id));
        const totalReviews = reviewDist.reduce((s, r) => s + r.count, 0);
        const avgRating = totalReviews > 0 ? reviewDist.reduce((s, r) => s + r.rating * r.count, 0) / totalReviews : 0;
        organiser.avg_rating = Math.round(avgRating * 10) / 10;
        organiser.total_reviews = totalReviews;
        let html = readHtml('pages/organiser-detail.html');
        html = html.replace('</head>', `<script>window.__PITCH_ORGANISER__=${JSON.stringify(organiser)};</script></head>`);
        return res.send(html);
      }
    } catch (e) { console.error('[organiser page]', e); }
  }
  res.status(404).send(readHtml('pages/404.html'));
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
        // Fire-and-forget view tracking
        try {
          const ipHash = createHash('sha256').update(req.ip || '').digest('hex').slice(0, 16);
          const viewerUserId = req.session?.userId || null;
          const viewerRole = req.session?.role || null;
          const ref = req.query.ref || (req.headers.referer?.includes('/events/') ? 'event_page' : req.headers.referer?.includes('/vendors') ? 'vendors_list' : 'direct');
          stmts.recordProfileView.run(Number(id), viewerUserId, viewerRole, ipHash, ref);
        } catch (e) { /* non-blocking */ }
        let html = readHtml('pages/vendor-detail.html');
        html = injectSession(html, req);
        html = html.replace('</head>', `<script>window.__PITCH_VENDOR__=${JSON.stringify(vendor)};</script></head>`);
        return res.send(html);
      }
    } catch (e) { console.error('[vendor page]', e); }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(injectSession(readHtml('pages/vendor-detail.html'), req));
});
// GET /dashboard/loading — instant loading page (no DB queries)
app.get('/dashboard/loading', (req, res) => {
  const role = req.query.to || 'vendor';
  const dest = role === 'admin' ? '/admin' : role === 'foodie' ? '/discover' : role === 'organiser' ? '/dashboard/organiser' : '/dashboard/vendor';
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pitch. — Loading</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#1A1612;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:'Instrument Sans',system-ui,sans-serif;overflow:hidden}
.logo{display:flex;align-items:center;gap:9px;margin-bottom:32px}.logo-dot{width:28px;height:28px;border-radius:50%;background:#E8500A}.logo-text{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#FDF4E7}
.spinner{width:36px;height:36px;border:3px solid #2A2018;border-top-color:#E8500A;border-radius:50%;animation:spin .6s linear infinite}
.msg{color:#6B5A4A;font-size:13px;margin-top:20px;letter-spacing:0.01em}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@900&display=swap" rel="stylesheet">
</head><body>
<div class="logo"><div class="logo-dot"></div><span class="logo-text">Pitch.</span></div>
<div class="spinner"></div>
<div class="msg">${role === 'foodie' ? 'Loading your feed…' : 'Loading your dashboard…'}</div>
<script>window.location.replace('${dest}');</script>
</body></html>`);
});

app.get('/dashboard/vendor',           serveDashboard('pages/vendor-dashboard.html',     'vendor',    vendorInitData));
app.get('/dashboard/vendor/*splat',    serveDashboard('pages/vendor-dashboard.html',     'vendor',    vendorInitData));
app.get('/dashboard/organiser',        serveDashboard('pages/organiser-dashboard.html',  'organiser', orgInitData));
app.get('/dashboard/organiser/*splat', serveDashboard('pages/organiser-dashboard.html',  'organiser', orgInitData));
app.get('/admin/login', (req, res, next) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  next();
}, page('pages/admin-login.html', { skipBanner: true }));
app.get('/admin',               serveAdminDashboard());
app.get('/admin/*splat',        serveAdminDashboard());

// ── Post-event cron endpoint (Vercel cron or manual trigger) ────────────────
// Keep serverless function warm — Vercel cron pings this every 5 min
app.get('/api/cron/warm', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get('/api/cron/post-event', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const result = await processCompletedEvents({ sendEmails: true });
  res.json({ ok: true, ...result });
});

// ── Google Search Console verification ─────────────────────────────────────
app.get('/googleddb675f540d83b36.html', (req, res) => {
  res.type('text/html').send('google-site-verification: googleddb675f540d83b36.html');
});

// ── SEO: robots.txt & sitemap.xml ──────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/*
Disallow: /dashboard/*
Disallow: /api/
Disallow: /login
Disallow: /signup*
Disallow: /verify-*
Disallow: /forgot-password

Sitemap: https://onpitch.com.au/sitemap.xml
`);
});

app.get('/sitemap.xml', (req, res) => {
  const base = 'https://onpitch.com.au';
  const pages = [
    { loc: '/',             priority: '1.0', changefreq: 'weekly' },
    { loc: '/about',        priority: '0.8', changefreq: 'monthly' },
    { loc: '/vendors',      priority: '0.9', changefreq: 'daily' },
    { loc: '/events',       priority: '0.9', changefreq: 'daily' },
    { loc: '/pricing',      priority: '0.7', changefreq: 'monthly' },
    { loc: '/how-it-works', priority: '0.7', changefreq: 'monthly' },
    { loc: '/contact',      priority: '0.6', changefreq: 'monthly' },
    { loc: '/privacy',      priority: '0.3', changefreq: 'yearly' },
    { loc: '/terms',        priority: '0.3', changefreq: 'yearly' },
  ];
  const today = new Date().toISOString().split('T')[0];
  const urls = pages.map(p => `  <url>
    <loc>${base}${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n');

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
});

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

// ── 404 catch-all ──────────────────────────────────────────────────────────
app.use((req, res) => {
  // Return JSON for API requests, HTML page for everything else
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).send(readHtml('pages/404.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────
// Warm caches at startup so first requests are fast
_refreshBanner().catch(() => {});

export default app;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Pitch. server running at http://localhost:${PORT}`);
  });
}
