import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function applicationSubmittedTemplate(vendorName, eventName, eventDate, eventSuburb) {
  const subject = `Application submitted — ${eventName}`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Application submitted, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">You have applied to <strong style="color:#FDF4E7;">${eventName}</strong>.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <div style="margin-bottom:10px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Event date</span>
        <div style="font-size:14px;color:#FDF4E7;">${eventDate}</div>
      </div>
      <div>
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Location</span>
        <div style="font-size:14px;color:#FDF4E7;">${eventSuburb}</div>
      </div>
    </div>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">The organiser will review your application and respond before the event deadline.</p>
    ${ctaButton('View your applications', `${BASE_URL}/dashboard/vendor/applications`)}
  `, subject);

  const text = `Application submitted, ${vendorName}. You have applied to ${eventName}. Event date: ${eventDate}. Location: ${eventSuburb}. The organiser will review your application and respond before the event deadline. View your applications: ${BASE_URL}/dashboard/vendor/applications`;

  return { subject, html, text };
}
