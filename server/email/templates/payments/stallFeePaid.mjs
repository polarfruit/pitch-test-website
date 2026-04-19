import { emailLayout, ctaButton } from '../../layout.mjs';
import { formatCurrency } from '../../helpers.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function stallFeePaidTemplate(vendorName, eventName, amount) {
  const subject = `Payment confirmed — ${eventName}`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Payment received, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your stall fee of <strong style="color:#FDF4E7;">${formatCurrency(amount)}</strong> for <strong style="color:#FDF4E7;">${eventName}</strong> has been paid.</p>
    <div style="background:#2E2720;border:1px solid rgba(45,139,85,0.3);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:14px;font-weight:700;color:#2D8B55;">&#10003; Payment confirmed</div>
    </div>
    ${ctaButton('View payment history', `${BASE_URL}/dashboard/vendor/payments`)}
  `, subject);

  const text = `Payment received, ${vendorName}. Your stall fee of ${formatCurrency(amount)} for ${eventName} has been paid. View payment history: ${BASE_URL}/dashboard/vendor/payments`;

  return { subject, html, text };
}
