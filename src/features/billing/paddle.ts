/**
 * Paddle Billing provider (Merchant of Record — individual devs, no company
 * registration required). Implements the same PaymentProvider contract as
 * stripe.ts; webhook events are translated into the shared DomainEvent
 * vocabulary so entitlement/applyDomainEvent/handleWebhook stay untouched.
 *
 * Env (absent => provider degrades / checkout throws a clear error):
 *   PAYMENT_PROVIDER      'stripe' | 'paddle'  (factory switch)
 *   PADDLE_API_KEY        sandbox/live API key (paddle_...)
 *   PADDLE_WEBHOOK_SECRET webhook signing secret (pdl_whsec_...)
 *   PADDLE_COLLECTION_ID  checkout collection that owns the Pro prices
 *   PADDLE_ENV            'sandbox' | 'live' (defaults to sandbox)
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PaymentProvider, CheckoutInput } from './payment'
import type { DomainEvent } from './entitlement'

export interface PaddleEnv {
  PADDLE_API_KEY?: string
  PADDLE_WEBHOOK_SECRET?: string
  PADDLE_COLLECTION_ID?: string
  PADDLE_ENV?: string
}

const API_BASE = 'https://api.paddle.com'
const CHECKOUT_BASES = { sandbox: 'https://sandbox-checkout.paddle.com', live: 'https://checkout.paddle.com' } as const

function apiBase(env: PaddleEnv): string {
  return env.PADDLE_ENV === 'live' ? CHECKOUT_BASES.live : CHECKOUT_BASES.sandbox
}

/** Verify Paddle's `Paddle-Signature: ts=...;h1=...` HMAC-SHA256 header. */
export function verifyPaddleSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader || !secret) return false
  const parts = new Map<string, string>()
  for (const pair of signatureHeader.split(';')) {
    const idx = pair.indexOf('=')
    if (idx > 0) parts.set(pair.slice(0, idx), pair.slice(idx + 1))
  }
  const ts = parts.get('ts')
  const h1 = parts.get('h1')
  if (!ts || !h1) return false
  // 5-minute clock skew guard (reject replay of old payloads)
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex')
  const a = Buffer.from(h1, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function paddleStatusToDomain(status: string): string {
  // Paddle statuses (active/trialing/past_due/paused/canceled) map 1:1 onto
  // the DomainEvent status vocabulary already understood by isActivePro.
  return status
}

function customerIdFromEvent(data: { customer_id?: string | null }): string {
  // Subscription rows store the real Paddle customer id (ensureCustomer
  // creates it), so webhook events match by the same id space as Stripe.
  return data.customer_id ?? ''
}

/** Translate a verified Paddle webhook body into a DomainEvent. Throws on bad signature. */
export async function translatePaddleEvent(rawBody: string, signatureHeader: string, env: PaddleEnv): Promise<DomainEvent> {
  const secret = env.PADDLE_WEBHOOK_SECRET ?? ''
  if (!verifyPaddleSignature(rawBody, signatureHeader, secret)) {
    throw new Error('invalid paddle signature')
  }
  const payload = JSON.parse(rawBody) as {
    event_id?: string
    event_type?: string
    data?: Record<string, any>
  }
  const eventId = payload.event_id ?? ''
  const type = payload.event_type ?? ''
  const data = (payload.data ?? {}) as Record<string, any>

  if (type === 'subscription.created' || type === 'subscription.updated') {
    const items = Array.isArray(data.items) ? data.items : []
    const price = items[0]?.price as { id?: string } | undefined
    const period = data.current_billing_period as { ends_at?: string } | undefined
    return {
      type: 'subscription.upserted',
      eventId,
      customerId: customerIdFromEvent(data),
      subscriptionId: String(data.id ?? ''),
      status: paddleStatusToDomain(String(data.status ?? 'unknown')),
      priceId: price?.id ?? null,
      currentPeriodEnd: period?.ends_at ? Date.parse(period.ends_at) : null,
      cancelAtPeriodEnd: Boolean(data.scheduled_change),
      occurredAt: Date.now(),
    }
  }
  if (type === 'subscription.canceled') {
    return {
      type: 'subscription.deleted',
      eventId,
      customerId: customerIdFromEvent(data),
      subscriptionId: String(data.id ?? ''),
      occurredAt: Date.now(),
    }
  }
  if (type === 'transaction.completed') {
    const items = Array.isArray(data.items) ? data.items : []
    const price = items[0]?.price as { id?: string; billing_cycle?: unknown } | undefined
    // Subscription first payments flow through subscription.* events; only
    // one-off (lifetime) purchases with no billing cycle are purchases here.
    if (price?.billing_cycle) return { type: 'ignored', eventId }
    return {
      type: 'purchase.completed',
      eventId,
      customerId: customerIdFromEvent(data),
      priceId: price?.id ?? null,
      paymentIntentId: String(data.id ?? ''),
    }
  }
  if (type === 'transaction.refunded') {
    return {
      type: 'purchase.refunded',
      eventId,
      customerId: customerIdFromEvent(data),
      paymentIntentId: String(data.id ?? ''),
    }
  }
  if (type === 'transaction.payment_failed') {
    return {
      type: 'payment.failed',
      eventId,
      customerId: customerIdFromEvent(data),
      occurredAt: Date.now(),
    }
  }
  return { type: 'ignored', eventId }
}

export function createPaddleProvider(env: PaddleEnv): PaymentProvider {
  const base = apiBase(env)
  const collectionId = env.PADDLE_COLLECTION_ID ?? ''

  const api = async (path: string, init: RequestInit = {}): Promise<any> => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.PADDLE_API_KEY ?? ''}`,
        ...(init.headers ?? {}),
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`paddle api ${path} -> ${res.status} ${body.slice(0, 200)}`)
    }
    return res.json()
  }

  return {
    async ensureCustomer(user, existingCustomerId) {
      if (existingCustomerId) return existingCustomerId
      // Reuse an existing Paddle customer for this email if present.
      const list = await api(`/customers?email=${encodeURIComponent(user.email)}`)
      const existing = Array.isArray(list.data) ? list.data[0] : undefined
      if (existing?.id) return String(existing.id)
      const created = await api('/customers', {
        method: 'POST',
        body: JSON.stringify({ email: user.email, custom_data: { user_id: user.id } }),
      })
      return String(created.data?.id ?? '')
    },

    async createCheckoutSession(input: CheckoutInput) {
      if (!collectionId) throw new Error('PADDLE_COLLECTION_ID is not configured')
      const params = new URLSearchParams({
        price_id: input.priceId,
        customer_id: input.customerId,
        custom_data: JSON.stringify({ user_id: input.userId, mode: input.mode, return_to: input.successUrl }),
      })
      // Paddle Checkout has no server-side success_url redirect; the customer
      // lands back on the collection's return page. The entitlement flips via
      // webhook regardless, so the app UI refreshes on next load.
      return { url: `${base}/custom/${collectionId}?${params.toString()}` }
    },

    async createPortalSession(customerId, returnUrl) {
      const session = await api(`/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
        method: 'POST',
        body: JSON.stringify({ return_url: returnUrl }),
      })
      const url = session.data?.urls?.general?.customer_portal ?? session.data?.urls?.customer_portal ?? ''
      if (!url) throw new Error('paddle portal session returned no url')
      return { url }
    },

    async cancelSubscription(subscriptionId) {
      // Immediate cancel (idempotent for already-canceled/missing subs).
      await api(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { method: 'POST' })
    },

    async parseWebhook(rawBody, signature) {
      return translatePaddleEvent(rawBody, signature, env)
    },
  }
}
