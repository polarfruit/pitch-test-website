import AuthLayout from '@/components/auth/AuthLayout'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'

export const metadata = {
  title: 'Reset password',
  description: 'Send yourself a password reset link for your Pitch. account.',
  alternates: { canonical: '/forgot-password' },
  openGraph: {
    title: 'Reset password — Pitch.',
    description: 'Send yourself a password reset link for your Pitch. account.',
    url: 'https://onpitch.com.au/forgot-password',
    siteName: 'Pitch.',
    type: 'website',
  },
}

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
