import AuthLayout from '@/components/auth/AuthLayout'
import ResetPasswordForm from '@/components/auth/ResetPasswordForm'

export const metadata = {
  title: 'Reset password — Pitch.',
  description: 'Choose a new password for your Pitch. account.',
}

export default function ResetPasswordPage({ params }) {
  return (
    <AuthLayout>
      <ResetPasswordForm token={params.token} />
    </AuthLayout>
  )
}
