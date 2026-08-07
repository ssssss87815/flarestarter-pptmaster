/**
 * Shared PPTMaster status vocabulary for the UI.
 * Machine statuses from the control plane are opaque English tokens; the
 * product UI renders them as friendly Chinese labels so users can actually
 * tell what a project is doing.
 */
export const PPTMASTER_STATUS_LABELS: Record<string, string> = {
  initial: '初始化',
  spec_ready: '规格就绪',
  spec_review: '规格审阅中',
  strategizing: '策略规划中',
  imaging: '图片获取中',
  generating: '页面生成中',
  chart_fixing: '图表修正中',
  quality_checking: '质量检查中',
  post_processing: '后处理中',
  preview_ready: '预览就绪',
  export_ready: '导出就绪',
  delivery_verified: '已交付',
  failed: '失败',
  failed_recoverable: '失败（可重试）',
}

/** Every status in which a pipeline job is actively running. */
export const PPTMASTER_RUNNING_STATUSES = [
  'strategizing',
  'imaging',
  'generating',
  'chart_fixing',
  'quality_checking',
  'post_processing',
]

/** Statuses in which the user can act on the generated preview/export. */
export const PPTMASTER_REVIEWABLE_STATUSES = ['preview_ready', 'export_ready', 'delivery_verified']

/** Statuses in which a failed project can be retried. */
export const PPTMASTER_FAILED_STATUSES = ['failed', 'failed_recoverable']

export function pptmasterStatusLabel(status: string | undefined): string {
  if (!status) return '未知'
  return PPTMASTER_STATUS_LABELS[status] ?? status
}

/**
 * User-facing pipeline stages for the progress bar. Machine statuses are
 * grouped into six coarse stages so customers can see at a glance which
 * phase a deck is in and roughly how far along it is.
 */
export const PPTMASTER_PIPELINE_STAGES: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'materials', label: '材料与主题', statuses: ['initial', 'sources_ready', 'researching'] },
  { key: 'outline', label: '规划大纲', statuses: ['strategizing', 'spec_review', 'spec_ready'] },
  { key: 'imaging', label: '配图', statuses: ['imaging'] },
  { key: 'drawing', label: '绘制页面', statuses: ['generating'] },
  { key: 'qc', label: '质检与预览', statuses: ['chart_fixing', 'quality_checking', 'post_processing', 'preview_ready'] },
  { key: 'export', label: '导出交付', statuses: ['export_ready', 'delivery_verified'] },
]

/** Overall percent for a status (drawing stage can be refined by page count). */
export function pptmasterProgressPercent(status: string | undefined, svgCount?: number, expectedPages?: number): number | null {
  if (!status) return null
  if (status === 'failed' || status === 'failed_recoverable') return null
  if (status === 'delivery_verified' || status === 'export_ready') return 100
  if (status === 'preview_ready' || status === 'post_processing') return 95
  if (status === 'quality_checking') return 90
  if (status === 'chart_fixing') return 85
  if (status === 'generating') {
    const expected = Math.max(1, expectedPages ?? 1)
    const done = Math.min(1, (svgCount ?? 0) / expected)
    return 62 + Math.round(done * 22) // 62 -> 84 as pages land
  }
  if (status === 'imaging') return 50
  if (status === 'spec_ready' || status === 'spec_review') return 35
  if (status === 'strategizing') return 30
  if (status === 'researching') return 15
  if (status === 'sources_ready' || status === 'initial') return 8
  return null
}

/** 1-based index of the current stage, or null when unknown/failed. */
export function pptmasterStageIndex(status: string | undefined): number | null {
  if (!status) return null
  for (let i = 0; i < PPTMASTER_PIPELINE_STAGES.length; i += 1) {
    if (PPTMASTER_PIPELINE_STAGES[i].statuses.includes(status)) return i
  }
  return null
}

/** Stall detection: how long the current stage has produced no new output. */
export function pptmasterStallSeconds(progress: { status?: string; svg_idle_seconds?: number; updated_at?: string }): number {
  const { status, svg_idle_seconds: idle, updated_at: updatedAt } = progress
  if (status && PPTMASTER_RUNNING_STATUSES.includes(status)) {
    if (typeof idle === 'number' && idle > 0) return idle
    if (updatedAt) {
      const t = Date.parse(updatedAt)
      if (!Number.isNaN(t)) return Math.max(0, Math.floor((Date.now() - t) / 1000))
    }
  }
  return 0
}
