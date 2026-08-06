import { z } from 'zod'

import { env } from '@/lib/env'
import { signPptMasterBridge } from './bridge'

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
  pipeline_mode: z.string().optional(),
  svg_count: z.number().optional(),
  expected_pages: z.number().optional(),
  export_count: z.number().optional(),
  exports: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
})

const specSchema = z.object({
  project_id: z.string(),
  status: z.string(),
  refine_spec: z.boolean().optional(),
  design_spec: z.string(),
  spec_lock: z.string(),
})

export type PptMasterProject = z.infer<typeof projectSchema>
export type PptMasterProgress = z.infer<typeof progressSchema>
export type PptMasterSpec = z.infer<typeof specSchema>
export type PptMasterBetaEnrollment = { ok: boolean; user_id: string; plan_id: string }
export type PptMasterUser = { id: string; email: string; name: string }

export type PptMasterQuickInput = {
  name: string; topic: string; audience: string; goal: string; language: string; tone: string; visual_style: string
  page_count: number; canvas: 'ppt169' | 'ppt43'; image_usage: 'optional' | 'none' | 'ai' | 'web'
}

function baseUrl(): string {
  const value = env.PPTMASTER_API_URL?.trim()
  if (!value) throw new Error('PPTMASTER_API_URL is not configured')
  return value.replace(/\/$/, '')
}

function bridgeConfig(): { issuer: string; audience: string; keyId: string; secret: string } {
  const issuer = env.PPTMASTER_BRIDGE_ISSUER?.trim()
  const audience = env.PPTMASTER_BRIDGE_AUDIENCE?.trim()
  const keyId = env.PPTMASTER_BRIDGE_ACTIVE_KEY_ID?.trim()
  const secret = env.PPTMASTER_BRIDGE_HMAC_KEY?.trim()
  if (!issuer || !audience || !keyId || !secret) throw new Error('PPTMaster bridge configuration is incomplete')
  return { issuer, audience, keyId, secret }
}

function legacyHeaders(): HeadersInit {
  const key = env.PPTMASTER_INTERNAL_API_KEY?.trim()
  if (!key) throw new Error('PPTMASTER_INTERNAL_API_KEY is not configured')
  return { accept: 'application/json', authorization: 'Bearer ' + key }
}

function canonicalTarget(url: string): string {
  const parsed = new URL(url)
  return parsed.pathname + parsed.search
}

async function bridgeFetch(user: PptMasterUser, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${baseUrl()}${path}`
  const method = (init.method ?? 'GET').toUpperCase()
  const idempotencyKey = method === 'GET' || method === 'HEAD' ? undefined : (new Headers(init.headers).get('idempotency-key') ?? crypto.randomUUID())
  const outgoing = new Request(url, {
    ...init,
    headers: { ...legacyHeaders(), ...(init.headers ?? {}) },
  })
  const body = new Uint8Array(await outgoing.clone().arrayBuffer())
  const config = bridgeConfig()
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ''
  for (const byte of nonceBytes) binary += String.fromCharCode(byte)
  const nonce = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const bridge = await signPptMasterBridge({
    method,
    canonicalTarget: canonicalTarget(outgoing.url),
    issuer: config.issuer,
    audience: config.audience,
    keyId: config.keyId,
    timestamp: Math.floor(Date.now() / 1000),
    nonce,
    subject: user.id,
    email: user.email,
    displayName: user.name,
    body,
    idempotencyKey,
  }, config.secret)
  for (const [key, value] of Object.entries(bridge)) outgoing.headers.set(key, value)
  return fetch(outgoing)
}

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit | undefined, user: PptMasterUser): Promise<T> {
  const response = await bridgeFetch(user, path, init)
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      if (body && typeof body.detail === 'string') detail = body.detail
    } catch { /* non-JSON error body */ }
    throw new Error(`PPTMaster API ${response.status} for ${path}${detail ? `: ${detail}` : ''}`)
  }
  return schema.parse(await response.json())
}

export async function getPptMasterHealth(): Promise<{ status: string; disk_state?: string }> {
  const response = await fetch(`${baseUrl()}/healthz`, {
    headers: legacyHeaders(),
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`PPTMaster API ${response.status} for /healthz`)
  const health = z.object({ status: z.string(), disk_state: z.string().optional() }).parse(await response.json())
  const diskHealthy = !health.disk_state || health.disk_state === 'ok' || health.disk_state === 'healthy'
  return { ...health, status: health.status === 'ok' && !diskHealthy ? 'degraded' : health.status }
}

export async function enrollPptMasterBeta(user: PptMasterUser, inviteCode: string): Promise<PptMasterBetaEnrollment> {
  return request('/api/internal/beta/enroll', z.object({ ok: z.boolean(), user_id: z.string(), plan_id: z.string() }), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invite_code: inviteCode }),
  }, user)
}

export async function createPptMasterProject(user: PptMasterUser, input: { name: string; topic?: string; mode?: 'advanced' | 'manual' }): Promise<PptMasterProject> {
  return request('/api/projects', projectSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }, user)
}

export async function startPptMasterQuick(user: PptMasterUser, input: PptMasterQuickInput): Promise<PptMasterProject> {
  return request('/api/quick-start', projectSchema, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  }, user)
}

export async function openPptMasterConfirmUi(user: PptMasterUser, projectId: string): Promise<{ confirm_ui_url: string }> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/confirm-ui`, z.object({ confirm_ui_url: z.string() }), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }, user)
}

