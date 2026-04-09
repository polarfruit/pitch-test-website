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
  console.log(`[mailer] Sending admin email to ${toEmail}: ${subject}`);
  try {
    if (process.env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'Pitch. <noreply@onpitch.com.au>',
          to: [toEmail], subject, text: textBody, html: htmlBody,
        }),
      });
      if (!res.ok) console.error('[mailer] Resend admin email error:', await res.text());
    } else {
      const t = await getTransporter();
      const from = process.env.SMTP_FROM || '"Pitch." <noreply@onpitch.com.au>';
      const info = await t.sendMail({ from, to: toEmail, subject, text: textBody, html: htmlBody });
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) console.log('[mailer] Ethereal preview:', preview);
    }
  } catch (err) {
    console.error('[mailer] Failed to send admin email:', err.message);
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
