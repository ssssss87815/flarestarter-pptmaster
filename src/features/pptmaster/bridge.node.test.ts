import { expect, test } from 'vitest'
import { buildPptMasterBridgeCanonicalString, signPptMasterBridge } from './bridge'

const secret = 'YnJpZGdlLXNlY3JldC12MS0wMTIzNDU2Nzg5YWJjZGVm'
const input = {
  method: 'POST',
  canonicalTarget: '/api/projects',
  issuer: 'flarestarter-pptmaster',
  audience: 'pptmaster-saas',
  keyId: 'fs-test-1',
  timestamp: 1785729600,
  nonce: 'AAECAwQFBgcICQoLDA0ODw',
  subject: 'user-123',
  email: 'lee@example.com',
  displayName: 'Lee',
  body: new TextEncoder().encode('{"name":"demo"}'),
  idempotencyKey: 'idem-123',
}

const expectedCanonical = [
  'PPTMASTER-BRIDGE-HMAC-SHA256',
  '1',
  'POST',
  '/api/projects',
  'flarestarter-pptmaster',
  'pptmaster-saas',
  'fs-test-1',
  '1785729600',
  'AAECAwQFBgcICQoLDA0ODw',
  'dXNlci0xMjM',
  'bGVlQGV4YW1wbGUuY29t',
  'TGVl',
  'd7d234f759ec34fd6298b7e32318614760070aaef9f4e92ced928324b49a0602',
  'idem-123',
].join('\n')

test('bridge canonical string matches the cross-language fixture', () => {
  expect(buildPptMasterBridgeCanonicalString(input, 'd7d234f759ec34fd6298b7e32318614760070aaef9f4e92ced928324b49a0602')).toBe(expectedCanonical)
})

test('bridge signature matches the cross-language fixture', async () => {
  const headers = await signPptMasterBridge(input, secret)
  expect(headers['x-pptmaster-bridge-body-sha256']).toBe('d7d234f759ec34fd6298b7e32318614760070aaef9f4e92ced928324b49a0602')
  expect(headers['x-pptmaster-bridge-signature']).toBe('r1cU_KbBaXq5OA_PoiojwfKjBi7LKSgrYloK9ywd2jE')
})
