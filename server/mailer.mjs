/**
 * mailer.mjs — Email & SMS verification for Pitch.
 *
 * Email priority:
 *   1. RESEND_API_KEY  → Resend HTTP API (recommended)
 *   2. SMTP_HOST       → nodemailer SMTP
 *   3. Dev fallback    → Ethereal (logs preview URL to console)
 *
 * Required Vercel env vars for Resend:
 *   RESEND_API_KEY  — from resend.com/api-keys
 *   RESEND_FROM     — e.g. "Pitch. <noreply@yourdomain.com>"
 *                     (domain must be verified in Resend dashboard)
 */

import nodemailer from 'nodemailer';

// ── Email HTML template ─────────────────────────────────────────────────────

function buildEmailHtml(code) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#1A1612;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#231E19;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.04);">
    <div style="background:linear-gradient(135deg,#2C1408,#1A1612);padding:32px 36px 28px;text-align:center;">
      <div style="font-size:32px;font-weight:900;color:#FDF4E7;letter-spacing:-0.04em;">
        Pitch<span style="color:#E8500A;">.</span>
      </div>
    </div>
    <div style="padding:36px;">
      <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Verify your email</h2>
      <p style="font-size:14px;color:#A89880;margin:0 0 28px;line-height:1.6;">Enter this 6-digit code to verify your email address.</p>
      <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.04);border-radius:14px;padding:24px;text-align:center;margin-bottom:28px;">
        <div style="font-size:42px;font-weight:900;color:#FDF4E7;letter-spacing:12px;">${code}</div>
      </div>
      <p style="font-size:12px;color:#6B5A4A;margin:0;line-height:1.6;">Expires in <strong style="color:#A89880;">15 minutes</strong>. If you didn't sign up for Pitch., ignore this email.</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Resend HTTP API ─────────────────────────────────────────────────────────

async function sendViaResend(toEmail, code) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM || 'Pitch. <noreply@onpitch.com.au>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from,
      to:      [toEmail],
      subject: `${code} is your Pitch. verification code`,
      text:    `Your Pitch. verification code is: ${code}\n\nExpires in 15 minutes.\n\nIf you didn't sign up, ignore this email.`,
      html:    buildEmailHtml(code),
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    console.error('[mailer] Resend error:', JSON.stringify(body));
    throw new Error(`Resend API ${res.status}: ${body.message || JSON.stringify(body)}`);
  }

  console.log('[mailer] Email sent via Resend. id:', body.id);
}

// ── SMTP (nodemailer) ───────────────────────────────────────────────────────

let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  if (process.env.SMTP_HOST) {
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Dev fallback: Ethereal
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email', port: 587, secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[mailer] No email provider configured — using Ethereal test account:', testAccount.user);
  }

  return _transporter;
}

async function sendViaSMTP(toEmail, code) {
  const from = process.env.SMTP_FROM || '"Pitch." <noreply@onpitch.com.au>';
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from,
    to:      toEmail,
    subject: `${code} is your Pitch. verification code`,
    text:    `Your Pitch. verification code is: ${code}\n\nExpires in 15 minutes.`,
    html:    buildEmailHtml(code),
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) console.log('[mailer] Ethereal preview URL:', previewUrl);
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function sendVerificationEmail(toEmail, code) {
  console.log(`[mailer] Sending email verification code to ${toEmail}: ${code}`);

  try {
    if (process.env.RESEND_API_KEY) {
      await sendViaResend(toEmail, code);
    } else {
      await sendViaSMTP(toEmail, code);
    }
  } catch (err) {
    console.error('[mailer] Failed to send email:', err.message);
    // Non-fatal — code is already logged above so manual verification is possible
  }
}

// ── Admin notification emails ───────────────────────────────────────────────

function buildAdminNoticeHtml(bodyHtml) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#1A1612;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#231E19;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.04);">
    <div style="background:linear-gradient(135deg,#2C1408,#1A1612);padding:32px 36px 28px;text-align:center;">
      <div style="font-size:32px;font-weight:900;color:#FDF4E7;letter-spacing:-0.04em;">Pitch<span style="color:#E8500A;">.</span></div>
    </div>
    <div style="padding:36px;">
      ${bodyHtml}
      <p style="font-size:12px;color:#6B5A4A;margin:24px 0 0;line-height:1.6;">Questions? Contact <a href="mailto:support@onpitch.com.au" style="color:#E8500A;">support@onpitch.com.au</a></p>
    </div>
  </div>
