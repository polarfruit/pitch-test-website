'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ROUTES } from '@/constants/routes'
import { sendPresignupCode, signupVendor } from '@/lib/auth'
import StepProgress from './StepProgress'
import EmailVerifyModal from './EmailVerifyModal'
import VendorStep1Account from './vendor/VendorStep1Account'
import VendorStep2Business from './vendor/VendorStep2Business'
import VendorStep3Setup from './vendor/VendorStep3Setup'
import VendorStep4Documents from './vendor/VendorStep4Documents'
import VendorStep5Plan from './vendor/VendorStep5Plan'
import VendorStep6Success from './vendor/VendorStep6Success'
import styles from './SignupWizard.module.css'

const STEP_LABELS = ['Account', 'Business', 'Setup', 'Docs', 'Plan']
const TOTAL_STEPS = STEP_LABELS.length

function buildInitialState() {
  return {
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm_password: '',
    trading_name: '',
    abn: '',
    mobile: '',
    state: 'SA',
    suburb: '',
    bio: '',
    cuisine_tags: [],
    setup_type: 'truck',
    stall_w: '3',
    stall_d: '3',
    power: false,
    water: false,
    price_range: '$',
    instagram: '',
    documents: {},
    plan: 'pro',
  }
}

function buildSignupPayload(formData) {
  return {
    first_name: formData.first_name.trim(),
    last_name: formData.last_name.trim(),
    email: formData.email.trim(),
    password: formData.password,
    trading_name: formData.trading_name.trim(),
    abn: formData.abn.replace(/\s/g, ''),
    mobile: formData.mobile.trim(),
    state: formData.state,
    suburb: formData.suburb.trim(),
    bio: formData.bio.trim(),
    cuisine_tags: formData.cuisine_tags,
    setup_type: formData.setup_type,
    stall_w: Number(formData.stall_w) || 3,
    stall_d: Number(formData.stall_d) || 3,
    power: Boolean(formData.power),
    water: Boolean(formData.water),
    price_range: formData.price_range,
    instagram: formData.instagram.trim(),
    plan: formData.plan,
  }
}

export default function VendorSignupForm() {
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
    const result = await signupVendor(payload)
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
    return <VendorStep6Success />
  }

  return (
    <>
      <StepProgress currentStep={currentStep} totalSteps={TOTAL_STEPS} labels={STEP_LABELS} />

      {currentStep === 1 ? (
        <VendorStep1Account
          formData={formData}
          updateField={updateField}
          onNext={() => goToStep(2)}
        />
      ) : null}

      {currentStep === 2 ? (
        <VendorStep2Business
          formData={formData}
          updateField={updateField}
          onNext={() => goToStep(3)}
          onBack={() => goToStep(1)}
        />
      ) : null}

      {currentStep === 3 ? (
        <VendorStep3Setup
          formData={formData}
          updateField={updateField}
          onNext={() => goToStep(4)}
          onBack={() => goToStep(2)}
        />
      ) : null}

      {currentStep === 4 ? (
        <VendorStep4Documents
          formData={formData}
          updateField={updateField}
          onNext={() => goToStep(5)}
          onBack={() => goToStep(3)}
        />
      ) : null}

      {currentStep === 5 ? (
        <VendorStep5Plan
          formData={formData}
          updateField={updateField}
          onSubmit={handleFinalSubmit}
          onBack={() => goToStep(4)}
          isSubmitting={isSubmitting}
          submissionError={submissionError}
        />
      ) : null}

      <p className={styles.footer}>
        Already have an account?{' '}
        <Link href={ROUTES.LOGIN} className={styles.footerLink}>Sign in</Link>
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
