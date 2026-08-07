import { createFileRoute, useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { authClient } from '@/features/auth/auth.client'
import { useTranslation } from '@/features/i18n/provider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AppShell } from '@/components/app/app-shell'
import { UserTable } from '@/features/admin/components/user-table'
import { UserDetailDrawer } from '@/features/admin/components/user-detail-drawer'
import { getAdminUsersFn, type AdminUserRow } from '@/features/admin/middleware'

// All fields optional so links to this route need not carry search params;
// defaults are applied at read time (and the server fn defaults them too).
interface UsersSearch {
  q?: string
  plan?: 'free' | 'pro'
  role?: 'user' | 'admin'
  page?: number
  pageSize?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export const Route = createFileRoute('/{-$locale}/admin/users')({
  validateSearch: (s: Record<string, unknown>): UsersSearch => {
    const out: UsersSearch = {}
    if (typeof s.q === 'string' && s.q) out.q = s.q
    if (s.plan === 'free' || s.plan === 'pro') out.plan = s.plan
    if (s.role === 'user' || s.role === 'admin') out.role = s.role
    if (typeof s.page === 'number') out.page = s.page
    if (typeof s.pageSize === 'number') out.pageSize = s.pageSize
    if (typeof s.sortBy === 'string') out.sortBy = s.sortBy
    if (s.sortDir === 'asc' || s.sortDir === 'desc') out.sortDir = s.sortDir
    return out
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getAdminUsersFn({ data: deps }),
  component: UsersPage,
})

function UsersPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { rows, total } = Route.useLoaderData()
  const search = Route.useSearch()
  const { data: session } = authClient.useSession()
  const currentUserId = session?.user?.id ?? ''

  // Apply defaults at read time (search fields are optional for linking).
  const q = search.q ?? ''
  const page = search.page ?? 0
  const pageSize = search.pageSize ?? 20
  const sortBy = search.sortBy ?? 'createdAt'
  const sortDir = search.sortDir ?? 'desc'

  const [selected, setSelected] = useState<AdminUserRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Controlled so the clear button and back/forward navigation stay in sync with the URL.
  const [qInput, setQInput] = useState(q)
  useEffect(() => setQInput(q), [q])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current) }, [])
  const isLoading = useRouterState({ select: (s) => s.isLoading })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = page + 1

  function setSearch(patch: Partial<UsersSearch>, replace = false) {
    void router.navigate({ to: '/{-$locale}/admin/users', search: { ...search, ...patch }, replace })
  }
  // One request per pause in typing, not per keystroke (each navigate refires the loader).
  function setSearchDebounced(patch: Partial<UsersSearch>) {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(patch, true), 300)
  }
  function onSort(col: string) {
    setSearch({ sortBy: col, sortDir: sortBy === col && sortDir === 'asc' ? 'desc' : 'asc', page: 0 })
  }
  function openRow(row: AdminUserRow) {
    setSelected(row)
    setDrawerOpen(true)
  }

  return (
    <AppShell user={{ name: session?.user?.name, email: session?.user?.email ?? '', role: session?.user?.role ?? 'admin', image: session?.user?.image ?? null }} isPro={false} active="admin-users" crumb={t('admin.navAdmin')}>
      <div className="mb-5">
        <h1 className="page-h">{t('admin.users')}</h1>
        <p className="mt-1.5 text-[14.5px] text-fg-2">{t('admin.usersSub')}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="field-wrap relative max-w-[380px] flex-1">
          <span className="lead"><Search size={17} /></span>
          <Input
            className="pl-[38px] pr-9"
            placeholder={t('admin.searchPlaceholder')}
            value={qInput}
            onChange={(e) => {
              setQInput(e.target.value)
              setSearchDebounced({ q: e.target.value, page: 0 })
            }}
          />
          {qInput && (
            <button
              type="button"
              aria-label={t('admin.clearSearch')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-3 hover:text-foreground"
              onClick={() => {
                if (searchTimer.current) clearTimeout(searchTimer.current)
                setQInput('')
                setSearch({ q: '', page: 0 }, true)
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <select
          className="h-9 rounded-md border border-border bg-transparent px-2.5 text-[13px] outline-none"
          value={search.plan ?? ''}
          onChange={(e) => setSearch({ plan: (e.target.value || undefined) as UsersSearch['plan'], page: 0 }, true)}
        >
          <option value="">{t('admin.filterAllPlans')}</option>
          <option value="pro">{t('admin.pro')}</option>
          <option value="free">{t('admin.free')}</option>
        </select>
        <select
          className="h-9 rounded-md border border-border bg-transparent px-2.5 text-[13px] outline-none"
          value={search.role ?? ''}
          onChange={(e) => setSearch({ role: (e.target.value || undefined) as UsersSearch['role'], page: 0 }, true)}
        >
          <option value="">{t('admin.filterAllRoles')}</option>
          <option value="admin">{t('admin.roleAdmin')}</option>
          <option value="user">{t('admin.roleUser')}</option>
        </select>
      </div>

      <Card className={`overflow-hidden p-0 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
        <UserTable rows={rows} sortBy={sortBy} sortDir={sortDir} onSort={onSort} onRowClick={openRow} />
        {rows.length === 0 && <p className="p-6 text-sm text-fg-3">{t('admin.noResults')}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <label className="flex items-center gap-2 text-[13px] text-fg-3">
            {t('admin.rowsPerPage')}
            <select
              className="h-9 w-auto rounded-[7px] border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring"
              value={pageSize}
              onChange={(e) => setSearch({ pageSize: Number(e.target.value), page: 0 })}
            >
              {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] text-fg-3">{t('admin.pageOf', { page: String(currentPage), total: String(totalPages) })}</span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setSearch({ page: 0 })}><ChevronsLeft size={15} /></Button>
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setSearch({ page: page - 1 })}><ChevronLeft size={15} /></Button>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setSearch({ page: page + 1 })}><ChevronRight size={15} /></Button>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setSearch({ page: totalPages - 1 })}><ChevronsRight size={15} /></Button>
            </div>
          </div>
        </div>
      </Card>

      <UserDetailDrawer
        row={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        currentUserId={currentUserId}
        onChanged={() => void router.invalidate()}
      />
    </AppShell>
  )
}
