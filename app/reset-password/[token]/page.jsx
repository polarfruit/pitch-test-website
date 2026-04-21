import AuthLayout from '@/components/auth/AuthLayout'
import ResetPasswordForm from '@/components/auth/ResetPasswordForm'

export const metadata = {
  title: 'Choose a new password',
  description: 'Choose a new password for your Pitch. account.',
  alternates: { canonical: '/reset-password' },
  openGraph: {
    title: 'Choose a new password — Pitch.',
    description: 'Choose a new password for your Pitch. account.',
    url: 'https://onpitch.com.au/reset-password',
    siteName: 'Pitch.',
    type: 'website',
  },
}

export default function ResetPasswordPage({ params }) {
  return (
    <AuthLayout>
      <ResetPasswordForm token={params.token} />
    </AuthLayout>
  )
}
