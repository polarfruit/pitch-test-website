import AuthLayout from '@/components/auth/AuthLayout'
import LoginForm from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Log in',
  description:
    'Sign in to your Pitch. account to manage events, vendors, or bookings.',
  alternates: { canonical: '/login' },
  openGraph: {
    title: 'Log in — Pitch.',
    description:
      'Sign in to your Pitch. account to manage events, vendors, or bookings.',
    url: 'https://onpitch.com.au/login',
    siteName: 'Pitch.',
    type: 'website',
  },
}

export default function LoginPage() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  )
}
