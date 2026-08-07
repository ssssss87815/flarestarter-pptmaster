/**
 * Server-side admin user list: queries the user table directly with Drizzle
 * (search by email OR name, whitelisted sort, pagination) and left-joins each
 * row's `subscription` (customerId/plan/status) + a Stripe dashboard URL.
 *
 * Deliberately NOT `auth.api.listUsers`: that endpoint re-checks the session's
 * DB role, which breaks for admins granted via ADMIN_EMAILS after signup, and
 * it can only search one field at a time. Authorization is the caller's job —
 * every server-fn entry point gates with assertAdmin() (see ./middleware).
 * Plain async fn (no react-start import) so it is workers-testable.
 */
import { count, desc, asc, or, and, eq, sql } from 'drizzle-orm'
import type { DB } from '@/db/client'
import { user } from '@/features/auth/auth.schema'
import { subscription } from '@/features/billing/billing.schema'
import { stripeCustomerUrl } from '@/features/billing/stripe-dashboard'

export interface AdminUserRow {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  role: string | null
  banned: boolean | null
  banReason: string | null
  banExpires: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
  adminNote: string | null
  customerId: string | null
  plan: string | null
  status: string | null
  stripeUrl: string | null
}

export interface AdminUsersParams {
  q?: string
  plan?: 'free' | 'pro'
  role?: 'user' | 'admin'
  page: number
  pageSize: number
  sortBy: string
  sortDir: 'asc' | 'desc'
}

const SORT_COLUMNS = { name: user.name, email: user.email, createdAt: user.createdAt } as const

export async function getAdminUsers(
  db: DB,
  secretKey: string | undefined,
  params: AdminUsersParams,
): Promise<{ rows: AdminUserRow[]; total: number }> {
  const pattern = params.q ? `%${params.q.replace(/[%_!]/g, '!$&')}%` : null
  const conds = []
  if (pattern) {
    conds.push(
      or(
        sql`${user.email} LIKE ${pattern} ESCAPE '!'`,
        sql`${user.name} LIKE ${pattern} ESCAPE '!'`,
      ),
    )
  }
  if (params.plan === 'free' || params.plan === 'pro') conds.push(eq(subscription.plan, params.plan))
  if (params.role === 'user' || params.role === 'admin') conds.push(eq(user.role, params.role))
  const where = conds.length ? and(...conds) : undefined
  const sortCol = SORT_COLUMNS[params.sortBy as keyof typeof SORT_COLUMNS] ?? user.createdAt
  const orderBy = params.sortDir === 'asc' ? asc(sortCol) : desc(sortCol)

  const [listed, [{ c: total }]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        adminNote: user.adminNote,
        customerId: subscription.customerId,
        plan: subscription.plan,
        status: subscription.status,
      })
      .from(user)
      .leftJoin(subscription, eq(subscription.userId, user.id))
      .where(where)
      .orderBy(orderBy)
      .limit(params.pageSize)
      .offset(params.page * params.pageSize),
    db.select({ c: count() }).from(user).where(where),
  ])

  const livemode = !!secretKey && (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_'))

  const rows: AdminUserRow[] = listed.map((u) => ({
    ...u,
    stripeUrl: u.customerId ? stripeCustomerUrl(u.customerId, livemode) : null,
  }))

  return { rows, total: Number(total) }
}
