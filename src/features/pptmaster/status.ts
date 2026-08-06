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
