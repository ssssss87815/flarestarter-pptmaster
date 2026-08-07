/**
 * Cloudflare Worker entry (wrangler `main`). Wraps the framework's default
 * server entry so every deployed response goes through cross-cutting steps:
 *   1. validate required env once per isolate (fail fast on misconfig),
 *   2. add baseline security headers, and
 *   3. report unhandled exceptions to Sentry (when SENTRY_DSN is set).
 *
 * Importing `@tanstack/react-start/server-entry` reuses the exact handler the
 * framework would otherwise run, so SSR/streaming behaviour is unchanged.
 */
import * as Sentry from '@sentry/cloudflare'
import entry from '@tanstack/react-start/server-entry'
import { withSecurityHeaders } from '@/lib/security-headers'
import { assertEnvOnce } from '@/lib/env-validate'
import { createDb } from '@/db/client'
import { runCleanup } from '@/features/maintenance/cleanup'

const fetchHandler = (
  entry as { fetch: (request: Request, env: Cloudflare.Env, ctx: ExecutionContext) => Promise<Response> }
).fetch

/** Paths that must never be language-redirected (APIs, assets, sitemap…). */
function isNonLocalePath(pathname: string): boolean {
  return (
    pathname.startsWith('/api') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/docs') ||
    pathname.startsWith('/llms') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/favicon.ico'
  )
}

/**
 * Preferred language from an Accept-Language header, respecting q-values.
 * Returns the highest-q concrete language tag (lowercased) or null when the
 * header is empty / only wildcards. q=0 means "explicitly not accepted".
 * (A naive `includes('zh')` check wrongly redirects English-first browsers
 * whose list merely contains zh, e.g. "en-US,en;q=0.9,zh-CN;q=0.8".)
 */
function preferredLanguage(accept: string): string | null {
  let best: { tag: string; q: number } | null = null
  for (const part of accept.split(',')) {
    const [rawTag, ...params] = part.trim().split(';')
    const tag = (rawTag ?? '').trim().toLowerCase()
    if (!tag || tag === '*') continue
    let q = 1
    for (const param of params) {
      const m = param.trim().match(/^q=([0-9.]+)$/i)
      if (m) q = parseFloat(m[1])
    }
    if (q <= 0) continue
    if (!best || q > best.q) best = { tag, q }
  }
  return best?.tag ?? null
}

const handler = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    await assertEnvOnce()
    // Browser-language negotiation: unprefixed page paths redirect to /zh when
    // the visitor prefers Chinese and has not pinned a `locale` cookie (the
    // language switcher sets it). Done at the worker edge — request headers
    // are complete here, and client-side navigations (which never hit this
    // layer) keep the current locale.
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/zh') && !url.pathname.startsWith('/en') && !isNonLocalePath(url.pathname)) {
      const cookie = request.headers.get('cookie') ?? ''
      const hasLocaleCookie = cookie.split(';').some((c) => c.trim().startsWith('locale='))
      if (!hasLocaleCookie) {
        const accept = request.headers.get('accept-language') ?? ''
        if (preferredLanguage(accept)?.startsWith('zh')) {
          const target = `/zh${url.pathname === '/' ? '' : url.pathname}${url.search}`
          return withSecurityHeaders(new Response(null, { status: 302, headers: { location: target } }))
        }
      }
    }
    const response = await fetchHandler(request, env, ctx)
    return withSecurityHeaders(response)
  },

  // Cron Triggers entry (schedule in wrangler.jsonc → triggers.crons). Runs the
  // maintenance cleanup; extend with your own periodic tasks (digests, etc.).
  async scheduled(_controller: ScheduledController, env: Cloudflare.Env, _ctx: ExecutionContext): Promise<void> {
    const result = await runCleanup(createDb(env.DB), Date.now())
    console.log('[cron] cleanup', result)
  },
}

// withSentry catches unhandled exceptions / promise rejections in the worker.
// Returning undefined when no DSN is set disables Sentry entirely (degrades
// gracefully). tracesSampleRate: 0 keeps it errors-only — cheap by default.
export default Sentry.withSentry(
  (env: Cloudflare.Env) =>
    env.SENTRY_DSN ? { dsn: env.SENTRY_DSN, tracesSampleRate: 0, sendDefaultPii: false } : undefined,
  handler,
)
