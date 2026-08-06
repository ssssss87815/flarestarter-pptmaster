import { beforeAll, describe, expect, test } from 'vitest'
import { env } from 'cloudflare:test'
import { createDb } from '@/db/client'
import { session, user } from '@/features/auth/auth.schema'
import { applyAuthSchema } from '@/features/auth/test-helpers'
import { assertRevocableAdminUserSessions, getAdminUserSessions, revokeAdminUserSessions } from './getAdminUserSessions'

beforeAll(async () => {
  await applyAuthSchema(env.DB)
})

describe('admin user session metadata', () => {
  test('rejects empty targets and the current administrator before mutation', () => {
    expect(() => assertRevocableAdminUserSessions('admin-1', '')).toThrow('Invalid user id')
    expect(() => assertRevocableAdminUserSessions('admin-1', 'admin-1')).toThrow('Cannot revoke the current administrator sessions')
    expect(() => assertRevocableAdminUserSessions('admin-1', 'user-2')).not.toThrow()
  })

  test('returns metadata without token and revokes only the selected user sessions', async () => {
    const db = createDb(env.DB)
    const suffix = crypto.randomUUID()
    const now = new Date()
    const targetId = `session-target-${suffix}`
    const otherId = `session-other-${suffix}`
    await db.insert(user).values([
      { id: targetId, name: 'Target', email: `${targetId}@test.com`, emailVerified: true, createdAt: now, updatedAt: now },
      { id: otherId, name: 'Other', email: `${otherId}@test.com`, emailVerified: true, createdAt: now, updatedAt: now },
    ])
    await db.insert(session).values([
      { id: `target-session-${suffix}`, userId: targetId, token: `secret-target-${suffix}`, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 60_000), ipAddress: '203.0.113.1', userAgent: 'Test Agent' },
      { id: `other-session-${suffix}`, userId: otherId, token: `secret-other-${suffix}`, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 60_000) },
    ])

    const metadata = await getAdminUserSessions(db, targetId)
    expect(metadata).toHaveLength(1)
    expect(metadata[0]).toMatchObject({ id: `target-session-${suffix}`, ipAddress: '203.0.113.1', userAgent: 'Test Agent' })
    expect(metadata[0]).not.toHaveProperty('token')
    expect(JSON.stringify(metadata)).not.toContain('secret-target')

    expect(await revokeAdminUserSessions(db, targetId)).toBe(1)
    expect(await getAdminUserSessions(db, targetId)).toEqual([])
    expect(await getAdminUserSessions(db, otherId)).toHaveLength(1)
  })
})
