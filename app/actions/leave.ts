'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth/session'
import { canApproveLeave } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log/service'
import { emitNotification } from '@/lib/notifications/service'
import { readLimitedField } from '@/lib/forms/limits'
import { getAppBaseUrl } from '@/lib/app-url'
import { leaveDecisionBody } from '@/lib/email/templates'
import { loadCalendar, loadLeave } from '@/lib/hr/data'
import { KIND_LABEL, kindError, leaveDays, overlappingLeave, rangeError, SPECIAL_LABEL, type LeaveKind } from '@/lib/hr/leave'

export type LeaveFormState = { error?: string; success?: string } | undefined

function done() {
  revalidatePath('/cuti', 'layout')
  revalidatePath('/tracker', 'layout')
}

/** Penerima notifikasi pengajuan baru: semua penyetuju aktif selain pengaju. */
async function approverIds(exceptId: string): Promise<string[]> {
  const { data } = await createAdminClient().from('profiles').select('id').eq('status', 'ACTIVE').is('deleted_at', null)
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id).filter((id) => id !== exceptId)
  const allowed = await Promise.all(ids.map(async (id) => ((await canApproveLeave(id)) ? id : null)))
  return allowed.filter((id): id is string => id !== null)
}

/** Karyawan mengajukan cuti untuk dirinya sendiri. */
export async function submitLeave(_prev: LeaveFormState, formData: FormData): Promise<LeaveFormState> {
  const profile = await requireProfile()
  const kind = readLimitedField(formData, 'kind') as LeaveKind
  const start = readLimitedField(formData, 'start_date')
  const end = readLimitedField(formData, 'end_date') || start
  const reason = readLimitedField(formData, 'reason') || null
  const attachment = readLimitedField(formData, 'attachment_url') || null
  const special = kind === 'KHUSUS' ? readLimitedField(formData, 'special_reason') || null : null

  // Cek tanggal dulu (sebelum membaca kalender), lalu jenis + batas hari Cuti Khusus.
  const rangeErr = rangeError(start, end, 366)
  if (rangeErr) return { error: rangeErr }
  if (reason && reason.length > 1000) return { error: 'Alasan paling panjang 1000 karakter.' }
  if (attachment && !/^https?:\/\/\S+$/i.test(attachment)) return { error: 'Lampiran harus berupa tautan (http/https).' }

  const days = leaveDays(start, end, await loadCalendar(start, end))
  const err = kindError(kind, special, start, end, days)
  if (err) return { error: err }
  if (days === 0) return { error: 'Rentang tanggal itu tidak berisi hari kerja.' }

  const existing = await loadLeave({ from: start, to: end, userId: profile.id, statuses: ['PENDING', 'APPROVED'] })
  const clash = overlappingLeave(existing, { user_id: profile.id, start_date: start, end_date: end })
  if (clash) return { error: `Sudah ada pengajuan ${KIND_LABEL[clash.kind]} ${clash.start_date} s/d ${clash.end_date} di tanggal itu.` }

  const { data, error } = await createAdminClient()
    .from('leave_requests')
    .insert({ user_id: profile.id, kind, special_reason: special, start_date: start, end_date: end, days, reason, attachment_url: attachment })
    .select('id')
    .single<{ id: string }>()
  if (error) {
    console.error('submitLeave failed:', error.message)
    return { error: 'Gagal menyimpan pengajuan. Silakan coba lagi.' }
  }
  const meta = { kind, kind_label: KIND_LABEL[kind], special_reason: special, special_label: special ? SPECIAL_LABEL[special] : null, start_date: start, end_date: end, days }
  await logActivity({ actorUserId: profile.id, action: 'LEAVE_REQUESTED', entityType: 'leave', entityId: data.id, metadata: meta })
  await emitNotification({
    key: `leave-requested:${data.id}`,
    type: 'LEAVE_REQUESTED',
    userIds: await approverIds(profile.id),
    title: `Pengajuan ${KIND_LABEL[kind]} baru`,
    message: `${profile.full_name || profile.email}: ${KIND_LABEL[kind]} ${start === end ? start : `${start} s/d ${end}`} (${days} hari kerja).`,
    entityType: 'leave_review',
    entityId: data.id,
    email: null,
  })
  done()
  return { success: `Pengajuan ${KIND_LABEL[kind]} (${days} hari kerja) terkirim, menunggu persetujuan.` }
}

