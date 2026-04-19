import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function documentVerifiedTemplate(vendorName, documentType) {
  const subject = `Document verified — ${documentType}`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Document verified, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your <strong style="color:#FDF4E7;">${documentType}</strong> has been verified by our team.</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">Your profile is one step closer to full approval.</p>
    ${ctaButton('View your documents', `${BASE_URL}/dashboard/vendor/documents`)}
  `, subject);

  const text = `Document verified, ${vendorName}. Your ${documentType} has been verified by our team. Your profile is one step closer to full approval. View your documents: ${BASE_URL}/dashboard/vendor/documents`;

  return { subject, html, text };
}
