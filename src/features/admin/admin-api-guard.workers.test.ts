import { describe, expect, test } from 'vitest'
import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { createDb } from '@/db/client'
import { applyAuthSchema, createTestAuth, extractToken } from '@/features/auth/test-helpers'
import { user as userTable } from '@/features/auth/auth.schema'
import { createAuth, type AuthEnv } from '@/features/auth/auth.server'

const TEST_ENV = {
  BETTER_AUTH_SECRET: 'test-secret-for-vitest-only-32-chars!!',
  BETTER_AUTH_URL: 'http://localhost',
  RESEND_API_KEY: 'test-mail-enabled',
}

function authEnv(adminEmails: string): AuthEnv {
  return { ...TEST_ENV, ADMIN_EMAILS: adminEmails, RESEND_API_KEY: undefined }
}

function requestCookies(response: Response): string {
  const cookies = typeof (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (response.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
    : [response.headers.get('set-cookie') ?? '']
  return cookies.map((cookie) => cookie.split(';')[0]).filter(Boolean).join('; ')
}

function mergeCookies(base: string, response: Response): string {
  const merged = new Map<string, string>()
  for (const pair of `${base}; ${requestCookies(response)}`.split(';').map((value) => value.trim()).filter(Boolean)) {
    merged.set(pair.split('=', 1)[0], pair)
  }
  return [...merged.values()].join('; ')
}

async function createAdminSession(email: string, password: string) {
  const db = createDb(env.DB)
  const bootstrap = createTestAuth(db, email)
  await bootstrap.auth.api.signUpEmail({ body: { email, password, name: email }, asResponse: true })
  const verification = bootstrap.sentEmails.find((message) => message.to === email)
  if (!verification) throw new Error('Missing verification email')
  await bootstrap.auth.api.verifyEmail({ query: { token: extractToken(verification.url) }, asResponse: true })
  const response = await bootstrap.auth.api.signInEmail({ body: { email, password }, asResponse: true })
  return requestCookies(response)
}

describe('admin API guard', () => {
  test('blocks native session endpoints so tokens and self-revocation stay behind the safe projection', async () => {
    await applyAuthSchema(env.DB)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS "rateLimit" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "key" TEXT,
      "count" INTEGER NOT NULL,
      "last_request" INTEGER NOT NULL
    )`).run()
    const db = createDb(env.DB)
    const email = `blocked-session-${crypto.randomUUID()}@test.com`
    const cookie = await createAdminSession(email, 'Password123!')
    const auth = createAuth(authEnv(email), db)
    for (const path of ['/api/auth/admin/list-user-sessions', '/api/auth/admin/revoke-user-session', '/api/auth/admin/revoke-user-sessions']) {
      const response = await auth.handler(new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { cookie, origin: 'http://localhost', 'content-type': 'application/json' },
        body: '{}',
      }))
      expect(response.status).toBe(404)
    }
  })

  test('ADMIN_EMAILS authorizes plugin routes; removal returns 404 and demotes stale DB role', async () => {
    await applyAuthSchema(env.DB)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS "rateLimit" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "key" TEXT,
      "count" INTEGER NOT NULL,
      "last_request" INTEGER NOT NULL
    )`).run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS "rateLimit_key_idx" ON "rateLimit" ("key")').run()
    const db = createDb(env.DB)
    const email = `guard-${crypto.randomUUID()}@test.com`
    const password = 'Password123!'
    const cookie = await createAdminSession(email, password)

    const allowed = createAuth(authEnv(email), db)
    const allowedResponse = await allowed.handler(new Request('http://localhost/api/auth/admin/list-users', {
      headers: { cookie },
    }))
    expect(allowedResponse.status).toBe(200)

    const revoked = createAuth(authEnv('someone-else@test.com'), db)
    const deniedResponse = await revoked.handler(new Request('http://localhost/api/auth/admin/list-users', {
      headers: { cookie },
    }))
    expect(deniedResponse.status).toBe(404)

    const [row] = await db.select({ role: userTable.role }).from(userTable).where(eq(userTable.email, email))
    expect(row.role).toBe('user')
  })

  test('impersonated users cannot use admin APIs but can exit after the original admin is revoked', async () => {
    await applyAuthSchema(env.DB)
    const db = createDb(env.DB)
    const adminEmail = `imp-guard-admin-${crypto.randomUUID()}@test.com`
    const targetEmail = `imp-guard-target-${crypto.randomUUID()}@test.com`
    const password = 'Password123!'
    const bootstrap = createTestAuth(db, adminEmail)
    const adminCookie = await createAdminSession(adminEmail, password)
    await bootstrap.auth.api.signUpEmail({ body: { email: targetEmail, password, name: targetEmail }, asResponse: true })
    const targetVerification = bootstrap.sentEmails.find((message) => message.to === targetEmail)
    if (!targetVerification) throw new Error('Missing target verification email')
    await bootstrap.auth.api.verifyEmail({ query: { token: extractToken(targetVerification.url) }, asResponse: true })
    const [target] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, targetEmail))

    const allowed = createAuth(authEnv(adminEmail), db)
    const impersonateResponse = await allowed.handler(new Request('http://localhost/api/auth/admin/impersonate-user', {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ userId: target.id }),
    }))
    expect(impersonateResponse.status).toBe(200)
    const impersonationCookies = mergeCookies(adminCookie, impersonateResponse)

    const revoked = createAuth(authEnv('someone-else@test.com'), db)
    const stopResponse = await revoked.handler(new Request('http://localhost/api/auth/admin/stop-impersonating', {
      method: 'POST',
      headers: { cookie: impersonationCookies, origin: 'http://localhost' },
    }))
    expect(stopResponse.status).toBe(200)

    const forbiddenResponse = await revoked.handler(new Request('http://localhost/api/auth/admin/list-users', {
      headers: { cookie: impersonationCookies },
    }))
    expect(forbiddenResponse.status).toBe(404)
  })
})
