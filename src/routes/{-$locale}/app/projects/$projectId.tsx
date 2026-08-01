import { useEffect, useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle2, Play, Upload } from 'lucide-react'

import { requireUser } from '@/features/auth/middleware'
import { getEntitlement } from '@/features/billing/middleware'
import {
  approvePptMasterExportAction,
  approvePptMasterOutlineAction,
  getPptMasterProgressAction,
  downloadPptMasterArtifactAction,
  getPptMasterSpecAction,
  lockPptMasterConfirmationsAction,
  startPptMasterGenerationAction,
  uploadPptMasterMarkdownAction,
} from '@/features/pptmaster/actions'
import { AppShell } from '@/components/app/app-shell'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/{-$locale}/app/projects/$projectId')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  loader: async ({ params }) => {
    const [user, ent, progress] = await Promise.all([
      requireUser({ data: { locale: (params as { locale?: string }).locale } }),
      getEntitlement(),
      getPptMasterProgressAction({ data: { projectId: params.projectId } }),
    ])
    let spec = null
    if (['spec_ready', 'spec_review', 'preview_ready', 'export_ready', 'failed', 'failed_recoverable'].includes(progress.status)) {
      try { spec = await getPptMasterSpecAction({ data: { projectId: params.projectId } }) } catch { spec = null }
    }
    return { user, ent, progress, spec }
  },
  component: ProjectWorkbench,
})

