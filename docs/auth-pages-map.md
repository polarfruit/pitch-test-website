# Auth & Signup Pages Audit

Audited: 2026-04-19
Total files: 7 | Total lines: 3,441

---

## 1. login.html

### PURPOSE
Sign-in page for all user roles (vendor, organiser, foodie). First page users see when returning. Accessible from nav, signup pages, and direct URL.

### LINE COUNT
257 lines

### SECTIONS
| Section | Lines | Description |
|---------|-------|-------------|
| Head / styles | 1–83 | Inline CSS for card, fields, buttons, error box, SSO |
| Logo + heading | 87–94 | Pitch. logo dot, "Welcome back" |
| Google SSO button | 96–98 | `#g-btn-container` rendered by Google Identity Services |
| Divider | 100 | "or sign in with email" |
| Email field | 102–105 | Email input |
| Password field | 107–114 | Password input with Show/Hide toggle, forgot link |
| Error box | 116 | Hidden `.error-box`, shown on failure |
| Submit button | 118 | "Sign in" |
| Footer links | 120–131 | Signup links (vendor/organiser/foodie), back to home |
| JS: doLogin | 142–180 | Email/password login via POST `/api/login` |
| JS: OAuth | 193–254 | Google OAuth config fetch, credential handler |

### API CALLS
| Endpoint | Method | Sends | Expects |
|----------|--------|-------|---------|
| `/api/login` | POST | `{ email, password }` | `{ redirect }` or `{ error }` |
| `/api/auth/oauth-config` | GET | — | `{ google: clientId }` |
| `/api/auth/google` | POST | `{ credential, intent: 'login' }` | `{ redirect }` or `{ needsSignup, error }` |

### VALIDATION
- Client: checks email and password are non-empty
- No format validation on email
- No password strength check (login only — correct)

### REDIRECTS
| Path | Destination |
|------|-------------|
| Success (email) | `data.redirect` (role-based dashboard) |
| Success (Google) | `/dashboard/loading?to=<role>` |
| Google no account | Error: "Please sign up first" |
| Forgot password | `/forgot-password` |
| Signup links | `/signup/vendor`, `/signup/organiser`, `/signup/foodie` |

### COMPLEXITY RATING
**Medium** — Google OAuth integration with dynamic script loading, SSO + email login paths, redirect query param handling.

### MIGRATION NOTES
- Needs `'use client'` — form state, DOM events, Google SDK injection
- Google Identity Services script loaded dynamically — need `useEffect` + cleanup
- `_oauthConfig` state + conditional rendering of SSO section
- No server data needed at page load (all client-driven)
- Share auth utility hooks with signup pages (Google OAuth, password toggle)

---

## 2. signup.html

### PURPOSE
Role selection landing page. User chooses between Foodie, Vendor, or Organiser before proceeding to the specific signup form. No actual registration logic — purely navigation.

### LINE COUNT
237 lines

### SECTIONS
| Section | Lines | Description |
|---------|-------|-------------|
| Head / styles | 1–186 | CSS variables, layout, role cards, responsive rules |
| Logo | 190 | Pitch. wordmark linking to homepage |
| Heading | 192–193 | "How will you use Pitch?" + subtitle |
| Foodie card | 197–208 | Full-width featured card, "Free forever" badge |
| Vendor card | 212–220 | Grid column card |
| Organiser card | 222–230 | Grid column card |
| Login link | 234 | "Already have an account? Sign in" |

### API CALLS
None — static navigation page.

### VALIDATION
None — no form fields.

### REDIRECTS
| Path | Destination |
|------|-------------|
| Foodie card | `/signup/foodie` |
| Vendor card | `/signup/vendor` |
| Organiser card | `/signup/organiser` |
| Sign in link | `/login` |

### COMPLEXITY RATING
**Simple** — Pure static page with links. No JS, no API calls, no form state. CSS-only interactions (hover states).

### MIGRATION NOTES
- Could be a server component — no client interactivity needed
- Uses CSS variables (already in brand system)
- Grain texture + glow orb pseudo-elements need careful migration
- Responsive breakpoint at 520px for card grid
- No `'use client'` needed

---

## 3. signup-vendor.html

### PURPOSE
Multi-step vendor registration form (6 steps). Collects account credentials, business details, setup preferences, compliance documents, and subscription plan. Includes inline email verification modal.

### LINE COUNT
1,086 lines

