export const PRIVACY_SECTIONS = [
  {
    id: 'collect',
    tocLabel: '1. Information We Collect',
    heading: '1. Information We Collect',
    blocks: [
      { type: 'p', text: 'We collect information you provide directly: full name, email address, mobile number, Australian Business Number (ABN), business name, and suburb/state. If you sign up as a vendor, we also collect your food business category, cuisine tags, and documents (e.g. PLI certificate). Payment information (e.g. credit card details) is processed directly by Stripe — we do not store card numbers. We also collect usage data such as pages visited, events viewed, and applications submitted.' },
    ],
  },
  {
    id: 'use',
    tocLabel: '2. How We Use Your Information',
    heading: '2. How We Use Your Information',
    blocks: [
      { type: 'p', text: 'We use your information to:' },
      { type: 'ul', items: [
        'Create and manage your account',
        'Verify your identity and ABN with the Australian Business Register',
        'Match vendors with relevant events',
        'Process stall fee payments',
        'Send you notifications about applications, approvals, and event updates',
        'Improve the Pitch. platform through aggregated analytics',
      ] },
    ],
  },
  {
    id: 'share',
    tocLabel: '3. Who We Share It With',
    heading: '3. Who We Share It With',
    blocks: [
      { type: 'p', text: 'When a vendor applies to an event, the organiser can view that vendor\'s profile, trading name, ABN, and public application details. When an organiser lists an event, vendors can view the organiser\'s public profile and event details. We do not sell your personal data to third parties. We may share data with service providers who help us operate the platform (e.g. Stripe for payments, Mailgun for email delivery) under strict confidentiality agreements.' },
    ],
  },
  {
    id: 'security',
    tocLabel: '4. Data Storage & Security',
    heading: '4. Data Storage & Security',
    blocks: [
      { type: 'p', text: 'All data is stored on Australian servers. Personal data is encrypted at rest and in transit using TLS 1.2+. Session tokens expire after 30 days of inactivity. We conduct periodic security reviews and follow OWASP best practices.' },
    ],
  },
  {
    id: 'cookies',
    tocLabel: '5. Cookies',
    heading: '5. Cookies',
    blocks: [
      { type: 'p', text: 'Pitch. uses essential cookies to keep you logged in and maintain your session. We do not use third-party advertising cookies. We may use anonymous analytics cookies (e.g. Google Analytics with IP anonymisation enabled) to understand how users navigate the platform. You can opt out of analytics cookies in your browser settings.' },
    ],
  },
  {
    id: 'rights',
    tocLabel: '6. Your Rights',
    heading: '6. Your Rights (Australian Privacy Act 1988)',
    blocks: [
      { type: 'p', text: 'Under the Privacy Act 1988 (Cth), you have the right to:' },
      { type: 'ul', items: [
        'Access personal information we hold about you',
        'Request corrections to inaccurate data',
        'Request deletion of your account and associated data',
        'Lodge a complaint with the Office of the Australian Information Commissioner (OAIC) if you believe we have mishandled your information',
      ] },
      { type: 'p-html', html: 'To exercise these rights, contact <a href="mailto:legal@onpitch.com.au">legal@onpitch.com.au</a>.' },
    ],
  },
  {
    id: 'retention',
    tocLabel: '7. Data Retention',
    heading: '7. Data Retention',
    blocks: [
      { type: 'p', text: 'We retain account data for up to 7 years after account deletion for legal, tax, and dispute-resolution purposes. Application records and payment history are retained for 7 years in accordance with Australian tax law requirements.' },
    ],
  },
  {
    id: 'contact',
    tocLabel: '8. Contact',
    heading: '8. Contact',
    blocks: [
      { type: 'p-html', html: 'Questions about this policy? Contact us at <a href="mailto:legal@onpitch.com.au">legal@onpitch.com.au</a> or write to: Pitch. Pty Ltd, Adelaide SA 5000, Australia.' },
    ],
  },
]
