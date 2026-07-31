import { z } from 'zod'

import { env } from '@/lib/env'

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  status: z.string(),
  detail: z.string().optional(),
  updated_at: z.string().optional(),
  created_at: z.string().optional(),
})

const progressSchema = projectSchema.extend({
  svg_count: z.number().optional(),
  expected_pages: z.number().optional(),
  export_count: z.number().optional(),
  exports: z.array(z.string()).optional(),
})

export type PptMasterProject = z.infer<typeof projectSchema>
export type PptMasterProgress = z.infer<typeof progressSchema>

function baseUrl(): string {
  const value = env.PPTMASTER_API_URL?.trim()
  if (!value) throw new Error('PPTMASTER_API_URL is not configured')
  return value.replace(/\/$/, '')
}

function internalHeaders(userId?: string): HeadersInit {
  const key = env.PPTMASTER_INTERNAL_API_KEY?.trim()
  if (!key) throw new Error('PPTMASTER_INTERNAL_API_KEY is not configured')
  return {
    accept: 'application/json',
    authorization: `Bearer ${key}`,
    ...(userId ? { 'x-pptmaster-user-id': userId } : {}),
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit, userId?: string): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...internalHeaders(userId), ...(init?.headers ?? {}) },
  })
  if (!response.ok) throw new Error(`PPTMaster API ${response.status} for ${path}`)
  return schema.parse(await response.json())
}

export async function getPptMasterHealth(): Promise<{ status: string; disk_state?: string }> {
  return request('/healthz', z.object({ status: z.string(), disk_state: z.string().optional() }))
}

export async function createPptMasterProject(userId: string, input: { name: string; topic?: string }): Promise<PptMasterProject> {
  return request('/api/projects', projectSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }, userId)
}

export async function uploadPptMasterMarkdown(userId: string, projectId: string, filename: string, markdown: string): Promise<PptMasterProject & { imported_sources?: string[] }> {
  const body = new FormData()
  body.append('file', new Blob([markdown], { type: 'text/markdown; charset=utf-8' }), filename.endsWith('.md') ? filename : `${filename}.md`)
  return request(`/api/projects/${encodeURIComponent(projectId)}/sources`, z.object({ ...projectSchema.shape, imported_sources: z.array(z.string()).optional() }), {
    method: 'POST',
    body,
  }, userId)
}

export async function listPptMasterProjects(userId: string): Promise<PptMasterProject[]> {
  const result = await request('/api/projects', z.union([z.array(projectSchema), z.object({ projects: z.array(projectSchema) })]), undefined, userId)
  return Array.isArray(result) ? result : result.projects
}

export async function getPptMasterProgress(projectId: string): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/progress`, progressSchema)
}
