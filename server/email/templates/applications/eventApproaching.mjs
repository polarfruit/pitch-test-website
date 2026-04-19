import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function eventApproachingTemplate(vendorName, eventName, eventDate, eventSuburb, venueName, boothDetails) {
  const subject = `${eventName} is in 3 days`;

  const boothRow = boothDetails
    ? `<div>
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Booth</span>
        <div style="font-size:14px;color:#FDF4E7;">${boothDetails}</div>
      </div>`
    : '';

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">${eventName} is coming up, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your confirmed event is in 3 days. Here are the details.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <div style="margin-bottom:10px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Date</span>
        <div style="font-size:14px;color:#FDF4E7;">${eventDate}</div>
      </div>
      <div style="margin-bottom:10px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Venue</span>
        <div style="font-size:14px;color:#FDF4E7;">${venueName}</div>
      </div>
      <div style="margin-bottom:10px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Location</span>
        <div style="font-size:14px;color:#FDF4E7;">${eventSuburb}</div>
      </div>
      ${boothRow}
    </div>
    ${ctaButton('View event details', `${BASE_URL}/dashboard/vendor/applications`)}
  `, subject);

  const text = `${eventName} is coming up, ${vendorName}. Your confirmed event is in 3 days. Date: ${eventDate}. Venue: ${venueName}. Location: ${eventSuburb}.${boothDetails ? ` Booth: ${boothDetails}.` : ''} View event details: ${BASE_URL}/dashboard/vendor/applications`;

  return { subject, html, text };
}
