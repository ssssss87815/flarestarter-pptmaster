import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { getAdminPptMasterHealthFn, getAdminStatsFn, getAdminUsersFn, getFeedbackFn, setFeedbackStatusFn, getWaitlistFn, getSponsorshipsFn, setSponsorshipHiddenFn } from '@/features/admin/middleware'
import { useSession } from '@/features/auth/auth.client'
import { StatsCards } from '@/features/admin/components/stats-cards'
import { useTranslation } from '@/features/i18n/provider'
import { AppShell } from '@/components/app/app-shell'
import { AdminSystemStatus } from '@/features/admin/components/admin-system-status'
import { UserTable } from '@/features/admin/components/user-table'
import { UserDetailDrawer } from '@/features/admin/components/user-detail-drawer'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { fmtDate } from '@/lib/format-date'
import type { AdminUserRow } from '@/features/admin/getAdminUsers'
import type { AdminFeedbackRow } from '@/features/feedback/feedback.server'
import type { AdminSponsorRow } from '@/features/sponsor/sponsor.server'
import type { WaitlistRow } from '@/features/waitlist/getWaitlist'
import { FEEDBACK_STATUSES, type FeedbackStatus } from '@/features/feedback/feedback.shared'

export const Route = createFileRoute('/{-$locale}/admin/')({
  loader: async () => {
    const [stats, health] = await Promise.all([getAdminStatsFn(), getAdminPptMasterHealthFn()])
    return { stats, health }
  },
  component: AdminDashboard,
})

