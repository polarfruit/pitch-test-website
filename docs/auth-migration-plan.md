# Auth Pages Migration Plan — Next.js App Router

Planned: 2026-04-19
Source audit: [docs/auth-pages-map.md](auth-pages-map.md)
Total legacy HTML: 3,748 lines across 8 files

---

## Route Structure

### New Next.js routes

```
app/login/page.jsx
app/signup/page.jsx
app/signup/vendor/page.jsx
app/signup/organiser/page.jsx
app/signup/foodie/page.jsx
app/forgot-password/page.jsx
app/verify/email/page.jsx
app/verify/phone/page.jsx
```

No conflicts with existing routes. Current `app/` only has `page.jsx` (homepage) and `events/page.jsx`.

### next.config.mjs rewrites to remove

Remove from `afterFiles` after migration:

```js
{ source: '/login',            destination: ... }
{ source: '/signup',           destination: ... }
{ source: '/signup/:path*',    destination: ... }
{ source: '/forgot-password',  destination: ... }
{ source: '/verify/:path*',    destination: ... }
```

Keep `/logout` rewrite (Express session destroy, no page to migrate).

---

## Shared Components

### Duplicated patterns across auth pages

| Pattern | Used by | Instances |
|---------|---------|-----------|
| Pitch. logo (dot + wordmark) | All 8 pages | 4 distinct markup patterns |
| Form field (label + input) | login, forgot-password, foodie, vendor, organiser | Identical styles |
| Password field with toggle | login, foodie, vendor (x2), organiser (x2) | 6 instances |
| Error box (red message) | All 8 pages | Identical |
| Google OAuth init + render | login, vendor, organiser, foodie | 4 copies |
| 6-digit code input | verify-email, verify-phone, vendor modal, organiser modal | 4 copies |
| Email verify modal (overlay) | vendor signup, organiser signup | ~95% identical |
| ABN verification | vendor signup, organiser signup | ~90% identical |
| Brand panel (sticky sidebar) | vendor signup, organiser signup | Same layout, different content |
| Step progress dots | vendor (6 steps), organiser (4 steps) | Same pattern |
| Resend cooldown timer | verify-email, verify-phone, vendor modal, organiser modal | 4 copies |
| Submit button with loading | All 8 pages | Same disabled/loading pattern |

### Shared component list — `components/auth/`

| Component | CSS Module | Description |
|-----------|------------|-------------|
| `AuthLogo` | `AuthLogo.module.css` | Pitch. wordmark with ember dot. Two variants: inline (login card) and sidebar (signup) |
| `AuthCard` | `AuthCard.module.css` | Centered card shell. Dark card, shadow, max-width 420-440px |
| `AuthLayout` | `AuthLayout.module.css` | Grain texture, glow orb, centered vertical layout (verify pages, signup role picker) |
| `AuthDivider` | `AuthDivider.module.css` | "or sign in with email" divider |
| `FormField` | `FormField.module.css` | Label + input. Props: `label`, `type`, `id`, `placeholder`, `value`, `onChange`, `error`, `hint`, `readOnly` |
| `PasswordField` | `PasswordField.module.css` | FormField + show/hide toggle |
| `SubmitButton` | `SubmitButton.module.css` | Full-width button. Props: `label`, `loadingLabel`, `isLoading`, `disabled`, `onClick`, `variant` (ember/herb) |
| `ErrorMessage` | `ErrorMessage.module.css` | Red error box. Props: `message`, `isVisible` |
| `SuccessMessage` | `SuccessMessage.module.css` | Green success box. Props: `message`, `isVisible` |
| `CodeInput` | `CodeInput.module.css` | 6-digit code entry. Auto-advance, backspace nav, paste handling. Props: `onComplete`, `accentColor`, imperative `clear()`/`focus()` |
| `GoogleOAuthButton` | `GoogleOAuthButton.module.css` | Loads Google Identity Services, renders button. Props: `intent`, `role`, `onCredential`, `onError` |
| `SignupBrandPanel` | `SignupBrandPanel.module.css` | Sticky sidebar. Props: `heading`, `subheading`, `features[]`, `quote`, `stats[]` |
| `StepProgress` | `StepProgress.module.css` | Progress dots. Props: `currentStep`, `totalSteps`, `labels[]` |
| `EmailVerifyModal` | `EmailVerifyModal.module.css` | Overlay modal with CodeInput + resend. Props: `email`, `isOpen`, `onVerified`, `onClose` |
| `ABNVerifier` | `ABNVerifier.module.css` | ABN input with auto-trigger, verify button, result display. Props: `value`, `onChange`, `context` |
| `CuisineTagSelector` | `CuisineTagSelector.module.css` | Multi-select tag buttons (vendor Step 3) |
| `SetupTypeSelector` | `SetupTypeSelector.module.css` | Radio cards for truck/stall/cart (vendor Step 3) |
| `PlanSelector` | `PlanSelector.module.css` | Plan card grid: Free/Pro/Growth (vendor Step 5) |
| `DocumentUploadCard` | `DocumentUploadCard.module.css` | Upload area + uploaded state (vendor Step 4) |
| `EventTypeTagSelector` | `EventTypeTagSelector.module.css` | Multi-select event type tags (organiser Step 3) |
| `EventScaleSelector` | `EventScaleSelector.module.css` | Radio cards for event scale (organiser Step 3) |
| `StallCountSlider` | `StallCountSlider.module.css` | Range slider with label display (organiser Step 3) |
| `ReferralSourceGrid` | `ReferralSourceGrid.module.css` | Grid of selectable referral cards (organiser Step 3) |

