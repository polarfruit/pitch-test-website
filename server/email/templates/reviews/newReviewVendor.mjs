import { emailLayout, ctaButton } from '../../layout.mjs';

const BASE_URL = 'https://onpitch.com.au';

export function newReviewVendorTemplate(vendorName, reviewerName, rating, eventName) {
  const subject = `New review — ${rating} star${rating === 1 ? '' : 's'} from ${eventName}`;

  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">You received a review, ${vendorName}.</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;"><strong style="color:#FDF4E7;">${reviewerName}</strong> rated you after <strong style="color:#FDF4E7;">${eventName}</strong>.</p>
    <div style="background:#2E2720;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px 20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:24px;color:#E8500A;letter-spacing:2px;margin-bottom:4px;">${stars}</div>
      <div style="font-size:14px;color:#FDF4E7;font-weight:700;">${rating} out of 5</div>
    </div>
    ${ctaButton('View your reviews', `${BASE_URL}/dashboard/vendor`)}
  `, subject);

  const text = `You received a review, ${vendorName}. ${reviewerName} rated you ${rating} star${rating === 1 ? '' : 's'} after ${eventName}. View your reviews: ${BASE_URL}/dashboard/vendor`;

  return { subject, html, text };
}
