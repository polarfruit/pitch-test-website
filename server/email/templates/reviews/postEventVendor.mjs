import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function postEventVendorTemplate(vendorName, eventName, organiserName) {
  const subject = `How was ${eventName}? Leave a review`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">How did it go, ${vendorName}?</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">You recently traded at <strong style="color:#FDF4E7;">${eventName}</strong> hosted by ${organiserName}.</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">Share your experience to help other vendors and organisers on Pitch.</p>
    ${ctaButton('Leave a review', `${BASE_URL}/dashboard/vendor`)}
  `, subject);

  const text = `How did it go, ${vendorName}? You recently traded at ${eventName} hosted by ${organiserName}. Share your experience to help other vendors and organisers. Leave a review: ${BASE_URL}/dashboard/vendor`;

  return { subject, html, text };
}
