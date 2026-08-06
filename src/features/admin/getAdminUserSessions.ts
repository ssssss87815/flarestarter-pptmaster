import { eq } from 'drizzle-orm'
import { session } from '@/features/auth/auth.schema'
import type { DB } from '@/db/client'

export type AdminUserSession = {
  id: string
  createdAt: string
  expiresAt: string
  ipAddress: string | null
  userAgent: string | null
}

/** Return session metadata only. Never select or serialize the session token. */
export async function getAdminUserSessions(db: DB, userId: string): Promise<AdminUserSession[]> {
  const rows = await db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(eq(session.userId, userId))
    .orderBy(session.createdAt)

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  }))
}

/** Keep the operator's current session reachable while revoking another account. */
export function assertRevocableAdminUserSessions(adminId: string, userId: string): void {
  if (!userId) throw new Error('Invalid user id')
  if (userId === adminId) throw new Error('Cannot revoke the current administrator sessions')
}

/** Revoke every session for a target user after the server-side identity check. */
export async function revokeAdminUserSessions(db: DB, userId: string): Promise<number> {
  const deleted = await db.delete(session).where(eq(session.userId, userId)).returning({ id: session.id })
  return deleted.length
}