### SECTIONS
| Section | Lines | Description |
|---------|-------|-------------|
| Head / CSS variables | 1–19 | Design tokens |
| Brand panel styles | 25–59 | Sticky left panel with gradient, features, quote, stats |
| Form element styles | 62–260 | Inputs, selects, textareas, toggles, tags, radio cards, plan cards, buttons, step progress, email verify modal |
| Email verify modal HTML | 311–328 | 6-digit code input overlay |
| Brand panel HTML | 330–370 | Logo, heading, feature list, testimonial, stats |
| Form panel | 372–679 | 6 step panels |
| Step 1: Account | 415–437 | First/last name, email, password, confirm password, Google SSO, next button |
| Step 2: Business | 440–462 | Trading name, ABN verify, mobile, state, suburb, bio |
| Step 3: Setup | 466–523 | Cuisine tags, setup type radio cards, stall dimensions, power/water toggles, price range, Instagram |
| Step 4: Documents | 527–599 | Food Safety Cert, PLI, Council Permit (optional) — upload areas |
| Step 5: Plan | 602–657 | Free / Pro ($29) / Growth ($79) plan cards |
| Step 6: Success | 659–676 | Confirmation checklist, CTA buttons |
| JS: step nav | 682–697 | `goStep(n)` with progress dot updates |
| JS: ABN verify | 705–774 | Auto-trigger at 11 digits, POST `/api/verify-abn` |
| JS: helpers | 776–808 | `togglePw`, `setPriceBtn`, `simulateUpload`, `removeDoc`, `selectPlan` |
| JS: collectPayload | 813–839 | Gathers all form values into payload object |
| JS: submitVendorSignup | 842–924 | Validates, sends pre-signup code, opens verify modal |
| JS: verify modal logic | 926–1025 | Wire digit inputs, submit code, resend code |
| JS: Google OAuth | 1027–1081 | Config fetch, credential handler, prefill form |
| Location autocomplete | 1083–1084 | External script for suburb field |

### API CALLS
| Endpoint | Method | Sends | Expects |
|----------|--------|-------|---------|
| `/api/verify-abn` | POST | `{ abn, context: { first_name, last_name, trading_name, email } }` | `{ valid, entityName, status, tradingNames, match }` or `{ error }` |
| `/api/presignup/send-code` | POST | `{ email }` | `{ ok }` or `{ devCode }` (dev mode) |
| `/api/presignup/verify-code` | POST | `{ email, code }` | `{ ok }` or `{ error }` |
| `/api/signup/vendor` | POST | Full vendor payload (20+ fields) | `{ redirect }` or `{ error }` |
| `/api/auth/oauth-config` | GET | — | `{ google: clientId }` |
| `/api/auth/google` | POST | `{ credential, intent: 'signup', role: 'vendor' }` | `{ prefill, redirect, existing }` |

### VALIDATION
- Client: name, email, password, trading name required (checked on submit)
- ABN must be exactly 11 digits if provided
- Password min 8 chars (hint only — not enforced client-side)
- No password match check between pw1/pw2
- No email format regex

### REDIRECTS
| Path | Destination |
|------|-------------|
| Success | `data.redirect` (vendor dashboard) with 2.5s delay |
| OAuth existing user | `d.redirect` |
| Success screen CTAs | `/events`, `/dashboard/vendor` |
| Already have account | `/login` |
| Organiser link | `/signup/organiser` |

### COMPLEXITY RATING
**Complex** — 6-step wizard with progress tracking, ABN verification with name matching, cuisine tag multi-select, setup type radio cards, document uploads, subscription plan selection, inline email verification modal, Google OAuth with form prefill, location autocomplete.

### MIGRATION NOTES
- Absolute `'use client'` — heavy form state, multi-step wizard, modals
- Extract shared components: `StepProgress`, `ABNVerifier`, `EmailVerifyModal`, `PlanSelector`, `CuisineTagSelector`, `DocumentUploadCard`
- Brand panel is identical pattern to organiser — extract `SignupBrandPanel` component
- `simulateUpload()` is a placeholder — needs real file upload integration
- Plan selection state needs to survive step navigation
- Google OAuth prefill pattern shared with organiser — extract `useGoogleOAuth` hook
- Location autocomplete (`pitchLocAC`) loaded as external script — need to integrate or replace
- Password match validation missing — add during migration
- Consider `react-hook-form` or similar for form state management across 6 steps

---

## 4. signup-organiser.html