function AdminDashboard() {
  const { stats, health } = Route.useLoaderData()
  const { data } = useSession()
  const { t } = useTranslation()
  const user = { name: data?.user?.name, email: data?.user?.email ?? '', role: data?.user?.role ?? 'admin', image: data?.user?.image ?? null }

  // ---- users ----
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize] = useState(10)
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<AdminUserRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ---- feedback / waitlist / sponsors ----
  const [feedback, setFeedback] = useState<AdminFeedbackRow[]>([])
  const [feedbackTotal, setFeedbackTotal] = useState(0)
  const [fbPage, setFbPage] = useState(0)
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([])
  const [wlPage, setWlPage] = useState(0)
  const [sponsors, setSponsors] = useState<AdminSponsorRow[]>([])
  const [spPage, setSpPage] = useState(0)
  const [sponsorTotal, setSponsorTotal] = useState(0)

  const loadUsers = useCallback(async () => {
    const res = await getAdminUsersFn({ data: { q: q || undefined, page, pageSize, sortBy, sortDir } })
    setRows(res.rows)
    setTotal(res.total)
  }, [q, page, pageSize, sortBy, sortDir])
  useEffect(() => { void loadUsers() }, [loadUsers])

  const loadFeedback = useCallback(async () => {
    const res = await getFeedbackFn({ data: { page: fbPage, pageSize: 10 } })
    setFeedback(res.rows)
    setFeedbackTotal(res.total)
  }, [fbPage])
  useEffect(() => { void loadFeedback() }, [loadFeedback])

  const loadWaitlist = useCallback(async () => {
    const res = await getWaitlistFn({ data: { page: wlPage, pageSize: 10 } })
    setWaitlist(res.rows)
  }, [wlPage])
  useEffect(() => { void loadWaitlist() }, [loadWaitlist])

  const loadSponsors = useCallback(async () => {
    const res = await getSponsorshipsFn({ data: { page: spPage, pageSize: 10 } })
    setSponsors(res.rows)
    setSponsorTotal(res.total)
  }, [spPage])
  useEffect(() => { void loadSponsors() }, [loadSponsors])

  const toggleSort = (col: string) => {
    if (sortBy === col) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')) } else { setSortBy(col); setSortDir('asc') }
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const fbPages = Math.max(1, Math.ceil(feedbackTotal / 10))
  const spPages = Math.max(1, Math.ceil(sponsorTotal / 10))

  return (
    <AppShell user={user} isPro={false} active="admin-dashboard" crumb={t('admin.navAdmin')}>
      <div className="mb-6">
        <h1 className="page-h">{t('admin.title')}</h1>
        <p className="mt-1.5 text-[14.5px] text-fg-2">{t('admin.overviewSub')}</p>
      </div>

      <StatsCards stats={stats} />
      <AdminSystemStatus status={health.status} diskState={health.disk_state} />

      {/* ---- Users ---- */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">{t('admin.users')}</h2>
          <div className="flex items-center gap-2">
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0) }}
              placeholder={t('admin.searchPlaceholder')}
              className="w-64"
            />
            <Button variant="ghost" size="sm" onClick={() => { setQ(''); setPage(0) }}>{t('admin.clearSearch')}</Button>
          </div>
        </div>
        <UserTable rows={rows} sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} onRowClick={(r) => { setSelected(r); setDrawerOpen(true) }} />
        <div className="mt-3 flex items-center justify-between text-[13px] text-fg-2">
          <span>{t('admin.pageOf', { page: page + 1, total: totalPages })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>›</Button>
          </div>
        </div>
      </section>

      {/* ---- Feedback ---- */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{t('admin.feedbackAdmin')}</h2>
          <span className="text-[13px] text-fg-2">{t('admin.pageOf', { page: fbPage + 1, total: fbPages })}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.name')}</TableHead>
              <TableHead>{t('admin.email')}</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>{t('admin.status')}</TableHead>
              <TableHead>{t('admin.createdAt')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {feedback.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-fg-2">{t('admin.noResults')}</TableCell></TableRow>
            )}
            {feedback.map((f) => (
              <TableRow key={f.id}>
                <TableCell>{f.name ?? '—'}</TableCell>
                <TableCell className="text-[13px] text-fg-2">{f.email ?? '—'}</TableCell>
                <TableCell>
                  <div className="max-w-72 truncate">{f.title}</div>
                  <div className="max-w-72 truncate text-[12.5px] text-fg-2">{f.body}</div>
                </TableCell>
                <TableCell><span className={`rounded-full px-2 py-0.5 text-[12px] ${f.status === 'open' ? 'bg-fg-1 text-bg-1' : 'bg-fg-3/20 text-fg-2'}`}>{f.status}</span></TableCell>
                <TableCell className="text-[13px] text-fg-2">{fmtDate(f.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {FEEDBACK_STATUSES.filter((s) => s !== f.status).map((s) => (
                      <Button key={s} variant="ghost" size="sm" onClick={() => { void setFeedbackStatusFn({ data: { id: f.id, status: s as FeedbackStatus } }).then(loadFeedback) }}>{s}</Button>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={fbPage === 0} onClick={() => setFbPage((p) => p - 1)}>‹</Button>
          <Button variant="outline" size="sm" disabled={fbPage >= fbPages - 1} onClick={() => setFbPage((p) => p + 1)}>›</Button>
        </div>
      </section>

      {/* ---- Waitlist ---- */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{t('admin.waitlist')}</h2>
          <a className="text-[13px] text-fg-2 underline" href="/admin/waitlist.csv">CSV</a>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.email')}</TableHead>
              <TableHead>{t('admin.locale')}</TableHead>
              <TableHead>{t('admin.source')}</TableHead>
              <TableHead>{t('admin.createdAt')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {waitlist.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-fg-2">{t('admin.waitlistEmpty')}</TableCell></TableRow>
            )}
            {waitlist.map((w, i) => (
              <TableRow key={`${w.email}-${i}`}>
                <TableCell>{w.email}</TableCell>
                <TableCell>{w.locale}</TableCell>
                <TableCell className="text-[13px] text-fg-2">{w.source}</TableCell>
                <TableCell className="text-[13px] text-fg-2">{fmtDate(w.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={wlPage === 0} onClick={() => setWlPage((p) => p - 1)}>‹</Button>
          <Button variant="outline" size="sm" onClick={() => setWlPage((p) => p + 1)}>›</Button>
        </div>
      </section>

      {/* ---- Sponsors ---- */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{t('admin.sponsors')}</h2>
          <a className="text-[13px] text-fg-2 underline" href="/admin/sponsors.csv">CSV</a>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GitHub</TableHead>
              <TableHead>{t('admin.amount')}</TableHead>
              <TableHead>{t('admin.message')}</TableHead>
              <TableHead>{t('admin.status')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sponsors.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-fg-2">{t('admin.noResults')}</TableCell></TableRow>
            )}
            {sponsors.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="text-[13px]">{s.github ?? '—'}</TableCell>
                <TableCell>{s.amountUsd != null ? `$${s.amountUsd}` : `${s.amount} ${s.currency}`}</TableCell>
                <TableCell className="max-w-64 truncate text-[13px] text-fg-2">{s.message ?? '—'}</TableCell>
                <TableCell>
                  {s.hidden ? <span className="rounded-full bg-fg-3/20 px-2 py-0.5 text-[12px] text-fg-2">{t('admin.hiddenBadge')}</span> : <span className="rounded-full bg-fg-1 px-2 py-0.5 text-[12px] text-bg-1">{s.status}</span>}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => { void setSponsorshipHiddenFn({ data: { id: s.id, hidden: !s.hidden } }).then(loadSponsors) }}>
                    {s.hidden ? t('admin.unhide') : t('admin.hide')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={spPage === 0} onClick={() => setSpPage((p) => p - 1)}>‹</Button>
          <Button variant="outline" size="sm" disabled={spPage >= spPages - 1} onClick={() => setSpPage((p) => p + 1)}>›</Button>
        </div>
      </section>

      <UserDetailDrawer row={selected} open={drawerOpen} onOpenChange={setDrawerOpen} currentUserId={data?.user?.id ?? ''} onChanged={() => { void loadUsers(); void loadFeedback() }} />
    </AppShell>
  )
}
