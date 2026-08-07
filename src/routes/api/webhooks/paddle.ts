import { createFileRoute } from '@tanstack/react-router'
import { env } from '@/lib/env'
import { createDb } from '@/db/client'
import { applyDomainEvent, handleWebhook } from '@/features/billing/billing.server'
import { runBillingHooks } from '@/features/billing/hooks'
import { translatePaddleEvent, type PaddleEnv } from '@/features/billing/paddle'
import { createPaymentProvider } from '@/features/billing/payment-provider'

const handler = async ({ request }: { request: Request }) => {
  const rawBody = await request.text()
  const signature = request.headers.get('paddle-signature') ?? ''
  const db = createDb(env.DB)

  // Paddle subscription cancellations requested from our UI must be wired
  // into the same idempotent cancel used by Stripe's lifetime path.
  const provider = await createPaymentProvider(env)
  const status = await handleWebhook(
    db,
    (raw, sig) => translatePaddleEvent(raw, sig, env as PaddleEnv),
    rawBody,
    signature,
    Date.now(),
    (d, ev, now) => applyDomainEvent(d, ev, now, (id) => provider.cancelSubscription(id)),
    runBillingHooks,
  )
  return new Response(status === 200 ? 'ok' : 'error', { status })
}

export const Route = createFileRoute('/api/webhooks/paddle')({
  server: { handlers: { POST: handler } },
})
