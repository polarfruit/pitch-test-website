import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function documentExpiry7Template(vendorName, documentType, expiryDate) {
  const subject = `Urgent — ${documentType} expires in 7 days`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Document expiring soon, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your <strong style="color:#FDF4E7;">${documentType}</strong> expires on <strong style="color:#FDF4E7;">${expiryDate}</strong>.</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">If your document expires, you will not be able to apply to events until you upload a valid replacement. Please renew it now.</p>
    ${ctaButton('Renew document', `${BASE_URL}/dashboard/vendor/documents`)}
  `, subject);

  const text = `Urgent, ${vendorName}. Your ${documentType} expires on ${expiryDate}. If your document expires, you will not be able to apply to events. Renew document: ${BASE_URL}/dashboard/vendor/documents`;

  return { subject, html, text };
}
