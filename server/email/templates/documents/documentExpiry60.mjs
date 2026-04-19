import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function documentExpiry60Template(vendorName, documentType, expiryDate) {
  const subject = `${documentType} expires in 60 days`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Document expiring soon, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your <strong style="color:#FDF4E7;">${documentType}</strong> expires on <strong style="color:#FDF4E7;">${expiryDate}</strong>.</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">Renew it before it expires to avoid interruptions to your event applications.</p>
    ${ctaButton('Renew document', `${BASE_URL}/dashboard/vendor/documents`)}
  `, subject);

  const text = `Document expiring soon, ${vendorName}. Your ${documentType} expires on ${expiryDate}. Renew it before it expires to avoid interruptions to your event applications. Renew document: ${BASE_URL}/dashboard/vendor/documents`;

  return { subject, html, text };
}
