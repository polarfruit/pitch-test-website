import AuthLayout from '@/components/auth/AuthLayout'
import LoginForm from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Log in — Pitch.',
  description:
    'Sign in to your Pitch. account to manage events, vendors, or bookings.',
}

export default function LoginPage() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  )
}
