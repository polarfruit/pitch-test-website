/**
 * mailer.mjs — Email & SMS verification for Pitch.
 *
 * Email: uses nodemailer. Configure via environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *   → or set SMTP_SERVICE=gmail and SMTP_USER/SMTP_PASS for Gmail
 *   → In dev (no SMTP_HOST), logs the code to console and uses Ethereal test account.
 *
 * SMS: uses Twilio. Configure via:
 *   TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
 *   → Without these set, SMS code is logged to console only.
 */

import nodemailer from 'nodemailer';

// ── Email ──────────────────────────────────────────────────────────────────

let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  if (process.env.SMTP_HOST) {
    // Production SMTP (any provider: SendGrid, Mailgun, SES, etc.)
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else if (process.env.SMTP_SERVICE === 'gmail') {
    // Gmail shorthand
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    // Dev fallback: Ethereal (fake SMTP — codes are logged to console)
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email', port: 587, secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[mailer] No SMTP configured — using Ethereal test account:', testAccount.user);
  }

  return _transporter;
}

const FROM_ADDRESS = process.env.SMTP_FROM || '"Pitch." <noreply@pitch.com.au>';

export async function sendVerificationEmail(toEmail, code) {
  console.log(`[mailer] Email verification code for ${toEmail}: ${code}`);

  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: FROM_ADDRESS,
      to:   toEmail,
      subject: `${code} is your Pitch. verification code`,
      text: `Your Pitch. email verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you didn't create a Pitch. account, ignore this email.`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#1A1612;font-family:'Helvetica Neue',Arial,sans-serif;">
          <div style="max-width:480px;margin:40px auto;background:#231E19;border-radius:20px;overflow:hidden;border:1px solid #ffffff0A;">
            <div style="background:linear-gradient(135deg,#2C1408,#1A1612);padding:32px 36px 28px;text-align:center;">
              <div style="font-size:32px;font-weight:900;color:#FDF4E7;letter-spacing:-0.04em;">
                Pitch<span style="color:#E8500A;">.</span>
              </div>
            </div>
            <div style="padding:36px;">
              <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Verify your email</h2>
              <p style="font-size:14px;color:#A89880;margin:0 0 28px;line-height:1.6;">Enter this 6-digit code in the Pitch. app to verify your email address.</p>
              <div style="background:#2E2720;border:1px solid #ffffff0A;border-radius:14px;padding:24px;text-align:center;margin-bottom:28px;">
                <div style="font-size:42px;font-weight:900;color:#FDF4E7;letter-spacing:12px;">${code}</div>
              </div>
              <p style="font-size:12px;color:#6B5A4A;margin:0;line-height:1.6;">This code expires in <strong style="color:#A89880;">15 minutes</strong>. If you didn't sign up for Pitch., you can safely ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log('[mailer] Email preview URL:', nodemailer.getTestMessageUrl(info));
    }
  } catch (err) {
    // Log but don't throw — we already logged the code to console above
    console.error('[mailer] Failed to send email:', err.message);
  }
}

// ── SMS ────────────────────────────────────────────────────────────────────

export async function sendVerificationSMS(toPhone, code) {
  console.log(`[mailer] SMS verification code for ${toPhone}: ${code}`);

  const sid   = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  const from  = process.env.TWILIO_FROM;

  if (!sid || !token || !from) {
    // Dev mode: code is already logged above
    console.log('[mailer] Twilio not configured. Set TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM to enable real SMS.');
    return;
  }

  try {
    // Dynamic import so Twilio is optional (not required in package.json)
    // If you want real SMS: npm install twilio
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
    // Non-fatal: code was logged to console
  }
}
