import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function documentUploadedAdminTemplate(vendorName, vendorEmail, documentType) {
  const subject = `New document uploaded — ${vendorName} (${documentType})`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">New document uploaded.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;"><strong style="color:#FDF4E7;">${vendorName}</strong> has uploaded a new <strong style="color:#FDF4E7;">${documentType}</strong> for verification.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <div style="margin-bottom:10px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Vendor</span>
        <div style="font-size:14px;color:#FDF4E7;">${vendorName}</div>
      </div>
      <div style="margin-bottom:10px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Email</span>
        <div style="font-size:14px;color:#FDF4E7;">${vendorEmail}</div>
      </div>
      <div>
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Document type</span>
        <div style="font-size:14px;color:#FDF4E7;">${documentType}</div>
      </div>
    </div>
    ${ctaButton('Review in admin panel', `${BASE_URL}/admin/vendors`)}
  `, subject);

  const text = `New document uploaded. ${vendorName} (${vendorEmail}) has uploaded a new ${documentType} for verification. Review in admin panel: ${BASE_URL}/admin/vendors`;

  return { subject, html, text };
}
