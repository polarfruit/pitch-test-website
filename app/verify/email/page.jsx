import { Suspense } from 'react'
import AuthLayout from '@/components/auth/AuthLayout'
import VerifyEmailForm from '@/components/auth/VerifyEmailForm'

export const metadata = {
  title: 'Verify email — Pitch.',
  description: 'Enter the 6-digit code we sent to your email to activate your Pitch. account.',
}

export default function VerifyEmailPage() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <VerifyEmailForm />
      </Suspense>
    </AuthLayout>
  )
}
