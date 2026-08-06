/** Better-Auth 错误对象 → auth.errors.* i18n key。 */
export function mapAuthError(
  error: { code?: string; message?: string; status?: number } | undefined | null,
): string {
  if (error?.status === 429) return 'auth.errors.rateLimited'
  const map: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: 'auth.errors.invalidCredentials',
    USER_ALREADY_EXISTS: 'auth.errors.emailExists',
    // admin() 插件挂载后，注册路径的重复邮箱错误用的是这个新 code（better-auth 1.6.23）。
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'auth.errors.emailExists',
    EMAIL_NOT_VERIFIED: 'auth.errors.emailNotVerified',
    INVALID_TOKEN: 'auth.errors.invalidToken',
    PASSWORD_TOO_SHORT: 'auth.errors.weakPassword',
    PASSWORD_TOO_LONG: 'auth.errors.weakPassword',
    VALIDATION_ERROR: 'auth.errors.invalidInput',
    BANNED_USER: 'auth.errors.banned',
  }
  const code = error?.code
  if (code && map[code]) return map[code]
  // Turnstile/captcha plugin failures surface as a message, not a mapped code.
  if (/captcha/i.test(error?.message ?? '')) return 'auth.errors.captchaFailed'
  // Better-Auth rate limiting may surface with only a message and no status/code.
  if (/too many requests|rate.?limit/i.test(error?.message ?? '')) return 'auth.errors.rateLimited'
  return 'auth.errors.unknown'
}
