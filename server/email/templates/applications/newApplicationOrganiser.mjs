import { emailLayout, ctaButton } from '../../layout.mjs';
import { getPlanLabel } from '../../helpers.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function newApplicationOrganiserTemplate(organiserName, vendorName, vendorTradingName, eventName, vendorCuisine, vendorPlan) {
  const subject = `New application — ${vendorTradingName} for ${eventName}`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">New application received, ${organiserName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;"><strong style="color:#FDF4E7;">${vendorTradingName}</strong> has applied to <strong style="color:#FDF4E7;">${eventName}</strong>.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <div style="margin-bottom:10px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Vendor</span>
        <div style="font-size:14px;color:#FDF4E7;">${vendorName}</div>
      </div>
      <div style="margin-bottom:10px;">
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Cuisine</span>
        <div style="font-size:14px;color:#FDF4E7;">${vendorCuisine}</div>
      </div>
      <div>
        <span style="font-size:13px;color:#6B5A4A;text-transform:uppercase;letter-spacing:0.06em;">Plan</span>
        <div style="font-size:14px;color:#FDF4E7;">${getPlanLabel(vendorPlan)}</div>
      </div>
    </div>
    ${ctaButton('Review application', `${BASE_URL}/dashboard/organiser/applications`)}
  `, subject);

  const text = `New application received, ${organiserName}. ${vendorTradingName} has applied to ${eventName}. Vendor: ${vendorName}. Cuisine: ${vendorCuisine}. Plan: ${getPlanLabel(vendorPlan)}. Review application: ${BASE_URL}/dashboard/organiser/applications`;

  return { subject, html, text };
}
