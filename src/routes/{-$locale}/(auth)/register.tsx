import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { User, Mail, Lock } from 'lucide-react'
import { signUp } from '@/features/auth/auth.client'
import { getEnabledSocialProviders, getTurnstileSiteKey } from '@/features/auth/middleware'
import { mapAuthError } from '@/features/auth/errors'
import { useTurnstile, captchaHeaders } from '@/features/auth/components/turnstile'
import { useTranslation } from '@/features/i18n/provider'
import { authPageHead } from '@/features/auth/head'
import { AuthCard, Field } from '@/features/auth/components/auth-card'
import { SocialButtons } from '@/features/auth/components/social-buttons'
import { Button } from '@/components/ui/button'
import { enrollPptMasterBetaAction } from '@/features/pptmaster/actions'

export const Route = createFileRoute('/{-$locale}/(auth)/register')({
  head: ({ params }) => authPageHead(params, 'registerTitle'),
  loader: async () => {
    const [providers, turnstileSiteKey] = await Promise.all([
      getEnabledSocialProviders(),
      getTurnstileSiteKey(),
    ])
    return { providers, turnstileSiteKey }
  },
  component: Register,
})

function Register() {
  const { providers, turnstileSiteKey } = Route.useLoaderData()
  const { t } = useTranslation()
  const { token, enabled, widget, reset } = useTurnstile(turnstileSiteKey)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [verifyPending, setVerifyPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signUp.email({ email, password, name }, captchaHeaders(token))
    setBusy(false)
    if (res.error) {
      setError(t(mapAuthError(res.error)))
      reset() // tokens are single-use
      return
    }
    try {
      // better-auth 客户端返回 { data: { token, user }, error }；其类型对 user 的
      // 推断不完整（Omit 掉了 user），这里做一次窄化断言取 data.user.id。
      const created = res as unknown as { data?: { user?: { id?: string; emailVerified?: boolean } } }
      await enrollPptMasterBetaAction({ data: { inviteCode, userId: created.data?.user?.id, email } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Beta invite enrollment failed.')
      return
    }
    // 强制邮箱验证开启时（REQUIRE_EMAIL_VERIFICATION=true），better-auth 注册
    // 后不建立 session（user.emailVerified=false），直接跳 /app 会被弹回登录页；
    // 此时引导用户去收件箱点验证链接，验证完成后自动落 /zh/app。
    if (verifyPendingAfterSignUp(res)) {
      setVerifyPending(true)
      return
    }
    window.location.assign('/app')
  }

  /** 注册响应里 user.emailVerified===false 说明验证邮件已发出、等待用户点链接。 */
  function verifyPendingAfterSignUp(res: unknown): boolean {
    const data = (res as { data?: { user?: { emailVerified?: boolean } } })?.data
    return data?.user?.emailVerified === false
  }

  return (
    <AuthCard title={t('auth.registerTitle')} subtitle={t('auth.registerSub')}>
      {verifyPending ? (
        <div className="grid gap-4">
          <p className="text-sm text-fg-2">{t('auth.registerVerifySent', { email })}</p>
          <Link to="/{-$locale}/verify-email" className="text-sm font-semibold text-primary">
            {t('auth.resendVerification')}
          </Link>
          <p className="text-sm text-fg-2">
            {t('auth.haveAccount')}{' '}
            <Link to="/{-$locale}/login" className="font-semibold text-primary">
              {t('auth.login')}
            </Link>
          </p>
        </div>
      ) : (
      <>
      <form onSubmit={submit} className="grid gap-[15px]">
        <Field id="inviteCode" label={t('auth.inviteCode')} icon={Lock} value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)} required autoComplete="off" placeholder="PPTB-..."
          hint={t('auth.inviteCodeHint')} />
        <Field id="name" label={t('auth.name')} icon={User} value={name}
          onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        <Field id="email" label={t('auth.email')} type="email" icon={Mail} value={email}
          onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
        <Field id="password" label={t('auth.password')} icon={Lock} canToggle value={password}
          onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password"
          hint={t('auth.pwHint')} />
        {widget}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy || (enabled && !token)}>
          {t('auth.register')}
        </Button>
      </form>
      <SocialButtons providers={providers} />
      <p className="mt-5 text-center text-sm text-fg-2">
        {t('auth.haveAccount')}{' '}
        <Link to="/{-$locale}/login" className="font-semibold text-primary">
          {t('auth.login')}
        </Link>
      </p>
      </>
      )}
    </AuthCard>
  )
}
