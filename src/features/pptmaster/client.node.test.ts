import { request as nodeRequest } from 'node:http'
import { env as nodeProcessEnv } from 'node:process'
import { request as nodeHttpsRequest } from 'node:https'
import { beforeEach, expect, test, vi } from 'vitest'

const caller = { id: '用户-id-不可替换', email: 'Lee@Example.com', name: '李 Lee' }

function configure() {
  return {
    PPTMASTER_API_URL: 'https://ppt.example.com',
    PPTMASTER_INTERNAL_API_KEY: 'internal-test-key',
    PPTMASTER_BRIDGE_ISSUER: 'flarestarter-pptmaster',
    PPTMASTER_BRIDGE_AUDIENCE: 'pptmaster-saas',
    PPTMASTER_BRIDGE_KEY_ID: 'fs-test-1',
    PPTMASTER_BRIDGE_HMAC_SECRET_BASE64URL: 'YnJpZGdlLWZpeHR1cmUtc2VjcmV0LXYxLTMyLWJ5dGVzISE',
  }
}

const project = JSON.stringify({ id: 'p1', name: 'Demo', status: 'draft' })
const e2eUrl = import.meta.env.VITE_PPTMASTER_E2E_URL as string | undefined

function e2eConfigure() {
  return {
    ...configure(),
    PPTMASTER_API_URL: e2eUrl,
    PPTMASTER_INTERNAL_API_KEY: nodeProcessEnv.PPTMASTER_E2E_INTERNAL_API_KEY ?? configure().PPTMASTER_INTERNAL_API_KEY,
    PPTMASTER_BRIDGE_ISSUER: nodeProcessEnv.PPTMASTER_E2E_BRIDGE_ISSUER ?? configure().PPTMASTER_BRIDGE_ISSUER,
    PPTMASTER_BRIDGE_AUDIENCE: nodeProcessEnv.PPTMASTER_E2E_BRIDGE_AUDIENCE ?? configure().PPTMASTER_BRIDGE_AUDIENCE,
    PPTMASTER_BRIDGE_KEY_ID: nodeProcessEnv.PPTMASTER_E2E_BRIDGE_KEY_ID ?? configure().PPTMASTER_BRIDGE_KEY_ID,
    PPTMASTER_BRIDGE_HMAC_SECRET_BASE64URL: nodeProcessEnv.PPTMASTER_E2E_BRIDGE_HMAC_SECRET_BASE64URL ?? configure().PPTMASTER_BRIDGE_HMAC_SECRET_BASE64URL,
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

test('authenticated JSON request carries bridge identity and no plaintext user-id header', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(project, { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  vi.doMock('@/lib/env', () => ({ env: configure() }))
  const { createPptMasterProject } = await import('./client')
  await createPptMasterProject(caller, { name: 'Demo' })
  const request = fetchMock.mock.calls[0][0] as Request
  expect(request.headers.get('authorization')).toBe('Bearer internal-test-key')
  expect(request.headers.get('x-pptmaster-bridge-subject')).not.toBeNull()
  expect(request.headers.get('x-pptmaster-user-id')).toBeNull()
  expect(request.headers.get('x-pptmaster-bridge-subject')).not.toContain('[object Object]')
})

test('invalid bridge configuration rejects before fetch', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.doMock('@/lib/env', () => ({ env: { ...configure(), PPTMASTER_BRIDGE_HMAC_SECRET_BASE64URL: 'short' } }))
  const { getPptMasterProgress } = await import('./client')
  await expect(getPptMasterProgress(caller, 'p1')).rejects.toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('retries receiver pending with stable idempotency key and fresh bridge nonce', async () => {
  const responses = [
    new Response('{"detail":"pending"}', { status: 409, headers: { 'retry-after': '0' } }),
    new Response(project, { status: 200, headers: { 'content-type': 'application/json' } }),
  ]
  const fetchMock = vi.fn().mockImplementation(async (input: Request) => {
    const body = new Uint8Array(await input.clone().arrayBuffer())
    expect(input.headers.get('idempotency-key')).not.toBeNull()
    expect(input.headers.get('x-pptmaster-bridge-body-sha256')).toBeTruthy()
    expect(input.headers.get('x-pptmaster-bridge-nonce')).toBeTruthy()
    expect(body.byteLength).toBeGreaterThan(0)
    return responses.shift()!
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.doMock('@/lib/env', () => ({ env: configure() }))
  const { createPptMasterProject } = await import('./client')
  await createPptMasterProject(caller, { name: 'Retry me' })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const first = fetchMock.mock.calls[0][0] as Request
  const second = fetchMock.mock.calls[1][0] as Request
  expect(first.headers.get('idempotency-key')).toBe(second.headers.get('idempotency-key'))
  expect(first.headers.get('x-pptmaster-bridge-nonce')).not.toBe(second.headers.get('x-pptmaster-bridge-nonce'))
  expect(first.headers.get('x-pptmaster-bridge-timestamp')).toBeTruthy()
  expect(second.headers.get('x-pptmaster-bridge-timestamp')).toBeTruthy()
})

test('does not retry a non-pending conflict', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"detail":"conflict"}', { status: 409 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.doMock('@/lib/env', () => ({ env: configure() }))
  const { createPptMasterProject } = await import('./client')
  await expect(createPptMasterProject(caller, { name: 'Conflict' })).rejects.toThrow('409')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('persistent 503 stops after exactly three attempts', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"detail":"unavailable"}', { status: 503 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.doMock('@/lib/env', () => ({ env: configure() }))
  const { createPptMasterProject } = await import('./client')
  await expect(createPptMasterProject(caller, { name: 'Unavailable' })).rejects.toThrow('503')
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test('safe GET has no idempotency key', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  vi.doMock('@/lib/env', () => ({ env: configure() }))
  const { listPptMasterProjects } = await import('./client')
  await listPptMasterProjects(caller)
  const request = fetchMock.mock.calls[0][0] as Request
  expect(request.headers.get('idempotency-key')).toBeNull()
})

test('download retries service unavailability without an idempotency key', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('{"detail":"unavailable"}', { status: 503 }))
    .mockResolvedValueOnce(new Response(new Uint8Array([80, 75, 3, 4]), { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'content-disposition': 'attachment; filename="demo.pptx"' } }))
  vi.stubGlobal('fetch', fetchMock)
  vi.doMock('@/lib/env', () => ({ env: configure() }))
  const { downloadPptMasterArtifact } = await import('./client')
  const downloaded = await downloadPptMasterArtifact(caller, 'p1')
  expect(downloaded.filename).toBe('demo.pptx')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  for (const call of fetchMock.mock.calls) expect((call[0] as Request).headers.get('idempotency-key')).toBeNull()
})

test('retries bounded service unavailability and preserves multipart bytes', async () => {
  const responses = [
    new Response('{"detail":"unavailable"}', { status: 503 }),
    new Response(project, { status: 200, headers: { 'content-type': 'application/json' } }),
  ]
  const fetchMock = vi.fn().mockImplementation(async (input: Request) => {
    const body = new Uint8Array(await input.clone().arrayBuffer())
    expect(input.headers.get('idempotency-key')).toBeTruthy()
    expect(body.byteLength).toBeGreaterThan(0)
    return responses.shift()!
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.doMock('@/lib/env', () => ({ env: configure() }))
  const { uploadPptMasterMarkdown } = await import('./client')
  await uploadPptMasterMarkdown(caller, 'p1', 'source.md', '# Retry multipart')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const first = fetchMock.mock.calls[0][0] as Request
  const second = fetchMock.mock.calls[1][0] as Request
  expect(first.headers.get('idempotency-key')).toBe(second.headers.get('idempotency-key'))
  expect(first.headers.get('x-pptmaster-bridge-body-sha256')).toBe(second.headers.get('x-pptmaster-bridge-body-sha256'))
})

test.skipIf(!e2eUrl)('real HTTP E2E covers caller identity, ownership, multipart flow, and invalid bridge authentication', async () => {
  const endpoint = new URL(e2eUrl!)
  let forceInvalidBridgeAuth = false
  const realFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    return new Promise((resolve, reject) => {
      void request.arrayBuffer().then((body) => {
        const path = new URL(request.url).pathname + new URL(request.url).search
        const outgoingHeaders = Object.fromEntries(request.headers.entries())
        if (forceInvalidBridgeAuth) {
          outgoingHeaders.authorization = 'Bearer invalid-test-service-auth'
          // The receiver's legacy bearer is not part of bridge-v1 auth. Keep the
          // signed envelope but make the bridge signature invalid so this
          // negative case proves the receiver rejects tampered authentication.
          outgoingHeaders['x-pptmaster-bridge-signature'] = 'invalid-test-signature'
        }
        const transport = endpoint.protocol === 'https:' ? nodeHttpsRequest : nodeRequest
        const outgoing = transport({
          hostname: endpoint.hostname,
          port: endpoint.port,
          method: request.method,
          path,
          headers: outgoingHeaders,
        }, (response) => {
          const chunks: Uint8Array[] = []
          response.on('data', (chunk: Uint8Array) => chunks.push(chunk))
          response.on('end', () => resolve(new Response(Buffer.concat(chunks), {
            status: response.statusCode,
            headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value ?? ''])),
          })))
        })
        outgoing.on('error', reject)
        outgoing.end(Buffer.from(body))
      }).catch(reject)
    })
  }
  vi.stubGlobal('fetch', realFetch)
  vi.doMock('@/lib/env', () => ({ env: e2eConfigure() }))
  const { createPptMasterProject, getPptMasterProgress, listPptMasterProjects, uploadPptMasterMarkdown, downloadPptMasterArtifact } = await import('./client')
  const owner = { id: 'e2e-owner-a', email: 'e2e-owner-a@example.com', name: 'E2E Owner A' }
  const other = { id: 'e2e-owner-b', email: 'e2e-owner-b@example.com', name: 'E2E Owner B' }
  const created = await createPptMasterProject(owner, { name: 'Real HTTP E2E' })
  expect(created.id).toBeTruthy()
  const ownerProjects = await listPptMasterProjects(owner)
  expect(ownerProjects.some((project) => project.id === created.id)).toBe(true)
  const otherProjects = await listPptMasterProjects(other)
  expect(otherProjects.some((project) => project.id === created.id)).toBe(false)
  const uploaded = await uploadPptMasterMarkdown(owner, created.id, 'e2e.md', '# Real HTTP E2E')
  expect(uploaded.id).toBe(created.id)
  const progress = await getPptMasterProgress(owner, created.id)
  expect(progress.id).toBe(created.id)
  await expect(getPptMasterProgress(other, created.id)).rejects.toThrow(/401|404/)
  await expect(downloadPptMasterArtifact(owner, created.id)).rejects.toThrow(/409|404/)
  const noAuth = await new Promise<number>((resolve, reject) => {
    const transport = endpoint.protocol === 'https:' ? nodeHttpsRequest : nodeRequest
    const unauthenticated = transport({ hostname: endpoint.hostname, port: endpoint.port, method: 'GET', path: '/api/projects', headers: { accept: 'application/json' } }, (response) => {
      response.resume()
      response.on('end', () => resolve(response.statusCode ?? 0))
    })
    unauthenticated.on('error', reject)
    unauthenticated.end()
  })
  expect(noAuth).toBe(401)
  forceInvalidBridgeAuth = true
  await expect(createPptMasterProject(owner, { name: 'Invalid service auth' })).rejects.toThrow(/401/)
  forceInvalidBridgeAuth = false
})

test('multipart upload signs the exact Request body bytes', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(project, { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  vi.doMock('@/lib/env', () => ({ env: configure() }))
  const { uploadPptMasterMarkdown } = await import('./client')
  await uploadPptMasterMarkdown(caller, 'p1', 'source.md', '# Hello')
  const request = fetchMock.mock.calls[0][0] as Request
  const body = new Uint8Array(await request.clone().arrayBuffer())
  expect(request.headers.get('x-pptmaster-bridge-body-sha256')).not.toBeNull()
  expect(body.byteLength).toBeGreaterThan(0)
})