### Hooks — `lib/hooks/`

| Hook | Description |
|------|-------------|
| `useGoogleOAuth` | Fetches `/api/auth/oauth-config`, loads Google script, initializes. Returns `{ isGoogleAvailable, renderButton }` |
| `useCooldownTimer` | Countdown timer for resend buttons. Returns `{ secondsRemaining, isActive, start }` |
| `useAuthSubmit` | Form submission with loading + error. Returns `{ isSubmitting, error, submitForm }` |
| `useAuthRedirect` | Checks `/api/me` on mount. If logged in, redirects to dashboard. Used on login/signup pages |
| `useLocationAutocomplete` | Dynamically loads `/location-autocomplete.js`, initializes `pitchLocAC` on input ref |

---

## Per-Page Analysis

### login.html -> app/login/page.jsx

**Type**: `'use client'` — form state, DOM events, Google SDK
**Lines**: 257

**Form fields**: Email (required), Password (with toggle)

**API calls**:
- `POST /api/login` — `{ email, password }` -> `{ redirect }` or `{ error }`
- `GET /api/auth/oauth-config` — Google client ID
- `POST /api/auth/google` — `{ credential, intent: 'login' }` -> `{ redirect, needsSignup }`

**Redirects**:
- Email success -> `data.redirect` (role-based dashboard)
- Google success -> `/dashboard/loading?to=<role>`
- `?redirect` query param -> subtitle changes to "Sign in to continue"

**Components**: AuthCard, AuthLogo, FormField, PasswordField, SubmitButton, ErrorMessage, GoogleOAuthButton, AuthDivider

**Page-specific**: `components/auth/LoginForm.jsx` — form state + submission

### signup.html -> app/signup/page.jsx

**Type**: Server component (no JS, no API, pure navigation)
**Lines**: 237

3 role cards (Foodie featured, Vendor, Organiser) with links. "Sign in" footer link. Grain texture + glow orb background. Responsive grid at 520px breakpoint.

No page-specific component needed — simple enough for inline JSX.

### signup-vendor.html -> app/signup/vendor/page.jsx

**Type**: `'use client'` — heavy form state, 6-step wizard, modals
**Lines**: 1,093

**6-step wizard**:
1. Account — name, email, password x2, Google SSO
2. Business — trading name, ABN verify, mobile, state, suburb, bio
3. Setup — cuisine tags, setup type, stall dimensions, power/water, price range, Instagram
4. Documents — food safety cert, PLI, council permit (simulated uploads)
5. Plan — Free/Pro/Growth cards + founding phase callout
6. Success — confirmation checklist + CTAs

**API calls**:
- `POST /api/verify-abn` — ABN verification with name matching
- `POST /api/presignup/send-code` — email verification code
- `POST /api/presignup/verify-code` — verify code
- `POST /api/signup/vendor` — full payload (20+ fields)
- `GET /api/auth/oauth-config` + `POST /api/auth/google` — OAuth with prefill