function normalizeConfirmUiPath(projectId: string, path: string): string {
  const normalized = path.replace(/^\/+/, '')
  const segments = normalized ? normalized.split('/') : []
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(projectId)) throw new Error('Invalid project id')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('%') || segment.includes('\\') || segment.includes('\0'))) {
    throw new Error('Invalid Confirm UI path')
  }
  if (segments[0] && !['api', 'static', 'images', 'assets'].includes(segments[0])) throw new Error('Invalid Confirm UI path')
  if (segments[0] === 'api' && !['api/catalogs', 'api/recommendations', 'api/confirm', 'api/shutdown'].includes(normalized)) {
    throw new Error('Invalid Confirm UI API path')
  }
  return `/projects/${encodeURIComponent(projectId)}/confirm-ui${normalized ? `/${segments.join('/')}` : '/'}`
}

export async function proxyPptMasterConfirmUiRequest(user: PptMasterUser, projectId: string, path = '', init?: RequestInit, query = ''): Promise<{ body: string; contentType: string; status: number }> {
  const normalized = path.replace(/^\/+/, '')
  const target = normalizeConfirmUiPath(projectId, path) + (query ? `?${query}` : '')
  const response = await bridgeFetch(user, target, init)
  const contentType = response.headers.get('content-type') || 'text/plain; charset=utf-8'
  if (!response.ok) throw new Error(`PPTMaster Confirm UI ${response.status}`)
  if (normalized && contentType.toLowerCase().includes('text/html')) throw new Error('Unexpected Confirm UI content type')
  return { body: await response.text(), contentType, status: response.status }
}

export async function getPptMasterConfirmUiDocument(user: PptMasterUser, projectId: string, path = ''): Promise<{ html: string; contentType: string }> {
  const result = await proxyPptMasterConfirmUiRequest(user, projectId, path)
  return { html: result.body, contentType: result.contentType }
}

