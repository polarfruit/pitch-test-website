import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function deadlineApproachingTemplate(organiserName, eventName, eventDate, pendingCount, deadlineDate) {
  const subject = `${pendingCount} application${pendingCount === 1 ? '' : 's'} pending — ${eventName} deadline approaching`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Deadline approaching for ${eventName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">You have <strong style="color:#FDF4E7;">${pendingCount}</strong> pending application${pendingCount === 1 ? '' : 's'} to review.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <div style="margin-bottom:10px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Event date</span>
        <div style="font-size:14px;color:#FDF4E7;">${eventDate}</div>
      </div>
      <div>
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Application deadline</span>
        <div style="font-size:14px;color:#FDF4E7;">${deadlineDate}</div>
      </div>
    </div>
    ${ctaButton('Review applications now', `${BASE_URL}/dashboard/organiser/applications`)}
  `, subject);

  const text = `Deadline approaching for ${eventName}, ${organiserName}. You have ${pendingCount} pending application${pendingCount === 1 ? '' : 's'} to review. Event date: ${eventDate}. Application deadline: ${deadlineDate}. Review applications now: ${BASE_URL}/dashboard/organiser/applications`;

  return { subject, html, text };
}
