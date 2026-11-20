'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { hasPermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { assertActiveUser } from '@/lib/data/assertions'
import { readLimitedField } from '@/lib/forms/limits'
import { escapeEmailHtml } from '@/lib/email/layout'
import { taskTransferBody } from '@/lib/email/templates'
import { formatDateTime } from '@/lib/utils/dates'
import { projectDeciders } from '@/lib/tasks/deciders'
import { approvalError, transferError, wibLocalToISO } from '@/lib/tasks/transfer-rules'
import { processDueTransfers, resolveTransfer, TRANSFER_COLUMNS, type TransferRow } from '@/lib/tasks/transfers'

export type TransferFormState = { error?: string; success?: string } | undefined

const DENIED = 'Anda tidak punya izin untuk melakukan aksi ini.'

function done(taskIds: string[]) {
  revalidatePath('/tasks', 'layout')
  for (const id of taskIds) revalidatePath(`/tasks/${id}`)
  revalidatePath('/projects', 'layout')
}

function appBaseUrl(): string {
  try {
    return getAppBaseUrl()
  } catch {
    return ''
  }
}

type TaskLite = { id: string; code: string; title: string; project_id: string; assignee_id: string; status: string }

/**
 * Ajukan / langsung alihkan satu atau banyak task.
 * - Consultant: hanya task miliknya; jadi PENDING dan PM/Admin diberi tahu (in-app + email).
 * - Pemegang tasks.edit di project task itu: langsung disetujui (permanen = seketika;
 *   sementara = terjadwal dan dimulai otomatis).
 * Task yang tidak memenuhi syarat dilewati dan disebut di pesan hasil.
 */
export async function requestTransfer(_prev: TransferFormState, formData: FormData): Promise<TransferFormState> {
  const profile = await requireProfile()
  if (profile.role === 'VIEWER') return { error: DENIED }

  const taskIds = [...new Set(formData.getAll('task_id').map(String).filter(Boolean))].slice(0, 200)
  const toUserId = readLimitedField(formData, 'to_user_id')
  const kind = readLimitedField(formData, 'kind')
  const startsAt = kind === 'TEMPORARY' ? wibLocalToISO(readLimitedField(formData, 'starts_at')) : ''
  const endsAt = kind === 'TEMPORARY' ? wibLocalToISO(readLimitedField(formData, 'ends_at')) : ''
  const note = readLimitedField(formData, 'note') || null
  const autoReturn = formData.get('auto_return') === 'on'
  const leaveRequestId = readLimitedField(formData, 'leave_request_id') || null
  if (taskIds.length === 0) return { error: 'Pilih minimal satu task.' }
  if (note && note.length > 1000) return { error: 'Catatan paling panjang 1000 karakter.' }
  if (!(await assertActiveUser(toUserId))) return { error: 'Pengganti harus user aktif.' }

  const admin = createAdminClient()
  // Viewer hanya membaca: tidak bisa memegang task.
  const { data: target } = await admin.from('profiles').select('role').eq('id', toUserId).single<{ role: string }>()
  if (!target || target.role === 'VIEWER') return { error: 'Pengganti harus Admin, PM, atau Team Member.' }
  // Cuti terkait hanya dipakai untuk task milik orang yang cuti (lihat insert di bawah).
  const { data: leave } = leaveRequestId
    ? await admin.from('leave_requests').select('user_id').eq('id', leaveRequestId).maybeSingle<{ user_id: string }>()
    : { data: null }
  const { data } = await admin
    .from('tasks')
    .select('id, code, title, project_id, assignee_id, status')
    .in('id', taskIds)
    .eq('is_deleted', false)
  const tasks = (data ?? []) as TaskLite[]

  const now = new Date()
  const skipped: string[] = []
  const pendingByProject = new Map<string, TaskLite[]>()
  const approvedIds: string[] = []
  let firstError: string | null = null

  for (const task of tasks) {
    if (task.status === 'DONE' || task.status === 'CANCELLED') {
      skipped.push(`${task.code} (sudah ditutup)`)
      continue
    }
    const manages = await hasPermission(profile.id, 'tasks.edit', task.project_id)
    if (!manages && task.assignee_id !== profile.id) {
      skipped.push(`${task.code} (bukan task Anda)`)
      continue
    }
    const err = transferError({ kind, fromUserId: task.assignee_id, toUserId, startsAt, endsAt, byManager: manages, now })
    if (err) {
      firstError ??= err
      skipped.push(`${task.code} (${err})`)
      continue
    }
    const { data: row, error } = await admin
      .from('task_transfers')
      .insert({
        task_id: task.id,
        from_user_id: task.assignee_id,
        to_user_id: toUserId,
        kind,
        starts_at: kind === 'TEMPORARY' ? startsAt : null,
        ends_at: kind === 'TEMPORARY' ? endsAt : null,
        // Kembali otomatis hanya bisa dipilih PM/Admin (keputusan pemilik: bawaannya PM ditanya).
        auto_return: manages && kind === 'TEMPORARY' && autoReturn,
        status: manages ? 'SCHEDULED' : 'PENDING',
        requested_by: profile.id,
        note,
        leave_request_id: leave && leave.user_id === task.assignee_id ? leaveRequestId : null,
        ...(manages ? { decided_by: profile.id, decided_at: now.toISOString() } : {}),
      })
      .select('id')
      .single<{ id: string }>()
    if (error || !row) {
      skipped.push(`${task.code} (${error?.code === '23505' ? 'sudah ada alih task yang berjalan' : 'gagal disimpan'})`)
      if (error && error.code !== '23505') console.error('requestTransfer failed:', error.message)
      continue
    }
    if (manages) approvedIds.push(row.id)
    else pendingByProject.set(task.project_id, [...(pendingByProject.get(task.project_id) ?? []), task])
  }

  for (const id of approvedIds) await processDueTransfers(new Date(), id)

  // Satu notifikasi per project untuk pengajuan consultant (mendesak: in-app + email).
  const baseUrl = appBaseUrl()
  for (const [projectId, list] of pendingByProject) {
    const deciders = (await projectDeciders(projectId)).filter((id) => id !== profile.id)
    const who = profile.full_name || profile.email
    await emitNotification({
      key: `transfer-request:${profile.id}:${list.map((t) => t.id).join(',')}:${now.getTime()}`,
      type: 'TASK_TRANSFER',
      userIds: deciders,
      title: `${who} mengajukan alih ${list.length} task`,
      message: list.map((t) => t.code).join(', ') + (kind === 'TEMPORARY' ? ` · sementara s/d ${formatDateTime(endsAt)}` : ' · permanen'),
      entityType: 'task_transfer',
      entityId: '',
      email: {
        subject: `[Alih Task] ${who}: ${list.length} task`,
        html: taskTransferBody({
          baseUrl,
          taskId: list[0].id,
          code: list.map((t) => t.code).join(', '),
          title: list.length === 1 ? list[0].title : `(${list.length} task)`,
          intro: `${escapeEmailHtml(who)} mengajukan alih task dan <strong>menunggu persetujuan Anda</strong>:`,
          rows: [
            { label: 'Jenis', text: kind === 'TEMPORARY' ? `Sementara ${formatDateTime(startsAt)} s/d ${formatDateTime(endsAt)}` : 'Permanen' },
            ...(note ? [{ label: 'Catatan', text: note }] : []),
          ],
          linkToList: true,
        }),
        category: 'task',
      },
    })
  }

  done(tasks.map((t) => t.id))
  const okCount = approvedIds.length + [...pendingByProject.values()].reduce((n, l) => n + l.length, 0)
  if (okCount === 0) return { error: firstError ?? `Tidak ada task yang bisa dialihkan: ${skipped.join('; ')}` }
  const head = approvedIds.length > 0
    ? `${approvedIds.length} task dialihkan.`
    : `${okCount} pengajuan alih task terkirim ke PM.`
  return { success: skipped.length ? `${head} Dilewati: ${skipped.join('; ')}` : head }
}

