import { useEffect, useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Upload } from 'lucide-react'

import { requireUser } from '@/features/auth/middleware'
import { getEntitlement } from '@/features/billing/middleware'
import {
  approvePptMasterExportAction,
  deletePptMasterProjectAction,
  getPptMasterProgressAction,
  downloadPptMasterArtifactAction,
  getPptMasterSpecAction,
  openPptMasterConfirmUiAction,
  rerunPptMasterPagesAction,
  startPptMasterGenerationAction,
  startPptMasterLivePreviewAction,
  uploadPptMasterMarkdownAction,
  uploadPptMasterSourceFileAction,
} from '@/features/pptmaster/actions'
import { AppShell } from '@/components/app/app-shell'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { pptmasterStatusLabel, PPTMASTER_RUNNING_STATUSES, PPTMASTER_REVIEWABLE_STATUSES, PPTMASTER_FAILED_STATUSES } from '@/features/pptmaster/status'

export const Route = createFileRoute('/{-$locale}/app/projects/$projectId')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  loader: async ({ params }) => {
    const [user, ent, progress] = await Promise.all([
      requireUser({ data: { locale: (params as { locale?: string }).locale } }),
      getEntitlement(),
      getPptMasterProgressAction({ data: { projectId: params.projectId } }),
    ])
    let spec = null
    if (['spec_ready', 'spec_review', 'preview_ready', 'export_ready', 'delivery_verified', 'failed', 'failed_recoverable'].includes(progress.status)) {
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
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [rerunPage, setRerunPage] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [rerunning, setRerunning] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [openingConfirm, setOpeningConfirm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isPro = ent.plan === 'pro'

  useEffect(() => {
    if (!PPTMASTER_RUNNING_STATUSES.includes(progress.status)) return
    const timer = window.setInterval(() => { void router.invalidate() }, 10000)
    return () => window.clearInterval(timer)
  }, [progress.status, router])

  async function refresh() { await router.invalidate() }

  async function resumeGeneration() {
    setError(null); setResuming(true)
    try { await startPptMasterGenerationAction({ data: { projectId: progress.id } }); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Resume failed.') }
    finally { setResuming(false) }
  }

  async function rerunPageNow() {
    const raw = rerunPage.trim()
    if (!raw) return
    const pageNumber = Number(raw)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) { setError('请输入有效的页号。'); return }
    const padded = String(pageNumber).padStart(2, '0')
    const pageName = `${padded}_page-${padded}.svg`
    setError(null); setRerunning(true)
    try { await rerunPptMasterPagesAction({ data: { projectId: progress.id, pages: [pageName] } }); setRerunPage(''); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Rerun failed.') }
    finally { setRerunning(false) }
  }

  async function deleteProject() {
    if (!window.confirm('确定删除这个项目吗？所有产物将被归档，且不可撤销。')) return
    setError(null); setDeleting(true)
    try {
      await deletePptMasterProjectAction({ data: { projectId: progress.id } })
      await router.navigate({ to: '/{-$locale}/app' })
    } catch (cause) { setError(cause instanceof Error ? cause.message : '删除失败。'); setDeleting(false) }
  }

  async function uploadImages() {
    if (!imageFiles.length) return
    const oversized = imageFiles.find((file) => file.size > 10 * 1024 * 1024)
    if (oversized) { setError(`「${oversized.name}」超过 10MB 限制，请压缩后重试`); return }
    setError(null); setUploadingImages(true)
    try {
      // Direct multipart upload through the Worker proxy route — no base64,
      // so large images stay well under the action/request body limits.
      const form = new FormData()
      for (const file of imageFiles) form.append('file', file)
      const response = await fetch(`/api/pptmaster-images/${encodeURIComponent(progress.id)}`, { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `上传失败（${response.status}）`)
      setImageFiles([])
      setUploadSuccess(`已成功上传 ${imageFiles.length} 张图片，AI 会在设计页面时参考。`)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '图片上传失败') }
    finally { setUploadingImages(false) }
  }

  async function uploadFile() {
    if (!sourceFile) return
    setError(null); setUploading(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(sourceFile)
      })
      if (!base64) throw new Error('Failed to read file')
      await uploadPptMasterSourceFileAction({ data: { projectId: progress.id, filename: sourceFile.name, base64, mime: sourceFile.type } })
      setSourceFile(null)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.') }
    finally { setUploading(false) }
  }

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
  const isGenerating = PPTMASTER_RUNNING_STATUSES.includes(progress.status)
  const canRerunPage = PPTMASTER_REVIEWABLE_STATUSES.includes(progress.status) || PPTMASTER_FAILED_STATUSES.includes(progress.status)
  const isFailed = PPTMASTER_FAILED_STATUSES.includes(progress.status)
  const pageNumbers = Array.from({ length: Math.max(progress.svg_count ?? 0, progress.expected_pages ?? 0) }, (_, index) => index + 1)

  const nextStep = (() => {
    if (isFailed) return { title: '重新生成', desc: '生成失败（可重试）。点击「页面操作 → 重新生成」，已有产物会保留。' }
    if (isGenerating) return { title: '等待生成完成', desc: `流水线正在运行（${pptmasterStatusLabel(progress.status)}），页面会自动刷新进度。` }
    if (progress.status === 'preview_ready') return { title: '预览并导出', desc: '先打开预览检查效果，满意后点击「确认并导出 PPTX」。' }
    if (isFinished) return { title: '下载 PPTX', desc: '文件已转存云端存档，保留 5 天；请及时下载保存到本地。' }
    if (progress.pipeline_mode === 'auto') return { title: '生成已启动', desc: '一键生成已按八项配置锁定确认，正在推进中（如状态未变化请稍候刷新）。' }
    return { title: '完成八项确认', desc: '点击下方「开始配置」设置受众、目标、风格、页数等，确认后自动开始生成。' }
  })()

  return (
    <AppShell user={user} isPro={isPro} active="dashboard" crumb={progress.name} paymentFailed={ent.paymentFailed}>
      <Link to="/{-$locale}/app" className="mb-5 inline-flex items-center gap-2 text-sm text-fg-3 hover:text-foreground"><ArrowLeft size={16} /> 返回演示文稿</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-h">{progress.name}</h1><p className="mt-1.5 text-sm text-fg-2">{progress.detail ?? '演示文稿工作台'}</p></div><Badge variant={isFailed ? 'free' : 'pro'} dot>{pptmasterStatusLabel(progress.status)}</Badge></div>

      <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-4 font-mono text-sm uppercase tracking-wide text-fg-3">生成进度</h2><div className="mb-4 rounded-[10px] border border-primary/30 bg-primary/5 px-4 py-3"><p className="text-sm font-medium text-foreground">下一步：{nextStep.title}</p><p className="mt-1 text-[13px] text-fg-2">{nextStep.desc}</p></div><div className="grid gap-3 text-sm text-fg-2 sm:grid-cols-3"><div>状态: <strong className="text-foreground">{pptmasterStatusLabel(progress.status)}</strong></div><div>材料: <strong className="text-foreground">{progress.sources?.length ?? 0}</strong></div><div>已生成页: <strong className="text-foreground">{progress.svg_count ?? 0}/{progress.expected_pages ?? '—'}</strong></div><div>导出: <strong className="text-foreground">{progress.export_count ?? 0}</strong></div></div>{progress.sources?.length ? <ul className="mt-3 flex flex-wrap gap-1.5 text-xs text-fg-3">{progress.sources.map((source) => <li key={source} className="rounded-full border border-border bg-background px-2.5 py-1">{source}</li>)}</ul> : null}{progress.exports?.length ? <button type="button" onClick={download} disabled={!isFinished} className={`mt-4 inline-flex items-center gap-2 rounded-[7px] px-4 py-2 text-sm font-medium disabled:opacity-50 ${isFinished ? 'bg-primary text-primary-foreground' : 'border border-input bg-background text-fg-3'}`}>{isFinished ? `下载 ${progress.exports.join(', ').replace(/^\\./, '')}` : '已导出（完成后可下载）'}</button> : null}{isFinished && <p className="mt-3 text-xs text-fg-3">🛡️ 文件已转存云端存档，保留 5 天；请及时下载，逾期存档自动清理。</p>}</section>

      <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-4 font-mono text-sm uppercase tracking-wide text-fg-3">演示材料（可选）</h2><p className="mb-3 text-sm text-fg-2">上传你的文档（Word、PDF、Markdown、PPT、TXT，单个文件最大 10MB），AI 会基于这些内容制作 PPT。没有现成文档也可以，直接输入主题或粘贴内容即可。</p><div className="flex flex-wrap items-center gap-2"><input type="file" accept=".md,.pdf,.docx,.pptx,.txt,.markdown" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 10 * 1024 * 1024) { setError(`「${file.name}」超过 10MB 限制，请压缩后重试`); setSourceFile(null); event.target.value = ''; return } setError(null); setSourceFile(file) }} className="max-w-full flex-1 text-sm text-fg-2 file:mr-3 file:rounded-[7px] file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground" aria-label="选择演示材料文件" /><button type="button" onClick={uploadFile} disabled={uploading || !sourceFile} title={sourceFile ? '上传已选文件' : '请先选择文件'} className="inline-flex items-center gap-2 rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Upload size={16} />{uploading ? '上传中…' : '上传材料'}</button></div><p className="mt-2 text-xs text-fg-3">{sourceFile ? `已选择：${sourceFile.name}，点击「上传材料」即可上传` : '选择文件后，「上传材料」按钮会变为可用'}</p><div className="mt-4 rounded-[10px] border border-border bg-background p-3"><p className="text-xs font-medium text-fg-3">或者直接粘贴内容：</p><Input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="文件名（如：产品介绍.md）" aria-label="材料文件名" className="mt-2" /><textarea value={markdown} onChange={(event) => setMarkdown(event.target.value)} className="mt-3 min-h-40 w-full rounded-[7px] border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary" aria-label="材料内容" placeholder="把你要做的内容粘贴到这里，例如产品介绍、会议纪要、课程大纲…" /><button type="button" onClick={upload} disabled={uploading || !markdown.trim()} className="mt-3 inline-flex items-center gap-2 rounded-[7px] border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"><Upload size={16} />{uploading ? '上传中…' : '添加材料内容'}</button></div></section>

      <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-4 font-mono text-sm uppercase tracking-wide text-fg-3">图片素材（可选）</h2><p className="mb-3 text-sm text-fg-2">上传你喜欢的图片（PNG / JPG / WebP，单张最大 10MB），AI 设计页面时会参考这些图片。</p><div className="flex flex-wrap items-center gap-2"><input type="file" accept=".png,.jpg,.jpeg,.webp" multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); const oversized = files.find((f) => f.size > 10 * 1024 * 1024); if (oversized) { setError(`「${oversized.name}」超过 10MB 限制，请压缩后重试`); setImageFiles([]); event.target.value = ''; return } setError(null); setImageFiles(files); setUploadSuccess(null) }} disabled={isGenerating} className="max-w-full flex-1 text-sm text-fg-2 file:mr-3 file:rounded-[7px] file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground disabled:opacity-50" aria-label="选择图片素材" /><button type="button" onClick={uploadImages} disabled={uploadingImages || !imageFiles.length || isGenerating} title={isGenerating ? '生成中暂不可上传' : imageFiles.length ? '上传已选图片' : '请先选择图片'} className="inline-flex items-center gap-2 rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{uploadingImages ? '上传中…' : '上传图片'}</button></div><p className="mt-2 text-xs text-fg-3">{isGenerating ? '当前正在生成页面，暂不可上传图片；生成完成后可以再上传替换。' : imageFiles.length ? `已选择 ${imageFiles.length} 张图片，点击「上传图片」即可上传` : '选择图片后，「上传图片」按钮会变为可用'}</p>{uploadSuccess && <p className="mt-2 text-xs font-medium text-emerald-400">✓ {uploadSuccess}</p>}</section>

      <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-4 font-mono text-sm uppercase tracking-wide text-fg-3">重做与恢复</h2>{canRerunPage && <div className="flex flex-wrap items-center gap-2"><Input type="number" min={1} max={Math.max(pageNumbers.length, 1)} value={rerunPage} onChange={(event) => setRerunPage(event.target.value)} placeholder="页号，如 3" aria-label="要重做的页号" className="max-w-[120px]" /><span className="text-xs text-fg-3">共 {pageNumbers.length || '—'} 页，输入要重画的页号</span><button type="button" onClick={rerunPageNow} disabled={rerunning || !rerunPage.trim()} className="inline-flex items-center gap-2 rounded-[7px] border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">{rerunning ? '重画中…' : '重做该页'}</button></div>}{isFailed && <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" onClick={resumeGeneration} disabled={resuming} className="inline-flex items-center gap-2 rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{resuming ? '恢复中…' : '重新生成'}</button><span className="text-xs text-fg-3">失败的项目可以重新尝试，已有产物会保留。</span></div>}</section>

      <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-3 font-mono text-sm uppercase tracking-wide text-fg-3">风格与内容确认</h2><p className="mb-4 text-sm text-fg-2">{progress.pipeline_mode === 'auto' ? '一键生成已按你的配置直接锁定。如需调整，可重新创建演示文稿。' : '配置受众、目标、语言、风格、页数等八项内容，AI 会严格按照你的配置生成。点击「开始配置」打开配置页。'}</p>{progress.pipeline_mode !== 'auto' && <button type="button" onClick={openConfirmUi} disabled={openingConfirm || isGenerating} className="rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{openingConfirm ? '正在打开…' : isGenerating ? '生成中，暂不可修改配置' : '开始配置'}</button>}{isGenerating && <p className="mt-3 text-sm text-fg-2">当前正在生成页面（{pptmasterStatusLabel(progress.status)}），配置已锁定，等生成完成后才能修改。</p>}{PPTMASTER_REVIEWABLE_STATUSES.includes(progress.status) && <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={openLivePreview} className="inline-flex items-center gap-2 rounded-[7px] border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">预览效果</button>{progress.status === 'preview_ready' && <button type="button" onClick={approveExport} disabled={exporting} className="inline-flex items-center gap-2 rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{exporting ? '导出中…' : '确认并导出 PPT'}</button>}</div>}{error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}</section>

      {spec && <section className="mb-5 rounded-[14px] border border-border bg-card p-[18px]"><h2 className="mb-3 font-mono text-sm uppercase tracking-wide text-fg-3">大纲预览</h2><p className="mb-3 text-xs text-fg-3">以下是 AI 规划的大纲与设计规格（内部技术细节，无需修改）。</p><details open><summary className="cursor-pointer text-sm text-foreground">大纲（design_spec.md）</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-fg-2">{spec.design_spec}</pre></details><details className="mt-3"><summary className="cursor-pointer text-sm text-foreground">设计规格（spec_lock.md）</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-fg-2">{spec.spec_lock}</pre></details></section>}

      <section className="rounded-[14px] border border-dashed border-border p-[18px]"><h2 className="mb-2 font-mono text-sm uppercase tracking-wide text-fg-3">删除项目</h2><p className="mb-3 text-xs text-fg-3">删除后项目会被归档且不可恢复，包含所有已生成的页面和导出文件。</p><button type="button" onClick={deleteProject} disabled={deleting} className="rounded-[7px] border border-red-400/40 bg-background px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-50">{deleting ? '删除中…' : '删除项目'}</button></section>
    </AppShell>
  )
}
