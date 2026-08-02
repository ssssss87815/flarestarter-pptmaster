import { Link } from '@tanstack/react-router'
import { ArrowRight, Terminal } from 'lucide-react'
import { useTranslation } from '@/features/i18n/provider'
import { buttonVariants } from '@/components/ui/button'

function TerminalCard() {
  return (
    <div className="term">
      <div className="term-bar">
        <span className="term-dot" style={{ background: '#FF5F57' }} />
        <span className="term-dot" style={{ background: '#FEBC2E' }} />
        <span className="term-dot" style={{ background: '#28C840' }} />
        <span className="ml-2 text-xs text-fg-3">PPTMaster — generation pipeline</span>
      </div>
      <div className="term-body">
        <div>
          <span className="pr">$</span> source.md → PPTMaster project
        </div>
        <div className="mt-1.5">
          <span className="pr">$</span> executor --live-preview
        </div>
        <div className="ok mt-1.5">✓ spec_lock.md · page notes</div>
        <div className="ok">✓ SVG quality check · native PPTX</div>
        <div className="mt-1.5">
          <span className="pr">$</span> export --verified
        </div>
        <div>
          <span className="ok">✓</span> <span className="pr">editable presentation ready</span>
        </div>
        <div className="mt-1.5">
          <span className="pr">$</span> <span className="term-cursor" />
        </div>
      </div>
    </div>
  )
}

export function Hero({ loggedIn }: { loggedIn: boolean }) {
  const { t } = useTranslation()

  return (
    <section className="grid-bg grid items-center gap-9 px-5 md:px-7 py-14 md:grid-cols-2">
      <div className="flex flex-col gap-[18px]">
        <span className="kicker">// guided editable-pptx workspace</span>
        <h1 className="font-display text-[34px] font-semibold leading-[1.08] tracking-[-1.2px] sm:text-[42px]">
          {t('marketing.heroTitlePre')}
          <span className="text-primary">{t('marketing.heroTitleHl')}</span>
          {t('marketing.heroTitlePost')}
        </h1>
        <p className="m-0 max-w-[34em] text-base leading-relaxed text-fg-2">
          {t('marketing.heroSubtitle')}
        </p>
        <div className="mt-1 flex flex-wrap gap-2.5">
          {loggedIn ? (
            <Link to="/{-$locale}/app" className={buttonVariants({ size: 'lg' })}>
              {t('marketing.heroCtaPrimary')} <ArrowRight size={18} />
            </Link>
          ) : (
            <Link to="/{-$locale}/register" className={buttonVariants({ size: 'lg' })}>
              {t('marketing.heroCtaPrimary')} <ArrowRight size={18} />
            </Link>
          )}
          <Link to="/{-$locale}/app/advanced" className={buttonVariants({ variant: 'outline', size: 'lg', className: 'font-mono text-sm' })}>
            <Terminal size={16} /> {t('app.advancedWorkbench')}
          </Link>
        </div>
      </div>
      <TerminalCard />
    </section>
  )
}
