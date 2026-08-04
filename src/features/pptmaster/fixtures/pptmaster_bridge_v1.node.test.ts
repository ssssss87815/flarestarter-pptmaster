import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

type Vector = Record<string, string | number>
type Fixture = { schema: string; vectors: Vector[] }
const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, 'pptmaster_bridge_v1.json'), 'utf8')) as Fixture
const claim = (value: string) => Buffer.from(new TextEncoder().encode(value)).toString('base64url')
const canonical = (v: Vector) => [v.domain, v.version, v.method.toString().toUpperCase(), v.canonical_target, v.issuer, v.audience, v.key_id, String(v.timestamp), v.nonce, claim(v.subject as string), claim((v.email as string).trim().toLowerCase()), v.display_name ? claim(v.display_name as string) : '', v.body_sha256, v.idempotency_key].join('\n')
test('shared bridge fixture covers query, unicode, empty optional claim, and idempotency', () => { expect(fixture.schema).toBe('pptmaster-bridge-hmac-v1-fixture'); expect(fixture.vectors).toHaveLength(2); expect(fixture.vectors[0].canonical_target).toContain('?'); expect(fixture.vectors[0].subject).toContain('用户'); expect(fixture.vectors[0].idempotency_key).not.toBe(''); expect(fixture.vectors[1].display_name).toBe(''); expect(fixture.vectors[1].body_utf8).toBe('') })
test.each(fixture.vectors)('recomputes canonical bytes, body hash, and HMAC for $method $canonical_target', (v) => { const body = Buffer.from(v.body_utf8 as string, 'utf8'); expect(createHash('sha256').update(body).digest('hex')).toBe(v.body_sha256); const c = canonical(v); expect(c).toBe(v.canonical_string); expect(createHmac('sha256', Buffer.from(v.secret_base64url as string, 'base64url')).update(c, 'utf8').digest('base64url')).toBe(v.signature_base64url) })