### PURPOSE
Multi-step organiser registration form (4 steps). Collects account credentials, organisation details, event preferences, and shows success confirmation. Includes inline email verification modal.

### LINE COUNT
1,136 lines

### SECTIONS
| Section | Lines | Description |
|---------|-------|-------------|
| Head / Tailwind CDN | 1–10 | Note: uses Tailwind CDN (unlike vendor page) |
| Inline CSS | 12–306 | Layout, brand panel, form elements, step dots, tags, radio cards, ABN verify, email verify modal, success screen |
| Email verify modal HTML | 310–328 | 6-digit code input overlay |
| Brand panel HTML | 332–389 | Logo, heading ("List events. Fill every spot."), features, testimonial, stats |
| Form panel | 392–706 | 4 step panels |
| Step 1: Account | 415–468 | Google SSO, first/last name, email, password, confirm, terms link |
| Step 2: Organisation | 470–542 | Org name, ABN verify, website, state, suburb, phone, bio |
| Step 3: About events | 544–638 | Event type tags, event scale radio cards, stall count range slider, referral source cards |
| Step 4: Success | 641–703 | Checklist (account, org, profile, post event, billing), info notice, CTA buttons |
| JS: step nav | 710–744 | `goStep(n)`, `updateProgress()` |
| JS: helpers | 747–845 | `togglePw`, `_abnOrgAutoTrigger`, `verifyABN_org`, `toggleTag`, `selectScale`, `updateStalls`, `selectRef` |
| JS: collectOrgPayload | 850–873 | Gathers all form values |
| JS: submitOrganiserSignup | 876–961 | Validates, sends pre-signup code, opens verify modal |
| JS: verify modal logic | 963–1049 | Wire digit inputs, submit code, resend, populate success screen |
| JS: Google OAuth | 1073–1131 | Config fetch, credential handler, prefill form |
| Location autocomplete | 1133–1134 | External script for suburb field |

### API CALLS
| Endpoint | Method | Sends | Expects |
|----------|--------|-------|---------|
| `/api/verify-abn` | POST | `{ abn, context: { first_name, last_name, trading_name, email } }` | `{ valid, entityName, status, tradingNames, match }` or `{ error }` |
| `/api/presignup/send-code` | POST | `{ email }` | `{ ok }` or `{ devCode }` (dev mode) |
| `/api/presignup/verify-code` | POST | `{ email, code }` | `{ ok }` or `{ error }` |
| `/api/signup/organiser` | POST | Full organiser payload (15+ fields) | `{ redirect }` or `{ error }` |
| `/api/auth/oauth-config` | GET | — | `{ google: clientId }` |
| `/api/auth/google` | POST | `{ credential, intent: 'signup', role: 'organiser' }` | `{ prefill, redirect, existing }` |

### VALIDATION
- Client: name, email, password, org name required
- Password match check between pw1-org and pw2-org
- ABN must be exactly 11 digits if provided
- Bio min 40 chars (hint only — not enforced client-side)
- No email format regex

### REDIRECTS
| Path | Destination |
|------|-------------|
| Success | `data.redirect` (organiser dashboard) with 2.5s delay |
| OAuth existing user | `d.redirect` |
| Success screen CTAs | `/dashboard/organiser`, `/events` |
| Sign in link | `/login?role=organiser` |

### COMPLEXITY RATING
**Complex** — 4-step wizard with progress tracking, ABN verification, event type multi-select tags, event scale radio cards, stall count range slider, referral source grid, inline email verification modal, Google OAuth with prefill, dynamic success screen population with real user data.

