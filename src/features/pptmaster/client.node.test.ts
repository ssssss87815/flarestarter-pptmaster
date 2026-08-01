import { beforeEach, expect, test, vi } from 'vitest'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  fetchMock.mockReset()
  vi.resetModules()
})

test('project requests carry the authenticated shell user identity', async () => {
  vi.doMock('@/lib/env', () => ({ env: {
    PPTMASTER_API_URL: 'https://ppt.example.com',
    PPTMASTER_INTERNAL_API_KEY: 'test-key',
  } }))
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    id: 'p1', name: 'Demo', status: 'draft',
  }), { status: 200, headers: { 'content-type': 'application/json' } }))
  const { getPptMasterProgress } = await import('./client')
  await getPptMasterProgress('user-1', 'p1')
  expect(fetchMock).toHaveBeenCalledWith(
    'https://ppt.example.com/api/projects/p1/progress',
    expect.objectContaining({
      headers: expect.objectContaining({
        authorization: 'Bearer test-key',
        'x-pptmaster-user-id': 'user-1',
      }),
    }),
  )
})

test('health requests target the PPTMaster service root and tolerate disk_state', async () => {
  vi.doMock('@/lib/env', () => ({ env: {
    PPTMASTER_API_URL: 'https://ppt.example.com',
    PPTMASTER_INTERNAL_API_KEY: 'test-key',
  } }))
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'degraded', disk_state: 'warn' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  const { getPptMasterHealth } = await import('./client')
  await expect(getPptMasterHealth()).resolves.toEqual({ status: 'degraded', disk_state: 'warn' })
  expect(fetchMock).toHaveBeenCalledWith(
    'https://ppt.example.com/healthz',
    expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer test-key' }) }),
  )
})

test('artifact download is proxied as base64 bytes with filename metadata', async () => {
  vi.doMock('@/lib/env', () => ({ env: {
    PPTMASTER_API_URL: 'https://ppt.example.com',
    PPTMASTER_INTERNAL_API_KEY: 'test-key',
  } }))
  fetchMock.mockResolvedValue(new Response(new Uint8Array([80, 75, 3, 4]), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'content-disposition': 'attachment; filename="demo.pptx"',
    },
  }))
  const { downloadPptMasterArtifact } = await import('./client')
  await expect(downloadPptMasterArtifact('user-1', 'p1')).resolves.toEqual({
    filename: 'demo.pptx',
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    data: 'UEsDBA==',
  })
})
