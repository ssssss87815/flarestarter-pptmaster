import { expect, test, vi } from 'vitest'

const identity = { id: '用户-id-不可替换', email: 'Lee@Example.com', name: '李 Lee' }

function serverFnMock() {
  let validator: ((value: unknown) => unknown) | { parse(value: unknown): unknown } | undefined
  const builder = {
    validator(value: unknown) {
      validator = value as ((value: unknown) => unknown) | { parse(value: unknown): unknown }
      return builder
    },
    inputValidator(value: unknown) {
      validator = value as ((value: unknown) => unknown) | { parse(value: unknown): unknown }
      return builder
    },
    handler(handler: (context: { data: unknown }) => unknown) {
      return async (options?: { data?: unknown }) => {
        const raw = options?.data
        const data = typeof validator === 'function' ? validator(raw) : validator ? validator.parse(raw) : raw
        return handler({ data })
      }
    },
  }
  return builder
}

test('every authenticated action passes the complete server-derived identity object', async () => {
  const calls = Object.fromEntries(['list', 'create', 'upload', 'progress', 'lock', 'generate', 'spec', 'outline', 'export', 'download', 'beta'].map((key) => [key, vi.fn().mockResolvedValue({})])) as Record<string, ReturnType<typeof vi.fn>>
  calls.list.mockResolvedValue([])
  vi.doMock('@tanstack/react-start', () => ({ createServerFn: () => serverFnMock() }))
  vi.doMock('@/features/auth/middleware', () => ({ requireUser: vi.fn().mockResolvedValue(identity) }))
  vi.doMock('./client', () => ({
    createPptMasterProject: calls.create,
    approvePptMasterExport: calls.export,
    approvePptMasterOutline: calls.outline,
    downloadPptMasterArtifact: calls.download,
    enrollPptMasterBeta: calls.beta,
    getPptMasterHealth: vi.fn(),
    getPptMasterProgress: calls.progress,
    getPptMasterSpec: calls.spec,
    listPptMasterProjects: calls.list,
    lockPptMasterConfirmations: calls.lock,
    startPptMasterGeneration: calls.generate,
    uploadPptMasterMarkdown: calls.upload,
  }))
  const actions = await import('./actions')
  await actions.getPptMasterProjects()
  await actions.createPptMasterProjectAction({ data: { name: 'Project', topic: 'Topic', mode: 'manual' } })
  await actions.uploadPptMasterMarkdownAction({ data: { projectId: 'p1', filename: 'source.md', markdown: '# source' } })
  await actions.getPptMasterProgressAction({ data: { projectId: 'p1' } })
  await actions.lockPptMasterConfirmationsAction({ data: { projectId: 'p1', confirmations: { a: true } } })
  await actions.startPptMasterGenerationAction({ data: { projectId: 'p1' } })
  await actions.getPptMasterSpecAction({ data: { projectId: 'p1' } })
  await actions.approvePptMasterOutlineAction({ data: { projectId: 'p1' } })
  await actions.approvePptMasterExportAction({ data: { projectId: 'p1' } })
  await actions.downloadPptMasterArtifactAction({ data: { projectId: 'p1' } })
  await actions.enrollPptMasterBetaAction({ data: { inviteCode: 'invite' } })
  expect(calls.list).toHaveBeenCalledWith(identity)
  expect(calls.create).toHaveBeenCalledWith(identity, { name: 'Project', topic: 'Topic', mode: 'manual' })
  expect(calls.upload).toHaveBeenCalledWith(identity, 'p1', 'source.md', '# source')
  expect(calls.progress).toHaveBeenCalledWith(identity, 'p1')
  expect(calls.lock).toHaveBeenCalledWith(identity, 'p1', { a: true })
  expect(calls.generate).toHaveBeenCalledWith(identity, 'p1')
  expect(calls.spec).toHaveBeenCalledWith(identity, 'p1')
  expect(calls.outline).toHaveBeenCalledWith(identity, 'p1')
  expect(calls.export).toHaveBeenCalledWith(identity, 'p1')
  expect(calls.download).toHaveBeenCalledWith(identity, 'p1')
  expect(calls.beta).toHaveBeenCalledWith(identity, 'invite')
})

test('authenticated action input does not expose identity fields', () => {
  const actionInput = { name: 'Project', topic: 'Topic', mode: 'manual' }
  expect(actionInput).not.toHaveProperty('id')
  expect(actionInput).not.toHaveProperty('email')
  expect(actionInput).not.toHaveProperty('userId')
})
