import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAppBaseUrl } from '@/lib/app-url'
import { emitNotification } from '@/lib/notifications/service'
import { emitTaskAssigned } from '@/lib/notifications/task-assigned'
import { logActivity } from '@/lib/activity-log/service'
import { taskTransferBody } from '@/lib/email/templates'
import { escapeEmailHtml } from '@/lib/email/layout'
import { formatDateTime } from '@/lib/utils/dates'
import { projectDeciders } from '@/lib/tasks/deciders'
import { statusAfterStart, transferTick, type TransferStatus } from '@/lib/tasks/transfer-rules'

/**
 * Mesin alih task (20 Nov 2026). Dipanggil penjadwal tiap 5 menit
 * (/api/cron/alih-task) dan langsung sesudah PM menyetujui/mengalihkan.
 * Setiap langkah MENGKLAIM baris alih task dulu (update dengan guard status),
 * baru memindah assignee dengan guard "assignee masih pemegang lama dan task
 * masih terbuka". Dua proses yang jalan bersamaan tidak saling menimpa.
 */

export type TransferRow = {
  id: string
  task_id: string
  from_user_id: string
  to_user_id: string
  kind: 'PERMANENT' | 'TEMPORARY'
  starts_at: string | null
  ends_at: string | null
  auto_return: boolean
  status: TransferStatus
  requested_by: string | null
}

export const TRANSFER_COLUMNS = 'id, task_id, from_user_id, to_user_id, kind, starts_at, ends_at, auto_return, status, requested_by'

type TaskInfo = { id: string; code: string; title: string; project_id: string }

function baseUrlOrEmpty(): string {
  try {
    return getAppBaseUrl()
  } catch {
    return ''
  }
}

async function names(ids: string[]): Promise<Map<string, string>> {
  const { data } = await createAdminClient().from('profiles').select('id, full_name, email').in('id', ids)
  return new Map(((data ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [p.id, p.full_name || p.email]))
}

/** Klaim baris: pindah status hanya bila status sekarang masih `from`. */
async function claim(id: string, from: TransferStatus, patch: Record<string, unknown>): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('task_transfers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', from)
    .select('id')
  return Boolean(data && data.length > 0)
}

/** Pindah assignee dengan guard; null bila task sudah ditutup/dihapus atau pemegangnya berubah. */
async function moveAssignee(taskId: string, from: string, to: string): Promise<(TaskInfo & { updated_at: string }) | null> {
  const { data } = await createAdminClient()
    .from('tasks')
    .update({ assignee_id: to })
    .eq('id', taskId)
    .eq('assignee_id', from)
    .eq('is_deleted', false)
    .not('status', 'in', '("DONE","CANCELLED")')
    .select('id, code, title, project_id, updated_at')
  const rows = (data ?? []) as (TaskInfo & { updated_at: string })[]
  return rows[0] ?? null
}

async function loadTask(taskId: string): Promise<(TaskInfo & { status: string; is_deleted: boolean }) | null> {
  const { data } = await createAdminClient()
    .from('tasks')
    .select('id, code, title, project_id, status, is_deleted')
    .eq('id', taskId)
    .maybeSingle<TaskInfo & { status: string; is_deleted: boolean }>()
  return data ?? null
}

function rangeText(t: Pick<TransferRow, 'kind' | 'starts_at' | 'ends_at'>): string {
  return t.kind === 'PERMANENT' ? 'permanen' : `sementara ${formatDateTime(t.starts_at)} s/d ${formatDateTime(t.ends_at)}`
}

async function logTransfer(t: TransferRow, task: TaskInfo, action: 'start' | 'return', fromName: string, toName: string): Promise<void> {
  await logActivity({
    actorUserId: null,
    action: 'TASK_TRANSFERRED',
    entityType: 'task',
    entityId: task.id,
    entityCode: task.code,
    projectId: task.project_id,
    metadata: {
      task_code: task.code,
      task_title: task.title,
      transfer_id: t.id,
      kind: t.kind,
      step: action,
      from_name: action === 'start' ? fromName : toName,
      to_name: action === 'start' ? toName : fromName,
      ends_at: t.ends_at,
    },
  })
}

