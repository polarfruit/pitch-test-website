import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function documentRejectedTemplate(vendorName, documentType, reason) {
  const subject = `Action required — ${documentType} needs attention`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Document needs attention, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your <strong style="color:#FDF4E7;">${documentType}</strong> could not be verified.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Reason</span>
      <div style="font-size:14px;color:#FDF4E7;">${reason}</div>
    </div>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">Please upload a new document so we can verify it.</p>
    ${ctaButton('Upload new document', `${BASE_URL}/dashboard/vendor/documents`)}
  `, subject);

  const text = `Document needs attention, ${vendorName}. Your ${documentType} could not be verified. Reason: ${reason}. Please upload a new document. Upload new document: ${BASE_URL}/dashboard/vendor/documents`;

  return { subject, html, text };
}
