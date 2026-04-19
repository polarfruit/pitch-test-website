import { emailLayout, ctaButton } from '../../layout.mjs';
import { formatCurrency } from '../../helpers.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function stallFeeIssuedTemplate(vendorName, eventName, amount, dueDate) {
  const subject = `Stall fee issued — ${eventName}`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Stall fee due, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">A stall fee has been issued for <strong style="color:#FDF4E7;">${eventName}</strong>.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <div style="margin-bottom:10px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Amount</span>
        <div style="font-size:16px;font-weight:700;color:#FDF4E7;">${formatCurrency(amount)}</div>
      </div>
      <div>
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Due date</span>
        <div style="font-size:14px;color:#FDF4E7;">${dueDate}</div>
      </div>
    </div>
    ${ctaButton('Pay now', `${BASE_URL}/dashboard/vendor/payments`)}
  `, subject);

  const text = `Stall fee due, ${vendorName}. A stall fee has been issued for ${eventName}. Amount: ${formatCurrency(amount)}. Due date: ${dueDate}. Pay now: ${BASE_URL}/dashboard/vendor/payments`;

  return { subject, html, text };
}
