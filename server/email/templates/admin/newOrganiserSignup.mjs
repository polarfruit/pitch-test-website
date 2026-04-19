import { emailLayout, ctaButton } from '../../layout.mjs';

/**
 * Admin notification when a new organiser signs up.
 * Same pattern as the vendor signup notification.
 */
export function newOrganiserSignupTemplate(organiserName, organiserEmail, orgName, suburb) {
  const subject = `New organiser signup — ${orgName}`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">New organiser registered</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">A new organiser has signed up on Pitch.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Name</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${organiserName}</td></tr>
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Email</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${organiserEmail}</td></tr>
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Organisation</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${orgName}</td></tr>
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Location</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${suburb}</td></tr>
      </table>
    </div>
    ${ctaButton('Review in admin panel', 'https://onpitch.com.au/admin/organisers')}
  `, subject);

  return { subject, html };
}
