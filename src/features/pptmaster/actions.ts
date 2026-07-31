import { createServerFn } from '@tanstack/react-start'

import { requireUser } from '@/features/auth/middleware'
import { getPptMasterHealth, listPptMasterProjects } from './client'

export const getPptMasterProjects = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  try {
    return await listPptMasterProjects(user.id)
  } catch (error) {
    console.warn('[pptmaster] project listing unavailable:', error instanceof Error ? error.message : error)
    return []
  }
})

export const getPptMasterHealthStatus = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    return await getPptMasterHealth()
  } catch (error) {
    return { status: 'unavailable', detail: error instanceof Error ? error.message : String(error) }
  }
})
