import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireUser } from '@/features/auth/middleware'
import { createPptMasterProject, approvePptMasterExport, approvePptMasterOutline, downloadPptMasterArtifact, enrollPptMasterBeta, getPptMasterHealth, getPptMasterProgress, getPptMasterSpec, listPptMasterProjects, lockPptMasterConfirmations, startPptMasterGeneration, uploadPptMasterMarkdown, type PptMasterCaller } from './client'

async function caller(): Promise<PptMasterCaller> {
  const user = await requireUser()
  return { id: user.id, email: user.email, name: user.name }
}

export const getPptMasterProjects = createServerFn({ method: 'GET' }).handler(async () => {
  return listPptMasterProjects(await caller())
})

export const createPptMasterProjectAction = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1), topic: z.string().trim().optional(), mode: z.enum(['advanced', 'manual']).optional() }))
  .handler(async ({ data }) => {
    return createPptMasterProject(await caller(), data)
  })

export const uploadPptMasterMarkdownAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1), filename: z.string().min(1), markdown: z.string().min(1) }))
  .handler(async ({ data }) => {
    return uploadPptMasterMarkdown(await caller(), data.projectId, data.filename, data.markdown)
  })

export const getPptMasterProgressAction = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    return getPptMasterProgress(await caller(), data.projectId)
  })

export const lockPptMasterConfirmationsAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1), confirmations: z.record(z.string(), z.unknown()) }))
  .handler(async ({ data }) => {
    return lockPptMasterConfirmations(await caller(), data.projectId, data.confirmations)
  })

export const startPptMasterGenerationAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    return startPptMasterGeneration(await caller(), data.projectId)
  })

export const getPptMasterSpecAction = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    return getPptMasterSpec(await caller(), data.projectId)
  })

export const approvePptMasterOutlineAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    return approvePptMasterOutline(await caller(), data.projectId)
  })

export const approvePptMasterExportAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    return approvePptMasterExport(await caller(), data.projectId)
  })

export const downloadPptMasterArtifactAction = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    return downloadPptMasterArtifact(await caller(), data.projectId)
  })

export const getPptMasterHealthStatus = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    return await getPptMasterHealth()
  } catch (error) {
    return { status: 'unavailable', detail: error instanceof Error ? error.message : String(error) }
  }
})

export const enrollPptMasterBetaAction = createServerFn({ method: 'POST' })
  .validator(z.object({ inviteCode: z.string().trim().min(1) }))
  .handler(async ({ data }) => {
    return enrollPptMasterBeta(await caller(), data.inviteCode)
  })
