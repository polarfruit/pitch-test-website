import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function documentExpiry30Template(vendorName, documentType, expiryDate) {
  const subject = `Action needed — ${documentType} expires in 30 days`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Document expiring soon, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your <strong style="color:#FDF4E7;">${documentType}</strong> expires on <strong style="color:#FDF4E7;">${expiryDate}</strong>.</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">Renew it soon to keep your profile in good standing and avoid any interruptions to your event applications.</p>
    ${ctaButton('Renew document', `${BASE_URL}/dashboard/vendor/documents`)}
  `, subject);

  const text = `Action needed, ${vendorName}. Your ${documentType} expires on ${expiryDate}. Renew it soon to keep your profile in good standing. Renew document: ${BASE_URL}/dashboard/vendor/documents`;

  return { subject, html, text };
}