/** Mulai: assignee pindah ke pengganti. Gagal guard -> alih task dibatalkan otomatis. */
async function startTransfer(t: TransferRow): Promise<void> {
  const next = statusAfterStart(t.kind)
  if (!(await claim(t.id, 'SCHEDULED', { status: next }))) return

  const moved = t.from_user_id === t.to_user_id ? null : await moveAssignee(t.task_id, t.from_user_id, t.to_user_id)
  const task = moved ?? (await loadTask(t.task_id))
  if (!moved) {
    await claim(t.id, next, { status: 'CANCELLED', decision_note: 'Dibatalkan otomatis: pemegang task sudah berubah atau task sudah ditutup.' })
    if (task && t.requested_by) {
      await emitNotification({
        key: `transfer-auto-cancel:${t.id}`,
        type: 'TASK_TRANSFER',
        userIds: [t.requested_by],
        title: `Alih task ${task.code} dibatalkan otomatis`,
        message: 'Pemegang task sudah berubah atau task sudah ditutup sebelum alih task dimulai.',
        entityType: 'task',
        entityId: task.id,
        email: null,
      })
    }
    return
  }

  const n = await names([t.from_user_id, t.to_user_id])
  const fromName = n.get(t.from_user_id) ?? '-'
  const toName = n.get(t.to_user_id) ?? '-'
  // Pengganti: TASK_ASSIGNED (in-app + email, mendesak).
  await emitTaskAssigned({ taskId: moved.id, taskCode: moved.code, taskTitle: moved.title, projectId: moved.project_id, assigneeId: t.to_user_id, stamp: moved.updated_at })
  await emitNotification({
    key: `transfer-start:${t.id}`,
    type: 'TASK_TRANSFER',
    userIds: [t.from_user_id],
    title: `Task ${moved.code} dialihkan ke ${toName}`,
    message: `Alih task ${rangeText(t)}.`,
    entityType: 'task',
    entityId: moved.id,
    email: null,
  })
  await logTransfer(t, moved, 'start', fromName, toName)
}

/** Masa sementara habis: kembali otomatis, atau PM ditanya (task tetap pada pemegang terakhir). */
async function endTransfer(t: TransferRow): Promise<void> {
  const task = await loadTask(t.task_id)
  // Task sudah selesai/ditutup/dihapus: alih task cukup diakhiri tanpa bertanya.
  if (!task || task.is_deleted || task.status === 'DONE' || task.status === 'CANCELLED') {
    await claim(t.id, 'ACTIVE', { status: 'DONE' })
    return
  }
  const n = await names([t.from_user_id, t.to_user_id])
  const fromName = n.get(t.from_user_id) ?? '-'
  const toName = n.get(t.to_user_id) ?? '-'

  if (t.auto_return) {
    if (!(await claim(t.id, 'ACTIVE', { status: 'DONE' }))) return
    const moved = await moveAssignee(t.task_id, t.to_user_id, t.from_user_id)
    if (!moved) return // task sudah selesai/ditutup atau pemegangnya diubah PM: biarkan
    await emitTaskAssigned({ taskId: moved.id, taskCode: moved.code, taskTitle: moved.title, projectId: moved.project_id, assigneeId: t.from_user_id, stamp: moved.updated_at })
    await emitNotification({
      key: `transfer-return:${t.id}`,
      type: 'TASK_TRANSFER',
      userIds: [t.to_user_id],
      title: `Task ${moved.code} kembali ke ${fromName}`,
      message: 'Masa alih task sementara sudah habis.',
      entityType: 'task',
      entityId: moved.id,
      email: null,
    })
    await logTransfer(t, moved, 'return', fromName, toName)
    return
  }

  if (!(await claim(t.id, 'ACTIVE', { status: 'EXPIRED' }))) return
  const deciders = await projectDeciders(task.project_id)
  const baseUrl = baseUrlOrEmpty()
  // PM perlu memutuskan: in-app + email (mendesak).
  await emitNotification({
    key: `transfer-expired:${t.id}`,
    type: 'TASK_TRANSFER',
    userIds: deciders,
    title: `Masa alih task ${task.code} habis`,
    message: `Task masih dipegang ${toName}. Kembalikan ke ${fromName}, perpanjang, atau biarkan.`,
    entityType: 'task_transfer',
    entityId: t.id,
    email: {
      subject: `[Alih Task Habis] ${task.code} ${task.title}`,
      html: taskTransferBody({ baseUrl, taskId: task.id, code: task.code, title: task.title, intro: `Masa alih task sementara sudah habis. Task masih dipegang <strong>${escapeEmailHtml(toName)}</strong> sampai Anda memutuskan: kembalikan ke ${escapeEmailHtml(fromName)}, perpanjang, atau biarkan.`, rows: [{ label: 'Rentang', text: rangeText(t) }], linkToList: true }),
      category: 'task',
    },
  })
  await emitNotification({
    key: `transfer-expired-info:${t.id}`,
    type: 'TASK_TRANSFER',
    userIds: [t.from_user_id, t.to_user_id],
    title: `Masa alih task ${task.code} habis`,
    message: `Task tetap dipegang ${toName} sampai PM memutuskan.`,
    entityType: 'task',
    entityId: task.id,
    email: null,
  })
}

