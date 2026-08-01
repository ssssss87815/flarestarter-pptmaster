/** PPTMaster wordmark for the product shell. `compact` renders the mark only. */
export function Logo({ size = 18, compact = false }: { size?: number; compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-[9px] font-display font-semibold tracking-[-0.3px] text-foreground"
      style={{ fontSize: size }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-lg"
        style={{
          width: 28,
          height: 28,
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 1.5 14.2 9.8 22.5 12 14.2 14.2 12 22.5 9.8 14.2 1.5 12 9.8 9.8Z" />
        </svg>
      </span>
      {!compact && (
        <span>
          PPT<span className="font-medium opacity-[0.58]">Master</span>
        </span>
      )}
    </span>
  )
}