**Split into step-per-component** (200-line limit):

| Component | File |
|-----------|------|
| `VendorSignupPage` | `components/auth/VendorSignupPage.jsx` — orchestrator |
| `VendorStep1Account` | `components/auth/vendor/VendorStep1Account.jsx` |
| `VendorStep2Business` | `components/auth/vendor/VendorStep2Business.jsx` |
| `VendorStep3Setup` | `components/auth/vendor/VendorStep3Setup.jsx` |
| `VendorStep4Documents` | `components/auth/vendor/VendorStep4Documents.jsx` |
| `VendorStep5Plan` | `components/auth/vendor/VendorStep5Plan.jsx` |
| `VendorStep6Success` | `components/auth/vendor/VendorStep6Success.jsx` |

### signup-organiser.html -> app/signup/organiser/page.jsx

**Type**: `'use client'` — heavy form state, 4-step wizard, modals
**Lines**: 1,136

**Note**: Currently loads `<script src="https://cdn.tailwindcss.com">` (inconsistent). Migration to CSS Modules resolves this.

**4-step wizard**:
1. Account — Google SSO, name, email, password x2, terms
2. Organisation — org name, ABN verify, website, state, suburb, phone, bio
3. About events — event type tags, scale radio cards, stall count slider, referral source
4. Success — checklist with real user data populated

**API calls**: Same pattern as vendor (presignup code, verify, signup/organiser, OAuth)

**Step components**:

| Component | File |
|-----------|------|
| `OrganiserSignupPage` | `components/auth/OrganiserSignupPage.jsx` — orchestrator |
| `OrganiserStep1Account` | `components/auth/organiser/OrganiserStep1Account.jsx` |
| `OrganiserStep2Organisation` | `components/auth/organiser/OrganiserStep2Organisation.jsx` |
| `OrganiserStep3Events` | `components/auth/organiser/OrganiserStep3Events.jsx` |
| `OrganiserStep4Success` | `components/auth/organiser/OrganiserStep4Success.jsx` |

### signup-foodie.html -> app/signup/foodie/page.jsx

**Type**: `'use client'` — form state, Google OAuth
**Lines**: 284

**Single-step form**: First name, last name (optional), email, password, Google SSO. Direct submit — no email verification step.

**API calls**:
- `POST /api/signup/foodie` — `{ first_name, last_name, email, password }`
- Google OAuth (same pattern, role: 'foodie')

**Redirect**: `/dashboard/loading?to=foodie`

**Components**: AuthCard, AuthLogo, FormField, PasswordField, SubmitButton, ErrorMessage, GoogleOAuthButton, AuthDivider

**Page-specific**: `components/auth/FoodieSignupForm.jsx`

### forgot-password.html -> app/forgot-password/page.jsx

**Type**: `'use client'` — form/success state toggle
**Lines**: 151

**Two states**: Form view -> success view

**API calls**: `POST /api/forgot-password` — `{ email }` -> always shows success (security pattern)

**Validation**: Email required + regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

**Components**: AuthCard, AuthLogo, FormField, SubmitButton, ErrorMessage, SuccessMessage

**Page-specific**: `components/auth/ForgotPasswordForm.jsx`

### verify-email.html -> app/verify/email/page.jsx

**Type**: `'use client'` — refs for code inputs, timer state, focus
**Lines**: 267

**Content**: 6-digit code input + resend with cooldown (30s initial, 60s after resend)

**API calls**:
- `POST /api/verify/email` — `{ code }` -> `{ ok, redirect }`
- `POST /api/verify/email/resend` -> `{ ok }`

**Email display**: `?email=` query param via `useSearchParams()`

**Redirect**: `data.redirect` or `/verify/phone` with 1.2s delay

**Components**: AuthLogo, AuthLayout, CodeInput, SubmitButton, useCooldownTimer

**Page-specific**: `components/auth/VerifyEmailForm.jsx`

### verify-phone.html -> app/verify/phone/page.jsx

**Type**: `'use client'` — two-step state, code input refs, timer
**Lines**: 307

