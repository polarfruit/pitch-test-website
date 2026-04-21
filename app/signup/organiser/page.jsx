import AuthLayout from '@/components/auth/AuthLayout'
import OrganiserSignupForm from '@/components/auth/OrganiserSignupForm'

export const metadata = {
  title: 'Sign up as an organiser — Pitch.',
  description: 'Create your Pitch. organiser account and start filling events with top food vendors.',
}

export default function OrganiserSignupPage() {
  return (
    <AuthLayout size="wide">
      <OrganiserSignupForm />
    </AuthLayout>
  )
}
