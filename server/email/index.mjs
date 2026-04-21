/**
 * index.mjs — Central email send functions for Pitch.
 *
 * Each function imports a template for content and delegates
 * to sendAdminEmail() in mailer.mjs for actual delivery.
 * All sends are fire-and-forget with .catch() error logging.
 * No function in this file ever throws.
 */

import { sendAdminEmail } from '../mailer.mjs';
import { accountApprovedTemplate } from './templates/auth/accountApproved.mjs';
import { accountRejectedTemplate } from './templates/auth/accountRejected.mjs';
import { accountSuspendedTemplate } from './templates/auth/accountSuspended.mjs';
import { emailVerifiedTemplate } from './templates/auth/emailVerified.mjs';
import { passwordResetTemplate } from './templates/auth/passwordReset.mjs';
import { newVendorSignupTemplate } from './templates/admin/newVendorSignup.mjs';
import { newOrganiserSignupTemplate } from './templates/admin/newOrganiserSignup.mjs';
import { reportFiledTemplate } from './templates/admin/reportFiled.mjs';
import { stallFeeIssuedTemplate } from './templates/payments/stallFeeIssued.mjs';
import { stallFeePaidTemplate } from './templates/payments/stallFeePaid.mjs';
import { stallFeeOverdueTemplate } from './templates/payments/stallFeeOverdue.mjs';
import { newMessageTemplate } from './templates/messages/newMessage.mjs';
import { unreadDigestTemplate } from './templates/messages/unreadDigest.mjs';
import { applicationSubmittedTemplate } from './templates/applications/applicationSubmitted.mjs';
import { applicationApprovedTemplate } from './templates/applications/applicationApproved.mjs';
import { applicationRejectedTemplate } from './templates/applications/applicationRejected.mjs';
import { newApplicationOrganiserTemplate } from './templates/applications/newApplicationOrganiser.mjs';
import { deadlineApproachingTemplate } from './templates/applications/deadlineApproaching.mjs';
import { eventApproachingTemplate } from './templates/applications/eventApproaching.mjs';
import { documentVerifiedTemplate } from './templates/documents/documentVerified.mjs';
import { documentRejectedTemplate } from './templates/documents/documentRejected.mjs';
import { documentExpiry60Template } from './templates/documents/documentExpiry60.mjs';
import { documentExpiry30Template } from './templates/documents/documentExpiry30.mjs';
import { documentExpiry7Template } from './templates/documents/documentExpiry7.mjs';
import { documentExpiredTemplate } from './templates/documents/documentExpired.mjs';
import { documentUploadedAdminTemplate } from './templates/documents/documentUploadedAdmin.mjs';
import { postEventVendorTemplate } from './templates/reviews/postEventVendor.mjs';
import { postEventOrganiserTemplate } from './templates/reviews/postEventOrganiser.mjs';
import { newReviewVendorTemplate } from './templates/reviews/newReviewVendor.mjs';
import { newReviewOrganiserTemplate } from './templates/reviews/newReviewOrganiser.mjs';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@onpitch.com.au';

// ── Auth emails ─────────────────────────────────────────────────────────────

export async function sendAccountApprovedEmail(vendorEmail, vendorName) {
  const { subject, html } = accountApprovedTemplate(vendorName);
  sendAdminEmail(vendorEmail, subject, html, `You're approved, ${vendorName}. Browse events: https://onpitch.com.au/events`)
    .catch(err => console.error('[email] sendAccountApprovedEmail failed:', err.message));
}

export async function sendAccountRejectedEmail(vendorEmail, vendorName, reason) {
  const { subject, html } = accountRejectedTemplate(vendorName, reason);
  sendAdminEmail(vendorEmail, subject, html, `Hi ${vendorName}, your application was not approved. Reason: ${reason}. Update your profile: https://onpitch.com.au/dashboard/vendor`)
    .catch(err => console.error('[email] sendAccountRejectedEmail failed:', err.message));
}

export async function sendAccountSuspendedEmail(vendorEmail, vendorName, reason) {
  const { subject, html } = accountSuspendedTemplate(vendorName, reason);
  sendAdminEmail(vendorEmail, subject, html, `Hi ${vendorName}, your account has been suspended. Reason: ${reason}. Contact support: https://onpitch.com.au/contact`)
    .catch(err => console.error('[email] sendAccountSuspendedEmail failed:', err.message));
}

export async function sendEmailVerifiedEmail(vendorEmail, vendorName) {
  const { subject, html } = emailVerifiedTemplate(vendorName);
  sendAdminEmail(vendorEmail, subject, html, `Email verified, ${vendorName}. Complete your profile: https://onpitch.com.au/dashboard/vendor`)
    .catch(err => console.error('[email] sendEmailVerifiedEmail failed:', err.message));
}