**Two-step flow**:
1. Enter phone number -> "Send code" -> transitions to step 2
2. Enter 6-digit code -> "Verify Phone" -> redirect
3. "Skip for now" option at both steps

**API calls**:
- `POST /api/verify/phone/send` — `{ phone }` -> `{ ok }`
- `POST /api/verify/phone` — `{ code }` -> `{ ok, redirect }`
- `POST /api/verify/phone/skip` -> `{ redirect }`

**Visual**: Green (herb #2D8B55) accent throughout, unlike ember on other pages

**Components**: AuthLogo, AuthLayout, CodeInput (herb variant), SubmitButton (herb variant), useCooldownTimer

**Page-specific**: `components/auth/VerifyPhoneForm.jsx`

---

## Session Handling

### Current approach

Express sessions (`express-session` with SQLite store). Cookie `connect.sid` is `httpOnly`. Pages detect auth by calling `GET /api/me` which returns `{ user }` or 401.

Navbar.jsx accepts a `user` prop (components/Navbar.jsx:9). Homepage passes no user (public).

### Proposed approach

Auth pages are public — no server-side auth check needed. Add `useAuthRedirect` hook: on mount, checks `/api/me`. If logged in, redirects to role-based dashboard. Prevents logged-in users seeing auth forms.

```js
// lib/hooks/useAuthRedirect.js
// On mount: GET /api/me
// If 200 + user.role -> redirect to dashboard
// If 401 -> stay on page (not logged in)
```

---

## Data Layer

### New file: `lib/data/auth.js`

Centralizes all auth API calls with error handling per LAW 5:

```
fetchAuthConfig()          — GET /api/auth/oauth-config
loginWithEmail(email, pw)  — POST /api/login
loginWithGoogle(credential)— POST /api/auth/google (intent: login)
signupVendor(payload)      — POST /api/signup/vendor
signupOrganiser(payload)   — POST /api/signup/organiser
signupFoodie(payload)      — POST /api/signup/foodie
signupWithGoogle(cred, role)— POST /api/auth/google (intent: signup)
sendPresignupCode(email)   — POST /api/presignup/send-code
verifyPresignupCode(email, code) — POST /api/presignup/verify-code
verifyEmail(code)          — POST /api/verify/email
resendEmailCode()          — POST /api/verify/email/resend
sendPhoneSMS(phone)        — POST /api/verify/phone/send
verifyPhone(code)          — POST /api/verify/phone
skipPhone()                — POST /api/verify/phone/skip
forgotPassword(email)      — POST /api/forgot-password
verifyABN(abn, context)    — POST /api/verify-abn
```

Each function: try/catch, check `response.ok`, log with `[functionName]` prefix, return typed fallback.

---

## Migration Order

### Batch 1 — Foundation (shared components + simple pages)

Establishes the component library. Simple pages validate patterns.

1. Create all shared components in `components/auth/`
2. Create all hooks in `lib/hooks/`
3. Create `lib/data/auth.js`
4. Migrate `login.html` -> `app/login/page.jsx`
5. Migrate `signup.html` -> `app/signup/page.jsx` (server component)
6. Migrate `forgot-password.html` -> `app/forgot-password/page.jsx`
7. Migrate `signup-foodie.html` -> `app/signup/foodie/page.jsx`

### Batch 2 — Complex signup forms

Builds on shared components. Vendor + organiser share brand panel, ABN, email verify modal.

8. Migrate `signup-vendor.html` -> `app/signup/vendor/page.jsx` (6-step wizard)
9. Migrate `signup-organiser.html` -> `app/signup/organiser/page.jsx` (4-step wizard)

### Batch 3 — Verification flow

Post-signup pages. CodeInput already validated in Batch 2 via EmailVerifyModal.

10. Migrate `verify-email.html` -> `app/verify/email/page.jsx`
11. Migrate `verify-phone.html` -> `app/verify/phone/page.jsx`

### After all batches

12. Update `next.config.mjs` — remove auth rewrites
13. Delete legacy HTML files from `pages/`

---

## Complete File List

### Page files (thin, under 80 lines each)

```
app/login/page.jsx
app/signup/page.jsx
app/signup/vendor/page.jsx
app/signup/organiser/page.jsx
app/signup/foodie/page.jsx
app/forgot-password/page.jsx
app/verify/email/page.jsx
app/verify/phone/page.jsx
```

### Shared auth components (23 components)

```
components/auth/AuthLogo.jsx               + .module.css
components/auth/AuthCard.jsx               + .module.css
components/auth/AuthLayout.jsx             + .module.css
components/auth/AuthDivider.jsx            + .module.css
components/auth/FormField.jsx              + .module.css
components/auth/PasswordField.jsx          + .module.css
components/auth/SubmitButton.jsx           + .module.css
components/auth/ErrorMessage.jsx           + .module.css
components/auth/SuccessMessage.jsx         + .module.css
components/auth/CodeInput.jsx              + .module.css
components/auth/GoogleOAuthButton.jsx      + .module.css
components/auth/SignupBrandPanel.jsx        + .module.css
components/auth/StepProgress.jsx           + .module.css
components/auth/EmailVerifyModal.jsx        + .module.css
components/auth/ABNVerifier.jsx            + .module.css
components/auth/CuisineTagSelector.jsx     + .module.css
components/auth/SetupTypeSelector.jsx      + .module.css
components/auth/PlanSelector.jsx           + .module.css
components/auth/DocumentUploadCard.jsx     + .module.css
components/auth/EventTypeTagSelector.jsx   + .module.css
components/auth/EventScaleSelector.jsx     + .module.css
components/auth/StallCountSlider.jsx       + .module.css
components/auth/ReferralSourceGrid.jsx     + .module.css
```

### Page-specific form components

```
components/auth/LoginForm.jsx              + .module.css
components/auth/FoodieSignupForm.jsx       + .module.css
components/auth/ForgotPasswordForm.jsx     + .module.css
components/auth/VerifyEmailForm.jsx        + .module.css
components/auth/VerifyPhoneForm.jsx        + .module.css
components/auth/VendorSignupPage.jsx       + .module.css
components/auth/vendor/VendorStep1Account.jsx
components/auth/vendor/VendorStep2Business.jsx
components/auth/vendor/VendorStep3Setup.jsx
components/auth/vendor/VendorStep4Documents.jsx
components/auth/vendor/VendorStep5Plan.jsx
components/auth/vendor/VendorStep6Success.jsx
components/auth/OrganiserSignupPage.jsx    + .module.css
components/auth/organiser/OrganiserStep1Account.jsx
components/auth/organiser/OrganiserStep2Organisation.jsx
components/auth/organiser/OrganiserStep3Events.jsx
components/auth/organiser/OrganiserStep4Success.jsx
```

### Hooks

```
lib/hooks/useGoogleOAuth.js
lib/hooks/useCooldownTimer.js
lib/hooks/useAuthSubmit.js
lib/hooks/useAuthRedirect.js
lib/hooks/useLocationAutocomplete.js
```

### Data layer

```
lib/data/auth.js
```

### Modified files

```
next.config.mjs       — remove auth rewrites (5 lines)
constants/routes.js   — already has all auth routes, no changes
```

### Deleted files (after verification)

```
pages/login.html
pages/signup.html
pages/signup-vendor.html
pages/signup-organiser.html
pages/signup-foodie.html
pages/forgot-password.html
pages/verify-email.html
pages/verify-phone.html
```

---

## Verification

### After each batch

1. `npx next build` — zero errors
2. Start `node serve.mjs` (background) + `npx next dev`
3. Test each page end-to-end: visual match, form submission, error states, Google OAuth render, redirects, Enter key, mobile viewport

### Key test flows

**Full signup flow**: `/signup` -> choose role -> fill form -> email verify modal -> account created -> success -> redirect to dashboard

**Login flow**: `/login` -> email/password or Google -> redirect to role-based dashboard

**Password reset**: `/forgot-password` -> enter email -> success shown (regardless of email existence)

**Verification flow**: `/verify/email?email=x` -> enter code -> redirect to `/verify/phone` -> enter phone -> send SMS -> enter code -> redirect to dashboard (or skip)

### Final check

Remove auth rewrites from next.config.mjs, delete legacy HTML files, `npx next build` passes, full auth flow works end-to-end.
