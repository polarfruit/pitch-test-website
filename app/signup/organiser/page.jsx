import AuthLayout from '@/components/auth/AuthLayout'
import OrganiserSignupForm from '@/components/auth/OrganiserSignupForm'

export const metadata = {
  title: 'Sign up as an organiser',
  description: 'Create your Pitch. organiser account and start filling events with top food vendors.',
  alternates: { canonical: '/signup/organiser' },
  openGraph: {
    title: 'Sign up as an organiser — Pitch.',
    description: 'Create your Pitch. organiser account and start filling events with top food vendors.',
    url: 'https://onpitch.com.au/signup/organiser',
    siteName: 'Pitch.',
    type: 'website',
  },
}

export default function OrganiserSignupPage() {
  return (
    <AuthLayout size="wide">
      <OrganiserSignupForm />
    </AuthLayout>
  )
}
