import { emailLayout, ctaButton } from '../../layout.mjs';
import { formatCurrency } from '../../helpers.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function stallFeeOverdueTemplate(vendorName, eventName, amount, daysPastDue) {
  const subject = `Overdue payment — ${eventName}`;
  const dayLabel = daysPastDue === 1 ? '1 day' : `${daysPastDue} days`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Payment overdue, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your stall fee of <strong style="color:#FDF4E7;">${formatCurrency(amount)}</strong> for <strong style="color:#FDF4E7;">${eventName}</strong> is <strong style="color:#C0392B;">${dayLabel} overdue</strong>.</p>
    <div style="background:#2E2720;border:1px solid rgba(192,57,43,0.3);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="font-size:14px;color:#A89880;margin:0;line-height:1.6;">Please pay as soon as possible to avoid issues with future event applications.</p>
    </div>
    ${ctaButton('Pay now', `${BASE_URL}/dashboard/vendor/payments`)}
  `, subject);

  const text = `Payment overdue, ${vendorName}. Your stall fee of ${formatCurrency(amount)} for ${eventName} is ${dayLabel} overdue. Please pay as soon as possible to avoid issues with future event applications. Pay now: ${BASE_URL}/dashboard/vendor/payments`;

  return { subject, html, text };
}
