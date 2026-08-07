import { createServerFn } from '@tanstack/react-start'
import { env } from '@/lib/env'
import { createDb } from '@/db/client'
import { assertAdmin } from './assert-admin.server'
import { clampPage, clampPageSize, clampSortDir } from './params'
import { getAdminStats } from './admin.server'
import type { AdminStats } from './admin.server'
import { getAdminUsers, type AdminUsersParams, type AdminUserRow } from './getAdminUsers'
import { getWaitlist, type WaitlistRow } from '@/features/waitlist/getWaitlist'
import { listSponsorships, setSponsorshipHidden, type AdminSponsorRow } from '@/features/sponsor/sponsor.server'
import { listFeedbackForAdmin, setFeedbackStatus, type AdminFeedbackRow } from '@/features/feedback/feedback.server'
import type { FeedbackStatus } from '@/features/feedback/feedback.shared'
import { assertRevocableAdminUserSessions, getAdminUserSessions, revokeAdminUserSessions, type AdminUserSession } from './getAdminUserSessions'
import { getPptMasterHealth } from '@/features/pptmaster/client'
import { getAdminRevenue, type AdminRevenueResult } from '@/features/billing/admin-revenue'

export type { AdminRevenueResult }

export type { AdminStats }
export type { AdminUserRow }
export type { WaitlistRow }
export type { AdminSponsorRow }
export type { AdminFeedbackRow }
export type { AdminUserSession }

/** 仅管理员可过；非管理员 → 404（不泄露 admin 存在）。返回 admin user。 */
export const requireAdmin = createServerFn({ method: 'GET' }).handler(() => assertAdmin())

/** server fn：assertAdmin → 聚合。 */
export const getAdminStatsFn = createServerFn({ method: 'GET' }).handler(async (): Promise<AdminStats> => {
  await assertAdmin()
  return getAdminStats(createDb(env.DB), Date.now())
})

/** server fn: assertAdmin → list waitlist entries paginated. */
export const getWaitlistFn = createServerFn({ method: 'GET' })
  .validator((d: { page?: number; pageSize?: number }) => ({ page: clampPage(d?.page), pageSize: clampPageSize(d?.pageSize) }))
  .handler(async ({ data }): Promise<{ rows: WaitlistRow[]; total: number }> => {
    await assertAdmin()
    return getWaitlist(createDb(env.DB), data)
  })

/** server fn: assertAdmin → list users (email/name search) with merged billing. */
export const getAdminUsersFn = createServerFn({ method: 'GET' })
  .validator((d: Partial<AdminUsersParams>) => ({
    q: typeof d?.q === 'string' ? d.q.slice(0, 200) : undefined,
    page: clampPage(d?.page),
    pageSize: clampPageSize(d?.pageSize),
    sortBy: typeof d?.sortBy === 'string' ? d.sortBy : 'createdAt', // getAdminUsers 内部再按白名单回退
    sortDir: clampSortDir(d?.sortDir),
  }))
  .handler(async ({ data }): Promise<{ rows: AdminUserRow[]; total: number }> => {
    await assertAdmin()
    return getAdminUsers(createDb(env.DB), env.STRIPE_SECRET_KEY, data)
  })

/** server fn: assertAdmin → list sponsorships paginated (governance view). */
export const getSponsorshipsFn = createServerFn({ method: 'GET' })
  .validator((d: { page?: number; pageSize?: number }) => ({ page: clampPage(d?.page), pageSize: clampPageSize(d?.pageSize) }))
  .handler(async ({ data }): Promise<{ rows: AdminSponsorRow[]; total: number }> => {
    await assertAdmin()
    return listSponsorships(createDb(env.DB), data)
  })

/** server fn: assertAdmin → hide/unhide a sponsorship on the public wall. */
export const setSponsorshipHiddenFn = createServerFn({ method: 'POST' })
  .validator((d: { id: string; hidden: boolean }) => d)
  .handler(async ({ data }): Promise<void> => {
    await assertAdmin()
    await setSponsorshipHidden(createDb(env.DB), data.id, data.hidden)
  })

/** server fn: assertAdmin → 反馈治理列表（含提交人与 Pro 徽章派生）。 */
export const getFeedbackFn = createServerFn({ method: 'GET' })
  .validator((d: { page?: number; pageSize?: number }) => ({ page: clampPage(d?.page), pageSize: clampPageSize(d?.pageSize) }))
  .handler(async ({ data }): Promise<{ rows: AdminFeedbackRow[]; total: number }> => {
    await assertAdmin()
    return listFeedbackForAdmin(createDb(env.DB), data)
  })

/** server fn: assertAdmin → 状态流转 + 可选一句话回复。 */
export const setFeedbackStatusFn = createServerFn({ method: 'POST' })
  .validator((d: { id: string; status: FeedbackStatus; adminNote?: string }) => d)
  .handler(async ({ data }): Promise<void> => {
    await assertAdmin()
    await setFeedbackStatus(createDb(env.DB), data.id, data.status, data.adminNote ?? null, Date.now())
  })

export const getAdminUserSessionsFn = createServerFn({ method: 'GET' })
  .validator((d: { userId: string }) => ({ userId: typeof d?.userId === 'string' ? d.userId : '' }))
  .handler(async ({ data }): Promise<AdminUserSession[]> => {
    await assertAdmin()
    if (!data.userId) throw new Error('Invalid user id')
    return getAdminUserSessions(createDb(env.DB), data.userId)
  })

export const revokeAdminUserSessionsFn = createServerFn({ method: 'POST' })
  .validator((d: { userId: string }) => ({ userId: typeof d?.userId === 'string' ? d.userId : '' }))
  .handler(async ({ data }): Promise<{ revoked: number }> => {
    const admin = await assertAdmin()
    assertRevocableAdminUserSessions(admin.id, data.userId)
    return { revoked: await revokeAdminUserSessions(createDb(env.DB), data.userId) }
  })

export const getAdminPptMasterHealthFn = createServerFn({ method: 'GET' }).handler(async (): Promise<{ status: string; disk_state?: string }> => {
  await assertAdmin()
  try {
    return await getPptMasterHealth()
  } catch {
    return { status: 'unavailable' }
  }
})

/** server fn: assertAdmin → Stripe revenue console (balance, charges, subscriptions, refunds). */
export const getAdminRevenueFn = createServerFn({ method: 'GET' }).handler(async (): Promise<AdminRevenueResult> => {
  await assertAdmin()
  return getAdminRevenue({ STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY ?? '' })
})
