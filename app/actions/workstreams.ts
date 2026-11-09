'use server'

import { revalidatePath } from 'next/cache'
import { requireManager } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageProjectFor } from '@/lib/data/projects'
import { logActivity } from '@/lib/activity-log/service'
import { readLimitedField } from '@/lib/forms/limits'
import { nextWorkstreamCode } from '@/lib/workstreams/code'

export type WorkstreamFormState = {
  error?: string
  success?: string
} | undefined

export async function createWorkstream(
  _prev: WorkstreamFormState,
  formData: FormData
): Promise<WorkstreamFormState> {
  const profile = await requireManager()

  const projectId = readLimitedField(formData, 'project_id')
  const name = readLimitedField(formData, 'name')
  const description = readLimitedField(formData, 'description')

  if (!projectId) return { error: 'Project wajib diisi.' }
  if (!name) return { error: 'Nama Workstream wajib diisi.' }
  if (!(await canManageProjectFor(profile, projectId))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  // Kode dihitung di sini (maks+1): trigger count+1 bentrok setelah ada Workstream yang dihapus.
  // Ulangi bila bentrok unik (23505) karena pembuatan bersamaan.
  const admin = createAdminClient()
  let created: { id: string; code: string } | null = null
  let error: { message: string; code?: string } | null = null
  for (let i = 0; i < 3 && !created; i++) {
    const { data: rows } = await admin.from('workstreams').select('code').eq('project_id', projectId)
    const res = await admin
      .from('workstreams')
      .insert({
        project_id: projectId,
        code: nextWorkstreamCode((rows ?? []).map((r: { code: string }) => r.code)),
        name,
        description: description || null,
      })
      .select('id, code')
      .single<{ id: string; code: string }>()
    created = res.data
    error = res.error
    if (error?.code !== '23505') break
  }

  if (error || !created) {
    console.error('createWorkstream failed:', error?.message)
    return { error: 'Tidak dapat membuat Workstream. Silakan coba lagi.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'WORKSTREAM_CREATED',
    entityType: 'workstream',
    entityId: created.id,
    entityCode: created.code,
    projectId,
    metadata: { workstream_code: created.code, workstream_name: name },
  })

  revalidatePath('/projects')
  revalidatePath(`/projects/${projectId}`)
  return { success: 'Workstream berhasil dibuat.' }
}

export async function updateWorkstream(
  _prev: WorkstreamFormState,
  formData: FormData
): Promise<WorkstreamFormState> {
  const profile = await requireManager()

  const id = readLimitedField(formData, 'id')
  const name = readLimitedField(formData, 'name')
  const description = readLimitedField(formData, 'description')

  if (!id) return { error: 'Workstream tidak ditemukan.' }
  if (!name) return { error: 'Nama Workstream wajib diisi.' }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('workstreams')
    .select('project_id, code')
    .eq('id', id)
    .single<{ project_id: string; code: string }>()

  if (!current) return { error: 'Workstream tidak ditemukan.' }
  if (!(await canManageProjectFor(profile, current.project_id))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  const { error } = await admin
    .from('workstreams')
    .update({ name, description: description || null })
    .eq('id', id)

  if (error) {
    console.error('updateWorkstream failed:', error.message)
    return { error: 'Tidak dapat memperbarui Workstream.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'WORKSTREAM_UPDATED',
    entityType: 'workstream',
    entityId: id,
    entityCode: current.code,
    projectId: current.project_id,
    metadata: { workstream_code: current.code, workstream_name: name },
  })

  revalidatePath('/projects')
  revalidatePath(`/projects/${current.project_id}`)
  return { success: 'Workstream berhasil diperbarui.' }
}

export async function deleteWorkstream(
  _prev: WorkstreamFormState,
  formData: FormData
): Promise<WorkstreamFormState> {
  const profile = await requireManager()

  const id = readLimitedField(formData, 'id')
  if (!id) return { error: 'Workstream tidak ditemukan.' }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('workstreams')
    .select('project_id, code, name')
    .eq('id', id)
    .single<{ project_id: string; code: string; name: string }>()

  if (!current) return { error: 'Workstream tidak ditemukan.' }
  if (!(await canManageProjectFor(profile, current.project_id))) {
    return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  }

  // Jangan hapus workstream yang sudah memiliki task (non-deleted).
  const { count } = await admin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('workstream_id', id)
    .eq('is_deleted', false)

  if ((count ?? 0) > 0) {
    return {
      error: 'Workstream ini masih memiliki task dan tidak dapat dihapus. Pindahkan task terlebih dahulu.',
    }
  }

  // FK on delete set null: task yang di-soft-delete & saran PENDING akan kehilangan Workstream-nya.
  const [{ count: softDeleted }, { count: pending }] = await Promise.all([
    admin.from('tasks').select('id', { count: 'exact', head: true }).eq('workstream_id', id).eq('is_deleted', true),
    admin.from('task_suggestions').select('id', { count: 'exact', head: true }).eq('workstream_id', id).eq('status', 'PENDING'),
  ])
  if ((pending ?? 0) > 0) {
    return { error: 'Workstream ini masih dipakai saran task yang menunggu keputusan. Setujui atau tolak saran tersebut terlebih dahulu.' }
  }
  if ((softDeleted ?? 0) > 0) {
    return { error: 'Workstream ini masih tercatat pada task yang sudah dihapus (riwayat). Penghapusan diblokir agar riwayat tidak hilang.' }
  }

  const { error } = await admin.from('workstreams').delete().eq('id', id)

  if (error) {
    console.error('deleteWorkstream failed:', error.message)
    return { error: 'Tidak dapat menghapus Workstream.' }
  }

  await logActivity({
    actorUserId: profile.id,
    action: 'WORKSTREAM_DELETED',
    entityType: 'workstream',
    entityId: id,
    entityCode: current.code,
    projectId: current.project_id,
    metadata: { workstream_code: current.code, workstream_name: current.name },
  })

  revalidatePath('/projects')
  revalidatePath(`/projects/${current.project_id}`)
  return { success: 'Workstream berhasil dihapus.' }
}
