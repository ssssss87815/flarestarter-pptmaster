import { test, expect } from 'vitest'
import { mapAuthError } from '@/features/auth/errors'

test('已知错误码映射到 i18n key', () => {
  expect(mapAuthError({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe('auth.errors.invalidCredentials')
  expect(mapAuthError({ code: 'USER_ALREADY_EXISTS' })).toBe('auth.errors.emailExists')
  expect(mapAuthError({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })).toBe('auth.errors.emailExists')
  expect(mapAuthError({ code: 'EMAIL_NOT_VERIFIED' })).toBe('auth.errors.emailNotVerified')
  expect(mapAuthError({ code: 'BANNED_USER' })).toBe('auth.errors.banned')
})

test('校验类错误映射到 invalidInput', () => {
  expect(mapAuthError({ code: 'VALIDATION_ERROR', message: '[body.email] Invalid input' })).toBe('auth.errors.invalidInput')
})

test('限流错误（仅 message、无 status/code）映射到 rateLimited', () => {
  expect(mapAuthError({ message: 'Too many requests. Please try again later.' })).toBe('auth.errors.rateLimited')
  expect(mapAuthError({ status: 429 })).toBe('auth.errors.rateLimited')
})

test('未知错误回退到 unknown', () => {
  expect(mapAuthError({ code: 'WHATEVER' })).toBe('auth.errors.unknown')
  expect(mapAuthError(undefined)).toBe('auth.errors.unknown')
  expect(mapAuthError(null)).toBe('auth.errors.unknown')
})