/** Pengaju membatalkan pengajuannya yang masih menunggu. */
export async function cancelOwnLeave(_prev: LeaveFormState, formData: FormData): Promise<LeaveFormState> {
  const profile = await requireProfile()
  const id = readLimitedField(formData, 'id')
  const { data } = await createAdminClient()
    .from('leave_requests')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', profile.id)
    .eq('status', 'PENDING')
    .select('id, kind, start_date, end_date')
    .maybeSingle<{ id: string; kind: LeaveKind; start_date: string; end_date: string }>()
  if (!data) return { error: 'Pengajuan tidak ditemukan atau sudah diputuskan.' }
  await logActivity({ actorUserId: profile.id, action: 'LEAVE_CANCELLED', entityType: 'leave', entityId: id, metadata: { ...data, kind_label: KIND_LABEL[data.kind] } })
  done()
  return { success: 'Pengajuan dibatalkan.' }
}

/**
 * Penyetuju memutuskan: approve / reject (pengajuan menunggu), atau cancel
 * (membatalkan yang sudah disetujui, mis. salah input). Tidak boleh memutuskan
 * pengajuan sendiri.
 */
export async function decideLeave(_prev: LeaveFormState, formData: FormData): Promise<LeaveFormState> {
  const profile = await requireProfile()
  if (!(await canApproveLeave(profile.id))) return { error: 'Anda tidak punya izin untuk melakukan aksi ini.' }
  const id = readLimitedField(formData, 'id')
  const decision = readLimitedField(formData, 'decision')
  const note = readLimitedField(formData, 'decision_note') || null
  if (!['approve', 'reject', 'cancel'].includes(decision)) return { error: 'Keputusan tidak valid.' }
  if (note && note.length > 1000) return { error: 'Catatan paling panjang 1000 karakter.' }

  const admin = createAdminClient()
  const { data: req } = await admin
    .from('leave_requests')
    .select('id, user_id, kind, start_date, end_date, status')
    .eq('id', id)
    .maybeSingle<{ id: string; user_id: string; kind: LeaveKind; start_date: string; end_date: string; status: string }>()
  if (!req) return { error: 'Pengajuan tidak ditemukan.' }
  if (req.user_id === profile.id) return { error: 'Pengajuan sendiri harus diputuskan penyetuju lain.' }
  const from = decision === 'cancel' ? 'APPROVED' : 'PENDING'
  if (req.status !== from) return { error: 'Status pengajuan sudah berubah; muat ulang halaman.' }

  const to = decision === 'approve' ? 'APPROVED' : decision === 'reject' ? 'REJECTED' : 'CANCELLED'
  const { data: updated, error } = await admin
    .from('leave_requests')
    .update({ status: to, decided_by: profile.id, decided_at: new Date().toISOString(), decision_note: note, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', from)
    .select('id')
  if (error || !updated?.length) return { error: 'Gagal menyimpan; muat ulang halaman lalu coba lagi.' }

  const label = KIND_LABEL[req.kind]
  const meta = { kind: req.kind, kind_label: label, start_date: req.start_date, end_date: req.end_date, note }
  await logActivity({
    actorUserId: profile.id,
    action: to === 'APPROVED' ? 'LEAVE_APPROVED' : to === 'REJECTED' ? 'LEAVE_REJECTED' : 'LEAVE_CANCELLED',
    entityType: 'leave',
    entityId: id,
    metadata: meta,
  })
  let baseUrl = ''
  try {
    baseUrl = getAppBaseUrl()
  } catch {
    /* tautan relatif */
  }
  const range = req.start_date === req.end_date ? req.start_date : `${req.start_date} s/d ${req.end_date}`
  const verb = to === 'APPROVED' ? 'disetujui' : to === 'REJECTED' ? 'ditolak' : 'dibatalkan'
  await emitNotification({
    key: `leave-decided:${id}:${to}`,
    type: 'LEAVE_DECIDED',
    userIds: [req.user_id],
    title: `${label} ${range} ${verb}`,
    message: note ? `Catatan: ${note}` : `Oleh ${profile.full_name || profile.email}.`,
    entityType: 'leave',
    entityId: id,
    email:
      to === 'CANCELLED'
        ? null
        : { subject: `[${label}] ${range} ${verb}`, html: leaveDecisionBody({ baseUrl, kindLabel: label, start: req.start_date, end: req.end_date, approved: to === 'APPROVED', note: note ?? '' }), category: 'task' },
  })
  done()
  return { success: `${label} ${range} ${verb}.` }
}
