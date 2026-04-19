import { emailLayout, ctaButton } from '../../layout.mjs';

/**
 * Admin notification when a report is filed against
 * a vendor or organiser. Uses a warning-tinted info box
 * to highlight the report details.
 */
export function reportFiledTemplate(reportType, reportedName, reportedBy, reason) {
  const subject = `New report filed — ${reportType}`;

  const html = emailLayout(`
    <h2 style="font-size:22px;font-weight:700;color:#FDF4E7;margin:0 0 10px;">New report filed</h2>
    <p style="font-size:14px;color:#A89880;margin:0 0 20px;line-height:1.6;">A new report has been submitted and needs review.</p>
    <div style="background:#2E2720;border:1px solid rgba(192,57,43,0.3);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Type</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${reportType}</td></tr>
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Reported</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${reportedName}</td></tr>
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Reported by</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${reportedBy}</td></tr>
        <tr><td style="font-size:12px;color:#6B5A4A;padding:4px 0;font-weight:700;">Reason</td><td style="font-size:14px;color:#FDF4E7;padding:4px 0;">${reason}</td></tr>
      </table>
    </div>
    ${ctaButton('Review in admin panel', 'https://onpitch.com.au/admin/reports')}
  `, subject);

  return { subject, html };
}
