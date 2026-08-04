import { z } from 'zod'
import { env } from '@/lib/env'
import { signPptMasterBridge, validatePptMasterCaller, type PptMasterCaller } from './bridge'

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
export type { PptMasterCaller } from './bridge'

type BridgeConfig = {
  apiUrl: string
  internalApiKey: string
  issuer: string
  audience: string
  keyId: string
  hmacSecret: string
}

function configured(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function configuredString(value: unknown, field: string): string {
  if (!configured(value)) throw new Error(`PPTMaster bridge configuration is incomplete: ${field}`)
  return value.trim()
}

function baseUrl(): string {
  const value = configuredString(env.PPTMASTER_API_URL, 'PPTMASTER_API_URL')
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('PPTMASTER_API_URL must use HTTP(S)')
  return value.replace(/\/$/, '')
}

function serviceHeaders(): Headers {
  const key = configuredString(env.PPTMASTER_INTERNAL_API_KEY, 'PPTMASTER_INTERNAL_API_KEY')
  return new Headers({ accept: 'application/json', authorization: `Bearer ${key}` })
}

function bridgeConfig(): BridgeConfig {
  return {
    apiUrl: baseUrl(),
    internalApiKey: configuredString(env.PPTMASTER_INTERNAL_API_KEY, 'PPTMASTER_INTERNAL_API_KEY'),
    issuer: configuredString(env.PPTMASTER_BRIDGE_ISSUER, 'PPTMASTER_BRIDGE_ISSUER'),
    audience: configuredString(env.PPTMASTER_BRIDGE_AUDIENCE, 'PPTMASTER_BRIDGE_AUDIENCE'),
    keyId: configuredString(env.PPTMASTER_BRIDGE_KEY_ID, 'PPTMASTER_BRIDGE_KEY_ID'),
    hmacSecret: configuredString(env.PPTMASTER_BRIDGE_HMAC_SECRET_BASE64URL, 'PPTMASTER_BRIDGE_HMAC_SECRET_BASE64URL'),
  }
}

function nonce(): string {
  if (typeof crypto.randomUUID !== 'function') throw new Error('Secure bridge nonce generation is unavailable')
  return crypto.randomUUID()
}

function canonicalTarget(url: URL): string {
  return `${url.pathname}${url.search}`
}

async function buildAuthenticatedRequest(
  path: string,
  init: RequestInit | undefined,
  config: BridgeConfig,
  identity: PptMasterCaller,
  body: Uint8Array,
  baseHeaders: Headers,
  idempotencyKey: string | undefined,
): Promise<Request> {
  const url = new URL(path, `${config.apiUrl}/`)
  const method = (init?.method ?? 'GET').toUpperCase()
  const bodyBuffer = body.byteLength > 0 ? body.slice().buffer : undefined
  const request = new Request(url, {
    method,
    headers: new Headers(baseHeaders),
    body: bodyBuffer,
  })
  const bridgeHeaders = await signPptMasterBridge({
    method,
    canonicalTarget: canonicalTarget(url),
    issuer: config.issuer,
    audience: config.audience,
    keyId: config.keyId,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: nonce(),
    subject: identity.id,
    email: identity.email,
    displayName: identity.name,
    body,
    idempotencyKey,
  }, config.hmacSecret)
  for (const [key, value] of Object.entries(bridgeHeaders)) request.headers.set(key, value)
  return request
}

async function prepareAuthenticatedRequest(path: string, caller: PptMasterCaller, init?: RequestInit): Promise<{
  config: BridgeConfig
  identity: PptMasterCaller
  body: Uint8Array
  baseHeaders: Headers
  idempotencyKey?: string
  method: string
}> {
  const config = bridgeConfig()
  const identity = validatePptMasterCaller(caller)
  const url = new URL(path, `${config.apiUrl}/`)
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = new Headers(init?.headers)
  headers.set('accept', headers.get('accept') ?? 'application/json')
  headers.set('authorization', `Bearer ${config.internalApiKey}`)
  const initial = new Request(url, { ...init, method, headers })
  return {
    config,
    identity,
    body: new Uint8Array(await initial.arrayBuffer()),
    baseHeaders: new Headers(initial.headers),
    idempotencyKey: !['GET', 'HEAD', 'OPTIONS'].includes(method) ? nonce() : undefined,
    method,
  }
}

function retryDelayMs(response: Response, attempt: number): number | undefined {
  if (response.status === 409 && response.headers.has('retry-after')) {
    const seconds = Number(response.headers.get('retry-after'))
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 2_000)
  }
  if (response.status === 503) {
    const seconds = Number(response.headers.get('retry-after'))
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 2_000)
    return Math.min(250 * 2 ** attempt, 1_000)
  }
  return undefined
}

