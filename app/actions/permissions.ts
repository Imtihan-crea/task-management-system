'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/current-access'
import { isGrantable, PERMISSION_SCOPE } from '@/lib/auth/access'
import { PERMISSION_GROUPS } from '@/lib/auth/permission-labels'
import { logActivity } from '@/lib/activity-log/service'
import { readLimitedField } from '@/lib/forms/limits'
import type { Permission } from '@/lib/auth/permissions'

export type PermissionFormState = { error?: string; success?: string } | undefined

const ALL = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.permission))
const isPermission = (p: string): p is Permission => (ALL as string[]).includes(p) && isGrantable(p as Permission)

/** Target harus ada dan bukan Super Admin / Developer (mereka selalu punya semua izin). */
async function loadTarget(userId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, is_super_admin, is_developer')
    .eq('id', userId)
    .maybeSingle<{ id: string; is_super_admin: boolean; is_developer: boolean }>()
  if (!data) return 'User tidak ditemukan.'
  if (data.is_super_admin || data.is_developer) return 'Super Admin dan Developer selalu punya semua izin.'
  return null
}

/** Simpan aturan "semua project / seluruh aplikasi" sekaligus (field perm:<izin> = default|grant|revoke). */
export async function saveGlobalPermissions(_prev: PermissionFormState, formData: FormData): Promise<PermissionFormState> {
  const actor = await requirePermission('permissions.manage')
  const userId = readLimitedField(formData, 'user_id')
  const targetError = await loadTarget(userId)
  if (targetError) return { error: targetError }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('user_permissions')
    .select('id, permission, granted')
    .eq('user_id', userId)
    .is('project_id', null)
  const current = new Map(((existing ?? []) as { id: string; permission: string; granted: boolean }[]).map((r) => [r.permission, r]))

  // Validasi semua pilihan dulu, baru menulis.
  const modes = new Map<string, string>()
  for (const permission of ALL) {
    const mode = readLimitedField(formData, `perm:${permission}`) || 'default'
    if (!['default', 'grant', 'revoke'].includes(mode)) return { error: 'Pilihan izin tidak valid.' }
    modes.set(permission, mode)
  }

  const changes: { permission: string; from: string; to: string }[] = []
  let failed = false
  for (const permission of ALL) {
    const mode = modes.get(permission)!
    const row = current.get(permission)
    const before = row ? (row.granted ? 'grant' : 'revoke') : 'default'
    if (before === mode) continue
    if (mode === 'default') {
      const { error } = await admin.from('user_permissions').delete().eq('id', row!.id)
      if (error) {
        failed = true
        break
      }
    } else if (row) {
      const { error } = await admin
        .from('user_permissions')
        .update({ granted: mode === 'grant', granted_by: actor.id, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) {
        failed = true
        break
      }
    } else {
      const { error } = await admin
        .from('user_permissions')
        .insert({ user_id: userId, permission, project_id: null, granted: mode === 'grant', granted_by: actor.id })
      if (error) {
        failed = true
        break
      }
    }
    changes.push({ permission, from: before, to: mode })
  }

  if (changes.length) {
    await logActivity({
      actorUserId: actor.id,
      action: 'PERMISSION_CHANGED',
      entityType: 'user',
      entityId: userId,
      metadata: { scope: 'all_projects', changes },
    })
  }
  revalidatePath(`/users/${userId}`)
  // Perubahan yang sempat tersimpan tetap tercatat di audit (di atas) walau ada yang gagal.
  if (failed) return { error: `Sebagian gagal disimpan (${changes.length} tersimpan). Silakan coba lagi.` }
  return { success: changes.length ? `${changes.length} izin diperbarui.` : 'Tidak ada perubahan.' }
}

/** Tambah / ubah / hapus aturan untuk satu project (mode = grant|revoke|default). */
export async function setProjectPermission(_prev: PermissionFormState, formData: FormData): Promise<PermissionFormState> {
  const actor = await requirePermission('permissions.manage')
  const userId = readLimitedField(formData, 'user_id')
  const permission = readLimitedField(formData, 'permission')
  const projectId = readLimitedField(formData, 'project_id')
  const mode = readLimitedField(formData, 'mode')

  const targetError = await loadTarget(userId)
  if (targetError) return { error: targetError }
  if (!isPermission(permission) || PERMISSION_SCOPE[permission] !== 'project') {
    return { error: 'Izin ini tidak bisa diatur per project.' }
  }
  if (!projectId) return { error: 'Pilih project.' }
  if (!['default', 'grant', 'revoke'].includes(mode)) return { error: 'Pilihan izin tidak valid.' }

  const admin = createAdminClient()
  const { data: project } = await admin.from('projects').select('id, code').eq('id', projectId).maybeSingle<{ id: string; code: string }>()
  if (!project) return { error: 'Project tidak ditemukan.' }

  // Ubah baris yang ada di tempat (tanpa hapus-lalu-insert), supaya aturan
  // "Cabut" tidak hilang bila penyimpanan gagal di tengah (review 16 Nov 2026).
  const { data: row } = await admin
    .from('user_permissions')
    .select('id')
    .eq('user_id', userId)
    .eq('permission', permission)
    .eq('project_id', projectId)
    .maybeSingle<{ id: string }>()
  const { error } =
    mode === 'default'
      ? row
        ? await admin.from('user_permissions').delete().eq('id', row.id)
        : { error: null }
      : row
        ? await admin
            .from('user_permissions')
            .update({ granted: mode === 'grant', granted_by: actor.id, updated_at: new Date().toISOString() })
            .eq('id', row.id)
        : await admin
            .from('user_permissions')
            .insert({ user_id: userId, permission, project_id: projectId, granted: mode === 'grant', granted_by: actor.id })
  if (error) {
    console.error('setProjectPermission failed:', error.message)
    return { error: 'Gagal menyimpan izin. Silakan coba lagi.' }
  }

  await logActivity({
    actorUserId: actor.id,
    action: 'PERMISSION_CHANGED',
    entityType: 'user',
    entityId: userId,
    projectId,
    metadata: { scope: 'project', project_code: project.code, permission, to: mode },
  })
  revalidatePath(`/users/${userId}`)
  return { success: mode === 'default' ? 'Aturan project dihapus.' : 'Aturan project disimpan.' }
}
