import { emailLayout, ctaButton } from '../../layout.mjs';

/**
 * Admin notification when a new vendor signs up.
 * Sent to the admin email address so they can review
 * and approve the vendor.
 */
export function newVendorSignupTemplate(vendorName, vendorEmail, tradingName, suburb, plan) {
  const subject = `New vendor signup — ${tradingName} needs approval`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">New vendor registered</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">A new vendor has signed up on Pitch. and needs approval.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Name</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${vendorName}</td></tr>
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Email</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${vendorEmail}</td></tr>
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Trading name</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${tradingName}</td></tr>
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Location</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${suburb}</td></tr>
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Plan</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${plan}</td></tr>
      </table>
    </div>
    ${ctaButton('Review in admin panel', 'https://onpitch.com.au/admin/vendors')}
  `, subject);

  return { subject, html };
}