async function waitBeforeRetry(delayMs: number): Promise<void> {
  if (delayMs <= 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
}

async function fetchAuthenticatedWithRetry(path: string, caller: PptMasterCaller, init?: RequestInit): Promise<Response> {
  const prepared = await prepareAuthenticatedRequest(path, caller, init)
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(await buildAuthenticatedRequest(path, init, prepared.config, prepared.identity, prepared.body, prepared.baseHeaders, prepared.idempotencyKey))
    if (response.ok) return response
    const delay = retryDelayMs(response, attempt)
    if (delay === undefined || attempt === maxAttempts - 1) return response
    await response.body?.cancel()
    await waitBeforeRetry(delay)
  }
  throw new Error(`PPTMaster API request exhausted for ${path}`)
}

async function request<T>(path: string, schema: z.ZodType<T>, caller: PptMasterCaller, init?: RequestInit): Promise<T> {
  const response = await fetchAuthenticatedWithRetry(path, caller, init)
  if (!response.ok) throw new Error(`PPTMaster API ${response.status} for ${path}`)
  return schema.parse(await response.json())
}

async function healthRequest(): Promise<Response> {
  return fetch(`${baseUrl()}/healthz`, { headers: serviceHeaders(), signal: AbortSignal.timeout(5000) })
}

export async function getPptMasterHealth(): Promise<{ status: string; disk_state?: string }> {
  const response = await healthRequest()
  if (!response.ok) throw new Error(`PPTMaster API ${response.status} for /healthz`)
  const health = z.object({ status: z.string(), disk_state: z.string().optional() }).parse(await response.json())
  return health.status === 'ok' && health.disk_state && health.disk_state !== 'ok' ? { ...health, status: 'degraded' } : health
}

export async function enrollPptMasterBeta(caller: PptMasterCaller, inviteCode: string): Promise<PptMasterBetaEnrollment> {
  return request('/api/internal/beta/enroll', z.object({ ok: z.boolean(), user_id: z.string(), plan_id: z.string() }), caller, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invite_code: inviteCode }),
  })
}

export async function createPptMasterProject(caller: PptMasterCaller, input: { name: string; topic?: string; mode?: 'advanced' | 'manual' }): Promise<PptMasterProject> {
  return request('/api/projects', projectSchema, caller, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
}

export async function uploadPptMasterMarkdown(caller: PptMasterCaller, projectId: string, filename: string, markdown: string): Promise<PptMasterProject & { imported_sources?: string[] }> {
  const body = new FormData()
  body.append('file', new Blob([markdown], { type: 'text/markdown; charset=utf-8' }), filename.endsWith('.md') ? filename : `${filename}.md`)
  return request(`/api/projects/${encodeURIComponent(projectId)}/sources`, z.object({ ...projectSchema.shape, imported_sources: z.array(z.string()).optional() }), caller, { method: 'POST', body })
}

export async function listPptMasterProjects(caller: PptMasterCaller): Promise<PptMasterProject[]> {
  const result = await request('/api/projects', z.union([z.array(projectSchema), z.object({ projects: z.array(projectSchema) })]), caller)
  return Array.isArray(result) ? result : result.projects
}

export async function getPptMasterProgress(caller: PptMasterCaller, projectId: string): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/progress`, progressSchema, caller)
}

export async function lockPptMasterConfirmations(caller: PptMasterCaller, projectId: string, input: Record<string, unknown>): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/confirmations`, progressSchema, caller, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
}

export async function startPptMasterGeneration(caller: PptMasterCaller, projectId: string): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/generate`, progressSchema, caller, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
}

export async function getPptMasterSpec(caller: PptMasterCaller, projectId: string): Promise<PptMasterSpec> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/spec`, specSchema, caller)
}

export async function approvePptMasterOutline(caller: PptMasterCaller, projectId: string): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/approve-outline`, progressSchema, caller, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
}

export async function approvePptMasterExport(caller: PptMasterCaller, projectId: string): Promise<PptMasterProgress> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/approve-export`, progressSchema, caller, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
}

export async function downloadPptMasterArtifact(caller: PptMasterCaller, projectId: string): Promise<{ filename: string; contentType: string; data: string }> {
  const response = await fetchAuthenticatedWithRetry(`/api/projects/${encodeURIComponent(projectId)}/download`, caller)
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
