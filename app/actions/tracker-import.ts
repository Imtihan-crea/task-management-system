'use server'

import { revalidatePath } from 'next/cache'
import readXlsxFile from 'read-excel-file/node'
import { requirePermission } from '@/lib/auth/current-access'
import { runTrackerImport, type TrackerImportState } from '@/lib/hr/import-tracker-run'
import type { SheetInput } from '@/lib/hr/import-tracker'

const MAX_FILE_BYTES = 4 * 1024 * 1024

/** Import histori Daily Tracker dari Excel (semua sheet "Daily <Bulan>"); inti di lib/hr/import-tracker-run.ts. */
export async function importTracker(_prev: TrackerImportState, formData: FormData): Promise<TrackerImportState> {
  const actor = await requirePermission('hr.manage')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Pilih file Excel (.xlsx).' }
  if (file.size > MAX_FILE_BYTES) return { error: 'File lebih dari 4 MB.' }

  let sheets
  try {
    sheets = await readXlsxFile(Buffer.from(await file.arrayBuffer()))
  } catch {
    return { error: 'File tidak bisa dibaca. Pastikan formatnya .xlsx.' }
  }

  const result = await runTrackerImport(sheets as unknown as SheetInput[], actor.id)
  revalidatePath('/tracker', 'layout')
  return result
}