export async function sendPasswordResetEmail(toEmail, userName, resetUrl) {
  const { subject, html } = passwordResetTemplate(userName, resetUrl);
  sendAdminEmail(toEmail, subject, html, `Reset your Pitch. password: ${resetUrl} (expires in 1 hour)`)
    .catch(err => console.error('[email] sendPasswordResetEmail failed:', err.message));
}

// ── Admin notification emails ───────────────────────────────────────────────

export async function sendNewVendorSignupAdminEmail(vendorName, vendorEmail, tradingName, suburb, plan) {
  const { subject, html } = newVendorSignupTemplate(vendorName, vendorEmail, tradingName, suburb, plan);
  sendAdminEmail(ADMIN_EMAIL, subject, html, `New vendor signup: ${tradingName} (${vendorEmail}). Review: https://onpitch.com.au/admin/vendors`)
    .catch(err => console.error('[email] sendNewVendorSignupAdminEmail failed:', err.message));
}

export async function sendNewOrganiserSignupAdminEmail(organiserName, organiserEmail, orgName, suburb) {
  const { subject, html } = newOrganiserSignupTemplate(organiserName, organiserEmail, orgName, suburb);
  sendAdminEmail(ADMIN_EMAIL, subject, html, `New organiser signup: ${orgName} (${organiserEmail}). Review: https://onpitch.com.au/admin/organisers`)
    .catch(err => console.error('[email] sendNewOrganiserSignupAdminEmail failed:', err.message));
}

export async function sendReportFiledAdminEmail(reportType, reportedName, reportedBy, reason) {
  const { subject, html } = reportFiledTemplate(reportType, reportedName, reportedBy, reason);
  sendAdminEmail(ADMIN_EMAIL, subject, html, `New report: ${reportType} against ${reportedName} by ${reportedBy}. Reason: ${reason}. Review: https://onpitch.com.au/admin/reports`)
    .catch(err => console.error('[email] sendReportFiledAdminEmail failed:', err.message));
}

// ── Payment emails ─────────────────────────────────────────────────────────

export async function sendStallFeeIssuedEmail(vendorEmail, vendorName, eventName, amount, dueDate) {
  const { subject, html, text } = stallFeeIssuedTemplate(vendorName, eventName, amount, dueDate);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendStallFeeIssuedEmail failed:', err.message));
}

export async function sendStallFeePaidEmail(vendorEmail, vendorName, eventName, amount) {
  const { subject, html, text } = stallFeePaidTemplate(vendorName, eventName, amount);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendStallFeePaidEmail failed:', err.message));
}

export async function sendStallFeeOverdueEmail(vendorEmail, vendorName, eventName, amount, daysPastDue) {
  const { subject, html, text } = stallFeeOverdueTemplate(vendorName, eventName, amount, daysPastDue);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendStallFeeOverdueEmail failed:', err.message));
}

// ── Message emails ─────────────────────────────────────────────────────────

export async function sendNewMessageEmail(recipientEmail, recipientName, senderName, messagePreview, threadUrl) {
  const { subject, html, text } = newMessageTemplate(recipientName, senderName, messagePreview, threadUrl);
  sendAdminEmail(recipientEmail, subject, html, text)
    .catch(err => console.error('[email] sendNewMessageEmail failed:', err.message));
}

export async function sendUnreadDigestEmail(recipientEmail, recipientName, unreadCount, threads) {
  const { subject, html, text } = unreadDigestTemplate(recipientName, unreadCount, threads);
  sendAdminEmail(recipientEmail, subject, html, text)
    .catch(err => console.error('[email] sendUnreadDigestEmail failed:', err.message));
}

// ── Application emails ────────────────────────────────────────────────────

export async function sendApplicationSubmittedEmail(vendorEmail, vendorName, eventName, eventDate, eventSuburb) {
  const { subject, html, text } = applicationSubmittedTemplate(vendorName, eventName, eventDate, eventSuburb);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendApplicationSubmittedEmail failed:', err.message));
}

export async function sendApplicationApprovedEmail(vendorEmail, vendorName, eventName, eventDate, eventSuburb, boothDetails, stallFee) {
  const { subject, html, text } = applicationApprovedTemplate(vendorName, eventName, eventDate, eventSuburb, boothDetails, stallFee);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendApplicationApprovedEmail failed:', err.message));
}

export async function sendApplicationRejectedEmail(vendorEmail, vendorName, eventName, eventDate, reason) {
  const { subject, html, text } = applicationRejectedTemplate(vendorName, eventName, eventDate, reason);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendApplicationRejectedEmail failed:', err.message));
}

