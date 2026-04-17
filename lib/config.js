export const config = {
  apiBase: process.env.EXPRESS_URL
    ?? 'http://localhost:3000',
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  stripePublishableKey:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  nodeEnv: process.env.NODE_ENV ?? 'development',
}

const requiredInProduction = [
  'supabaseUrl',
  'supabaseAnonKey',
]

// Warn at startup if required vars are missing in production.
// Hard throw is deferred to runtime (not build time) because
// next build sets NODE_ENV=production but env vars are only
// injected by Vercel at deploy time, not during local builds.
if (config.nodeEnv === 'production') {
  requiredInProduction.forEach(key => {
    if (!config[key]) {
      console.warn(
        `[config] Missing required environment variable: ${key}`
      )
    }
  })
}
