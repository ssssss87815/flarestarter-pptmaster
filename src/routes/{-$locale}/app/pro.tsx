import { createFileRoute, Link } from '@tanstack/react-router'
import { Lock, Settings2, Image, MonitorPlay, FileDown, Gauge, BadgeCheck } from 'lucide-react'
import { getEntitlement } from '@/features/billing/middleware'
import { hasProAccess } from '@/features/billing/entitlement'
import { requireUser } from '@/features/auth/middleware'
import { useTranslation } from '@/features/i18n/provider'
import { AppShell } from '@/components/app/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/* Soft-gated Pro area: free users may enter and get a blurred preview with an
 * upgrade CTA (a real "peek" converts better than a redirect). For routes that
 * must never render for free users, use the hard gate instead:
 * `loader: () => requirePlan('pro')()` — it redirects to /pricing. */
export const Route = createFileRoute('/{-$locale}/app/pro')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  loader: async ({ params }) => {
    const [user, ent] = await Promise.all([requireUser({ data: { locale: (params as { locale?: string }).locale } }), getEntitlement()])
    return { user, ent }
  },
  component: Pro,
})

function ProFeature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="flex items-start gap-3.5 p-5">
      <span className="icon-tile shrink-0" style={{ width: 40, height: 40, borderRadius: 12 }}>
        {icon}
      </span>
      <div>
        <p className="m-0 text-[15px] font-semibold">{title}</p>
        <p className="mt-1 m-0 text-[13.5px] leading-relaxed text-fg-3">{desc}</p>
      </div>
    </Card>
  )
}

function Pro() {
  const { user, ent } = Route.useLoaderData()
  const { t } = useTranslation()
  // feature gate: paid Pro OR admin; the topbar badge stays on ent.plan (billing truth)
  const unlocked = hasProAccess(user.role, ent)
  const features = [
    { icon: <Settings2 size={19} />, title: t('billing.proFeatures.f1t'), desc: t('billing.proFeatures.f1d') },
    { icon: <Image size={19} />, title: t('billing.proFeatures.f2t'), desc: t('billing.proFeatures.f2d') },
    { icon: <MonitorPlay size={19} />, title: t('billing.proFeatures.f3t'), desc: t('billing.proFeatures.f3d') },
    { icon: <FileDown size={19} />, title: t('billing.proFeatures.f4t'), desc: t('billing.proFeatures.f4d') },
    { icon: <Gauge size={19} />, title: t('billing.proFeatures.f5t'), desc: t('billing.proFeatures.f5d') },
    { icon: <BadgeCheck size={19} />, title: t('billing.proFeatures.f6t'), desc: t('billing.proFeatures.f6d') },
  ]
  return (
    <AppShell user={user} isPro={ent.plan === 'pro'} active="pro" crumb={t('app.proDemo')} paymentFailed={ent.paymentFailed}>
      <div className="mb-6 flex items-center gap-2.5">
        <h1 className="page-h">{t('billing.proArea')}</h1>
        <Badge variant="pro">Pro</Badge>
      </div>
      {unlocked ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((f, i) => <ProFeature key={i} icon={f.icon} title={f.title} desc={f.desc} />)}
        </div>
      ) : (
        <div className="relative">
          {/* the real Pro surface, blurred and inert — a genuine peek */}
          <div className="pointer-events-none select-none blur-[6px]" aria-hidden>
            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((f, i) => <ProFeature key={i} icon={f.icon} title={f.title} desc={f.desc} />)}
            </div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 text-center">
            <span className="icon-tile" style={{ width: 52, height: 52, borderRadius: 14 }}>
              <Lock size={24} />
            </span>
            <p className="m-0 max-w-[26em] text-base text-fg-2">{t('billing.proPeekBody')}</p>
            <Link to="/{-$locale}/pricing">
              <Button>{t('billing.upgrade')}</Button>
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  )
}
