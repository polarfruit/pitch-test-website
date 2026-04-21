'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ROUTES } from '@/constants/routes'
import { sendPresignupCode, signupOrganiser } from '@/lib/auth'
import StepProgress from './StepProgress'
import EmailVerifyModal from './EmailVerifyModal'
import OrganiserStep1Account from './organiser/OrganiserStep1Account'
import OrganiserStep2Organisation from './organiser/OrganiserStep2Organisation'
import OrganiserStep3Events from './organiser/OrganiserStep3Events'
import OrganiserStep4Success from './organiser/OrganiserStep4Success'
import styles from './SignupWizard.module.css'

const STEP_LABELS = ['Account', 'Organisation', 'Events']
const TOTAL_STEPS = STEP_LABELS.length

function buildInitialState() {
  return {
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm_password: '',
    org_name: '',
    abn: '',
    website: '',
    state: 'SA',
    suburb: '',
    phone: '',
    bio: '',
    event_types: ['Night markets'],
    event_scale: 'Medium',
    stall_range: '20–30 stalls',
    referral: 'Google / Search',
  }
}

function buildSignupPayload(formData) {
  return {
    first_name: formData.first_name.trim(),
    last_name: formData.last_name.trim(),
    email: formData.email.trim(),
    password: formData.password,
    org_name: formData.org_name.trim(),
    abn: formData.abn.replace(/\s/g, ''),
    website: formData.website.trim(),
    state: formData.state,
    suburb: formData.suburb.trim(),
    phone: formData.phone.trim(),
    bio: formData.bio.trim(),
    event_types: formData.event_types,
    event_scale: formData.event_scale,
    stall_range: formData.stall_range,
    referral: formData.referral,
  }
}

export default function OrganiserSignupForm() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState(buildInitialState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState('')
  const [verifyState, setVerifyState] = useState({ open: false, devCode: null })
  const [isSuccess, setIsSuccess] = useState(false)

  function updateField(field, value) {
    setFormData((previous) => ({ ...previous, [field]: value }))
  }

  function goToStep(step) {
    setCurrentStep(step)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function handleFinalSubmit() {
    setSubmissionError('')
    setIsSubmitting(true)

    const result = await sendPresignupCode(formData.email.trim())
    if (!result.ok) {
      setSubmissionError(result.error)
      setIsSubmitting(false)
      return
    }

    setVerifyState({ open: true, devCode: result.devCode })
    setIsSubmitting(false)
  }

  async function handleEmailVerified() {
    const payload = buildSignupPayload(formData)
    const result = await signupOrganiser(payload)
    if (!result.ok) {
      setSubmissionError(result.error)
      setVerifyState({ open: false, devCode: null })
      return
    }
    setVerifyState({ open: false, devCode: null })
    setIsSuccess(true)
    setTimeout(() => {
      router.push(result.redirect)
    }, 1800)
  }

  function handleCancelVerification() {
    setVerifyState({ open: false, devCode: null })
  }

  if (isSuccess) {
    return <OrganiserStep4Success />
  }

  return (
    <>
      <StepProgress currentStep={currentStep} totalSteps={TOTAL_STEPS} labels={STEP_LABELS} />

      {currentStep === 1 ? (
        <OrganiserStep1Account
          formData={formData}
          updateField={updateField}
          onNext={() => goToStep(2)}
        />
      ) : null}

      {currentStep === 2 ? (
        <OrganiserStep2Organisation
          formData={formData}
          updateField={updateField}
          onNext={() => goToStep(3)}
          onBack={() => goToStep(1)}
        />
      ) : null}

      {currentStep === 3 ? (
        <OrganiserStep3Events
          formData={formData}
          updateField={updateField}
          onSubmit={handleFinalSubmit}
          onBack={() => goToStep(2)}
          isSubmitting={isSubmitting}
          submissionError={submissionError}
        />
      ) : null}

      <p className={styles.footer}>
        Already have an account?{' '}
        <Link href={`${ROUTES.LOGIN}?role=organiser`} className={styles.footerLink}>Sign in</Link>
      </p>

      {verifyState.open ? (
        <EmailVerifyModal
          email={formData.email.trim()}
          devCode={verifyState.devCode}
          onVerified={handleEmailVerified}
          onCancel={handleCancelVerification}
        />
      ) : null}
    </>
  )
}
