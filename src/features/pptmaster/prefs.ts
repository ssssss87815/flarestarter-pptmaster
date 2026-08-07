import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { env } from '@/lib/env'
import { createDb } from '@/db/client'
import { user as userTable } from '@/features/auth/auth.schema'
import { requireUser } from '@/features/auth/middleware'

/** Pro default-generation preferences (seed values for the Confirm UI). */
export interface ProPrefs {
  pageCount: string | null
  canvas: string | null
  language: string | null
  visualStyle: string | null
  imageUsage: string | null
}

export const EMPTY_PREFS: ProPrefs = { pageCount: null, canvas: null, language: null, visualStyle: null, imageUsage: null }

const prefsValidator = z.object({
  pageCount: z.string().max(8).nullable().optional(),
  canvas: z.string().max(32).nullable().optional(),
  language: z.string().max(32).nullable().optional(),
  visualStyle: z.string().max(48).nullable().optional(),
  imageUsage: z.string().max(64).nullable().optional(),
})

export const getProPrefsFn = createServerFn({ method: 'GET' }).handler(async (): Promise<ProPrefs> => {
  const user = await requireUser()
  const db = createDb(env.DB)
  const rows = await db.select({
    proPageCount: userTable.proPageCount,
    proCanvas: userTable.proCanvas,
    proLanguage: userTable.proLanguage,
    proVisualStyle: userTable.proVisualStyle,
    proImageUsage: userTable.proImageUsage,
  }).from(userTable).where(eq(userTable.id, user.id))
  const r = rows[0]
  if (!r) return EMPTY_PREFS
  return {
    pageCount: r.proPageCount ?? null,
    canvas: r.proCanvas ?? null,
    language: r.proLanguage ?? null,
    visualStyle: r.proVisualStyle ?? null,
    imageUsage: r.proImageUsage ?? null,
  }
})

export const saveProPrefsFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) => prefsValidator.parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const db = createDb(env.DB)
    await db.update(userTable).set({
      proPageCount: data.pageCount ?? null,
      proCanvas: data.canvas ?? null,
      proLanguage: data.language ?? null,
      proVisualStyle: data.visualStyle ?? null,
      proImageUsage: data.imageUsage ?? null,
      updatedAt: new Date(),
    }).where(eq(userTable.id, user.id))
    return { ok: true }
  })

/** Build the Confirm UI seed dict from stored prefs (only non-empty values). */
export function prefsToSeed(prefs: ProPrefs): Record<string, string> {
  const seed: Record<string, string> = {}
  if (prefs.pageCount) seed.page_count = prefs.pageCount
  if (prefs.canvas) seed.canvas = prefs.canvas
  if (prefs.language) seed.language = prefs.language
  if (prefs.visualStyle) seed.visual_style = prefs.visualStyle
  if (prefs.imageUsage) seed.image_usage = prefs.imageUsage
  return seed
}
