import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/features/i18n/provider'

export function AdminSystemStatus({ status, diskState }: { status: string; diskState?: string }) {
  const { t } = useTranslation()
  const available = status === 'ok' && (!diskState || diskState === 'ok' || diskState === 'healthy')
  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {available ? <CheckCircle2 className="text-emerald-500" size={20} /> : <AlertTriangle className="text-fg-3" size={20} />}
          <div>
            <h2 className="font-semibold">{t('admin.systemStatus')}</h2>
            <p className="mt-1 text-sm text-fg-3">{t('admin.pptMasterStatus')}</p>
          </div>
        </div>
        <Badge variant={available ? 'ok' : 'warn'} dot>{status}</Badge>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm text-fg-2">
        <Activity size={15} />
        {diskState ? `${t('admin.diskState')}: ${diskState}` : t('admin.statusChecked')}
      </div>
    </Card>
  )
}
