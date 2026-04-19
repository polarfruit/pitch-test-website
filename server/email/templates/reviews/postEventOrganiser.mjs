import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function postEventOrganiserTemplate(organiserName, eventName, vendorCount) {
  const subject = `${eventName} is complete — rate your vendors`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">${eventName} is done, ${organiserName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">You had <strong style="color:#FDF4E7;">${vendorCount}</strong> vendor${vendorCount === 1 ? '' : 's'} at your event.</p>
    <p style="font-size:14px;color:#A89880;margin:0 0 24px;line-height:1.6;">Rate them to build the community and help other organisers find the best vendors.</p>
    ${ctaButton('Rate your vendors', `${BASE_URL}/dashboard/organiser`)}
  `, subject);

  const text = `${eventName} is done, ${organiserName}. You had ${vendorCount} vendor${vendorCount === 1 ? '' : 's'} at your event. Rate them to build the community. Rate your vendors: ${BASE_URL}/dashboard/organiser`;

  return { subject, html, text };
}
