import { useTranslation } from '@/features/i18n/provider'

// Universal proper nouns — recognizable to the dev audience; intentionally text, not logos.
const STACK = ['Source intake', 'Strategist', 'Executor', 'Live Preview', 'Native DrawingML', 'PPTX'] as const

export function TechStrip() {
  const { t } = useTranslation()
  return (
    <section className="border-t border-border px-5 md:px-7 py-4">
      <p className="m-0 text-center font-mono text-[12.5px] text-fg-3">
        <span className="text-primary">{t('marketing.builtOn')}</span> {STACK.join(' · ')}
      </p>
    </section>
  )
}