### MIGRATION NOTES
- Absolute `'use client'` — heavy form state, multi-step wizard, modals
- Note: this page loads `<script src="https://cdn.tailwindcss.com">` — vendor page does not. Inconsistency to resolve during migration (use project's Tailwind setup)
- ~85% of the email verify modal code is identical to vendor — extract shared `EmailVerifyModal` component
- ABN verify logic nearly identical to vendor — extract shared `ABNVerifier` component
- Brand panel pattern shared with vendor — extract parameterised `SignupBrandPanel`
- Google OAuth flow identical pattern — extract `useGoogleOAuth` hook
- Success screen dynamically populates with real user data (email, org name) — handle in state
- Range slider for stall count is custom — needs controlled component
- Location autocomplete (`pitchLocAC`) loaded as external script

---

## 5. forgot-password.html

### PURPOSE
Password reset request page. User enters email, receives reset link. Single-step with form/success state toggle. Available from login page's "Forgot password?" link.

### LINE COUNT
151 lines

### SECTIONS
| Section | Lines | Description |
|---------|-------|-------------|
| Head / styles | 1–66 | Card, fields, buttons, error box, success box |
| Logo | 71–74 | Pitch. logo dot |
| Form view | 76–88 | Heading, email field, error box, submit button |
| Success view | 90–95 | Check-email message with sent-to email display, try again link |
| Footer links | 97–103 | Sign in link, back to home |
| JS: doReset | 107–148 | POST to `/api/forgot-password`, always shows success (security best practice) |

### API CALLS
| Endpoint | Method | Sends | Expects |
|----------|--------|-------|---------|
| `/api/forgot-password` | POST | `{ email }` | Response ignored — always shows success |

### VALIDATION
- Client: email required, basic regex format check (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
- Note: success shown regardless of whether email exists (correct security pattern)

### REDIRECTS
| Path | Destination |
|------|-------------|
| Success | Stays on page, shows success view |
| Try again link | `/forgot-password` (self) |
| Sign in link | `/login` |
| Back link | `/` |

### COMPLEXITY RATING
**Simple** — Single form field, one API call, form/success state toggle. No OAuth, no multi-step, no complex validation.

### MIGRATION NOTES
- Needs `'use client'` — form state, DOM manipulation for view toggle
- Simple `useState` for form vs success view
- Could share card/logo component with login page
- Email regex validation reusable across pages

---

## 6. verify-email.html

### PURPOSE
Email verification page with 6-digit code input. Shown after signup when email verification is required. Has resend functionality with cooldown timer.

### LINE COUNT
267 lines

### SECTIONS
| Section | Lines | Description |
|---------|-------|-------------|
| Head / styles | 1–125 | CSS variables, layout, code inputs, buttons, messages |
| Logo | 129 | Pitch. wordmark |
| Icon + heading | 131–133 | Email icon, "Check your inbox", subtitle with email display |
| Code input card | 135–154 | 6 individual digit inputs, verify button, resend with countdown |
| Message area | 153 | Success/error message div |
| JS: email display | 158–161 | Reads email from URL `?email=` param |
| JS: code input wiring | 164–184 | Auto-advance, backspace nav, paste handling |
| JS: submitCode | 198–225 | POST `/api/verify/email` with 6-digit code |
| JS: resend | 228–264 | 30s initial cooldown, 60s after resend, POST `/api/verify/email/resend` |

### API CALLS
| Endpoint | Method | Sends | Expects |
|----------|--------|-------|---------|
| `/api/verify/email` | POST | `{ code }` | `{ ok, redirect }` or `{ error }` |
| `/api/verify/email/resend` | POST | — | `{ ok }` or `{ error }` |

### VALIDATION
- Client: code must be exactly 6 digits
- Auto-strips non-numeric characters

### REDIRECTS
| Path | Destination |
|------|-------------|
| Success | `data.redirect` or `/verify/phone` (default) with 1.2s delay |

### COMPLEXITY RATING
**Medium** — 6-digit code input with auto-advance, paste handling, arrow key navigation, resend with countdown timer, message state management.

### MIGRATION NOTES
- Needs `'use client'` — refs for code inputs, timer state, focus management
- Extract reusable `CodeInput` component (shared with verify-phone, email verify modals in signup pages)
- Resend cooldown timer needs `useEffect` cleanup
- Email passed via URL param — use `useSearchParams()`
- Auto-submit on 6th digit possible (not implemented but easy to add)

---

## 7. verify-phone.html

### PURPOSE
Phone verification page with two-step flow: (1) enter phone number + send SMS, (2) enter 6-digit code. Includes "skip for now" option. Shown after email verification in signup flow.

### LINE COUNT
307 lines

### SECTIONS
| Section | Lines | Description |
|---------|-------|-------------|
| Head / styles | 1–144 | CSS variables, layout, phone input, code inputs, buttons, messages |
| Logo | 149 | Pitch. wordmark |
| Icon + heading | 151–153 | Phone icon, "Verify your phone", subtitle |
| Step 1: phone input | 159–168 | Phone number field, send code button, skip link |
| Step 2: code entry | 171–190 | 6-digit code inputs, verify button, resend, skip link |
| Message area | 156 | Success/error message div |
| JS: sendSMS | 202–230 | POST `/api/verify/phone/send`, transitions to step 2 |
| JS: code input wiring | 232–252 | Auto-advance, backspace nav, paste handling |
| JS: submitCode | 254–280 | POST `/api/verify/phone` with 6-digit code |
| JS: skipPhone | 282–290 | POST `/api/verify/phone/skip`, redirects |
| JS: cooldown | 292–304 | 60s resend countdown timer |

### API CALLS
| Endpoint | Method | Sends | Expects |
|----------|--------|-------|---------|
| `/api/verify/phone/send` | POST | `{ phone }` | `{ ok }` or `{ error }` |
| `/api/verify/phone` | POST | `{ code }` | `{ ok, redirect }` or `{ error }` |
| `/api/verify/phone/skip` | POST | — | `{ redirect }` |

### VALIDATION
- Client: phone number required (no format validation)
- Code must be 6 digits

### REDIRECTS
| Path | Destination |
|------|-------------|
| Verify success | `data.redirect` or `/` with 1.2s delay |
| Skip | `data.redirect` or `/` |

### COMPLEXITY RATING
**Medium** — Two-step flow (phone entry → code entry), SMS send, code input with auto-advance, skip option, resend cooldown. Herb (green) colour accent instead of ember (orange).

### MIGRATION NOTES
- Needs `'use client'` — two-step state, code input refs, timer
- Extract shared `CodeInput` component (same as verify-email)
- Phone input has no format validation — consider adding AU phone format mask
- Skip flow needs careful state management (POST then redirect)
- Green accent (#2D8B55) on this page — different from ember on other pages

---

## Migration Priority Order

### Tier 1 — Migrate first (high traffic, shared components unlock others)

1. **login.html** (257 lines)
   - Entry point for all returning users — highest traffic auth page
   - Contains Google OAuth pattern reused by signup pages
   - Simple enough to establish auth page migration patterns
   - Extracting `useGoogleOAuth` hook here unblocks signup migrations

2. **signup.html** (237 lines)
   - Gateway to all signup flows — must exist for vendor/organiser signup to work
   - Simplest page in the set (pure navigation, no JS, no API calls)
   - Can be a server component — good practice for migration patterns

### Tier 2 — Migrate together (tightly coupled, share many components)

3. **signup-vendor.html** (1,086 lines) + **signup-organiser.html** (1,136 lines)
   - Migrate together because they share ~70% of their component surface:
     - `SignupBrandPanel` (parameterised)
     - `EmailVerifyModal` (identical)
     - `ABNVerifier` (identical)
     - `useGoogleOAuth` hook (identical)
     - `StepProgress` indicator
     - Location autocomplete integration
   - Most complex pages — benefit most from React component extraction
   - signup-organiser loads Tailwind CDN inconsistently — migration resolves this
   - Consider splitting each into step-per-file to keep under 200-line limit

### Tier 3 — Migrate together (verification flow, shared CodeInput)

5. **verify-email.html** (267 lines) + **verify-phone.html** (307 lines)
   - Part of post-signup flow — depends on signup pages being migrated
   - Share identical `CodeInput` component pattern
   - Resend cooldown timer logic is identical — extract `useCooldownTimer` hook
   - Can share page shell/layout since they look very similar
   - verify-phone has unique two-step flow (phone entry → code entry)

### Tier 4 — Migrate last (lowest priority, standalone)

7. **forgot-password.html** (151 lines)
   - Standalone page, rarely visited
   - Simplest form — single field, one API call
   - No dependencies on or from other pages
   - Can share card/logo component extracted from login migration

### Shared components to extract during migration

| Component | Used by | Priority |
|-----------|---------|----------|
| `useGoogleOAuth` | login, signup-vendor, signup-organiser | Tier 1 |
| `AuthCard` (logo + card shell) | login, forgot-password | Tier 1 |
| `SignupBrandPanel` | signup-vendor, signup-organiser | Tier 2 |
| `EmailVerifyModal` | signup-vendor, signup-organiser | Tier 2 |
| `ABNVerifier` | signup-vendor, signup-organiser | Tier 2 |
| `StepProgress` | signup-vendor, signup-organiser | Tier 2 |
| `CodeInput` | verify-email, verify-phone, EmailVerifyModal | Tier 2 |
| `useCooldownTimer` | verify-email, verify-phone | Tier 3 |
| `PasswordField` (with toggle) | login, signup-vendor, signup-organiser | Tier 1 |
