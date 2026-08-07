import { createFileRoute } from '@tanstack/react-router'
import { readUser } from '@/features/auth/readUser.server'
import { proxyPptMasterImagesUpload } from '@/features/pptmaster/client'

// Streaming multipart proxy for user image uploads.
// The browser posts the raw FormData straight to this route (no base64, no
// server-fn JSON) so large images don't blow up the action request body.
const handler = async ({ request }: { request: Request }) => {
  const user = await readUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const pathname = new URL(request.url).pathname
  const prefix = '/api/pptmaster-images/'
  if (!pathname.startsWith(prefix)) return new Response('Not found', { status: 404 })
  let projectId = ''
  try {
    projectId = decodeURIComponent(pathname.slice(prefix.length))
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if (!projectId || /%(?:2f|5c|25)/i.test(projectId)) return new Response('Not found', { status: 404 })
  try {
    const body = await request.arrayBuffer()
    const result = await proxyPptMasterImagesUpload(
      { id: user.id, email: user.email, name: user.name },
      projectId,
      body,
      request.headers.get('content-type') ?? 'application/octet-stream',
    )
    return new Response(JSON.stringify({ detail: result.detail }), {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ detail: error instanceof Error ? error.message : '上传失败' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }
}

export const Route = createFileRoute('/api/pptmaster-images/$')({
  server: { handlers: { POST: handler } },
})
