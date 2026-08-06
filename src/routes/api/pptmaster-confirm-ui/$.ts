import { createFileRoute } from '@tanstack/react-router'
import { readUser } from '@/features/auth/readUser.server'
import { proxyPptMasterConfirmUiRequest } from '@/features/pptmaster/client'

const handler = async ({ request }: { request: Request }) => {
  const user = await readUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const pathname = new URL(request.url).pathname
  const prefix = '/api/pptmaster-confirm-ui/'
  if (!pathname.startsWith(prefix)) return new Response('Not found', { status: 404 })
  const remainder = pathname.slice(prefix.length)
  const slash = remainder.indexOf('/')
  const rawProjectId = slash < 0 ? remainder : remainder.slice(0, slash)
  const rawPath = slash < 0 ? '' : remainder.slice(slash + 1)
  if (/%(?:2f|5c|25)/i.test(`${rawProjectId}/${rawPath}`)) return new Response('Not found', { status: 404 })
  let projectId = ''
  let path = ''
  try {
    projectId = decodeURIComponent(rawProjectId)
    path = decodeURIComponent(rawPath)
    const result = await proxyPptMasterConfirmUiRequest({ id: user.id, email: user.email, name: user.name }, projectId, path, {
      method: request.method,
      body: request.method === 'POST' ? await request.text() : undefined,
      headers: request.method === 'POST' ? { 'content-type': request.headers.get('content-type') ?? 'application/json' } : undefined,
    })
    // The control plane rewrites Confirm UI absolute /api,/static,.. URLs to
    // /projects/{id}/confirm-ui/... (its own proxy prefix). Behind the Worker we
    // must map that prefix back to OUR proxy prefix so the browser keeps hitting
    // this route; otherwise those sub-requests 404 and the UI hangs on "Loading
    // recommendations".
    let body = result.body
    const ct = (result.contentType ?? '').toLowerCase()
    if (ct.includes('html') || ct.includes('javascript') || ct.includes('css') || ct.includes('json') || ct.startsWith('text/')) {
      body = body.split(`/projects/${encodeURIComponent(projectId)}/confirm-ui/`).join(`/api/pptmaster-confirm-ui/${encodeURIComponent(projectId)}/`)
    }
    return new Response(body, {
      status: result.status,
      headers: {
        'content-type': result.contentType,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid ')) return new Response('Not found', { status: 404 })
    return new Response('Confirm UI unavailable', { status: 502 })
  }
}

export const Route = createFileRoute('/api/pptmaster-confirm-ui/$')({
  server: { handlers: { GET: handler, POST: handler } },
})
