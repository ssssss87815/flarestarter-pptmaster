import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowRight, FileText, Settings, Sparkles, SlidersHorizontal } from 'lucide-react'

import { requireUser } from '@/features/auth/middleware'
import { getEntitlement } from '@/features/billing/middleware'
import { deletePptMasterProjectAction, getPptMasterProjects, startPptMasterQuickAction } from '@/features/pptmaster/actions'
import { pptmasterStatusLabel } from '@/features/pptmaster/status'
import { useTranslation } from '@/features/i18n/provider'
import { AppShell } from '@/components/app/app-shell'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/{-$locale}/app/')({
  validateSearch: (s: Record<string, unknown>): { checkout?: string } => ({
    checkout: typeof s.checkout === 'string' ? s.checkout : undefined,
  }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  loader: async ({ params }) => {
    const [user, ent, projects] = await Promise.all([
      requireUser({ data: { locale: (params as { locale?: string }).locale } }),
      getEntitlement(),
      getPptMasterProjects(),
    ])
    return { user, ent, projects }
  },
  component: AppHome,
})

function AppHome() {
  const { user, ent, projects } = Route.useLoaderData()
  const { checkout } = Route.useSearch()
  const { t } = useTranslation()
  const router = useRouter()
  const isPro = ent.plan === 'pro'
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [audience, setAudience] = useState('专业观众')
  const [goal, setGoal] = useState('说明方案并推动决策')
  const [language, setLanguage] = useState('中文')
  const [tone, setTone] = useState('清晰、可信')
  const [visualStyle, setVisualStyle] = useState('现代专业')
  const [pageCount, setPageCount] = useState('8')
  const [canvas, setCanvas] = useState<'ppt169' | 'ppt43'>('ppt169')
  const [imageUsage, setImageUsage] = useState<'optional' | 'none' | 'ai' | 'web'>('optional')
  const [step, setStep] = useState(1)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function deleteProject(id: string, name: string) {
    if (!window.confirm(`确定删除「${name}」吗？所有产物将被归档，且不可撤销。`)) return
    setDeletingId(id); setError(null)
    try { await deletePptMasterProjectAction({ data: { projectId: id } }); await router.invalidate() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '删除失败。') }
    finally { setDeletingId(null) }
  }

  function nextStep() {
    setError(null)
    if (step === 1 && (!name.trim() || !topic.trim())) { setError('请先填写作品名称和主题。'); return }
    setStep(step + 1)
  }

  async function createProject() {
    setError(null)
    if (!name.trim() || !topic.trim()) { setError('请填写作品名称和主题。'); return }
    setCreating(true)
    try {
      const project = await startPptMasterQuickAction({ data: { name: name.trim(), topic: topic.trim(), audience, goal, language, tone, visual_style: visualStyle, page_count: Math.max(3, Math.min(30, Number(pageCount) || 8)), canvas, image_usage: imageUsage } })
      await router.navigate({ to: '/{-$locale}/app/projects/$projectId', params: { projectId: project.id } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create project.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppShell user={user} isPro={isPro} active="dashboard" crumb={t('app.dashboard')} paymentFailed={ent.paymentFailed}>
      <div className="mb-6">
        <h1 className="page-h">{t('app.dashboard')}</h1>
        <p className="mt-1.5 text-[14.5px] text-fg-2">{t('app.welcomeSub')}</p>
      </div>
      {checkout === 'success' && ent.plan === 'free' && <p className="mb-4 text-sm text-primary">{t('billing.processing')}</p>}
      <div className="mb-7 flex flex-wrap items-center gap-3 text-sm text-fg-2">
        <span>{t('app.loggedInAs', { email: user.email })}</span>
        <Badge variant={isPro ? 'pro' : 'free'} dot>{isPro ? t('billing.pro') : t('billing.free')}</Badge>
      </div>

      <section className="mb-7 rounded-[14px] border border-border bg-card p-[18px]">
        <h2 className="mb-2 text-base font-semibold">一键生成</h2>
        <p className="mb-4 text-sm text-fg-2">跟着引导完成设置，选项可以直接选，不用自己琢磨。</p>

        {/* Step indicator */}
        <div className="mb-5 flex items-center gap-2">
          {['基本信息', '内容设置', '视觉设置'].map((label, i) => {
            const n = i + 1
            const done = step > n
            const active = step === n
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(n)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] transition-colors ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/10 text-primary' : 'bg-muted text-fg-3'}`}
              >
                <span>{done ? '✓' : n}</span>
                {label}
              </button>
            )
          })}
        </div>

        {step === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="作品名称（必填）" aria-label="作品名称" />
            <Input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="主题（必填）" aria-label="主题" />
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-fg-2">目标受众
              <select className="h-[42px] rounded-[7px] border border-input bg-background px-3" value={audience} onChange={(event) => setAudience(event.target.value)}>
                <option>老师、评委</option><option>公司领导</option><option>客户</option><option>同学</option><option>其他观众</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-fg-2">演示目标
              <select className="h-[42px] rounded-[7px] border border-input bg-background px-3" value={goal} onChange={(event) => setGoal(event.target.value)}>
                <option>汇报工作进展</option><option>讲解方案内容</option><option>答辩说明</option><option>产品路演</option><option>教学讲解</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-fg-2">语言
              <select className="h-[42px] rounded-[7px] border border-input bg-background px-3" value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option>中文</option><option>English</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-fg-2">语气
              <select className="h-[42px] rounded-[7px] border border-input bg-background px-3" value={tone} onChange={(event) => setTone(event.target.value)}>
                <option>清晰、可信</option><option>正式、权威</option><option>亲切、轻松</option><option>激情、有感染力</option>
              </select>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-fg-2">视觉风格
              <select className="h-[42px] rounded-[7px] border border-input bg-background px-3" value={visualStyle} onChange={(event) => setVisualStyle(event.target.value)}>
                <option>现代专业</option><option>学术严谨</option><option>创意活泼</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-fg-2">页数
              <select className="h-[42px] rounded-[7px] border border-input bg-background px-3" value={pageCount} onChange={(event) => setPageCount(event.target.value)}>
                <option value="8">8 页</option><option value="12">12 页</option><option value="16">16 页</option><option value="24">24 页</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-fg-2">画布
              <select className="h-[42px] rounded-[7px] border border-input bg-background px-3" value={canvas} onChange={(event) => setCanvas(event.target.value as 'ppt169' | 'ppt43')}>
                <option value="ppt169">16:9 宽屏</option><option value="ppt43">4:3 标准</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-fg-2">图片
              <select className="h-[42px] rounded-[7px] border border-input bg-background px-3" value={imageUsage} onChange={(event) => setImageUsage(event.target.value as typeof imageUsage)}>
                <option value="optional">按需</option><option value="none">不使用</option><option value="ai">AI 图片</option><option value="web">网络图片</option>
              </select>
            </label>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            {step > 1 && (
              <button type="button" onClick={() => setStep(step - 1)} className="rounded-[7px] border border-input px-4 py-2 text-sm text-fg-2 hover:text-foreground">上一步</button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step < 3 ? (
              <button type="button" onClick={nextStep} className="rounded-[7px] bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">下一步</button>
            ) : (
              <button type="button" onClick={createProject} disabled={creating} className="rounded-[7px] bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{creating ? '生成中…' : '开始生成'}</button>
            )}
            {error && <span role="alert" className="text-sm text-red-400">{error}</span>}
          </div>
        </div>
      </section>

      <section className="mb-7">
        <div className="mb-3.5 flex items-center justify-between"><h2 className="font-mono text-sm uppercase tracking-wide text-fg-3">Your presentations</h2><span className="text-xs text-fg-3">{projects.length} projects</span></div>
        {projects.length === 0 ? <div className="rounded-[14px] border border-dashed border-border p-6 text-sm text-fg-3">No presentation projects yet. Create one above.</div> : <div className="grid gap-3.5">{projects.map((project) => <div key={project.id} className="rounded-[14px] border border-border bg-card p-[18px]"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="icon-tile"><FileText size={20} /></span><div><h3 className="m-0 text-[15px] font-semibold text-foreground">{project.name}</h3><p className="mt-1 text-[13px] text-fg-3">{pptmasterStatusLabel(project.status)}{project.detail ? ` · ${project.detail}` : ''}</p></div></div><div className="flex items-center gap-2"><button type="button" onClick={() => deleteProject(project.id, project.name)} disabled={deletingId === project.id} className="text-xs text-fg-3 hover:text-red-400 disabled:opacity-50" aria-label={`Delete ${project.name}`}>{deletingId === project.id ? '删除中…' : '删除'}</button><Link to="/{-$locale}/app/projects/$projectId" params={{ projectId: project.id }} className="text-fg-3 hover:text-foreground" aria-label={`Open ${project.name}`}><ArrowRight size={17} /></Link></div></div></div>)}</div>}
      </section>

      <h2 className="mb-3.5 font-mono text-sm uppercase tracking-wide text-fg-3">{t('app.quickActions')}</h2>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Link to="/{-$locale}/app/advanced" className="block rounded-[14px] border border-primary/40 bg-primary/5 p-[18px] transition-colors hover:border-primary"><span className="icon-tile"><SlidersHorizontal size={20} /></span><div className="mb-1.5 mt-3.5 flex items-center gap-2"><h3 className="m-0 text-[15px] font-semibold text-foreground">{t('app.advancedWorkbench')}</h3><ArrowRight size={15} className="text-fg-3" /></div><p className="m-0 text-[13px] leading-snug text-fg-3">{t('app.advancedWorkbenchSub')}</p></Link>
        <Link to="/{-$locale}/app/account" className="block rounded-[14px] border border-border bg-card p-[18px] transition-colors hover:border-border-strong"><span className="icon-tile"><Settings size={20} /></span><div className="mb-1.5 mt-3.5 flex items-center gap-2"><h3 className="m-0 text-[15px] font-semibold text-foreground">{t('app.openAccount')}</h3><ArrowRight size={15} className="text-fg-3" /></div><p className="m-0 text-[13px] leading-snug text-fg-3">{t('app.openAccountSub')}</p></Link>
        <Link to="/{-$locale}/app/pro" className="block rounded-[14px] border border-border bg-card p-[18px] transition-colors hover:border-border-strong"><span className="icon-tile"><Sparkles size={20} /></span><div className="mb-1.5 mt-3.5 flex items-center gap-2"><h3 className="m-0 text-[15px] font-semibold text-foreground">{t('app.openPro')}</h3><ArrowRight size={15} className="text-fg-3" /></div><p className="m-0 text-[13px] leading-snug text-fg-3">{t('app.openProSub')}</p></Link>
      </div>
    </AppShell>
  )
}
