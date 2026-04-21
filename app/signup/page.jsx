import AuthLayout from '@/components/auth/AuthLayout'
import SignupRoleSelect from '@/components/auth/SignupRoleSelect'

export const metadata = {
  title: 'Sign up',
  description:
    'Create a Pitch. account as a foodie, a food vendor, or an event organiser.',
  alternates: { canonical: '/signup' },
  openGraph: {
    title: 'Sign up — Pitch.',
    description:
      'Create a Pitch. account as a foodie, a food vendor, or an event organiser.',
    url: 'https://onpitch.com.au/signup',
    siteName: 'Pitch.',
    type: 'website',
  },
}

export default function SignupPage() {
  return (
    <AuthLayout size="wide">
      <SignupRoleSelect />
    </AuthLayout>
  )
}
