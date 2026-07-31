import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireUser } from '@/features/auth/middleware'
import { createPptMasterProject, getPptMasterHealth, listPptMasterProjects, uploadPptMasterMarkdown } from './client'

export const getPptMasterProjects = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  try {
    return await listPptMasterProjects(user.id)
  } catch (error) {
    console.warn('[pptmaster] project listing unavailable:', error instanceof Error ? error.message : error)
    return []
  }
})

export const createPptMasterProjectAction = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1), topic: z.string().trim().optional() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return createPptMasterProject(user.id, data)
  })

export const uploadPptMasterMarkdownAction = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string().min(1), filename: z.string().min(1), markdown: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return uploadPptMasterMarkdown(user.id, data.projectId, data.filename, data.markdown)
  })

export const getPptMasterHealthStatus = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    return await getPptMasterHealth()
  } catch (error) {
    return { status: 'unavailable', detail: error instanceof Error ? error.message : String(error) }
  }
})
