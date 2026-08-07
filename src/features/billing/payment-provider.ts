/**
 * Payment provider factory — the single place billing chooses its gateway.
 * PAYMENT_PROVIDER env selects the implementation; absent/unknown falls back
 * to Stripe (the original default) so existing deployments never break.
 */
import type { PaymentProvider } from './payment'

export type PaymentProviderKind = 'stripe' | 'paddle'

export function resolvePaymentProviderKind(raw: string | undefined): PaymentProviderKind {
  return raw === 'paddle' ? 'paddle' : 'stripe'
}

export async function createPaymentProvider(env: Record<string, string | undefined>): Promise<PaymentProvider> {
  const kind = resolvePaymentProviderKind(env.PAYMENT_PROVIDER)
  if (kind === 'paddle') {
    const { createPaddleProvider } = await import('./paddle')
    return createPaddleProvider(env)
  }
  const { createStripeProvider } = await import('./stripe')
  return createStripeProvider(env)
}
