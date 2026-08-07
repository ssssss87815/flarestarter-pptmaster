import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'

import { requireUser } from '@/features/auth/middleware'
import { readUser } from '@/features/auth/readUser.server'
import { env } from '@/lib/env'
import { createDb } from '@/db/client'
import { user as userTable } from '@/features/auth/auth.schema'
import { grantBetaPro } from '@/features/billing/billing.server'
import { createPptMasterProject, approvePptMasterExport, approvePptMasterOutline, deletePptMasterProject, downloadPptMasterArtifact, enrollPptMasterBeta, getPptMasterProgress, getPptMasterSpec, listPptMasterProjects, lockPptMasterConfirmations, openPptMasterConfirmUi, rerunPptMasterPages, startPptMasterGeneration, startPptMasterLivePreview, startPptMasterQuick, uploadPptMasterMarkdown, uploadPptMasterSourceFile, uploadPptMasterUserImages, type PptMasterUser } from './client'

function pptUser(user: { id: string; email: string; name: string }): PptMasterUser {
  return { id: user.id, email: user.email, name: user.name }
}

export const getPptMasterProjects = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  try {
    return await listPptMasterProjects(pptUser(user))
  } catch (error) {
    console.warn('[pptmaster] project listing unavailable:', error instanceof Error ? error.message : error)
    return []
  }
})

export const createPptMasterProjectAction = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1), topic: z.string().trim().optional(), mode: z.enum(['advanced', 'manual']).optional() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return createPptMasterProject(pptUser(user), data)
  })

export const startPptMasterQuickAction = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1), topic: z.string().trim().min(1), audience: z.string().trim().min(1), goal: z.string().trim().min(1), language: z.string().trim().min(1), tone: z.string().trim().min(1), visual_style: z.string().trim().min(1), page_count: z.number().int().min(3).max(30), canvas: z.enum(['ppt169', 'ppt43']), image_usage: z.enum(['optional', 'none', 'ai', 'web']) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return startPptMasterQuick(pptUser(user), data)
  })

export const openPptMasterConfirmUiAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    // Carry the user's Pro default-generation prefs into the Confirm UI as
    // seed values (page count / canvas / language / style / image policy).
    const db = createDb(env.DB)
    const rows = await db.select({
      proPageCount: userTable.proPageCount,
      proCanvas: userTable.proCanvas,
      proLanguage: userTable.proLanguage,
      proVisualStyle: userTable.proVisualStyle,
      proImageUsage: userTable.proImageUsage,
    }).from(userTable).where(eq(userTable.id, user.id))
    const r = rows[0]
    const seed: Record<string, string> = {}
    if (r) {
      if (r.proPageCount) seed.page_count = r.proPageCount
      if (r.proCanvas) seed.canvas = r.proCanvas
      if (r.proLanguage) seed.language = r.proLanguage
      if (r.proVisualStyle) seed.visual_style = r.proVisualStyle
      if (r.proImageUsage) seed.image_usage = r.proImageUsage
    }
    return openPptMasterConfirmUi(pptUser(user), data.projectId, seed)
  })

export const uploadPptMasterMarkdownAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1), filename: z.string().min(1), markdown: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return uploadPptMasterMarkdown(pptUser(user), data.projectId, data.filename, data.markdown)
  })

export const uploadPptMasterSourceFileAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1), filename: z.string().min(1), base64: z.string().min(1), mime: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return uploadPptMasterSourceFile(pptUser(user), data.projectId, data.filename, data.base64, data.mime)
  })

export const getPptMasterProgressAction = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return getPptMasterProgress(pptUser(user), data.projectId)
  })

export const lockPptMasterConfirmationsAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1), confirmations: z.record(z.string(), z.unknown()) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return lockPptMasterConfirmations(pptUser(user), data.projectId, data.confirmations)
  })

export const startPptMasterGenerationAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return startPptMasterGeneration(pptUser(user), data.projectId)
  })

export const rerunPptMasterPagesAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1), pages: z.array(z.string().min(1)).min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return rerunPptMasterPages(pptUser(user), data.projectId, data.pages)
  })

export const deletePptMasterProjectAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return deletePptMasterProject(pptUser(user), data.projectId)
  })

export const uploadPptMasterUserImagesAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1), files: z.array(z.object({ filename: z.string().min(1), base64: z.string().min(1), mime: z.string() })).min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return uploadPptMasterUserImages(pptUser(user), data.projectId, data.files)
  })

export const getPptMasterSpecAction = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return getPptMasterSpec(pptUser(user), data.projectId)
  })

export const approvePptMasterOutlineAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return approvePptMasterOutline(pptUser(user), data.projectId)
  })

export const approvePptMasterExportAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return approvePptMasterExport(pptUser(user), data.projectId)
  })

export const startPptMasterLivePreviewAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return startPptMasterLivePreview(pptUser(user), data.projectId)
  })

export const downloadPptMasterArtifactAction = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return downloadPptMasterArtifact(pptUser(user), data.projectId)
  })

export const enrollPptMasterBetaAction = createServerFn({ method: 'POST' })
  .validator(z.object({
    inviteCode: z.string().trim().min(1),
    // 邮箱验证模式下注册后没有 session（token=null）。注册页会把 signUp 响应里的
    // userId + email 传进来，这里在 D1 校验该身份真实存在且匹配后才 enroll。
    userId: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
  }))
  .handler(async ({ data }) => {
    const sessionUser = await readUser()
    if (sessionUser) {
      const result = await enrollPptMasterBeta(pptUser(sessionUser), data.inviteCode)
      // 引擎侧 pro 已生效；同步壳侧 entitlement，否则 UI/门控仍显示 free。
      await grantBetaPro(createDb(env.DB), sessionUser.id)
      return result
    }
    if (!data.userId || !data.email) {
      throw new Error('注册信息不完整，请刷新页面后重试。')
    }
    const db = createDb(env.DB)
    const rows = await db
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(and(eq(user.id, data.userId), eq(user.email, data.email.toLowerCase().trim())))
      .limit(1)
    if (!rows[0]) {
      throw new Error('注册信息校验失败，请刷新页面后重试。')
    }
    const result = await enrollPptMasterBeta(pptUser(rows[0]), data.inviteCode)
    await grantBetaPro(db, rows[0].id)
    return result
  })
