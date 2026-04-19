import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function documentExpiredTemplate(vendorName, documentType) {
  const subject = `Your ${documentType} has expired`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Document expired, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your <strong style="color:#FDF4E7;">${documentType}</strong> has expired.</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">You cannot apply to new events until you upload a valid document. Please upload a replacement as soon as possible.</p>
    ${ctaButton('Upload new document', `${BASE_URL}/dashboard/vendor/documents`)}
  `, subject);

  const text = `Document expired, ${vendorName}. Your ${documentType} has expired. You cannot apply to new events until you upload a valid document. Upload new document: ${BASE_URL}/dashboard/vendor/documents`;

  return { subject, html, text };
}
