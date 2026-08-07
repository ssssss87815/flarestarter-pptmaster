import { useEffect, useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { Lock, Languages, SlidersHorizontal, BadgeCheck, Crown } from 'lucide-react'
import { getEntitlement } from '@/features/billing/middleware'
import { hasProAccess } from '@/features/billing/entitlement'
import { requireUser } from '@/features/auth/middleware'
import { useTranslation } from '@/features/i18n/provider'
import { getProPrefsFn, saveProPrefsFn, type ProPrefs } from '@/features/pptmaster/prefs'
import { AppShell } from '@/components/app/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

/* Soft-gated Pro area: free users see a blurred preview with an upgrade CTA.
 * Pro/Beta users get the real surface: subscription status, interface
 * language, and default-generation preferences that seed the Confirm UI. */
export const Route = createFileRoute('/{-$locale}/app/pro')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  loader: async ({ params }) => {
    const [user, ent, prefs] = await Promise.all([
      requireUser({ data: { locale: (params as { locale?: string }).locale } }),
      getEntitlement(),
      getProPrefsFn(),
    ])
    return { user, ent, prefs }
  },
  component: Pro,
})

function Pro() {
  const { user, ent, prefs } = Route.useLoaderData()
  const { t, locale } = useTranslation()
  const router = useRouter()
  const unlocked = hasProAccess(user.role, ent)
  const [form, setForm] = useState<ProPrefs>({ ...prefs })
  const [saving, setSaving] = useState(false)
  useEffect(() => setForm({ ...prefs }), [prefs])

  async function save() {
    setSaving(true)
    try {
      await saveProPrefsFn({ data: form })
      toast.success(t('admin.saved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  function setLang(locale: 'zh' | 'en') {
    document.cookie = `locale=${locale}; path=/; max-age=31536000; samesite=lax`
    const { pathname, search } = window.location
    const rest = pathname.replace(/^\/(zh|en)?/, '') || '/'
    const target = locale === 'zh' ? `/zh${rest}${search}` : `${rest}${search}`
    void router.navigate({ href: target })
  }

  const sel = 'h-9 rounded-md border border-border bg-transparent px-2.5 text-[13px] outline-none'

  return (
    <AppShell user={user} isPro={ent.plan === 'pro'} active="pro" crumb={t('app.proDemo')} paymentFailed={ent.paymentFailed}>
      <div className="mb-6 flex items-center gap-2.5">
        <h1 className="page-h">{t('billing.proArea')}</h1>
        <Badge variant="pro">Pro</Badge>
      </div>
      {unlocked ? (
        <div className="grid max-w-[640px] gap-4">
          {/* Subscription status */}
          <Card className="flex items-center gap-3.5 p-5">
            <span className="icon-tile shrink-0" style={{ width: 42, height: 42, borderRadius: 12 }}>
              {ent.lifetime ? <Crown size={20} /> : <BadgeCheck size={20} />}
            </span>
            <div>
              <p className="m-0 text-[15px] font-semibold">{ent.lifetime ? t('billing.proLifetime') : t('billing.proStatus')}</p>
              <p className="mt-1 m-0 text-[13px] text-fg-3">
                {ent.lifetime
                  ? t('billing.proStatusActive')
                  : ent.currentPeriodEnd
                    ? `${t('billing.proStatusActive')} · ${new Date(ent.currentPeriodEnd).toLocaleDateString()}`
                    : t('billing.proStatusActive')}
              </p>
            </div>
          </Card>

          {/* Interface language */}
          <Card className="grid gap-3 p-5">
            <div className="flex items-center gap-2">
              <Languages size={16} className="text-fg-3" />
              <span className="text-[14px] font-semibold">{t('billing.interfaceLanguage')}</span>
            </div>
            <div className="flex gap-2">
              <Button variant={locale === 'zh' ? 'default' : 'outline'} size="sm" onClick={() => setLang('zh')}>{t('billing.langZh')}</Button>
              <Button variant={locale === 'en' ? 'default' : 'outline'} size="sm" onClick={() => setLang('en')}>{t('billing.langEn')}</Button>
            </div>
          </Card>

          {/* Default generation preferences — seed the Confirm UI */}
          <Card className="grid gap-3.5 p-5">
            <div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-fg-3" />
                <span className="text-[14px] font-semibold">{t('billing.prefsTitle')}</span>
              </div>
              <p className="mt-1 m-0 text-[12.5px] text-fg-3">{t('billing.prefsSub')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('billing.prefPageCount')}</Label>
                <select className={sel} value={form.pageCount ?? ''} onChange={(e) => setForm({ ...form, pageCount: e.target.value || null })}>
                  <option value="">{t('billing.prefDefault')}</option>
                  <option value="8">8</option><option value="12">12</option><option value="16">16</option><option value="24">24</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('billing.prefCanvas')}</Label>
                <select className={sel} value={form.canvas ?? ''} onChange={(e) => setForm({ ...form, canvas: e.target.value || null })}>
                  <option value="">{t('billing.prefDefault')}</option>
                  <option value="ppt169">{t('billing.canvas169')}</option>
                  <option value="ppt43">{t('billing.canvas43')}</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('billing.prefLanguage')}</Label>
                <select className={sel} value={form.language ?? ''} onChange={(e) => setForm({ ...form, language: e.target.value || null })}>
                  <option value="">{t('billing.prefDefault')}</option>
                  <option value="中文">{t('billing.langZh')}</option>
                  <option value="English">{t('billing.langEn')}</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('billing.prefStyle')}</Label>
                <select className={sel} value={form.visualStyle ?? ''} onChange={(e) => setForm({ ...form, visualStyle: e.target.value || null })}>
                  <option value="">{t('billing.prefDefault')}</option>
                  <option value="现代专业">{t('billing.styleModern')}</option>
                  <option value="学术严谨">{t('billing.styleAcademic')}</option>
                  <option value="创意活泼">{t('billing.styleCreative')}</option>
                </select>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label className="text-xs">{t('billing.prefImages')}</Label>
                <select className={sel} value={form.imageUsage ?? ''} onChange={(e) => setForm({ ...form, imageUsage: e.target.value || null })}>
                  <option value="">{t('billing.prefDefault')}</option>
                  <option value="用户提供加网络来源">{t('billing.imageUserNet')}</option>
                  <option value="仅用户提供">{t('billing.imageUserOnly')}</option>
                  <option value="AI 自动生成">{t('billing.imageAi')}</option>
                </select>
              </div>
            </div>
            <div>
              <Button size="sm" disabled={saving} onClick={() => void save()}>{t('billing.prefSave')}</Button>
            </div>
          </Card>
        </div>
      ) : (
        <div className="relative">
          <div className="pointer-events-none select-none blur-[6px]" aria-hidden>
            <div className="grid max-w-[640px] gap-4">
              <Card className="p-5"><p className="m-0 text-sm text-fg-2">{t('billing.proPeekBody')}</p></Card>
              <Card className="p-5"><p className="m-0 text-sm text-fg-2">{t('billing.proPeekBody')}</p></Card>
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
