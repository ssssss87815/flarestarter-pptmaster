import { expect, test } from 'vitest'
import { buildPptMasterBridgeCanonicalString, signPptMasterBridge, validatePptMasterCaller } from './bridge'

const secret = 'YnJpZGdlLWZpeHR1cmUtc2VjcmV0LXYxLTMyLWJ5dGVzISE'
const input = {
  method: 'POST', canonicalTarget: '/api/projects', issuer: 'flarestarter-pptmaster', audience: 'pptmaster-saas', keyId: 'fs-fixture-1', timestamp: 1785729600, nonce: 'AAECAwQFBgcICQoLDA0ODw', subject: '用户-123', email: 'LEE@EXAMPLE.COM', displayName: '李 Lee', body: new TextEncoder().encode('{"name":"demo","topic":"bridge"}'), idempotencyKey: 'idem-unicode-1',
}

test('signer matches the shared v1 canonical field order', async () => {
  const vector = { ...input, canonicalTarget: '/api/projects?locale=zh&view=%E6%A6%82%E8%A6%81' }
  const headers = await signPptMasterBridge(vector, secret)
  expect(buildPptMasterBridgeCanonicalString(vector, headers['x-pptmaster-bridge-body-sha256'])).toBe([
    'PPTMASTER-BRIDGE-HMAC-SHA256', '1', 'POST', '/api/projects?locale=zh&view=%E6%A6%82%E8%A6%81', 'flarestarter-pptmaster', 'pptmaster-saas', 'fs-fixture-1', '1785729600', 'AAECAwQFBgcICQoLDA0ODw', '55So5oi3LTEyMw', 'bGVlQGV4YW1wbGUuY29t', '5p2OIExlZQ', headers['x-pptmaster-bridge-body-sha256'], 'idem-unicode-1',
  ].join('\n'))
})

test('caller validation preserves real fields and rejects missing identity', () => {
  expect(validatePptMasterCaller({ id: '用户-id', email: 'user@example.com', name: '用户' })).toEqual({ id: '用户-id', email: 'user@example.com', name: '用户' })
  expect(() => validatePptMasterCaller({ id: '   ', email: 'user@example.com', name: '用户' })).toThrow()
})

test('signer rejects controls, malformed secrets, noncanonical body hashes, and blank optional/identity values', async () => {
  await expect(signPptMasterBridge({ ...input, method: 'POST\nX' }, secret)).rejects.toThrow()
  await expect(signPptMasterBridge(input, 'plain-secret')).rejects.toThrow()
  await expect(signPptMasterBridge({ ...input, displayName: null as unknown as string }, secret)).rejects.toThrow()
  await expect(signPptMasterBridge({ ...input, idempotencyKey: null as unknown as string }, secret)).rejects.toThrow()
  await expect(signPptMasterBridge({ ...input, subject: '   ' }, secret)).rejects.toThrow()
  expect(() => buildPptMasterBridgeCanonicalString(input, 'not-a-hash')).toThrow()
})
