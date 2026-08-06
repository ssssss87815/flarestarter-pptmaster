import { createFileRoute } from '@tanstack/react-router'
import { getAdminPptMasterHealthFn, getAdminStatsFn } from '@/features/admin/middleware'
import { useSession } from '@/features/auth/auth.client'
import { StatsCards } from '@/features/admin/components/stats-cards'
import { useTranslation } from '@/features/i18n/provider'
import { AppShell } from '@/components/app/app-shell'
import { AdminSystemStatus } from '@/features/admin/components/admin-system-status'

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

  return (
    <AppShell user={user} isPro={false} active="admin-dashboard" crumb={t('admin.navAdmin')}>
      <div className="mb-6">
        <h1 className="page-h">{t('admin.title')}</h1>
        <p className="mt-1.5 text-[14.5px] text-fg-2">{t('admin.overviewSub')}</p>
      </div>
      <StatsCards stats={stats} />
      <AdminSystemStatus status={health.status} diskState={health.disk_state} />
    </AppShell>
  )
}
