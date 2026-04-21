export const TERMS_SECTIONS = [
  {
    id: 'intro',
    tocLabel: '1. Introduction',
    heading: '1. Introduction',
    blocks: [
      { type: 'p', text: 'Pitch. ("we", "us", "our") is an online marketplace platform that connects food vendors with event organisers across Australia. These Terms of Service govern your access to and use of the Pitch. platform, including our website, mobile applications, and related services (collectively, the "Platform").' },
      { type: 'p', text: 'By creating an account or using the Platform in any way, you agree to be bound by these Terms. If you do not agree to these Terms, you must not use the Platform.' },
      { type: 'p', text: 'These Terms apply to all users of the Platform, including vendors (individuals or businesses offering food or beverage products at events) and organisers (individuals or entities running markets, festivals, or other food events).' },
    ],
  },
  {
    id: 'accounts',
    tocLabel: '2. Accounts & Eligibility',
    heading: '2. Accounts & Eligibility',
    blocks: [
      { type: 'p', text: 'To use the Pitch. Platform, you must:' },
      { type: 'ul', items: [
        'Be at least 18 years of age',
        'Be based in Australia, or operate events or a food business within Australia',
        'Provide accurate and complete registration information',
        'Maintain the security of your account credentials',
      ] },
      { type: 'p-html', html: '<strong>Vendors</strong> are required to hold a valid Australian Business Number (ABN) at the time of registration. Your ABN will be verified as part of the signup process. Operating as a vendor on Pitch. without a valid ABN is not permitted.' },
      { type: 'p-html', html: 'You are responsible for all activity that occurs under your account. If you believe your account has been compromised, you must notify us immediately at <a href="mailto:hello@onpitch.com.au">hello@onpitch.com.au</a>.' },
    ],
  },
  {
    id: 'vendor-obligations',
    tocLabel: '3. Vendor Obligations',
    heading: '3. Vendor Obligations',
    blocks: [
      { type: 'p', text: 'As a vendor on the Pitch. Platform, you agree to:' },
      { type: 'ul', items: [
        'Provide accurate, current, and complete information in your vendor profile and event applications — including your menu, food categories, stall setup requirements, and trading history',
        'Hold and maintain valid Public Liability Insurance (PLI) of at least $10 million AUD. Evidence of current PLI may be requested by organisers or by Pitch. at any time',
        'Comply with all applicable food safety laws and regulations in the state or territory where you are trading, including holding any required food business registration or food handler certificates',
        'Honour confirmed bookings. Repeatedly cancelling confirmed event participations may result in account suspension',
        'Respond to organiser messages and application outcomes in a timely manner (we recommend within 48 hours)',
      ] },
      { type: 'highlight', html: '<strong>PLI Minimum:</strong> $10,000,000 AUD per occurrence. Organisers may require higher limits for specific events. Check event requirements before applying.' },
    ],
  },
  {
    id: 'organiser-obligations',
    tocLabel: '4. Organiser Obligations',
    heading: '4. Organiser Obligations',
    blocks: [
      { type: 'p', text: 'As an event organiser on the Pitch. Platform, you agree to:' },
      { type: 'ul', items: [
        'Post accurate and complete event listings, including correct dates, location, stall dimensions, expected foot traffic, and any vendor requirements',
        'Communicate application decisions to vendors in a timely manner — we recommend within 14 days of application receipt or 30 days before the event, whichever is sooner',
        'Not discriminate against vendors on the basis of race, religion, gender, sexual orientation, national origin, disability, or any other protected attribute',
        'Clearly state any event-specific requirements (PLI limits, dietary restrictions, exclusivity arrangements) in the event listing before applications open',
        'Process stall fee payments or refunds in accordance with these Terms and any commitments made to vendors upon confirmation',
      ] },
    ],
  },
  {
    id: 'payments',
    tocLabel: '5. Bookings & Payments',
    heading: '5. Bookings & Payments',
    blocks: [
      { type: 'p', text: 'Stall fee amounts are set by organisers and are clearly listed at the time of application. Where payments are processed through the Pitch. Platform, the following applies:' },
      { type: 'ul-html', items: [
        'A platform fee of <strong>3%</strong> is applied to payments processed through Pitch. This fee is deducted from the total amount payable to the organiser',
        'The first three events processed through Pitch. payment infrastructure are fee-free for organisers',
        'Payment is processed via Stripe. By using Pitch. payment processing, you also agree to Stripe\'s Terms of Service',
        'Organisers who collect stall fees directly (outside of Pitch.) are not subject to the 3% platform fee',
      ] },
      { type: 'highlight', html: '<strong>Platform fee:</strong> 3% on payments processed through Pitch. First three events are fee-free for organisers. Organisers collecting fees directly are not subject to this fee.' },
      { type: 'p', text: 'Pitch. is not a party to the financial agreement between vendors and organisers. We provide the payment processing infrastructure only. Disputes regarding stall fees, refunds, or non-payment should first be raised directly between the parties.' },
    ],
  },
  {
    id: 'cancellations',
    tocLabel: '6. Cancellations',
    heading: '6. Cancellations',
    blocks: [
      { type: 'p-html', html: '<strong>If an organiser cancels an event:</strong> Any stall fees already collected through Pitch. will be refunded in full to affected vendors within 5–10 business days. Organisers are responsible for notifying vendors as soon as possible after an event cancellation decision is made.' },
      { type: 'p-html', html: '<strong>If a vendor cancels a confirmed booking:</strong> The applicable cancellation policy depends on when the cancellation occurs relative to the event date:' },
      { type: 'ul', items: [
        'Cancellation more than 30 days before the event: full refund, no fee',
        'Cancellation 8–30 days before the event: 50% of stall fee may be retained by the organiser',
        'Cancellation 7 days or fewer before the event: full stall fee may be forfeited',
      ] },
      { type: 'p', text: 'Specific cancellation terms may be set by individual organisers in their event listings. Where an organiser\'s stated cancellation policy differs from the above, the organiser\'s policy prevails. Pitch. is not liable for any losses arising from event or booking cancellations.' },
    ],
  },
  {
    id: 'conduct',
    tocLabel: '7. Prohibited Conduct',
    heading: '7. Prohibited Conduct',
    blocks: [
      { type: 'p', text: 'You must not engage in any of the following on the Pitch. Platform:' },
      { type: 'ul', items: [
        'Posting false, misleading, or fraudulent information on your profile or in event applications',
        'Submitting fake or incentivised reviews of other vendors or events',
        'Soliciting vendors or organisers to transact outside the Pitch. Platform with the intent to avoid platform fees',
        'Using automated bots, scrapers, or other tools to access the Platform without authorisation',
        'Harassing, threatening, or abusing other users through the messaging system',
        'Creating multiple accounts to circumvent a suspension or ban',
        'Using another user\'s account credentials without their express permission',
      ] },
      { type: 'p', text: 'Violation of these provisions may result in immediate account suspension or termination, at Pitch.\'s sole discretion. We reserve the right to report serious misconduct to relevant authorities.' },
    ],
  },
  {
    id: 'ip',
    tocLabel: '8. Intellectual Property',
    heading: '8. Intellectual Property',
    blocks: [
      { type: 'p', text: 'All content on the Pitch. Platform — including design, logos, and software — is owned by or licensed to Pitch. Pty Ltd and is protected by applicable intellectual property laws.' },
      { type: 'p', text: 'By uploading content to the Platform (including profile photos, menu descriptions, and event listings), you grant Pitch. a non-exclusive, royalty-free, worldwide licence to use, display, and reproduce that content for the purposes of operating and promoting the Platform. You retain ownership of your content. We will not sell your content to third parties.' },
      { type: 'p', text: 'You represent that any content you upload does not infringe the intellectual property rights of any third party.' },
    ],
  },
  {
    id: 'liability',
    tocLabel: '9. Limitation of Liability',
    heading: '9. Limitation of Liability',
    blocks: [
      { type: 'p', text: 'Pitch. is a marketplace platform. We are not a party to any agreement between vendors and organisers, and we do not guarantee the conduct, suitability, or performance of any user on the Platform.' },
      { type: 'p', text: 'To the fullest extent permitted by Australian law, Pitch. excludes all liability for:' },
      { type: 'ul', items: [
        'Any loss arising from a vendor-organiser dispute',
        'Event cancellations or no-shows by either party',
        'Personal injury, property damage, or food safety incidents at events',
        'Indirect, consequential, or economic losses arising from use of the Platform',
      ] },
      { type: 'p', text: 'Where liability cannot be excluded under the Australian Consumer Law, our liability is limited to resupplying the affected service or paying the cost of doing so. Nothing in these Terms limits your rights under the Australian Consumer Law.' },
    ],
  },
  {
    id: 'changes',
    tocLabel: '10. Changes to Terms',
    heading: '10. Changes to Terms',
    blocks: [
      { type: 'p-html', html: 'We may update these Terms from time to time. For material changes — changes that materially affect your rights or obligations — we will provide at least <strong>14 days\' notice</strong> via email to your registered address and a notice on the Platform before the changes take effect.' },
      { type: 'highlight', html: '<strong>Notice period:</strong> Material changes require at least 14 days\' notice via email before taking effect.' },
      { type: 'p', text: 'For non-material changes (such as corrections, clarifications, or updates reflecting new features), changes may take effect immediately upon posting. The "Last updated" date at the top of this page reflects the most recent revision.' },
      { type: 'p', text: 'Your continued use of the Platform after the effective date of any changes constitutes your acceptance of the revised Terms.' },
    ],
  },
  {
    id: 'contact',
    tocLabel: '11. Contact',
    heading: '11. Contact',
    blocks: [
      { type: 'p', text: 'For legal enquiries, notices under these Terms, or any formal correspondence, please contact:' },
      { type: 'p-html', html: '<strong>Pitch. Pty Ltd</strong><br>Adelaide, South Australia<br>Email: <a href="mailto:legal@onpitch.com.au">legal@onpitch.com.au</a>' },
      { type: 'p-html', html: 'For general support or account questions, contact us at <a href="mailto:hello@onpitch.com.au">hello@onpitch.com.au</a> or through the <a href="/contact">contact page</a>.' },
    ],
  },
]
