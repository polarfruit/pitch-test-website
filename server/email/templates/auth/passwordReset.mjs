import { emailLayout, ctaButton } from '../../layout.mjs';

/**
 * Email sent when a user requests a password reset.
 * Token embedded in the CTA URL expires in 1 hour (enforced server-side).
 */
export function passwordResetTemplate(userName, resetUrl) {
  const subject = 'Reset your Pitch. password';

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">Reset your password, ${userName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 12px;line-height:1.6;">Someone requested a password reset for your Pitch. account. This link expires in 1 hour.</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">If you didn't request this, you can ignore this email — your password stays the same.</p>
    ${ctaButton('Reset my password', resetUrl)}
  `, subject);

  return { subject, html };
}
