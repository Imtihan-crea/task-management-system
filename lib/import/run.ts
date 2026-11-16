import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log/service'
import { nextWorkstreamCode } from '@/lib/workstreams/code'
import { importKey, parseTimeline, type TimelineRow } from '@/lib/import/timeline'
import type { TaskStatus } from '@/types/task'

export type ImportState = {
  error?: string
  errors?: string[]
  success?: string
} | undefined

type ExistingTask = {
  id: string
  code: string
  title: string
  workstream_id: string | null
  assignee_id: string
  start_date: string | null
  deadline: string
  status: TaskStatus
  description: string | null
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** Tanggal selesai Excel (atau sekarang) untuk completed_at/cancelled_at. */
const stamp = (date: string | null) => (date ? `${date}T12:00:00+07:00` : new Date().toISOString())

/**
 * Inti import sheet Timeline (dipanggil action setelah cek izin). Semua baris
 * divalidasi dulu; bila ada satu yang salah, tidak ada yang disimpan. Task yang
 * sudah pernah diimport (Divisi + judul sama) diperbarui, bukan diduplikasi.
 * shortcut: tanpa notifikasi/email per task (hindari puluhan email sekaligus); tambah ringkasan bila diminta.
 */
export async function runTimelineImport(input: {
  actorId: string
  projectId: string
  fallbackAssignee: string
  data: unknown[][]
}): Promise<ImportState> {
  const { projectId, fallbackAssignee } = input
  const profile = { id: input.actorId }
  const parsed = parseTimeline(input.data as never)
  const errors = [...parsed.errors]
  if (parsed.rows.length === 0 && errors.length === 0) return { error: 'Tidak ada task di sheet Timeline.' }

  const admin = createAdminClient()
  const [{ data: users }, { data: wsRows }, { data: existingRows }] = await Promise.all([
    admin.from('profiles').select('id, full_name').eq('status', 'ACTIVE').limit(1000),
    admin.from('workstreams').select('id, name, code').eq('project_id', projectId),
    admin
      .from('tasks')
      .select('id, code, title, workstream_id, assignee_id, start_date, deadline, status, description')
      .eq('project_id', projectId)
      .eq('source_type', 'IMPORT')
      .eq('is_deleted', false),
  ])

  // PIC → user aktif: nama lengkap persis, atau kata pertama nama bila hanya satu yang cocok.
  const people = ((users ?? []) as { id: string; full_name: string | null }[]).map((u) => ({ id: u.id, full_name: u.full_name ?? '' }))
  const findUser = (name: string): string | null => {
    const n = norm(name)
    const exact = people.filter((u) => norm(u.full_name) === n)
    if (exact.length === 1) return exact[0].id
    const first = people.filter((u) => norm(u.full_name).split(' ')[0] === n)
    return first.length === 1 ? first[0].id : null
  }
  if (fallbackAssignee && !people.some((u) => u.id === fallbackAssignee)) {
    return { error: 'PIC cadangan harus user aktif.' }
  }

  const assignees = new Map<TimelineRow, string>()
  const unknownPic = new Set<string>()
  for (const row of parsed.rows) {
    const id = findUser(row.picName) ?? (fallbackAssignee || null)
    if (id) assignees.set(row, id)
    else unknownPic.add(row.picName)
  }
  if (unknownPic.size) {
    errors.push(
      `PIC belum punya akun aktif: ${[...unknownPic].join(', ')}. Buat akunnya dulu (nama sama dengan di Excel), atau pilih PIC cadangan.`
    )
  }
  if (errors.length) return { error: 'Tidak ada yang disimpan. Perbaiki dulu:', errors }

  // Divisi → Workstream (dibuat bila belum ada).
  const workstreams = (wsRows ?? []) as { id: string; name: string; code: string }[]
  const wsByName = new Map(workstreams.map((w) => [norm(w.name), w]))
  for (const divisi of new Set(parsed.rows.map((r) => r.divisi))) {
    if (wsByName.has(norm(divisi))) continue
    const { data: created, error } = await admin
      .from('workstreams')
      .insert({ project_id: projectId, code: nextWorkstreamCode(workstreams.map((w) => w.code)), name: divisi })
      .select('id, name, code')
      .single<{ id: string; name: string; code: string }>()
    if (error || !created) {
      console.error('importTimeline workstream failed:', error?.message)
      return { error: `Gagal membuat Workstream "${divisi}". Tidak ada task yang disimpan.` }
    }
    workstreams.push(created)
    wsByName.set(norm(divisi), created)
    await logActivity({
      actorUserId: profile.id,
      action: 'WORKSTREAM_CREATED',
      entityType: 'workstream',
      entityId: created.id,
      entityCode: created.code,
      projectId,
      metadata: { workstream_code: created.code, workstream_name: divisi, source: 'import' },
    })
  }
  const wsName = new Map(workstreams.map((w) => [w.id, w.name]))

  const existing = new Map<string, ExistingTask>()
  for (const t of (existingRows ?? []) as ExistingTask[]) {
    existing.set(importKey(wsName.get(t.workstream_id ?? '') ?? '', t.title), t)
  }

  const toInsert = []
  const toUpdate: { task: ExistingTask; patch: Record<string, unknown> }[] = []
  for (const row of parsed.rows) {
    const fields = {
      title: row.title,
      description: row.description,
      workstream_id: wsByName.get(norm(row.divisi))!.id,
      assignee_id: assignees.get(row)!,
      start_date: row.startDate,
      deadline: row.deadline,
      status: row.status,
    }
    const old = existing.get(importKey(row.divisi, row.title))
    if (!old) {
      toInsert.push({
        ...fields,
        project_id: projectId,
        created_by: profile.id,
        priority: 'MEDIUM',
        source_type: 'IMPORT',
        completed_at: row.status === 'DONE' ? stamp(row.completedDate) : null,
        cancelled_at: row.status === 'CANCELLED' ? stamp(null) : null,
      })
      continue
    }
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) {
      if (old[k as keyof ExistingTask] !== v) patch[k] = v
    }
    if (patch.status) {
      patch.completed_at = row.status === 'DONE' ? stamp(row.completedDate) : null
      patch.cancelled_at = row.status === 'CANCELLED' ? stamp(null) : null
    }
    if (Object.keys(patch).length) toUpdate.push({ task: old, patch })
  }

  let created: { id: string; code: string; title: string }[] = []
  if (toInsert.length) {
    const res = await admin.from('tasks').insert(toInsert).select('id, code, title')
    if (res.error) {
      console.error('importTimeline insert failed:', res.error.message)
      return { error: 'Gagal menyimpan task baru. Tidak ada task baru yang tersimpan; silakan coba lagi.' }
    }
    created = res.data ?? []
  }

  const failed: string[] = []
  for (const { task, patch } of toUpdate) {
    const { error } = await admin.from('tasks').update(patch).eq('id', task.id)
    if (error) {
      console.error('importTimeline update failed:', task.code, error.message)
      failed.push(`${task.code} ${task.title}`)
    }
  }

  await Promise.all([
    ...created.map((t) =>
      logActivity({
        actorUserId: profile.id,
        action: 'TASK_CREATED',
        entityType: 'task',
        entityId: t.id,
        entityCode: t.code,
        projectId,
        metadata: { task_code: t.code, task_title: t.title, source: 'import' },
      })
    ),
    ...toUpdate
      .filter(({ task }) => !failed.includes(`${task.code} ${task.title}`))
      .map(({ task, patch }) =>
        logActivity({
          actorUserId: profile.id,
          action: 'TASK_UPDATED',
          entityType: 'task',
          entityId: task.id,
          entityCode: task.code,
          projectId,
          metadata: { task_code: task.code, changed: Object.keys(patch), source: 'import' },
        })
      ),
  ])

  const unchanged = parsed.rows.length - created.length - toUpdate.length
  const summary = `Import selesai: ${created.length} task baru, ${toUpdate.length - failed.length} diperbarui, ${unchanged} tidak berubah.`
  if (failed.length) return { error: `${summary} Gagal diperbarui:`, errors: failed }
  return { success: summary }
}
