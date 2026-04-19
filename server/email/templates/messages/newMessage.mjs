import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function newMessageTemplate(recipientName, senderName, messagePreview, threadUrl) {
  const truncatedPreview = messagePreview.length > 100
    ? messagePreview.substring(0, 100) + '...'
    : messagePreview;

  const replyUrl = threadUrl || `${BASE_URL}/dashboard/vendor/messages`;
  const subject = `New message from ${senderName} on Pitch.`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">New message, ${recipientName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;"><strong style="color:#FDF4E7;">${senderName}</strong> sent you a message.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <p style="font-size:14px;color:#FDF4E7;margin:0;line-height:1.6;font-style:italic;">"${truncatedPreview}"</p>
    </div>
    ${ctaButton('Reply now', replyUrl)}
  `, subject);

  const text = `New message, ${recipientName}. ${senderName} sent you a message: "${truncatedPreview}" Reply now: ${replyUrl}`;

  return { subject, html, text };
}
