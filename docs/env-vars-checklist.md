# Environment Variables — Vercel Deployment Checklist

Single source of truth for every environment variable read by the
Pitch. platform. Use this when provisioning a new environment,
auditing what is currently set, or diagnosing a misconfigured
deploy.

To verify what is currently set on any given deploy, read the
`[env]` banner printed on startup by `serve.mjs` — it logs every
critical variable (with secrets masked to the last 4 characters)
on every Vercel cold start and local run.

---

## Manual fixes required

### RESEND_FROM — change from sandbox to brand domain

**Current (Vercel):** `Pitch. <onboarding@resend.dev>`
**Required:**         `Pitch. <noreply@onpitch.com.au>`

This is a **Vercel dashboard change**, not a code change. The code
already reads `process.env.RESEND_FROM` at every send site and falls
back to the brand address only if the var is missing. Both call
sites audited clean: [server/mailer.mjs:46](../server/mailer.mjs),
[server/mailer.mjs:181](../server/mailer.mjs).

Steps:

1. Vercel → Project → Settings → Environment Variables
2. Edit `RESEND_FROM` in the **Production** environment
3. Paste: `Pitch. <noreply@onpitch.com.au>`
4. Redeploy (trigger a deploy or push a commit)
5. Verify in the next deploy's logs — the startup banner will show:
   `[env] RESEND_FROM=Pitch. <noreply@onpitch.com.au>`

**Prerequisite:** `onpitch.com.au` must be verified in the Resend
dashboard (Domains tab) with SPF and DKIM DNS records set. Without
domain verification, Resend will reject outbound mail from the brand
address.

### ADMIN_USERNAME / ADMIN_PASSWORD — set strong values before launch

**Current (fallback):** `admin` / `admin`
**Required:**          custom username + password of **at least 16 characters**

These credentials gate `POST /api/admin/login` and therefore the entire
admin panel. The code falls back to `admin` / `admin` only when the env
vars are missing — acceptable locally, catastrophic in production. Rate
limiting is in place (5 attempts per IP per 15 minutes at
[serve.mjs:1670-1700](../serve.mjs)) but is a deterrent, not a
replacement for strong credentials. Constants read at
[serve.mjs:930-931](../serve.mjs).

If `ADMIN_PASSWORD` is unset on boot, the startup banner is followed by
an error-severity line:

```
[env] CRITICAL: ADMIN_PASSWORD is using default value. Set ADMIN_PASSWORD in environment variables before launch.
```

Steps:

1. Generate a strong password — e.g. `openssl rand -base64 24`
2. Vercel → Project → Settings → Environment Variables
3. Add `ADMIN_USERNAME` (Production) — any non-trivial value
4. Add `ADMIN_PASSWORD` (Production) — the generated password
5. Redeploy (trigger a deploy or push a commit)
6. Verify in the deploy's logs — the startup banner will show:
   `[env] ADMIN_USERNAME=set`
   `[env] ADMIN_PASSWORD=set (masked)`
   and the `[env] CRITICAL: ADMIN_PASSWORD is using default value`
   error line will be **absent**.
7. Test login at `/admin` with the new credentials; confirm the old
   `admin` / `admin` pair now returns 401.

---

## Legend

- ✅ **known set** — confirmed set in Vercel production
- ❓ **verify in Vercel** — must be confirmed in the dashboard or
  by reading the next deploy's `[env]` startup banner
- ➖ **local only** — not applicable on Vercel (auto-provided or
  dev-only)

---

## Critical — platform breaks without these

| Var | Purpose | Format | Status | File |
|-----|---------|--------|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for browser-side client | `https://xxxx.supabase.co` | ❓ verify in Vercel | [lib/config.js:5](../lib/config.js) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for browser client | JWT-like string | ❓ verify in Vercel | [lib/config.js:7](../lib/config.js) |
| `STRIPE_SECRET_KEY` | Server-side Stripe operations | `sk_live_…` | ❓ verify in Vercel | [serve.mjs:17](../serve.mjs) |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhook signatures | `whsec_…` | ❓ verify in Vercel | [serve.mjs:63](../serve.mjs) |
| `STRIPE_PRICE_PRO` | Price ID for Pro plan subscription | `price_…` | ❓ verify in Vercel | [serve.mjs:43](../serve.mjs) |
| `STRIPE_PRICE_GROWTH` | Price ID for Growth plan subscription | `price_…` | ❓ verify in Vercel | [serve.mjs:44](../serve.mjs) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side Stripe publishable key | `pk_live_…` | ❓ verify in Vercel | [lib/config.js:11](../lib/config.js) |
| `SESSION_SECRET` | HMAC secret for Express session cookies — **must not be the dev fallback** in production | ≥ 32 random chars | ❓ verify in Vercel | [serve.mjs:256](../serve.mjs) |
| `RESEND_API_KEY` | Resend transactional email API key | `re_…` | ❓ verify in Vercel | [server/mailer.mjs:45](../server/mailer.mjs) |
| `RESEND_FROM` | From address on all platform emails | `Pitch. <noreply@onpitch.com.au>` | ✅ known set — **value needs correction**, see Manual fixes above | [server/mailer.mjs:46,181](../server/mailer.mjs) |
| `TURSO_DATABASE_URL` | Production SQLite via Turso (libSQL) | `libsql://…` | ❓ verify in Vercel | [server/db.mjs:23](../server/db.mjs) |
| `TURSO_AUTH_TOKEN` | Turso database auth token | JWT-like string | ❓ verify in Vercel | [server/db.mjs:28](../server/db.mjs) |
| `ADMIN_USERNAME` | Admin panel username — **must be changed from `admin` default** before production launch | string | ❓ verify in Vercel | [serve.mjs:930](../serve.mjs) |
| `ADMIN_PASSWORD` | Admin panel password — **must be changed from `admin` default** before production launch. Minimum 16 characters recommended | ≥ 16 chars | ❓ verify in Vercel | [serve.mjs:931](../serve.mjs) |

