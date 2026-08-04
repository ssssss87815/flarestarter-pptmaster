import { z } from 'zod'

const BRIDGE_DOMAIN = 'PPTMASTER-BRIDGE-HMAC-SHA256'
const BRIDGE_VERSION = '1'

export type PptMasterCaller = Readonly<{
  id: string
  email: string
  name: string
}>

export type PptMasterBridgeInput = Readonly<{
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
}>

export type PptMasterBridgeHeaders = Record<string, string>

const encoder = new TextEncoder()
const rawFields = ['method', 'canonicalTarget', 'issuer', 'audience', 'keyId', 'nonce', 'subject', 'email', 'displayName', 'idempotencyKey'] as const

function invalid(field: string): never {
  throw new Error(`Invalid PPTMaster bridge ${field}`)
}

function text(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || /[\u0000-\u001f\u007f]/.test(value)) invalid(field)
  return value
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: unknown, field: string): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) invalid(field)
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    invalid(field)
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  if (base64UrlEncode(bytes) !== value) invalid(field)
  return bytes
}

function validateInput(input: PptMasterBridgeInput): void {
  if (!input || typeof input !== 'object') invalid('input')
  for (const field of rawFields) {
    const value = input[field]
    if (value === undefined && (field === 'displayName' || field === 'idempotencyKey')) continue
    text(value, field, field === 'displayName' || field === 'idempotencyKey')
  }
  if (!Number.isInteger(input.timestamp) || input.timestamp < 0) invalid('timestamp')
  if (!(input.body instanceof Uint8Array)) invalid('body')
  if (!input.subject.trim() || !input.email.trim()) invalid('identity')
}

function decodeSecret(value: string): Uint8Array {
  const bytes = base64UrlDecode(value, 'secret')
  if (bytes.length < 32) invalid('secret')
  return bytes
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function encodeBridgeClaim(value: string): string {
  return base64UrlEncode(encoder.encode(value))
}

export function buildPptMasterBridgeCanonicalString(input: PptMasterBridgeInput, bodySha256: string): string {
  validateInput(input)
  if (typeof bodySha256 !== 'string' || !/^[0-9a-f]{64}$/.test(bodySha256)) invalid('bodySha256')
  const email = input.email.trim().toLowerCase()
  if (!email) invalid('email')
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
    encodeBridgeClaim(email),
    input.displayName ? encodeBridgeClaim(input.displayName) : '',
    bodySha256,
    input.idempotencyKey ?? '',
  ].join('\n')
}

export async function signPptMasterBridge(input: PptMasterBridgeInput, base64UrlSecret: string): Promise<PptMasterBridgeHeaders> {
  validateInput(input)
  const bodySha256 = await sha256Hex(input.body)
  const canonical = buildPptMasterBridgeCanonicalString(input, bodySha256)
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(decodeSecret(base64UrlSecret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, toArrayBuffer(encoder.encode(canonical)))
  const headers: PptMasterBridgeHeaders = {
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
  }
  if (input.idempotencyKey) headers['idempotency-key'] = input.idempotencyKey
  return headers
}

export function validatePptMasterCaller(caller: PptMasterCaller): PptMasterCaller {
  if (!caller || typeof caller !== 'object') invalid('caller')
  const id = text(caller.id, 'caller.id')
  const email = text(caller.email, 'caller.email')
  const name = text(caller.name, 'caller.name')
  if (!id.trim()) invalid('caller.id')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) invalid('caller.email')
  if (!name.trim()) invalid('caller.name')
  return { id, email, name }
}

export const bridgeCallerSchema = z.object({ id: z.string().min(1), email: z.string().email(), name: z.string().min(1) }).readonly()
