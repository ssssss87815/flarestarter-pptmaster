import { describe, test, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyPaddleSignature, translatePaddleEvent, createPaddleProvider } from './paddle'

const SECRET = 'pdl_whsec_testsecret123'

function sign(rawBody: string, ts: number, secret = SECRET): string {
  const h1 = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex')
  return `ts=${ts};h1=${h1}`
}

describe('verifyPaddleSignature', () => {
  test('valid signature passes', () => {
    const body = '{"event_id":"evt_1"}'
    expect(verifyPaddleSignature(body, sign(body, Math.floor(Date.now() / 1000)), SECRET)).toBe(true)
  })
  test('tampered body fails', () => {
    const body = '{"event_id":"evt_1"}'
    const sig = sign(body, Math.floor(Date.now() / 1000))
    expect(verifyPaddleSignature(body + 'x', sig, SECRET)).toBe(false)
  })
  test('wrong secret fails', () => {
    const body = '{"event_id":"evt_1"}'
    expect(verifyPaddleSignature(body, sign(body, Math.floor(Date.now() / 1000), 'wrong'), SECRET)).toBe(false)
  })
  test('missing ts/h1 fails', () => {
    expect(verifyPaddleSignature('{}', 'h1=abc', SECRET)).toBe(false)
  })
  test('stale signature (replay) fails', () => {
    const body = '{"event_id":"evt_1"}'
    const stale = Math.floor(Date.now() / 1000) - 600 // 10 min old
    expect(verifyPaddleSignature(body, sign(body, stale), SECRET)).toBe(false)
  })
})

function signedBody(payload: unknown, secret = SECRET): { raw: string; sig: string } {
  const raw = JSON.stringify(payload)
  return { raw, sig: sign(raw, Math.floor(Date.now() / 1000), secret) }
}

const ENV = { PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_COLLECTION_ID: 'col_01', PADDLE_API_KEY: 'paddle_test_x', PADDLE_ENV: 'sandbox' }

describe('translatePaddleEvent', () => {
  test('subscription.created → subscription.upserted with mapped fields', async () => {
    const { raw, sig } = signedBody({
      event_id: 'evt_sub_1',
      event_type: 'subscription.created',
      data: {
        id: 'sub_123',
        customer_id: 'cus_456',
        status: 'active',
        items: [{ price: { id: 'pri_789', billing_cycle: { interval: 'month', frequency: 1 } } }],
        current_billing_period: { ends_at: '2026-09-01T00:00:00Z' },
        scheduled_change: null,
      },
    })
    const ev = await translatePaddleEvent(raw, sig, ENV)
    expect(ev).toMatchObject({
      type: 'subscription.upserted',
      eventId: 'evt_sub_1',
      customerId: 'cus_456',
      subscriptionId: 'sub_123',
      status: 'active',
      priceId: 'pri_789',
      cancelAtPeriodEnd: false,
    })
    expect(ev.type === 'subscription.upserted' && ev.currentPeriodEnd).toBe(Date.parse('2026-09-01T00:00:00Z'))
  })

  test('scheduled_change present → cancelAtPeriodEnd true', async () => {
    const { raw, sig } = signedBody({
      event_id: 'evt_sub_2',
      event_type: 'subscription.updated',
      data: {
        id: 'sub_123',
        customer_id: 'cus_456',
        status: 'active',
        items: [{ price: { id: 'pri_789' } }],
        scheduled_change: { action: 'cancel' },
      },
    })
    const ev = await translatePaddleEvent(raw, sig, ENV)
    expect(ev.type === 'subscription.upserted' && ev.cancelAtPeriodEnd).toBe(true)
  })

  test('subscription.canceled → subscription.deleted', async () => {
    const { raw, sig } = signedBody({
      event_id: 'evt_sub_3',
      event_type: 'subscription.canceled',
      data: { id: 'sub_123', customer_id: 'cus_456' },
    })
    const ev = await translatePaddleEvent(raw, sig, ENV)
    expect(ev).toMatchObject({ type: 'subscription.deleted', subscriptionId: 'sub_123', customerId: 'cus_456' })
  })

  test('one-off transaction.completed → purchase.completed (lifetime)', async () => {
    const { raw, sig } = signedBody({
      event_id: 'evt_tx_1',
      event_type: 'transaction.completed',
      data: { id: 'tx_1', customer_id: 'cus_456', items: [{ price: { id: 'pri_lifetime', billing_cycle: null } }] },
    })
    const ev = await translatePaddleEvent(raw, sig, ENV)
    expect(ev).toMatchObject({ type: 'purchase.completed', customerId: 'cus_456', paymentIntentId: 'tx_1' })
  })

  test('subscription transaction.completed → ignored (subscription events own it)', async () => {
    const { raw, sig } = signedBody({
      event_id: 'evt_tx_2',
      event_type: 'transaction.completed',
      data: { id: 'tx_2', customer_id: 'cus_456', items: [{ price: { id: 'pri_789', billing_cycle: { interval: 'month' } } }] },
    })
    const ev = await translatePaddleEvent(raw, sig, ENV)
    expect(ev.type).toBe('ignored')
  })

  test('transaction.refunded → purchase.refunded', async () => {
    const { raw, sig } = signedBody({
      event_id: 'evt_tx_3',
      event_type: 'transaction.refunded',
      data: { id: 'tx_3', customer_id: 'cus_456' },
    })
    const ev = await translatePaddleEvent(raw, sig, ENV)
    expect(ev).toMatchObject({ type: 'purchase.refunded', paymentIntentId: 'tx_3' })
  })

  test('unknown event → ignored', async () => {
    const { raw, sig } = signedBody({ event_id: 'evt_other', event_type: 'product.created', data: {} })
    const ev = await translatePaddleEvent(raw, sig, ENV)
    expect(ev.type).toBe('ignored')
  })

  test('bad signature throws', async () => {
    const { raw } = signedBody({ event_id: 'evt_bad', event_type: 'subscription.created', data: {} })
    await expect(translatePaddleEvent(raw, 'ts=1;h1=deadbeef', ENV)).rejects.toThrow()
  })
})

describe('createPaddleProvider', () => {
  test('checkout session builds collection URL with price/customer/custom_data', async () => {
    const provider = createPaddleProvider(ENV)
    const { url } = await provider.createCheckoutSession({
      customerId: 'cus_456',
      priceId: 'pri_789',
      userId: 'user_1',
      successUrl: 'https://app.example/app',
      cancelUrl: 'https://app.example/pricing',
      mode: 'subscription',
    })
    expect(url).toContain('https://sandbox-checkout.paddle.com/custom/col_01?')
    expect(url).toContain('price_id=pri_789')
    expect(url).toContain('customer_id=cus_456')
    expect(url).toContain(encodeURIComponent('user_1'))
  })

  test('missing collection id throws a clear error', async () => {
    const provider = createPaddleProvider({ PADDLE_WEBHOOK_SECRET: SECRET })
    await expect(
      provider.createCheckoutSession({
        customerId: 'cus', priceId: 'pri', userId: 'u', successUrl: '', cancelUrl: '', mode: 'subscription',
      }),
    ).rejects.toThrow('PADDLE_COLLECTION_ID')
  })
})
