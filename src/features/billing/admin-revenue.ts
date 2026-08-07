/**
 * Admin revenue console — read-only Stripe queries for the /admin/revenue
 * page. This is the only place admin surfaces call Stripe read APIs;
 * every other admin surface reads D1 only. Degrades to { unavailable: true }
 * when STRIPE_SECRET_KEY is absent (no-mock convention).
 */
import Stripe from 'stripe'

export interface RevenueCharge {
  id: string
  amount: number // cents
  currency: string
  status: string
  created: number
  email: string | null
  description: string | null
}

export interface RevenueSubscription {
  id: string
  customer: string
  plan: string | null
  status: string
  amount: number | null // cents per interval
  interval: string | null
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
}

export interface RevenueRefund {
  id: string
  amount: number // cents
  currency: string
  status: string | null
  created: number
  charge: string | null
}

export interface AdminRevenue {
  livemode: boolean
  available: number
  pending: number
  currency: string
  charges: RevenueCharge[]
  subscriptions: RevenueSubscription[]
  refunds: RevenueRefund[]
}

export type AdminRevenueResult = { unavailable: true } | AdminRevenue

export async function getAdminRevenue(env: { STRIPE_SECRET_KEY: string }): Promise<AdminRevenueResult> {
  const key = env.STRIPE_SECRET_KEY
  if (!key) return { unavailable: true }
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() })
  try {
    const [balance, charges, subs, refunds] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.charges.list({ limit: 15 }),
      stripe.subscriptions.list({ limit: 15, status: 'all' }),
      stripe.refunds.list({ limit: 10 }),
    ])
    const currency = balance.available[0]?.currency ?? 'usd'
    const available = balance.available.reduce((s, b) => s + b.amount, 0)
    const pending = balance.pending.reduce((s, b) => s + b.amount, 0)
    return {
      livemode: key.startsWith('sk_live_') || key.startsWith('rk_live_'),
      available,
      pending,
      currency,
      charges: charges.data.map((c) => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        status: c.status,
        created: c.created,
        email: c.billing_details?.email ?? c.receipt_email ?? null,
        description: c.description ?? null,
      })),
      subscriptions: subs.data.map((s) => ({
        id: s.id,
        customer: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? '',
        plan: s.items.data[0]?.price?.nickname ?? s.items.data[0]?.price?.id ?? null,
        status: s.status,
        amount: s.items.data[0]?.price?.unit_amount ?? null,
        interval: s.items.data[0]?.price?.recurring?.interval ?? null,
        currentPeriodEnd: (s as { current_period_end?: number | null }).current_period_end ?? null,
        cancelAtPeriodEnd: s.cancel_at_period_end,
      })),
      refunds: refunds.data.map((r) => ({
        id: r.id,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        created: r.created,
        charge: typeof r.charge === 'string' ? r.charge : r.charge?.id ?? null,
      })),
    }
  } catch (err) {
    // Stripe auth/network failures must not 500 the admin page.
    return { unavailable: true }
  }
}
