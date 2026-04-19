import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function unreadDigestTemplate(recipientName, unreadCount, threads) {
  const countLabel = unreadCount === 1 ? '1 unread message' : `${unreadCount} unread messages`;
  const subject = `You have ${countLabel} on Pitch.`;

  // Show up to 3 thread previews
  const visibleThreads = (threads || []).slice(0, 3);
  const threadListHtml = visibleThreads.map(thread => {
    const preview = thread.messagePreview.length > 80
      ? thread.messagePreview.substring(0, 80) + '...'
      : thread.messagePreview;
    return `
      <div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:14px;font-weight:700;color:#FDF4E7;margin-bottom:4px;">${thread.senderName}</div>
        <div style="font-size:13px;color:#A89880;line-height:1.5;">${preview}</div>
      </div>`;
  }).join('');

  const threadListText = visibleThreads
    .map(thread => `- ${thread.senderName}: ${thread.messagePreview.substring(0, 80)}`)
    .join('\n');

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">${countLabel}, ${recipientName}.</h2>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:6px 20px;margin-bottom:24px;">
      ${threadListHtml}
    </div>
    ${ctaButton('View all messages', `${BASE_URL}/dashboard/vendor/messages`)}
  `, subject);

  const text = `${countLabel}, ${recipientName}.\n\n${threadListText}\n\nView all messages: ${BASE_URL}/dashboard/vendor/messages`;

  return { subject, html, text };
}
