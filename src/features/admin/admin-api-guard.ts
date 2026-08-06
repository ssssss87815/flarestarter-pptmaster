import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from 'better-auth/api'
import type { DB } from '@/db/client'
import { isAdminEmail } from './is-admin'
import { syncAdminRole } from './ensure-admin'

const BLOCKED_SESSION_ENDPOINTS = new Set([
  '/admin/list-user-sessions',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
])

function adminPath(path: string | undefined): string {
  const value = path ?? ''
  const index = value.indexOf('/admin/')
  return index >= 0 ? value.slice(index) : value
}

/**
 * Better Auth's admin plugin authorizes from the cached DB role. Guard every
 * browser-facing plugin endpoint with ADMIN_EMAILS as the authority too, so a
 * removed admin cannot bypass our page/server-fn gate by calling /api/auth/admin/*.
 */
export function createAdminApiGuard(db: DB, adminEmails: string | undefined) {
  return createAuthMiddleware(async (ctx) => {
    const path = adminPath(ctx.path)
    if (!path.startsWith('/admin/')) return

    // The Better Auth plugin exposes raw session tokens from list-user-sessions
    // and allows unrestricted self-revocation. Session governance is deliberately
    // implemented by our metadata-only server functions instead.
    if (BLOCKED_SESSION_ENDPOINTS.has(path)) throw APIError.fromStatus('NOT_FOUND')

    const session = await getAuthoritativeSessionFromCtx(ctx)
    // The impersonated session belongs to the target user, so it is not in
    // ADMIN_EMAILS. Keep only the dedicated exit endpoint reachable there.
    if (path === '/admin/stop-impersonating' && session?.session.impersonatedBy) return
    if (!session || !isAdminEmail(session.user.email, adminEmails)) {
      if (session?.user.role === 'admin') await syncAdminRole(db, session.user, adminEmails)
      throw APIError.fromStatus('NOT_FOUND')
    }

    await syncAdminRole(db, session.user, adminEmails)
  })
}
