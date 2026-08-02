import { useTranslation } from '@/features/i18n/provider'

// Tool names are hardcoded (universal proper nouns); 'your agent' keeps it tool-agnostic.
const AGENTS = ['Source', 'Confirm', 'Generate', 'Review', 'Export'] as const

export function AgentSection() {
  const { t } = useTranslation()
  return (
    <section className="grid-bg border-t border-border px-5 md:px-7 py-12">
      <span className="kicker">{t('agent.kicker')}</span>
      <h2 className="m-0 mt-2.5 max-w-[18em] font-display text-[24px] font-semibold tracking-[-0.6px]">
        {t('agent.title')}
      </h2>
      <p className="m-0 mt-2.5 max-w-[46em] text-[15px] leading-relaxed text-fg-2">{t('agent.body')}</p>
      <p className="m-0 mt-4 font-mono text-[12.5px] text-fg-3">
        <span className="text-primary">$</span> {AGENTS.join(' · ')}
      </p>
    </section>
  )
}
