'use server'

import { revalidatePath } from 'next/cache'
import { readSheet, SheetNotFoundError } from 'read-excel-file/node'
import { requirePermission } from '@/lib/auth/current-access'
import { CLOSED_PROJECT_ERROR, canManageProjectFor, isProjectClosed } from '@/lib/data/projects'
import { readLimitedField } from '@/lib/forms/limits'
import { TIMELINE_SHEET } from '@/lib/import/timeline'
import { runTimelineImport, type ImportState } from '@/lib/import/run'

const MAX_FILE_BYTES = 4 * 1024 * 1024

/** Import task dari Excel format "Timeline Harian" (sheet Timeline); inti di lib/import/run.ts. */
export async function importTimeline(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const profile = await requirePermission('tasks.create')
  const projectId = readLimitedField(formData, 'project_id')
  const fallbackAssignee = readLimitedField(formData, 'fallback_assignee_id')
  const file = formData.get('file')

  if (!projectId) return { error: 'Pilih Project tujuan.' }
  if (!(file instanceof File) || file.size === 0) return { error: 'Pilih file Excel (.xlsx).' }
  if (file.size > MAX_FILE_BYTES) return { error: 'File lebih dari 4 MB.' }
  if (!(await canManageProjectFor(profile, projectId, 'tasks.create'))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }
  if (await isProjectClosed(projectId)) return { error: CLOSED_PROJECT_ERROR }

  let data
  try {
    data = await readSheet(Buffer.from(await file.arrayBuffer()), TIMELINE_SHEET)
  } catch (e) {
    if (e instanceof SheetNotFoundError) return { error: `Sheet "${TIMELINE_SHEET}" tidak ada di file ini.` }
    return { error: 'File tidak bisa dibaca. Pastikan formatnya .xlsx.' }
  }

  const result = await runTimelineImport({ actorId: profile.id, projectId, fallbackAssignee, data: data as unknown[][] })
  revalidatePath('/tasks')
  revalidatePath('/projects')
  revalidatePath(`/projects/${projectId}`)
  return result
}