function ProjectWorkbench() {
  const { user, ent, progress, spec } = Route.useLoaderData()
  const router = useRouter()
  const [filename, setFilename] = useState('source.md')
  const [markdown, setMarkdown] = useState('# My presentation\n\nAdd the source material for this PPTMaster project.')
  const [pageCount, setPageCount] = useState('8')
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approvingOutline, setApprovingOutline] = useState(false)
  const [approvingExport, setApprovingExport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isPro = ent.plan === 'pro'

  useEffect(() => {
    if (!['strategizing', 'imaging', 'generating', 'chart_fixing', 'quality_checking', 'post_processing'].includes(progress.status)) return
    const timer = window.setInterval(() => { void router.invalidate() }, 5000)
    return () => window.clearInterval(timer)
  }, [progress.status, router])

  async function refresh() { await router.invalidate() }
  async function upload() {
    setError(null); setUploading(true)
    try { await uploadPptMasterMarkdownAction({ data: { projectId: progress.id, filename, markdown } }); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.') }
    finally { setUploading(false) }
  }
  async function confirm() {
    setError(null); setConfirming(true)
    try { await lockPptMasterConfirmationsAction({ data: { projectId: progress.id, confirmations: { audience: 'General professional audience', mode: 'presentation', language: '中文', tone: 'clear and credible', visual_style: 'modern professional', page_count: Number(pageCount) || 8, canvas: 'ppt169', image_usage: 'optional' } } }); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Confirmation failed.') }
    finally { setConfirming(false) }
  }
  async function generate() {
    setError(null); setGenerating(true)
    try { await startPptMasterGenerationAction({ data: { projectId: progress.id } }); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Generation failed.') }
    finally { setGenerating(false) }
  }
  async function approveOutline() {
    setError(null); setApprovingOutline(true)
    try { await approvePptMasterOutlineAction({ data: { projectId: progress.id } }); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Outline approval failed.') }
    finally { setApprovingOutline(false) }
  }
  async function approveExport() {
    setError(null); setApprovingExport(true)
    try { await approvePptMasterExportAction({ data: { projectId: progress.id } }); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Export approval failed.') }
    finally { setApprovingExport(false) }
  }

  async function download() {
    setError(null)
    try {
      const result = await downloadPptMasterArtifactAction({ data: { projectId: progress.id } })
      const bytes = Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Download failed.') }
  }

  const canLockConfirmations = ['draft', 'sources_ready', 'confirmation_pending', 'confirmation_locked'].includes(progress.status)
  const canStartGeneration = progress.status === 'spec_ready' && !!spec
  const showOutlineApproval = canStartGeneration
  const showExportApproval = progress.status === 'preview_ready'
  const isFinished = progress.status === 'export_ready' || progress.status === 'delivery_verified'

  return (
    <AppShell user={user} isPro={isPro} active="dashboard" crumb={progress.name} paymentFailed={ent.paymentFailed}>
      <Link to="/{-$locale}/app" className="mb-5 inline-flex items-center gap-2 text-sm text-fg-3 hover:text-foreground"><ArrowLeft size={16} /> Back to projects</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-h">{progress.name}</h1><p className="mt-1.5 text-sm text-fg-2">{progress.detail ?? 'PPTMaster project workbench'}</p></div><Badge variant={progress.status === 'failed' || progress.status === 'failed_recoverable' ? 'free' : 'pro'} dot>{progress.status}</Badge></div>

      <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-4 font-mono text-sm uppercase tracking-wide text-fg-3">Source material</h2><Input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="source.md" aria-label="Markdown filename" /><textarea value={markdown} onChange={(event) => setMarkdown(event.target.value)} className="mt-3 min-h-48 w-full rounded-[7px] border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary" aria-label="Markdown source" /><button type="button" onClick={upload} disabled={uploading || !markdown.trim()} className="mt-3 inline-flex items-center gap-2 rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Upload size={16} />{uploading ? 'Uploading…' : 'Upload Markdown'}</button></section>

      <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-4 font-mono text-sm uppercase tracking-wide text-fg-3">Workflow</h2><div className="flex flex-wrap items-end gap-3"><label className="text-sm text-fg-2">Pages<Input value={pageCount} onChange={(event) => setPageCount(event.target.value)} className="mt-1 w-28" inputMode="numeric" /></label><button type="button" onClick={confirm} disabled={confirming || !canLockConfirmations} className="rounded-[7px] border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50">{confirming ? 'Saving…' : 'Lock confirmations'}</button><button type="button" onClick={generate} disabled={generating || !canStartGeneration} className="inline-flex items-center gap-2 rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Play size={16} />{generating ? 'Starting…' : 'Start generation'}</button>{showOutlineApproval && <button type="button" onClick={approveOutline} disabled={approvingOutline} className="inline-flex items-center gap-2 rounded-[7px] border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"><CheckCircle2 size={16} />{approvingOutline ? 'Approving…' : 'Approve outline'}</button>}{showExportApproval && <button type="button" onClick={approveExport} disabled={approvingExport} className="inline-flex items-center gap-2 rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{approvingExport ? 'Exporting…' : 'Approve export'}</button>}</div>{error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}</section>

      {spec && <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-3 font-mono text-sm uppercase tracking-wide text-fg-3">Outline / spec review</h2><details open><summary className="cursor-pointer text-sm text-foreground">design_spec.md</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-fg-2">{spec.design_spec}</pre></details><details className="mt-3"><summary className="cursor-pointer text-sm text-foreground">spec_lock.md</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-fg-2">{spec.spec_lock}</pre></details></section>}

      <section className="rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-4 font-mono text-sm uppercase tracking-wide text-fg-3">Progress</h2><div className="grid gap-3 text-sm text-fg-2 sm:grid-cols-3"><div>Status: <strong className="text-foreground">{progress.status}</strong></div><div>Sources: <strong className="text-foreground">{progress.sources?.length ?? 0}</strong></div><div>SVG pages: <strong className="text-foreground">{progress.svg_count ?? 0}/{progress.expected_pages ?? '—'}</strong></div><div>Exports: <strong className="text-foreground">{progress.export_count ?? 0}</strong></div></div>{progress.exports?.length ? <button type="button" onClick={download} disabled={!isFinished} className={`mt-4 text-sm ${isFinished ? 'text-primary' : 'text-fg-3 opacity-60'}`}>{isFinished ? `Download ${progress.exports.join(', ')}` : `Export available: ${progress.exports.join(', ')}`}</button> : null}</section>
    </AppShell>
  )
}
