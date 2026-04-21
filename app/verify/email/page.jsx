import { Suspense } from 'react'
import AuthLayout from '@/components/auth/AuthLayout'
import VerifyEmailForm from '@/components/auth/VerifyEmailForm'

export const metadata = {
  title: 'Verify email',
  description: 'Enter the 6-digit code we sent to your email to activate your Pitch. account.',
  alternates: { canonical: '/verify/email' },
  openGraph: {
    title: 'Verify email — Pitch.',
    description: 'Enter the 6-digit code we sent to your email to activate your Pitch. account.',
    url: 'https://onpitch.com.au/verify/email',
    siteName: 'Pitch.',
    type: 'website',
  },
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
