import { beforeEach, expect, test, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const bridgeEnv = {
  PPTMASTER_API_URL: 'https://ppt.example.com',
  PPTMASTER_INTERNAL_API_KEY: 'test-key',
  PPTMASTER_BRIDGE_ISSUER: 'flarestarter-pptmaster',
  PPTMASTER_BRIDGE_AUDIENCE: 'pptmaster-saas',
  PPTMASTER_BRIDGE_ACTIVE_KEY_ID: 'fs-test-1',
  PPTMASTER_BRIDGE_HMAC_KEY: 'YnJpZGdlLXNlY3JldC12MS0wMTIzNDU2Nzg5YWJjZGVm',
}
const user = { id: 'user-1', email: 'user-1@example.com', name: 'User 1' }

beforeEach(() => {
  fetchMock.mockReset()
  vi.resetModules()
})

test('project requests carry a signed authenticated shell identity without raw user-id header', async () => {
  vi.doMock('@/lib/env', () => ({ env: bridgeEnv }))
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'p1', name: 'Demo', status: 'draft' }), { status: 200 }))
  const { getPptMasterProgress } = await import('./client')
  await getPptMasterProgress(user, 'p1')
  const request = fetchMock.mock.calls[0][0]
  expect(request).toBeInstanceOf(Request)
  expect(request.headers.get('authorization')).toBe('Bearer test-key')
  expect(request.headers.get('x-pptmaster-bridge-signature')).toBeTruthy()
  expect(request.headers.get('x-pptmaster-user-id')).toBeNull()
})

test('health requests use the legacy service gate during migration', async () => {
  vi.doMock('@/lib/env', () => ({ env: bridgeEnv }))
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'degraded', disk_state: 'warn' }), { status: 200 }))
  const { getPptMasterHealth } = await import('./client')
  await expect(getPptMasterHealth()).resolves.toEqual({ status: 'degraded', disk_state: 'warn' })
  // health uses the legacy service gate: plain URL + Bearer key header, no bridge signature
  expect(fetchMock).toHaveBeenCalledWith(
    'https://ppt.example.com/healthz',
    expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer test-key' }),
    }),
  )
})

test('health downgrades ok status when disk state is not healthy', async () => {
  vi.doMock('@/lib/env', () => ({ env: bridgeEnv }))
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok', disk_state: 'warn' }), { status: 200 }))
  const { getPptMasterHealth } = await import('./client')
  await expect(getPptMasterHealth()).resolves.toEqual({ status: 'degraded', disk_state: 'warn' })
})

test('confirm UI proxy rejects traversal and unknown paths before signing or fetch', async () => {
  vi.doMock('@/lib/env', () => ({ env: bridgeEnv }))
  const { proxyPptMasterConfirmUiRequest } = await import('./client')
  await expect(proxyPptMasterConfirmUiRequest(user, 'p1', '../healthz')).rejects.toThrow('Invalid Confirm UI path')
  await expect(proxyPptMasterConfirmUiRequest(user, 'p1', 'assets/%2e%2e/healthz')).rejects.toThrow('Invalid Confirm UI path')
  await expect(proxyPptMasterConfirmUiRequest(user, 'p1', 'assets/%252e%252e/healthz')).rejects.toThrow('Invalid Confirm UI path')
  await expect(proxyPptMasterConfirmUiRequest(user, 'p1', 'api/unknown')).rejects.toThrow('Invalid Confirm UI API path')
  expect(fetchMock).not.toHaveBeenCalled()
})

test('quick start signs the exact JSON body', async () => {
  vi.doMock('@/lib/env', () => ({ env: bridgeEnv }))
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'p1', name: 'Demo', status: 'strategizing' }), { status: 201 }))
  const { startPptMasterQuick } = await import('./client')
  const input = { name: 'Demo', topic: 'Topic', audience: 'Leaders', goal: 'Decide', language: 'zh', tone: 'clear', visual_style: 'editorial' as const, page_count: 8, canvas: 'ppt169' as const, image_usage: 'none' as const }
  await startPptMasterQuick(user, input)
  const request = fetchMock.mock.calls[0][0]
  expect(await request.clone().json()).toEqual(input)
  expect(request.headers.get('x-pptmaster-bridge-body-sha256')).toBeTruthy()
  expect(request.headers.get('idempotency-key')).toBeTruthy()
})

test('canonical confirm UI action targets the project API and returns its URL', async () => {
  vi.doMock('@/lib/env', () => ({ env: bridgeEnv }))
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ confirm_ui_url: '/projects/p1/confirm-ui/' }), { status: 202 }))
  const { openPptMasterConfirmUi } = await import('./client')
  await expect(openPptMasterConfirmUi(user, 'p1')).resolves.toEqual({ confirm_ui_url: '/projects/p1/confirm-ui/' })
  const request = fetchMock.mock.calls[0][0]
  expect(request.url).toBe('https://ppt.example.com/api/projects/p1/confirm-ui')
  expect(request.headers.get('x-pptmaster-bridge-subject')).toBe('dXNlci0x')
})

test('artifact download is proxied as base64 bytes with filename metadata', async () => {
  vi.doMock('@/lib/env', () => ({ env: bridgeEnv }))
  fetchMock.mockResolvedValue(new Response(new Uint8Array([80, 75, 3, 4]), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'content-disposition': 'attachment; filename="demo.pptx"',
    },
  }))
  const { downloadPptMasterArtifact } = await import('./client')
  await expect(downloadPptMasterArtifact(user, 'p1')).resolves.toEqual({
    filename: 'demo.pptx',
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    data: 'UEsDBA==',
  })
})
