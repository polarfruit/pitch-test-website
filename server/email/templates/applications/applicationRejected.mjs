import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function applicationRejectedTemplate(vendorName, eventName, eventDate, reason) {
  const subject = `Update on your application to ${eventName}`;

  const reasonBlock = reason
    ? `<div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Reason</span>
        <div style="font-size:14px;color:#FDF4E7;">${reason}</div>
      </div>`
    : '';

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Update on your application, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Thank you for applying to <strong style="color:#FDF4E7;">${eventName}</strong> on ${eventDate}. Unfortunately, your application was not successful this time.</p>
    ${reasonBlock}
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">Keep your profile updated and apply to other events — there are always new opportunities on Pitch.</p>
    ${ctaButton('Browse more events', `${BASE_URL}/events`)}
  `, subject);

  const text = `Update on your application, ${vendorName}. Thank you for applying to ${eventName} on ${eventDate}. Unfortunately, your application was not successful this time.${reason ? ` Reason: ${reason}.` : ''} Keep your profile updated and apply to other events. Browse more events: ${BASE_URL}/events`;

  return { subject, html, text };
}
