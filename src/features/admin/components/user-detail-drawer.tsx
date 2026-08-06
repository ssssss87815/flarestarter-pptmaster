import { useState, useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Ban, Check, Copy, ExternalLink, LogIn, CalendarIcon, RefreshCw, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { authClient } from '@/features/auth/auth.client'
import { useTranslation } from '@/features/i18n/provider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { useIsMobile } from '@/lib/use-mobile'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { banExpiresInSeconds } from '@/features/admin/ban'
import { initials } from '@/features/admin/components/user-table'
import { fmtDate } from '@/lib/format-date'
import type { AdminUserRow } from '@/features/admin/getAdminUsers'
import { Label } from '@/components/ui/label'
import { getAdminUserSessionsFn, revokeAdminUserSessionsFn, type AdminUserSession } from '@/features/admin/middleware'

interface Props {
  row: AdminUserRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
  currentUserId: string
  onChanged: () => void
}


export function UserDetailDrawer({ row, open, onOpenChange, currentUserId, onChanged }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [reason, setReason] = useState('')
  const [expiry, setExpiry] = useState<Date | undefined>(undefined)
  const [calOpen, setCalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sessions, setSessions] = useState<AdminUserSession[] | null>(null)
  const [sessionsBusy, setSessionsBusy] = useState(false)

  useEffect(() => {
    setReason('')
    setExpiry(undefined)
    setCalOpen(false)
    setSessions(null)
  }, [row?.id])

  if (!row) return null
  const selectedRow = row
  const isSelf = selectedRow.id === currentUserId

  async function loadSessions() {
    setSessionsBusy(true)
    try {
      setSessions(await getAdminUserSessionsFn({ data: { userId: selectedRow.id } }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSessionsBusy(false)
    }
  }

  async function revokeSessions() {
    if (isSelf) return
    setSessionsBusy(true)
    try {
      await revokeAdminUserSessionsFn({ data: { userId: selectedRow.id } })
      toast.success(t('admin.sessionsRevoked'))
      await loadSessions()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
      setSessionsBusy(false)
    }
  }

  async function act(fn: () => Promise<{ error?: { message?: string } | null }>, ok: string, after?: () => void) {
    setBusy(true)
    try {
      const res = await fn()
      if (res.error) {
        toast.error(res.error.message ?? 'Error')
        return
      }
      toast.success(ok)
      after ? after() : (onChanged(), onOpenChange(false))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction={isMobile ? 'bottom' : 'right'}>
      <DrawerContent className="group/drawer-content">
        <DrawerHeader>
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={row.image ?? undefined} alt={row.name} />
              <AvatarFallback>{initials(row.name, row.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DrawerTitle>{row.name}</DrawerTitle>
              <div className="flex items-center gap-1.5 mt-1">
                {row.role === 'admin' ? <Badge variant="pro">{t('admin.roleAdmin')}</Badge> : <span className="text-fg-3 text-xs">user</span>}
                {row.banned ? <Badge variant="warn" dot>{t('admin.banned')}</Badge> : <Badge variant="ok" dot>{t('admin.active')}</Badge>}
              </div>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-5 text-sm flex flex-col gap-4">
          <div className="grid gap-1">
            <span className="text-fg-3 text-xs">{t('admin.email')}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] break-all">{row.email}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard
                    .writeText(row.email)
                    .then(() => toast.success(t('admin.emailCopied')))
                    .catch(() => toast.error('Error'))
                }}
                title={t('admin.copyEmail')}
              >
                <Copy size={14} />
              </Button>
            </div>
          </div>

          {row.stripeUrl && (
            <div className="grid gap-1">
              <span className="text-fg-3 text-xs">{t('admin.customerId')}</span>
              <a href={row.stripeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-mono text-[13px] text-primary hover:underline">
                {row.customerId} <ExternalLink size={13} />
              </a>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><span className="text-fg-3 text-xs">{t('admin.joined')}</span><span>{fmtDate(row.createdAt)}</span></div>
            <div className="grid gap-1"><span className="text-fg-3 text-xs">{t('admin.updated')}</span><span>{fmtDate(row.updatedAt)}</span></div>
            <div className="grid gap-1">
              <span className="text-fg-3 text-xs">{t('admin.plan')}</span>
              <span>{row.plan === 'pro' ? <Badge variant="pro">{t('admin.pro')}</Badge> : row.plan ? t('admin.free') : '—'}</span>
            </div>
            <div className="grid gap-1"><span className="text-fg-3 text-xs">{t('admin.status')}</span><span>{row.status ?? '—'}</span></div>
          </div>

          <hr className="border-border" />

          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{t('admin.sessions')}</span>
              <Button variant="outline" size="sm" disabled={sessionsBusy} onClick={() => void loadSessions()}>
                <RefreshCw size={14} className={sessionsBusy ? 'animate-spin' : ''} /> {t('admin.viewSessions')}
              </Button>
            </div>
            {sessions && (
              <>
                {sessions.length === 0 ? <p className="text-fg-3">{t('admin.noSessions')}</p> : (
                  <div className="grid gap-2">
                    {sessions.map((item) => (
                      <div key={item.id} className="rounded-md border border-border p-2 text-xs">
                        <div className="font-mono break-all">{item.id}</div>
                        <div className="mt-1 grid gap-1 text-fg-3">
                          <span>{t('admin.sessionCreated')}: {fmtDate(item.createdAt)}</span>
                          <span>{t('admin.sessionExpires')}: {fmtDate(item.expiresAt)}</span>
                          {item.ipAddress && <span>{t('admin.sessionIp')}: {item.ipAddress}</span>}
                          {item.userAgent && <span className="break-words">{t('admin.sessionUserAgent')}: {item.userAgent}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" disabled={isSelf || sessionsBusy} onClick={() => void revokeSessions()}>
                  <ShieldOff size={15} /> {t('admin.revokeSessions')}
                </Button>
                {isSelf && <p className="text-xs text-fg-3">{t('admin.selfSessionRevokeDisabled')}</p>}
              </>
            )}
          </div>

          {row.banned ? (
            <div className="grid gap-3">
              <div><span className="text-fg-3 text-xs">{t('admin.banReason')}: </span>{row.banReason || '—'}</div>
              <div><span className="text-fg-3 text-xs">{t('admin.banExpires')}: </span>{row.banExpires ? fmtDate(row.banExpires) : t('admin.banNever')}</div>
              <Button variant="outline" disabled={isSelf || busy} onClick={() => act(() => authClient.admin.unbanUser({ userId: row.id }), t('admin.unban'))}>
                <Check size={15} /> {t('admin.unban')}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>{t('admin.banReason')}</Label>
                <Textarea value={reason} placeholder={t('admin.banReasonPlaceholder')} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('admin.banExpires')}</Label>
                <Popover open={calOpen} onOpenChange={setCalOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start font-normal">
                      {/* client-only (inside a user gesture), so local-time display is hydration-safe */}
                      <CalendarIcon size={15} /> {expiry ? expiry.toLocaleDateString() : t('admin.banPermanent')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <Calendar
                      mode="single"
                      selected={expiry}
                      onSelect={(d) => {
                        setExpiry(d)
                        setCalOpen(false)
                      }}
                      disabled={{ before: new Date() }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                variant="default"
                disabled={isSelf || busy}
                style={{ background: 'var(--destructive)' }}
                onClick={() =>
                  act(
                    () =>
                      authClient.admin.banUser({
                        userId: row.id,
                        banReason: reason || t('admin.banDefaultReason'),
                        banExpiresIn: banExpiresInSeconds(expiry, Date.now()),
                      }),
                    t('admin.banSubmit'),
                  )
                }
              >
                <Ban size={15} /> {t('admin.banSubmit')}
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            disabled={isSelf || busy}
            onClick={() => act(() => authClient.admin.impersonateUser({ userId: row.id }), t('admin.impersonate'), () => router.navigate({ to: '/{-$locale}/app' }))}
          >
            <LogIn size={15} /> {t('admin.impersonate')}
          </Button>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">{t('admin.closeDrawer')}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
