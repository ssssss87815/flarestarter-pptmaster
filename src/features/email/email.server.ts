import { Resend } from 'resend'
import { renderEmail } from './templates'
import { createDevTransport, type SentEmail } from './dev-transport'
import type { Locale } from '@/features/i18n/locale'

export interface SendEmailInput {
  to: string
  locale: Locale
  template: 'verify-email' | 'reset-password' | 'pro-activated'
  data: { url: string }
}

interface Transport {
  send(email: SentEmail): Promise<void>
}

/** 可注入 transport 的内部实现（便于测试）。 */
export async function sendEmailWith(transport: Transport, input: SendEmailInput): Promise<void> {
  const rendered = await renderEmail(input)
  await transport.send({ to: input.to, subject: rendered.subject, html: rendered.html, text: rendered.text })
}

/** Exported for tests. Resend's SDK reports API failures via `{ error }` instead of
 *  throwing — without this check a bad EMAIL_FROM or a rate-limit silently drops
 *  verify/reset emails while better-auth believes they were sent. */
export function resendTransport(apiKey: string, from: string): Transport {
  const resend = new Resend(apiKey)
  return {
    async send(email) {
      const { error } = await resend.emails.send({ from, to: email.to, subject: email.subject, html: email.html, text: email.text })
      if (error) throw new Error(`Resend send failed: ${error.name}: ${error.message}`)
    },
  }
}

/** 生产入口：有 RESEND_API_KEY 则用 Resend，否则降级到控制台捕获（本地不误发）。 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  // Dynamic import keeps cloudflare:workers out of the module graph in node/test environments.
  const { env } = await import('@/lib/env')
  const apiKey = env.RESEND_API_KEY
  const from = env.EMAIL_FROM || 'PPTMaster <onboarding@resend.dev>'
  // 生产构建里降级路径要脱敏（import.meta.env.PROD 由 vite 构建期注入；vite dev 为 false，
  // 本地开发照旧在控制台拿到完整链接）。
  const transport: Transport = apiKey ? resendTransport(apiKey, from) : createDevTransport({ redactBody: import.meta.env.PROD })
  await sendEmailWith(transport, input)
}
