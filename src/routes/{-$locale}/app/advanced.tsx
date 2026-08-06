import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import { requireUser } from '@/features/auth/middleware'
import { getEntitlement } from '@/features/billing/middleware'
import { createPptMasterProjectAction } from '@/features/pptmaster/actions'
import { useTranslation } from '@/features/i18n/provider'
import { AppShell } from '@/components/app/app-shell'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/{-$locale}/app/advanced')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  loader: async ({ params }) => {
    const [user, ent] = await Promise.all([
      requireUser({ data: { locale: (params as { locale?: string }).locale } }),
      getEntitlement(),
    ])
    return { user, ent }
  },
  component: AdvancedWorkbench,
})

function AdvancedWorkbench() {
  const { user, ent } = Route.useLoaderData()
  const { t } = useTranslation()
  const router = useRouter()
  const [topic, setTopic] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (ent.plan !== 'pro') { setError('高级工作台需要有效的 Pro 或 Beta 订阅。'); return }
    const cleanTopic = topic.trim()
    if (!cleanTopic) { setError(t('app.advancedTopicRequired')); return }
    setCreating(true); setError(null)
    try {
      const project = await createPptMasterProjectAction({ data: { name: name.trim() || cleanTopic.slice(0, 36), topic: cleanTopic, mode: 'advanced' } })
      await router.navigate({ to: '/{-$locale}/app/projects/$projectId', params: { projectId: project.id } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('app.advancedCreateFailed'))
    } finally { setCreating(false) }
  }

  return (
    <AppShell user={user} isPro={ent.plan === 'pro'} active="advanced" crumb={t('app.advancedWorkbench')} paymentFailed={ent.paymentFailed}>
      <button type="button" onClick={() => router.history.back()} className="mb-5 inline-flex items-center gap-2 text-sm text-fg-3 hover:text-foreground"><ArrowLeft size={16} /> {t('app.backToWorkspace')}</button>
      <div className="mb-7 flex items-start gap-3"><span className="icon-tile"><SlidersHorizontal size={22} /></span><div><h1 className="page-h">{t('app.advancedWorkbench')}</h1><p className="mt-1.5 text-sm text-fg-2">{t('app.advancedWorkbenchSub')}</p></div></div>
      <section className="rounded-[14px] border border-primary/30 bg-card p-5">
        <h2 className="mb-2 text-base font-semibold">{t('app.advancedCreateTitle')}</h2>
        <p className="mb-5 text-sm text-fg-2">高级工作台只创建项目并管理材料。创建后进入项目页，通过唯一的 canonical Confirm UI 完成八项确认；这里不复制一键生成表单，也不会自动生成。</p>
        <div className="grid gap-3">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('app.advancedTopicPlaceholder')} aria-label={t('app.advancedTopicLabel')} />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('app.advancedNamePlaceholder')} aria-label={t('app.advancedNameLabel')} />
        </div>
        <button type="button" onClick={create} disabled={creating} className="mt-4 rounded-[7px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{creating ? t('app.advancedCreating') : t('app.advancedCreateButton')}</button>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      </section>
    </AppShell>
  )
}