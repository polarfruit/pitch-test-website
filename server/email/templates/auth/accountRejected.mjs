import { emailLayout, ctaButton } from '../../layout.mjs';

/**
 * Email sent to a vendor when their application is rejected.
 * Empathetic tone — not harsh. Includes the reason and a
 * clear path to reapply.
 */
export function accountRejectedTemplate(vendorName, reason) {
  const subject = 'Update on your Pitch. application';

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">We reviewed your application, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Unfortunately your application was not approved at this time.</p>
    <div style="background:#2E2720;border:1px solid rgba(192,57,43,0.3);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:11px;font-weight:700;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Reason</div>
      <div style="font-size:14px;color:#FDF4E7;">${reason}</div>
    </div>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">You can update your profile and reapply at any time.</p>
    ${ctaButton('Update your profile', 'https://onpitch.com.au/dashboard/vendor')}
  `, subject);

  return { subject, html };
}