---

## Important — feature-gating, degrades gracefully

| Var | Purpose | Format | Status | File |
|-----|---------|--------|--------|------|
| `ADMIN_EMAIL` | Destination for admin notifications (signups, reports, document uploads) | `admin@onpitch.com.au` | ❓ verify in Vercel | [server/email/index.mjs:41](../server/email/index.mjs) |
| `SITE_URL` | Absolute URL used in email links | `https://onpitch.com.au` | ❓ verify in Vercel | [serve.mjs:1671](../serve.mjs) |
| `CRON_SECRET` | Bearer secret for `/api/cron/*` endpoints — without it, cron endpoints are unprotected | random 32+ chars | ❓ verify in Vercel | [serve.mjs:5544](../serve.mjs) |
| `ABR_GUID` | Australian Business Register GUID used for ABN auto-verify on vendor signup | UUID | ❓ verify in Vercel | [serve.mjs:1085,1124](../serve.mjs) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for social sign-in | `…apps.googleusercontent.com` | ❓ verify in Vercel | [serve.mjs:945](../serve.mjs) |
| `GA_MEASUREMENT_ID` | Google Analytics tag injected into pages | `G-…` | ❓ verify in Vercel | [serve.mjs:233](../serve.mjs) |
| `EXPRESS_URL` | Next.js → Express rewrite target. Usually auto-set by the Vercel integration; set explicitly only if routing to a separate Express origin | `https://onpitch.com.au` or omitted | ❓ verify in Vercel | [next.config.mjs:14](../next.config.mjs) |

---

## Optional — dev fallback paths or not currently used in production

| Var | Purpose | Format | Status | File |
|-----|---------|--------|--------|------|
| `SMTP_HOST` | Fallback SMTP server (only used if `RESEND_API_KEY` is missing) | hostname | ➖ not required (Resend is primary) | [server/mailer.mjs:79](../server/mailer.mjs) |
| `SMTP_PORT` | Fallback SMTP port | `587` or `465` | ➖ not required | [server/mailer.mjs:82](../server/mailer.mjs) |
| `SMTP_USER` | Fallback SMTP username | string | ➖ not required | [server/mailer.mjs:85](../server/mailer.mjs) |
| `SMTP_PASS` | Fallback SMTP password | string | ➖ not required | [server/mailer.mjs:86](../server/mailer.mjs) |
| `SMTP_FROM` | Fallback SMTP from address | `"Pitch." <noreply@onpitch.com.au>` | ➖ not required | [server/mailer.mjs:103](../server/mailer.mjs) |
| `TWILIO_SID` | Twilio account SID (SMS verification — not currently enabled) | `AC…` | ➖ not required (email-only) | [server/mailer.mjs:387](../server/mailer.mjs) |
| `TWILIO_TOKEN` | Twilio auth token | string | ➖ not required | [server/mailer.mjs:388](../server/mailer.mjs) |
| `TWILIO_FROM` | Twilio sender number | `+61…` | ➖ not required | [server/mailer.mjs:389](../server/mailer.mjs) |
| `NODE_ENV` | Runtime environment. Vercel sets this to `production` automatically | `production` \| `development` | ✅ auto-set by Vercel | multiple |
| `PORT` | Local dev server port. Vercel assigns its own port | `3000` | ➖ local only | [serve.mjs:35](../serve.mjs) |
| `VERCEL` | Auto-set by Vercel at runtime. Gates `app.listen` so the Express app exports as a serverless handler | `1` | ✅ auto-set by Vercel | [serve.mjs:5635](../serve.mjs) |
| `STRIPE_PUBLISHABLE_KEY` | Legacy — the server returns this value on `/api/create-payment-intent`. Prefer `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` | ❓ consider migrating reads to the `NEXT_PUBLIC_` variant | [serve.mjs:3278](../serve.mjs) |

---

## Verification workflow

1. After changing any Vercel env var, trigger a redeploy.
2. Open the deployment's **Logs** tab and filter for `[env]`.
3. Confirm the line for the changed var shows the new value (full
   for plain config, masked suffix for secrets).
4. For `RESEND_FROM` specifically, confirm it reads:
   `[env] RESEND_FROM=Pitch. <noreply@onpitch.com.au>`
5. Send a test transactional email (e.g. trigger a vendor signup
   in production) and confirm the `From:` header shows the brand
   address, not `onboarding@resend.dev`.

---

## Provisioning a new environment (staging / preview)

Minimum set of vars to boot the platform with working auth, email,
billing, and database:

```
# Core
NODE_ENV=production
SITE_URL=https://your-domain.example
SESSION_SECRET=<32+ random chars — openssl rand -hex 32>

# Database
TURSO_DATABASE_URL=libsql://…
TURSO_AUTH_TOKEN=…

# Supabase (client-side)
NEXT_PUBLIC_SUPABASE_URL=https://….supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…

# Stripe
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_PRO=price_…
STRIPE_PRICE_GROWTH=price_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…

# Email
RESEND_API_KEY=re_…
RESEND_FROM=Pitch. <noreply@your-domain.example>
ADMIN_EMAIL=admin@your-domain.example

# Ops
CRON_SECRET=<32+ random chars>
ABR_GUID=<Australian Business Register lookup GUID>
```

Omit any of the **Optional** rows unless the specific feature is
needed.
