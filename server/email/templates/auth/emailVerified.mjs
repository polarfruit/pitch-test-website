import { emailLayout, ctaButton } from '../../layout.mjs';

/**
 * Email sent after a vendor verifies their email address.
 * Guides them to the next step: completing their profile.
 */
export function emailVerifiedTemplate(vendorName) {
  const subject = 'Email verified — complete your profile';

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Email verified, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">Your email is confirmed. Next step: complete your profile to get approved and start applying to events.</p>
    ${ctaButton('Complete your profile', 'https://onpitch.com.au/dashboard/vendor')}
  `, subject);

  return { subject, html };
}