</body>
</html>`;
}

export function buildSuspensionEmailHtml(firstName, reason, role) {
  return buildAdminNoticeHtml(`
    <h2 style="font-size:20px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Your account has been suspended</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 16px;line-height:1.6;">Hi ${firstName},</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your Pitch. ${role} account has been temporarily suspended.</p>
    <div style="background:#2E2720;border:1px solid rgba(192,57,43,0.3);border-radius:12px;padding:18px 20px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Reason</div>
      <div style="font-size:14px;color:#FDF4E7;">${reason}</div>
    </div>
    <p style="font-size:14px;color:#A89880;margin:0;line-height:1.6;">To appeal this decision, reply to this email or contact <a href="mailto:support@onpitch.com.au" style="color:#E8500A;">support@onpitch.com.au</a>.</p>
  `);
}

export function buildSuspensionNoticeHtml(bodyText) {
  return buildAdminNoticeHtml(`
    <p style="font-size:14px;color:#A89880;margin:0 0 16px;line-height:1.6;">Hi,</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">${bodyText}</p>
    <p style="font-size:14px;color:#A89880;margin:0;line-height:1.6;">If you have questions, contact <a href="mailto:support@onpitch.com.au" style="color:#E8500A;">support@onpitch.com.au</a>.</p>
  `);
}

export async function sendAdminEmail(toEmail, subject, htmlBody, textBody) {
  const hasKey = !!process.env.RESEND_API_KEY;
  const keyTail = hasKey ? process.env.RESEND_API_KEY.slice(-4) : 'none';
  const fromAddr = process.env.RESEND_FROM || 'Pitch. <noreply@onpitch.com.au>';
  console.log(`[mailer] Sending admin email to ${toEmail}: "${subject}" — RESEND_API_KEY=${hasKey ? '***' + keyTail : 'MISSING'}, RESEND_FROM="${fromAddr}"`);
  try {
    if (hasKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromAddr,
          to: [toEmail], subject, text: textBody, html: htmlBody,
        }),
      });
      const bodyText = await res.text();
      if (!res.ok) {
        console.error(`[mailer] Resend admin email error: status=${res.status} body=${bodyText}`);
        throw new Error(`Resend API ${res.status}: ${bodyText}`);
      }
      let parsed;
      try { parsed = JSON.parse(bodyText); } catch { parsed = {}; }
      console.log(`[mailer] Resend admin email sent. id=${parsed.id || 'unknown'} to=${toEmail}`);
    } else {
      console.warn('[mailer] RESEND_API_KEY missing — falling back to SMTP/Ethereal');
      const t = await getTransporter();
      const from = process.env.SMTP_FROM || '"Pitch." <noreply@onpitch.com.au>';
      const info = await t.sendMail({ from, to: toEmail, subject, text: textBody, html: htmlBody });
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) console.log('[mailer] Ethereal preview:', preview);
    }
  } catch (err) {
    console.error('[mailer] Failed to send admin email:', err.message, err.stack);
    throw err;
  }
}

// ── Post-event completion emails ────────────────────────────────────────────

export function buildPostEventOrgHtml(firstName, eventName, vendorNames, dashboardUrl) {
  const vendorList = vendorNames.map(n => `<li style="font-size:14px;color:#FDF4E7;margin-bottom:4px;">${n}</li>`).join('');
  return buildAdminNoticeHtml(`
    <h2 style="font-size:20px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Your event has wrapped up</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 16px;line-height:1.6;">Hi ${firstName},</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 16px;line-height:1.6;"><strong style="color:#FDF4E7;">${eventName}</strong> has ended. Rate the vendors who participated — your feedback helps build trust across the platform.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Vendors to rate</div>
      <ul style="margin:0;padding:0 0 0 18px;">${vendorList}</ul>
    </div>
    <a href="${dashboardUrl}" style="display:inline-block;background:#E8500A;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">Rate your vendors</a>
  `);
}

export function buildPostEventVendorHtml(tradingName, eventName, organiserName, dashboardUrl) {
  return buildAdminNoticeHtml(`
    <h2 style="font-size:20px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">How was ${eventName}?</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 16px;line-height:1.6;">Hi ${tradingName},</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">You recently attended <strong style="color:#FDF4E7;">${eventName}</strong> organised by <strong style="color:#FDF4E7;">${organiserName}</strong>. Share your experience — your review helps other vendors decide where to trade.</p>
    <a href="${dashboardUrl}" style="display:inline-block;background:#E8500A;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">Leave a review</a>
  `);
}

// ── Subscription email template ─────────────────────────────────────────────

function buildSubscriptionEmailHtml(bodyHtml) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#1A1612;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#231E19;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.04);">
    <div style="background:linear-gradient(135deg,#2C1408,#1A1612);padding:32px 36px 28px;text-align:center;">
      <div style="font-size:32px;font-weight:900;color:#FDF4E7;letter-spacing:-0.04em;">Pitch<span style="color:#E8500A;">.</span></div>
    </div>
    <div style="padding:36px;">
      ${bodyHtml}
      <p style="font-size:12px;color:#6B5A4A;margin:32px 0 0;line-height:1.6;">Manage your subscription any time from your dashboard settings.</p>
    </div>
  </div>
</body>
</html>`;
}