async function loadTransfer(id: string): Promise<(TransferRow & { task: TaskLite | null }) | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('task_transfers').select(TRANSFER_COLUMNS).eq('id', id).maybeSingle<TransferRow>()
  if (!data) return null
  const { data: task } = await admin.from('tasks').select('id, code, title, project_id, assignee_id, status').eq('id', data.task_id).maybeSingle<TaskLite>()
  return { ...data, task: task ?? null }
}

/** PM/Admin menyetujui atau menolak pengajuan consultant (satu atau banyak `id`). */
export async function decideTransfer(_prev: TransferFormState, formData: FormData): Promise<TransferFormState> {
  const profile = await requireProfile()
  const ids = [...new Set(formData.getAll('id').map(String).filter(Boolean))].slice(0, 200)
  const decision = readLimitedField(formData, 'decision')
  const note = readLimitedField(formData, 'decision_note') || null
  const autoReturn = formData.get('auto_return') === 'on'
  if (ids.length === 0) return { error: 'Pilih minimal satu pengajuan.' }
  if (decision !== 'approve' && decision !== 'reject') return { error: 'Keputusan tidak valid.' }
  if (note && note.length > 1000) return { error: 'Catatan paling panjang 1000 karakter.' }

  const okCodes: string[] = []
  const failed: string[] = []
  const taskIds: string[] = []
  for (const id of ids) {
    const t = await loadTransfer(id)
    if (!t || !t.task) {
      failed.push('(tidak ditemukan)')
      continue
    }
    taskIds.push(t.task.id)
    const err = await decideOne(profile, t as TransferRow & { task: TaskLite }, decision, note, autoReturn)
    if (err) failed.push(`${t.task.code} (${err})`)
    else okCodes.push(t.task.code)
  }
  done(taskIds)
  if (okCodes.length === 0) return { error: failed.join('; ') }
  const verb = decision === 'approve' ? 'disetujui' : 'ditolak'
  return { success: `${okCodes.length} alih task ${verb}${failed.length ? `. Gagal: ${failed.join('; ')}` : '.'}` }
}