/**
 * Jalankan langkah yang sudah jatuh tempo. `onlyId` = satu alih task
 * (sesudah disetujui), selain itu semua. Sementara yang mulai dan selesainya
 * sudah lewat ikut diakhiri dalam putaran yang sama.
 */
export async function processDueTransfers(now: Date = new Date(), onlyId?: string): Promise<{ started: number; ended: number }> {
  let query = createAdminClient().from('task_transfers').select(TRANSFER_COLUMNS).in('status', ['SCHEDULED', 'ACTIVE']).limit(500)
  if (onlyId) query = query.eq('id', onlyId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  let started = 0
  let ended = 0
  for (const row of (data ?? []) as TransferRow[]) {
    let t = row
    for (let step = 0; step < 2; step++) {
      const action = transferTick(t, now)
      if (action === 'start') {
        await startTransfer(t)
        started += 1
        t = { ...t, status: statusAfterStart(t.kind) }
      } else if (action === 'end') {
        await endTransfer(t)
        ended += 1
        break
      } else break
    }
  }
  return { started, ended }
}

/** PM memutuskan alih task yang berjalan / habis masanya. */
export async function resolveTransfer(
  t: TransferRow,
  action: 'return' | 'keep' | 'extend',
  actorId: string,
  newEndsAt?: string
): Promise<string | null> {
  if (t.status !== 'ACTIVE' && t.status !== 'EXPIRED') return 'Alih task ini sudah tidak berjalan. Muat ulang halaman.'
  const decided = { decided_by: actorId, decided_at: new Date().toISOString() }
  if (action === 'extend') {
    if (!newEndsAt || new Date(newEndsAt).getTime() <= Date.now()) return 'Waktu selesai baru harus di masa depan.'
    if (t.starts_at && new Date(newEndsAt) <= new Date(t.starts_at)) return 'Waktu selesai harus setelah waktu mulai.'
    return (await claim(t.id, t.status, { status: 'ACTIVE', ends_at: newEndsAt, ...decided })) ? null : 'Alih task sudah berubah. Muat ulang halaman.'
  }
  if (!(await claim(t.id, t.status, { status: 'DONE', ...decided }))) return 'Alih task sudah berubah. Muat ulang halaman.'
  if (action === 'keep') return null

  const moved = await moveAssignee(t.task_id, t.to_user_id, t.from_user_id)
  if (!moved) return null // task sudah ditutup atau pemegangnya diubah: cukup diakhiri
  const n = await names([t.from_user_id, t.to_user_id])
  await emitTaskAssigned({ taskId: moved.id, taskCode: moved.code, taskTitle: moved.title, projectId: moved.project_id, assigneeId: t.from_user_id, stamp: moved.updated_at })
  await emitNotification({
    key: `transfer-return:${t.id}`,
    type: 'TASK_TRANSFER',
    userIds: [t.to_user_id],
    title: `Task ${moved.code} dikembalikan ke ${n.get(t.from_user_id) ?? '-'}`,
    message: 'PM mengakhiri alih task.',
    entityType: 'task',
    entityId: moved.id,
    email: null,
  })
  await logTransfer(t, moved, 'return', n.get(t.from_user_id) ?? '-', n.get(t.to_user_id) ?? '-')
  return null
}
