import { useEffect, useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Upload } from 'lucide-react'

import { requireUser } from '@/features/auth/middleware'
import { getEntitlement } from '@/features/billing/middleware'
import {
  approvePptMasterExportAction,
  getPptMasterProgressAction,
  downloadPptMasterArtifactAction,
  getPptMasterSpecAction,
  openPptMasterConfirmUiAction,
  startPptMasterLivePreviewAction,
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
  const [uploading, setUploading] = useState(false)
  const [openingConfirm, setOpeningConfirm] = useState(false)
  const [exporting, setExporting] = useState(false)
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
  async function openConfirmUi() {
    setError(null); setOpeningConfirm(true)
    try {
      await openPptMasterConfirmUiAction({ data: { projectId: progress.id } })
      window.location.assign(`/api/pptmaster-confirm-ui/${encodeURIComponent(progress.id)}/?return_to=/app/projects/${encodeURIComponent(progress.id)}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Confirm UI unavailable.') }
    finally { setOpeningConfirm(false) }
  }

  async function approveExport() {
    setError(null); setExporting(true)
    try {
      await approvePptMasterExportAction({ data: { projectId: progress.id } })
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export failed.') }
    finally { setExporting(false) }
  }

  async function openLivePreview() {
    setError(null)
    try {
      await startPptMasterLivePreviewAction({ data: { projectId: progress.id } })
      // Open in a NEW tab so the project page stays put; closing the preview
      // tab must never take the workbench with it.
      window.open(`/api/pptmaster-live/${encodeURIComponent(progress.id)}/?return_to=/app/projects/${encodeURIComponent(progress.id)}`, '_blank', 'noopener')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Live preview unavailable.') }
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

  const isFinished = progress.status === 'export_ready' || progress.status === 'delivery_verified'
  const isGenerating = progress.status === 'strategizing' || progress.status === 'imaging' || progress.status === 'generating'

  return (
    <AppShell user={user} isPro={isPro} active="dashboard" crumb={progress.name} paymentFailed={ent.paymentFailed}>
      <Link to="/{-$locale}/app" className="mb-5 inline-flex items-center gap-2 text-sm text-fg-3 hover:text-foreground"><ArrowLeft size={16} /> Back to presentations</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-h">{progress.name}</h1><p className="mt-1.5 text-sm text-fg-2">{progress.detail ?? 'Presentation workbench'}</p></div><Badge variant={progress.status === 'failed' || progress.status === 'failed_recoverable' ? 'free' : 'pro'} dot>{progress.status}</Badge></div>

      <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-4 font-mono text-sm uppercase tracking-wide text-fg-3">Source material</h2><Input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="source.md" aria-label="Markdown filename" /><textarea value={markdown} onChange={(event) => setMarkdown(event.target.value)} className="mt-3 min-h-48 w-full rounded-[7px] border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary" aria-label="Markdown source" /><button type="button" onClick={upload} disabled={uploading || !markdown.trim()} className="mt-3 inline-flex items-center gap-2 rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Upload size={16} />{uploading ? 'Uploading…' : 'Add source material'}</button></section>

      <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-3 font-mono text-sm uppercase tracking-wide text-fg-3">Canonical Confirm UI</h2><p className="mb-4 text-sm text-fg-2">高级项目只在这里完成八项确认。确认结果将锁定 spec 并驱动后续规划与生成；项目页不再复制确认表单。</p><button type="button" onClick={openConfirmUi} disabled={openingConfirm || isGenerating} className="rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{openingConfirm ? '正在打开…' : isGenerating ? '生成中，暂不可修改确认' : '打开 Confirm UI'}</button>{isGenerating && <p className="mt-3 text-sm text-fg-2">当前流水线正在运行（{progress.status}），确认锁定后需等生成完成才能再次修改。</p>}{(progress.status === 'preview_ready' || progress.status === 'export_ready') && <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={openLivePreview} className="inline-flex items-center gap-2 rounded-[7px] border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">打开预览</button>{progress.status === 'preview_ready' && <button type="button" onClick={approveExport} disabled={exporting} className="inline-flex items-center gap-2 rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{exporting ? '导出中…' : '确认并导出 PPTX'}</button>}</div>}{error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}</section>

      {spec && <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-3 font-mono text-sm uppercase tracking-wide text-fg-3">Outline / spec review</h2><details open><summary className="cursor-pointer text-sm text-foreground">design_spec.md</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-fg-2">{spec.design_spec}</pre></details><details className="mt-3"><summary className="cursor-pointer text-sm text-foreground">spec_lock.md</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-fg-2">{spec.spec_lock}</pre></details></section>}

      <section className="rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-4 font-mono text-sm uppercase tracking-wide text-fg-3">Progress</h2><div className="grid gap-3 text-sm text-fg-2 sm:grid-cols-3"><div>Status: <strong className="text-foreground">{progress.status}</strong></div><div>Sources: <strong className="text-foreground">{progress.sources?.length ?? 0}</strong></div><div>SVG pages: <strong className="text-foreground">{progress.svg_count ?? 0}/{progress.expected_pages ?? '—'}</strong></div><div>Exports: <strong className="text-foreground">{progress.export_count ?? 0}</strong></div></div>{progress.exports?.length ? <button type="button" onClick={download} disabled={!isFinished} className={`mt-4 inline-flex items-center gap-2 rounded-[7px] px-4 py-2 text-sm font-medium disabled:opacity-50 ${isFinished ? 'bg-primary text-primary-foreground' : 'border border-input bg-background text-fg-3'}`}>{isFinished ? `下载 ${progress.exports.join(', ')}` : `导出可用: ${progress.exports.join(', ')}`}</button> : null}</section>
    </AppShell>
  )
}
