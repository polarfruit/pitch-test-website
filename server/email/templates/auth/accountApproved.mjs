import { emailLayout, ctaButton } from '../../layout.mjs';

/**
 * Email sent to a vendor when their account is approved.
 * Warm, direct tone — they're in, let them start applying.
 */
export function accountApprovedTemplate(vendorName) {
  const subject = "You're approved — welcome to Pitch.";

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">You're approved, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your vendor profile has been verified and approved. You can now apply to events across South Australia.</p>
    ${ctaButton('Browse events now', 'https://onpitch.com.au/events')}
  `, subject);

  return { subject, html };
}
