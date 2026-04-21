import AuthLayout from '@/components/auth/AuthLayout'
import VendorSignupForm from '@/components/auth/VendorSignupForm'

export const metadata = {
  title: 'Sign up as a vendor — Pitch.',
  description: 'Create your Pitch. vendor account and start applying to events across South Australia.',
}

export default function VendorSignupPage() {
  return (
    <AuthLayout size="wide">
      <VendorSignupForm />
    </AuthLayout>
  )
}