// Plan features displayed in subscription emails. Growth includes
// all Pro features plus additional Growth-only capabilities.
const PRO_FEATURES = [
  'Unlimited applications',
  'Priority placement in search',
  'Pro badge on your profile',
  'Up to 10 profile photos',
  'New event alerts within 2 hours',
  'Application templates',
  'Profile view analytics',
  'iCal calendar export',
  'Document expiry reminders',
];

const GROWTH_ONLY_FEATURES = [
  'Top placement in search',
  'Growth badge on profile',
  'Up to 20 photos in named galleries',
  '24-hour early event access',
  'Cold contact any organiser',
  'Custom vanity URL',
  'Bookkeeping summary export',
  'Team access (second user)',
];

function formatPlanName(plan) {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function buildFeatureListHtml(features) {
  const items = features
    .map(f => `<li style="font-size:14px;color:#FDF4E7;margin-bottom:6px;line-height:1.5;">${f}</li>`)
    .join('');
  return `<ul style="margin:0;padding:0 0 0 20px;">${items}</ul>`;
}

function getFeaturesForPlan(plan) {
  if (plan === 'growth') return [...PRO_FEATURES, ...GROWTH_ONLY_FEATURES];
  return PRO_FEATURES;
}

// ── Subscription lifecycle emails ───────────────────────────────────────────

export async function sendUpgradeConfirmationEmail(vendorEmail, vendorName, newPlan, amount) {
  const planLabel = formatPlanName(newPlan);
  const subject = `You're now on Pitch. ${planLabel} \u2713`;

  let featuresHtml;
  if (newPlan === 'growth') {
    featuresHtml = `
      <div style="font-size:13px;font-weight:700;color:#A89880;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Everything in Pro</div>
      ${buildFeatureListHtml(PRO_FEATURES)}
      <div style="font-size:13px;font-weight:700;color:#A89880;text-transform:uppercase;letter-spacing:0.06em;margin:18px 0 10px;">Plus</div>
      ${buildFeatureListHtml(GROWTH_ONLY_FEATURES)}`;
  } else {
    featuresHtml = buildFeatureListHtml(PRO_FEATURES);
  }

  const html = buildSubscriptionEmailHtml(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 4px;">Welcome to ${planLabel}, ${vendorName}.</h2>
    <p style="font-size:15px;color:#A89880;margin:0 0 24px;line-height:1.6;">Your upgrade is confirmed.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="font-size:14px;color:#A89880;margin:0;line-height:1.6;">Your card was charged <strong style="color:#FDF4E7;">$${amount.toFixed(2)}</strong> today.</p>
    </div>
    <div style="font-size:13px;font-weight:700;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">What you now have access to</div>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:28px;">
      ${featuresHtml}
    </div>
    <a href="https://onpitch.com.au/dashboard/vendor" style="display:inline-block;background:#E8500A;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">Go to your dashboard</a>
  `);

  const text = `Welcome to ${planLabel}, ${vendorName}. Your upgrade is confirmed. Your card was charged $${amount.toFixed(2)} today. Visit your dashboard: https://onpitch.com.au/dashboard/vendor`;

  return await sendAdminEmail(vendorEmail, subject, html, text);
}

export async function sendDowngradeConfirmationEmail(vendorEmail, vendorName, currentPlan, periodEndDate) {
  const planLabel = formatPlanName(currentPlan);
  const subject = 'Your Pitch. subscription has been cancelled';
  const features = getFeaturesForPlan(currentPlan);

  const html = buildSubscriptionEmailHtml(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Subscription cancelled, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">You have cancelled your <strong style="color:#FDF4E7;">${planLabel}</strong> subscription.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="font-size:14px;color:#A89880;margin:0;line-height:1.6;">You keep all ${planLabel} features until <strong style="color:#FDF4E7;">${periodEndDate}</strong>. After that date your account moves to Starter (free).</p>
    </div>
    <div style="font-size:13px;font-weight:700;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">What you will lose access to on ${periodEndDate}</div>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:28px;">
      ${buildFeatureListHtml(features)}
    </div>
    <a href="https://onpitch.com.au/dashboard/vendor#billing" style="display:inline-block;background:#E8500A;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">Reactivate before ${periodEndDate}</a>
    <p style="font-size:14px;color:#A89880;margin:24px 0 0;line-height:1.6;">We hope to see you back. If anything about the experience could have been better, we'd genuinely like to hear about it.</p>
  `);

  const text = `Subscription cancelled, ${vendorName}. You have cancelled your ${planLabel} subscription. You keep all ${planLabel} features until ${periodEndDate}. After that your account moves to Starter (free). Reactivate: https://onpitch.com.au/dashboard/vendor#billing`;

  return await sendAdminEmail(vendorEmail, subject, html, text);
}

export async function sendPaymentFailedEmail(vendorEmail, vendorName, amount, nextRetryDate) {
  const subject = 'Action required \u2014 payment failed for your Pitch. subscription';

  const html = buildSubscriptionEmailHtml(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">We couldn't process your payment, ${vendorName}.</h2>
    <div style="background:#2E2720;border:1px solid rgba(192,57,43,0.3);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="font-size:14px;color:#A89880;margin:0 0 8px;line-height:1.6;">Your payment of <strong style="color:#FDF4E7;">$${amount.toFixed(2)}</strong> failed today.</p>
      <p style="font-size:14px;color:#A89880;margin:0;line-height:1.6;">We'll automatically retry on <strong style="color:#FDF4E7;">${nextRetryDate}</strong>.</p>
    </div>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">If the payment is not resolved, your subscription will be cancelled and your account will revert to Starter (free).</p>
    <a href="https://onpitch.com.au/dashboard/vendor#billing" style="display:inline-block;background:#E8500A;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">Update payment method</a>
    <p style="font-size:14px;color:#A89880;margin:24px 0 0;line-height:1.6;">If you've already updated your card, you can ignore this email — we'll retry automatically.</p>
  `);

  const text = `We couldn't process your payment, ${vendorName}. Your payment of $${amount.toFixed(2)} failed today. We'll retry on ${nextRetryDate}. If not resolved your subscription will be cancelled. Update your payment method: https://onpitch.com.au/dashboard/vendor#billing`;

  return await sendAdminEmail(vendorEmail, subject, html, text);
}

export async function sendSubscriptionCancelledEmail(vendorEmail, vendorName, planName) {
  const planLabel = formatPlanName(planName);
  const subject = `Your Pitch. ${planLabel} has ended`;
  const features = getFeaturesForPlan(planName);

  const html = buildSubscriptionEmailHtml(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Your ${planLabel} plan has ended.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your subscription was cancelled due to a failed payment. Your account is now on Starter (free).</p>
    <div style="font-size:13px;font-weight:700;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">What you no longer have access to</div>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:28px;">
      ${buildFeatureListHtml(features)}
    </div>
    <a href="https://onpitch.com.au/pricing" style="display:inline-block;background:#E8500A;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">Upgrade again</a>
    <p style="font-size:14px;color:#A89880;margin:24px 0 0;line-height:1.6;">You can upgrade again any time. Your profile and application history are still here.</p>
  `);

  const text = `Your ${planLabel} plan has ended. Your subscription was cancelled due to a failed payment. Your account is now on Starter (free). Upgrade again: https://onpitch.com.au/pricing`;

  return await sendAdminEmail(vendorEmail, subject, html, text);
}

// ── SMS ─────────────────────────────────────────────────────────────────────

export async function sendVerificationSMS(toPhone, code) {
  console.log(`[mailer] SMS verification code for ${toPhone}: ${code}`);

  const sid   = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  const from  = process.env.TWILIO_FROM;

  if (!sid || !token || !from) {
    console.log('[mailer] Twilio not configured. Set TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM to enable SMS.');
    return;
  }

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(sid, token);
    await client.messages.create({
      body: `Your Pitch. verification code is: ${code}. Valid for 10 minutes.`,
      from,
      to: toPhone,
    });
    console.log(`[mailer] SMS sent to ${toPhone}`);
  } catch (err) {
    console.error('[mailer] Failed to send SMS:', err.message);
  }
}
