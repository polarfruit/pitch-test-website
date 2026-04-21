import AuthLayout from '@/components/auth/AuthLayout'
import SignupRoleSelect from '@/components/auth/SignupRoleSelect'

export const metadata = {
  title: 'Sign up — Pitch.',
  description:
    'Create a Pitch. account as a foodie, a food vendor, or an event organiser.',
}

export default function SignupPage() {
  return (
    <AuthLayout size="wide">
      <SignupRoleSelect />
    </AuthLayout>
  )
}
