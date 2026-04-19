/**
 * layout.mjs — Shared email layout wrapper for Pitch. transactional emails.
 *
 * All styles are inline — no external CSS. Designed for maximum
 * email client compatibility (Gmail, Outlook, Apple Mail).
 *
 * Design tokens:
 *   Background:  #1A1612 (coal)
 *   Card:        #231E19 (char)
 *   Text-hi:     #FDF4E7
 *   Text-mid:    #A89880
 *   Text-lo:     #6B5A4A
 *   Accent/CTA:  #E8500A (ember)
 *   Info box:    #2E2720
 */

// ── CTA button ──────────────────────────────────────────────────────────────

/**
 * Returns an HTML string for an ember-coloured call-to-action button.
 * Use inside emailLayout() content blocks.
 */
export function ctaButton(label, url) {
  return `<a href="${url}" style="display:inline-block;background:#E8500A;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:16px 32px;border-radius:10px;">${label}</a>`;
}

// ── Email layout wrapper ────────────────────────────────────────────────────

/**
 * Wraps email body content in the standard Pitch. email chrome:
 * dark background, card container, wordmark header, and footer.
 *
 * @param {string} content — Inner HTML body content
 * @param {string} title  — Email title (shown in email client previews)
 * @returns {string} Complete HTML email document
 */
export function emailLayout(content, title) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title || ''}</title>
</head>
<body style="margin:0;padding:0;background:#1A1612;font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#231E19;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.04);">
    <!-- Header: Pitch. wordmark -->
    <div style="padding:36px 40px 28px;text-align:center;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:900;color:#FDF4E7;letter-spacing:-0.03em;">Pitch<span style="color:#E8500A;">.</span></div>
    </div>
    <!-- Body -->
    <div style="padding:0 40px 40px;">
      ${content}
    </div>
    <!-- Footer -->
    <div style="padding:0 40px 32px;text-align:center;">
      <p style="font-size:12px;color:#6B5A4A;margin:0 0 4px;line-height:1.6;">Australia's marketplace for food vendors and events.</p>
      <p style="font-size:12px;color:#6B5A4A;margin:0;line-height:1.6;">&copy; 2026 Pitch. Adelaide, Australia.</p>
    </div>
  </div>
</body>
</html>`;
}