export async function startPptMasterLivePreview(user: PptMasterUser, projectId: string): Promise<{ live_preview_url: string }> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/live-preview`, z.object({ live_preview_url: z.string() }), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }, user)
}

function normalizeLivePreviewPath(projectId: string, path: string): string {
  const normalized = path.replace(/^\/+/, '')
  const segments = normalized ? normalized.split('/') : []
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(projectId)) throw new Error('Invalid project id')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('%') || segment.includes('\\') || segment.includes('\0'))) {
    throw new Error('Invalid live preview path')
  }
  if (segments[0] && !['api', 'static', 'images', 'assets'].includes(segments[0])) throw new Error('Invalid live preview path')
  return `/projects/${encodeURIComponent(projectId)}/live${normalized ? `/${segments.join('/')}` : '/'}`
}

export async function proxyPptMasterLiveRequest(user: PptMasterUser, projectId: string, path = '', init?: RequestInit, query = ''): Promise<{ body: string; bodyBytes?: Uint8Array; contentType: string; status: number }> {
  const normalized = path.replace(/^\/+/, '')
  const target = normalizeLivePreviewPath(projectId, path) + (query ? `?${query}` : '')
  const response = await bridgeFetch(user, target, init)
  const contentType = response.headers.get('content-type') || 'text/plain; charset=utf-8'
  if (!response.ok) throw new Error(`PPTMaster Live Preview ${response.status}`)
  if (normalized && contentType.toLowerCase().includes('text/html')) throw new Error('Unexpected live preview content type')
  const ct = contentType.toLowerCase()
  // Binary payloads (slide images, fonts) must pass through byte-for-byte;
  // decoding them as text corrupts the data and images fail to render.
  if (ct.startsWith('image/') || ct.startsWith('font/') || ct === 'application/octet-stream') {
    return { body: '', bodyBytes: new Uint8Array(await response.arrayBuffer()), contentType, status: response.status }
  }
  return { body: await response.text(), contentType, status: response.status }
}

export async function uploadPptMasterMarkdown(user: PptMasterUser, projectId: string, filename: string, markdown: string): Promise<PptMasterProject & { imported_sources?: string[] }> {
  const body = new FormData()
  body.append('file', new Blob([markdown], { type: 'text/markdown; charset=utf-8' }), filename.endsWith('.md') ? filename : `${filename}.md`)
  return request(`/api/projects/${encodeURIComponent(projectId)}/sources`, z.object({ ...projectSchema.shape, imported_sources: z.array(z.string()).optional() }), {
    method: 'POST',
    body,
  }, user)
}

export async function uploadPptMasterSourceFile(user: PptMasterUser, projectId: string, filename: string, base64: string, mime: string): Promise<PptMasterProject & { imported_sources?: string[] }> {
  // Control plane imports PDF/DOCX/PPTX/MD/TXT via the same /sources endpoint.
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const body = new FormData()
  body.append('file', new Blob([bytes], { type: mime || 'application/octet-stream' }), filename)
  return request(`/api/projects/${encodeURIComponent(projectId)}/sources`, z.object({ ...projectSchema.shape, imported_sources: z.array(z.string()).optional() }), {
    method: 'POST',
    body,
  }, user)
}

export async function listPptMasterProjects(user: PptMasterUser): Promise<PptMasterProject[]> {
  const result = await request('/api/projects', z.union([z.array(projectSchema), z.object({ projects: z.array(projectSchema) })]), undefined, user)
  return Array.isArray(result) ? result : result.projects
}

export async function getPptMasterProgress(user: PptMasterUser, projectId: string): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/progress`, progressSchema, undefined, user)
}

export async function lockPptMasterConfirmations(user: PptMasterUser, projectId: string, input: Record<string, unknown>): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/confirmations`, progressSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }, user)
}

export async function startPptMasterGeneration(user: PptMasterUser, projectId: string): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/generate`, progressSchema, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  }, user)
}

export async function rerunPptMasterPages(user: PptMasterUser, projectId: string, pages: string[]): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/rerun-pages`, progressSchema, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pages }),
  }, user)
}

export async function deletePptMasterProject(user: PptMasterUser, projectId: string): Promise<{ ok: boolean; id: string; status: string }> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/delete`, z.object({ ok: z.boolean(), id: z.string(), status: z.string() }).passthrough(), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  }, user)
}

export async function uploadPptMasterUserImages(user: PptMasterUser, projectId: string, files: { filename: string; base64: string; mime: string }[]): Promise<{ added: { name: string; bytes: number }[] }> {
  const body = new FormData()
  for (const file of files) {
    const binary = atob(file.base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    body.append('file', new Blob([bytes], { type: file.mime || 'application/octet-stream' }), file.filename)
  }
  return request(`/api/projects/${encodeURIComponent(projectId)}/images`, z.object({ added: z.array(z.object({ name: z.string(), bytes: z.number() })) }).passthrough(), {
    method: 'POST',
    body,
  }, user)
}

export async function getPptMasterSpec(user: PptMasterUser, projectId: string): Promise<PptMasterSpec> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/spec`, specSchema, undefined, user)
}

export async function approvePptMasterOutline(user: PptMasterUser, projectId: string): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/approve-outline`, progressSchema, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  }, user)
}

export async function approvePptMasterExport(user: PptMasterUser, projectId: string): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/approve-export`, progressSchema, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  }, user)
}

export async function downloadPptMasterArtifact(user: PptMasterUser, projectId: string): Promise<{ filename: string; contentType: string; data: string }> {
  const response = await bridgeFetch(user, `/api/projects/${encodeURIComponent(projectId)}/download`)
  if (!response.ok) throw new Error(`PPTMaster download ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return {
    filename: response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] ?? `${projectId}.pptx`,
    contentType: response.headers.get('content-type') ?? 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    data: btoa(binary),
  }
}
