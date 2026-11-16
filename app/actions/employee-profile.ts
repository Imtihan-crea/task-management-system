'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log/service'
import { readLimitedField } from '@/lib/forms/limits'
import { loadReferences } from '@/lib/hr/data'
import { parseEmployee, type EmployeeFields } from '@/lib/hr/employee'
import { todayISO } from '@/lib/utils/dates'

export type EmployeeFormState = { error?: string; success?: string } | undefined

const FIELDS = ['division', 'position_title', 'position_level', 'join_date', 'annual_leave_quota'] as const

/** Data karyawan (divisi, jabatan, level, tanggal masuk, kuota cuti). Izin hr.manage. */
export async function updateEmployeeProfile(_prev: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const actor = await requirePermission('hr.manage')
  const userId = readLimitedField(formData, 'user_id')
  const admin = createAdminClient()
  const { data: current } = await admin
    .from('profiles')
    .select('division, position_title, position_level, join_date, annual_leave_quota, deleted_at')
    .eq('id', userId)
    .maybeSingle<EmployeeFields & { deleted_at: string | null }>()
  if (!current || current.deleted_at) return { error: 'User tidak ditemukan.' }

  const refs = await loadReferences(['DIVISION', 'POSITION'])
  const active = (list: string) => refs.filter((r) => r.list === list && !r.archived_at).map((r) => r.label)
  const parsed = parseEmployee(
    Object.fromEntries(FIELDS.map((f) => [f, readLimitedField(formData, f)])) as Record<(typeof FIELDS)[number], string>,
    { divisions: active('DIVISION'), positions: active('POSITION'), current, today: todayISO() }
  )
  if ('error' in parsed) return { error: parsed.error }

  const changes = FIELDS.filter((f) => parsed.value[f] !== current[f]).map((f) => ({ field: f, from: current[f], to: parsed.value[f] }))
  if (!changes.length) return { success: 'Tidak ada perubahan.' }
  const { error } = await admin.from('profiles').update(parsed.value).eq('id', userId)
  if (error) {
    console.error('updateEmployeeProfile failed:', error.message)
    return { error: 'Gagal menyimpan. Silakan coba lagi.' }
  }
  await logActivity({ actorUserId: actor.id, action: 'HR_PROFILE_UPDATED', entityType: 'user', entityId: userId, metadata: { changes } })
  revalidatePath(`/users/${userId}`)
  revalidatePath('/tracker/rekap')
  return { success: 'Data karyawan disimpan.' }
}
