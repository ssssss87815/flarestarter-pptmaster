import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getAdminRevenueFn, type AdminRevenueResult } from '@/features/admin/middleware'
import { useSession } from '@/features/auth/auth.client'
import { useTranslation } from '@/features/i18n/provider'
import { AppShell } from '@/components/app/app-shell'
import { Card } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/{-$locale}/admin/revenue')({
  component: RevenuePage,
})

function fmtMoney(cents: number, currency: string): string {
  const v = cents / 100
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currency.toUpperCase() }).format(v)
  } catch {
    return `${v.toFixed(2)} ${currency.toUpperCase()}`
  }
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

function RevenuePage() {
  const { t } = useTranslation()
  const { data } = useSession()
  const [rev, setRev] = useState<AdminRevenueResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getAdminRevenueFn().then((r) => { setRev(r); setLoading(false) })
  }, [])

  const user = { name: data?.user?.name, email: data?.user?.email ?? '', role: data?.user?.role ?? 'admin', image: data?.user?.image ?? null }
  const unavailable = rev !== null && 'unavailable' in rev
  const dash = rev !== null && !unavailable ? `https://dashboard.stripe.com${rev.livemode ? '' : '/test'}` : null

  return (
    <AppShell user={user} isPro={false} active="admin-revenue" crumb={t('admin.navAdmin')}>
      <div className="mb-6">
        <h1 className="page-h">{t('admin.revenueTitle')}</h1>
        <p className="mt-1.5 text-[14.5px] text-fg-2">{t('admin.revenueSub')}</p>
      </div>

      {loading && <p className="text-[14px] text-fg-2">…</p>}

      {unavailable && (
        <Card className="p-6">
          <p className="text-[14.5px] text-fg-2">{t('admin.revenueNotConfigured')}</p>
        </Card>
      )}

      {rev !== null && !unavailable && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-[12.5px] uppercase tracking-wide text-fg-2">{t('admin.available')}</p>
              <p className="mt-1 text-[22px] font-semibold">{fmtMoney(rev.available, rev.currency)}</p>
            </Card>
            <Card className="p-5">
              <p className="text-[12.5px] uppercase tracking-wide text-fg-2">{t('admin.pending')}</p>
              <p className="mt-1 text-[22px] font-semibold">{fmtMoney(rev.pending, rev.currency)}</p>
            </Card>
            <Card className="p-5">
              <p className="text-[12.5px] uppercase tracking-wide text-fg-2">{t('admin.recentCharges')}</p>
              <p className="mt-1 text-[22px] font-semibold">{rev.charges.length}</p>
            </Card>
            <Card className="p-5">
              <p className="text-[12.5px] uppercase tracking-wide text-fg-2">{t('admin.activeSubs')}</p>
              <p className="mt-1 text-[22px] font-semibold">{rev.subscriptions.filter((s) => s.status === 'active').length}</p>
            </Card>
          </div>

          {dash && (
            <div className="mt-4">
              <a href={dash} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">{t('admin.stripeDashboard')} ↗</Button>
              </a>
            </div>
          )}

          <section className="mt-8">
            <h2 className="mb-3 text-[17px] font-semibold">{t('admin.recentCharges')}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.createdAt')}</TableHead>
                  <TableHead>{t('admin.amount')}</TableHead>
                  <TableHead>{t('admin.status')}</TableHead>
                  <TableHead>{t('admin.email')}</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rev.charges.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-fg-2">{t('admin.noResults')}</TableCell></TableRow>}
                {rev.charges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-[13px] text-fg-2">{fmtDate(c.created)}</TableCell>
                    <TableCell>{fmtMoney(c.amount, c.currency)}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-[12px] ${c.status === 'succeeded' ? 'bg-fg-1 text-bg-1' : 'bg-fg-3/20 text-fg-2'}`}>{c.status}</span>
                    </TableCell>
                    <TableCell className="text-[13px] text-fg-2">{c.email ?? '—'}</TableCell>
                    <TableCell className="max-w-48 truncate text-[12.5px] text-fg-2" title={c.id}>{c.id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="mt-10">
            <h2 className="mb-3 text-[17px] font-semibold">{t('admin.subscriptions')}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.plan')}</TableHead>
                  <TableHead>{t('admin.status')}</TableHead>
                  <TableHead>{t('admin.amount')}</TableHead>
                  <TableHead>{t('admin.interval')}</TableHead>
                  <TableHead>{t('admin.periodEnd')}</TableHead>
                  <TableHead>Customer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rev.subscriptions.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-fg-2">{t('admin.noResults')}</TableCell></TableRow>}
                {rev.subscriptions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.plan ?? '—'}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-[12px] ${s.status === 'active' ? 'bg-fg-1 text-bg-1' : 'bg-fg-3/20 text-fg-2'}`}>
                        {s.status}{s.cancelAtPeriodEnd ? ' · cancel@period' : ''}
                      </span>
                    </TableCell>
                    <TableCell>{s.amount != null ? `${fmtMoney(s.amount, 'usd')}/${s.interval ?? ''}` : '—'}</TableCell>
                    <TableCell className="text-[13px] text-fg-2">{s.interval ?? '—'}</TableCell>
                    <TableCell className="text-[13px] text-fg-2">{s.currentPeriodEnd ? fmtDate(s.currentPeriodEnd) : '—'}</TableCell>
                    <TableCell className="max-w-40 truncate text-[12.5px] text-fg-2" title={s.customer}>{s.customer || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="mt-10">
            <h2 className="mb-3 text-[17px] font-semibold">{t('admin.recentRefunds')}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.createdAt')}</TableHead>
                  <TableHead>{t('admin.amount')}</TableHead>
                  <TableHead>{t('admin.status')}</TableHead>
                  <TableHead>Charge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rev.refunds.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-fg-2">{t('admin.noResults')}</TableCell></TableRow>}
                {rev.refunds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[13px] text-fg-2">{fmtDate(r.created)}</TableCell>
                    <TableCell>{fmtMoney(r.amount, r.currency)}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-[12px] ${r.status === 'succeeded' ? 'bg-fg-1 text-bg-1' : 'bg-fg-3/20 text-fg-2'}`}>{r.status}</span>
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-[12.5px] text-fg-2" title={r.charge ?? ''}>{r.charge ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      )}
    </AppShell>
  )
}