export async function sendNewApplicationOrganiserEmail(organiserEmail, organiserName, vendorName, vendorTradingName, eventName, vendorCuisine, vendorPlan) {
  const { subject, html, text } = newApplicationOrganiserTemplate(organiserName, vendorName, vendorTradingName, eventName, vendorCuisine, vendorPlan);
  sendAdminEmail(organiserEmail, subject, html, text)
    .catch(err => console.error('[email] sendNewApplicationOrganiserEmail failed:', err.message));
}

export async function sendDeadlineApproachingEmail(organiserEmail, organiserName, eventName, eventDate, pendingCount, deadlineDate) {
  const { subject, html, text } = deadlineApproachingTemplate(organiserName, eventName, eventDate, pendingCount, deadlineDate);
  sendAdminEmail(organiserEmail, subject, html, text)
    .catch(err => console.error('[email] sendDeadlineApproachingEmail failed:', err.message));
}

export async function sendEventApproachingEmail(vendorEmail, vendorName, eventName, eventDate, eventSuburb, venueName, boothDetails) {
  const { subject, html, text } = eventApproachingTemplate(vendorName, eventName, eventDate, eventSuburb, venueName, boothDetails);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendEventApproachingEmail failed:', err.message));
}

// ── Document emails ───────────────────────────────────────────────────────

export async function sendDocumentVerifiedEmail(vendorEmail, vendorName, documentType) {
  const { subject, html, text } = documentVerifiedTemplate(vendorName, documentType);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendDocumentVerifiedEmail failed:', err.message));
}

export async function sendDocumentRejectedEmail(vendorEmail, vendorName, documentType, reason) {
  const { subject, html, text } = documentRejectedTemplate(vendorName, documentType, reason);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendDocumentRejectedEmail failed:', err.message));
}

export async function sendDocumentExpiry60Email(vendorEmail, vendorName, documentType, expiryDate) {
  const { subject, html, text } = documentExpiry60Template(vendorName, documentType, expiryDate);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendDocumentExpiry60Email failed:', err.message));
}

export async function sendDocumentExpiry30Email(vendorEmail, vendorName, documentType, expiryDate) {
  const { subject, html, text } = documentExpiry30Template(vendorName, documentType, expiryDate);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendDocumentExpiry30Email failed:', err.message));
}

export async function sendDocumentExpiry7Email(vendorEmail, vendorName, documentType, expiryDate) {
  const { subject, html, text } = documentExpiry7Template(vendorName, documentType, expiryDate);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendDocumentExpiry7Email failed:', err.message));
}

export async function sendDocumentExpiredEmail(vendorEmail, vendorName, documentType) {
  const { subject, html, text } = documentExpiredTemplate(vendorName, documentType);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendDocumentExpiredEmail failed:', err.message));
}

export async function sendDocumentUploadedAdminEmail(vendorName, vendorEmail, documentType) {
  const { subject, html, text } = documentUploadedAdminTemplate(vendorName, vendorEmail, documentType);
  sendAdminEmail(ADMIN_EMAIL, subject, html, text)
    .catch(err => console.error('[email] sendDocumentUploadedAdminEmail failed:', err.message));
}

// ── Review emails ─────────────────────────────────────────────────────────

export async function sendPostEventVendorEmail(vendorEmail, vendorName, eventName, organiserName) {
  const { subject, html, text } = postEventVendorTemplate(vendorName, eventName, organiserName);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendPostEventVendorEmail failed:', err.message));
}

export async function sendPostEventOrganiserEmail(organiserEmail, organiserName, eventName, vendorCount) {
  const { subject, html, text } = postEventOrganiserTemplate(organiserName, eventName, vendorCount);
  sendAdminEmail(organiserEmail, subject, html, text)
    .catch(err => console.error('[email] sendPostEventOrganiserEmail failed:', err.message));
}

export async function sendNewReviewVendorEmail(vendorEmail, vendorName, reviewerName, rating, eventName) {
  const { subject, html, text } = newReviewVendorTemplate(vendorName, reviewerName, rating, eventName);
  sendAdminEmail(vendorEmail, subject, html, text)
    .catch(err => console.error('[email] sendNewReviewVendorEmail failed:', err.message));
}

export async function sendNewReviewOrganiserEmail(organiserEmail, organiserName, reviewerName, rating, eventName) {
  const { subject, html, text } = newReviewOrganiserTemplate(organiserName, reviewerName, rating, eventName);
  sendAdminEmail(organiserEmail, subject, html, text)
    .catch(err => console.error('[email] sendNewReviewOrganiserEmail failed:', err.message));
}