async function decideOne(
  profile: { id: string; full_name: string | null; email: string },
  t: TransferRow & { task: TaskLite },
  decision: 'approve' | 'reject',
  note: string | null,
  autoReturn: boolean
): Promise<string | null> {
  if (!(await hasPermission(profile.id, 'tasks.edit', t.task.project_id))) return DENIED
  if (t.requested_by === profile.id) return 'pengajuan sendiri harus diputuskan PM/Admin lain'
  if (t.status !== 'PENDING') return 'sudah diputuskan'
  if (decision === 'approve') {
    const late = approvalError(t, new Date())
    if (late) return late
  }

  const now = new Date().toISOString()
  const { data: claimed } = await createAdminClient()
    .from('task_transfers')
    .update({
      status: decision === 'approve' ? 'SCHEDULED' : 'REJECTED',
      decided_by: profile.id,
      decided_at: now,
      decision_note: note,
      auto_return: decision === 'approve' && t.kind === 'TEMPORARY' && autoReturn,
      updated_at: now,
    })
    .eq('id', t.id)
    .eq('status', 'PENDING')
    .select('id')
  if (!claimed?.length) return 'sudah diputuskan'

  if (decision === 'approve') {
    await processDueTransfers(new Date(), t.id)
    return null
  }
  if (t.requested_by) {
    // Ditolak: consultant perlu tahu segera (in-app + email).
    await emitNotification({
      key: `transfer-rejected:${t.id}`,
      type: 'TASK_TRANSFER',
      userIds: [t.requested_by],
      title: `Alih task ${t.task.code} ditolak`,
      message: note ? `Catatan PM: ${note}` : `Oleh ${profile.full_name || profile.email}.`,
      entityType: 'task',
      entityId: t.task.id,
      email: {
        subject: `[Alih Task Ditolak] ${t.task.code} ${t.task.title}`,
        html: taskTransferBody({
          baseUrl: appBaseUrl(),
          taskId: t.task.id,
          code: t.task.code,
          title: t.task.title,
          intro: `Pengajuan alih task Anda <strong>ditolak</strong> oleh ${escapeEmailHtml(profile.full_name || profile.email)}. Task tetap Anda pegang.`,
          rows: note ? [{ label: 'Catatan', text: note }] : [],
        }),
        category: 'task',
      },
    })
  }
  return null
}

/** Batalkan alih task yang belum dimulai (satu atau banyak `id`): pengaju, atau PM/Admin project. */
export async function cancelTransfer(_prev: TransferFormState, formData: FormData): Promise<TransferFormState> {
  const profile = await requireProfile()
  const ids = [...new Set(formData.getAll('id').map(String).filter(Boolean))].slice(0, 200)
  if (ids.length === 0) return { error: 'Pilih minimal satu alih task.' }
  let ok = 0
  const failed: string[] = []
  const taskIds: string[] = []
  for (const id of ids) {
    const t = await loadTransfer(id)
    if (!t || !t.task) continue
    taskIds.push(t.task.id)
    const manages = await hasPermission(profile.id, 'tasks.edit', t.task.project_id)
    if (!manages && t.requested_by !== profile.id) {
      failed.push(`${t.task.code} (tanpa izin)`)
      continue
    }
    if (t.status !== 'PENDING' && t.status !== 'SCHEDULED') {
      failed.push(`${t.task.code} (sudah berjalan; pakai tombol Akhiri)`)
      continue
    }
    const { data } = await createAdminClient()
      .from('task_transfers')
      .update({ status: 'CANCELLED', decided_by: profile.id, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', t.id)
      .eq('status', t.status)
      .select('id')
    if (data?.length) ok += 1
    else failed.push(`${t.task.code} (sudah berubah)`)
  }
  done(taskIds)
  if (ok === 0) return { error: failed.join('; ') || 'Alih task tidak ditemukan.' }
  return { success: `${ok} alih task dibatalkan${failed.length ? `. Gagal: ${failed.join('; ')}` : '.'}` }
}

/** PM/Admin mengakhiri alih task yang berjalan atau habis masanya: kembalikan, biarkan, perpanjang. */
export async function endTransferAction(_prev: TransferFormState, formData: FormData): Promise<TransferFormState> {
  const profile = await requireProfile()
  const action = readLimitedField(formData, 'action')
  if (action !== 'return' && action !== 'keep' && action !== 'extend') return { error: 'Pilihan tidak valid.' }
  const t = await loadTransfer(readLimitedField(formData, 'id'))
  if (!t || !t.task) return { error: 'Alih task tidak ditemukan.' }
  if (!(await hasPermission(profile.id, 'tasks.edit', t.task.project_id))) return { error: DENIED }
  const newEnd = action === 'extend' ? wibLocalToISO(readLimitedField(formData, 'ends_at')) : undefined
  if (action === 'extend' && !newEnd) return { error: 'Isi waktu selesai baru.' }
  const err = await resolveTransfer(t, action, profile.id, newEnd)
  if (err) return { error: err }
  done([t.task.id])
  return {
    success: action === 'return' ? 'Task dikembalikan ke pemegang asal.' : action === 'keep' ? 'Task tetap pada pemegang sekarang.' : 'Alih task diperpanjang.',
  }
}
