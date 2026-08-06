const BRIDGE_DOMAIN = 'PPTMASTER-BRIDGE-HMAC-SHA256'
const BRIDGE_VERSION = '1'

export type PptMasterBridgeInput = {
  method: string
  canonicalTarget: string
  issuer: string
  audience: string
  keyId: string
  timestamp: number
  nonce: string
  subject: string
  email: string
  displayName?: string
  body: Uint8Array
  idempotencyKey?: string
}

export type PptMasterBridgeHeaders = {
  'x-pptmaster-bridge-version': string
  'x-pptmaster-bridge-issuer': string
  'x-pptmaster-bridge-audience': string
  'x-pptmaster-bridge-key-id': string
  'x-pptmaster-bridge-timestamp': string
  'x-pptmaster-bridge-nonce': string
  'x-pptmaster-bridge-subject': string
  'x-pptmaster-bridge-email': string
  'x-pptmaster-bridge-display-name': string
  'x-pptmaster-bridge-body-sha256': string
  'x-pptmaster-bridge-signature': string
  'idempotency-key': string
}

const encoder = new TextEncoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid bridge key encoding')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function encodeBridgeClaim(value: string): string {
  return base64UrlEncode(encoder.encode(value))
}

export function buildPptMasterBridgeCanonicalString(input: PptMasterBridgeInput, bodySha256: string): string {
  const idempotencyKey = input.idempotencyKey ?? ''
  return [
    BRIDGE_DOMAIN,
    BRIDGE_VERSION,
    input.method.toUpperCase(),
    input.canonicalTarget,
    input.issuer,
    input.audience,
    input.keyId,
    String(input.timestamp),
    input.nonce,
    encodeBridgeClaim(input.subject),
    encodeBridgeClaim(input.email.trim().toLowerCase()),
    input.displayName ? encodeBridgeClaim(input.displayName) : '',
    bodySha256,
    idempotencyKey,
  ].join('\n')
}

export async function signPptMasterBridge(input: PptMasterBridgeInput, base64UrlSecret: string): Promise<PptMasterBridgeHeaders> {
  const bodySha256 = await sha256Hex(input.body)
  const canonical = buildPptMasterBridgeCanonicalString(input, bodySha256)
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(base64UrlDecode(base64UrlSecret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(canonical))
  return {
    'x-pptmaster-bridge-version': BRIDGE_VERSION,
    'x-pptmaster-bridge-issuer': input.issuer,
    'x-pptmaster-bridge-audience': input.audience,
    'x-pptmaster-bridge-key-id': input.keyId,
    'x-pptmaster-bridge-timestamp': String(input.timestamp),
    'x-pptmaster-bridge-nonce': input.nonce,
    'x-pptmaster-bridge-subject': encodeBridgeClaim(input.subject),
    'x-pptmaster-bridge-email': encodeBridgeClaim(input.email.trim().toLowerCase()),
    'x-pptmaster-bridge-display-name': input.displayName ? encodeBridgeClaim(input.displayName) : '',
    'x-pptmaster-bridge-body-sha256': bodySha256,
    'x-pptmaster-bridge-signature': base64UrlEncode(new Uint8Array(signature)),
    'idempotency-key': input.idempotencyKey ?? '',
  }
}
