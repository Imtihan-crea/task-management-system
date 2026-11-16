'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/current-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity-log/service'
import { readLimitedField } from '@/lib/forms/limits'
import { loadRules } from '@/lib/hr/data'
import { rulesError, type TrackerRules } from '@/lib/hr/tracker'

/** Pengaturan HR (migrasi 021): aturan jam berversi, kalender kerja, target bulanan dikunci. Izin hr.manage. */

export type HrSettingsState = { error?: string; success?: string } | undefined

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const validDate = (d: string) => DATE_RE.test(d) && !Number.isNaN(Date.parse(d))
const num = (formData: FormData, name: string) => Number(readLimitedField(formData, name).replace(',', '.'))
const three = (formData: FormData, prefix: string): [number, number, number] => [
  num(formData, `${prefix}_0`),
  num(formData, `${prefix}_1`),
  num(formData, `${prefix}_2`),
]

function done(path = '/settings/hr') {
  revalidatePath(path)
  revalidatePath('/tracker')
  revalidatePath('/tracker/rekap')
}

/** Simpan versi aturan baru mulai tanggal tertentu (tanggal sama = versi itu diganti). */
export async function saveHrRules(_prev: HrSettingsState, formData: FormData): Promise<HrSettingsState> {
  const actor = await requirePermission('hr.manage')
  const effectiveFrom = readLimitedField(formData, 'effective_from')
  if (!validDate(effectiveFrom)) return { error: 'Tanggal berlaku tidak valid.' }
  const current = await loadRules(effectiveFrom)
  const rules: TrackerRules = {
    ...current,
    hoursPerDay: num(formData, 'hours_per_day'),
    dailyThresholds: three(formData, 'daily'),
    weeklyThresholds: three(formData, 'weekly'),
    monthlyPerDay: three(formData, 'monthly'),
    leaveReducesTarget: formData.get('leave_reduces_target') === 'on',
  }
  const err = rulesError(rules)
  if (err) return { error: err }

  const { error } = await createAdminClient()
    .from('hr_settings')
    .upsert({ effective_from: effectiveFrom, rules, created_by: actor.id }, { onConflict: 'effective_from' })
  if (error) {
    console.error('saveHrRules failed:', error.message)
    return { error: 'Gagal menyimpan aturan. Silakan coba lagi.' }
  }
  await logActivity({
    actorUserId: actor.id,
    action: 'HR_RULES_CHANGED',
    entityType: 'hr',
    entityId: `rules:${effectiveFrom}`,
    metadata: { effective_from: effectiveFrom, before: current, after: rules },
  })
  done()
  return { success: `Aturan disimpan, berlaku mulai ${effectiveFrom}.` }
}

export async function addCalendarDay(_prev: HrSettingsState, formData: FormData): Promise<HrSettingsState> {
  const actor = await requirePermission('hr.manage')
  const day = readLimitedField(formData, 'day')
  const kind = readLimitedField(formData, 'kind')
  const name = readLimitedField(formData, 'name').replace(/\s+/g, ' ')
  if (!validDate(day)) return { error: 'Tanggal tidak valid.' }
  if (kind !== 'HOLIDAY' && kind !== 'WORKDAY') return { error: 'Pilih jenis hari.' }
  if (!name || name.length > 120) return { error: 'Keterangan wajib diisi (maks 120 karakter).' }

  const { error } = await createAdminClient()
    .from('work_calendar')
    .upsert({ day, kind, name, created_by: actor.id }, { onConflict: 'day' })
  if (error) {
    console.error('addCalendarDay failed:', error.message)
    return { error: 'Gagal menyimpan. Silakan coba lagi.' }
  }
  await logActivity({
    actorUserId: actor.id,
    action: 'HR_CALENDAR_CHANGED',
    entityType: 'hr',
    entityId: `calendar:${day}`,
    metadata: { day, kind, name },
  })
  done()
  return { success: `${day} disimpan.` }
}

export async function removeCalendarDay(_prev: HrSettingsState, formData: FormData): Promise<HrSettingsState> {
  const actor = await requirePermission('hr.manage')
  const day = readLimitedField(formData, 'day')
  const { data, error } = await createAdminClient().from('work_calendar').delete().eq('day', day).select('day, kind, name')
  if (error || !data?.length) return { error: 'Tanggal tidak ditemukan.' }
  await logActivity({
    actorUserId: actor.id,
    action: 'HR_CALENDAR_CHANGED',
    entityType: 'hr',
    entityId: `calendar:${day}`,
    metadata: { day, removed: true, was: data[0] },
  })
  done()
  return { success: `${day} dihapus dari kalender.` }
}

/** Kunci target jam bulanan (hours kosong = lepas kunci, kembali ke hari kerja × jam/hari). */
export async function setMonthTarget(_prev: HrSettingsState, formData: FormData): Promise<HrSettingsState> {
  const actor = await requirePermission('hr.manage')
  const month = readLimitedField(formData, 'month')
  const raw = readLimitedField(formData, 'target_hours')
  const note = readLimitedField(formData, 'note') || null
  if (!MONTH_RE.test(month)) return { error: 'Bulan tidak valid.' }
  const admin = createAdminClient()
  const monthDate = `${month}-01`

  if (!raw) {
    const { error } = await admin.from('hr_month_targets').delete().eq('month', monthDate)
    if (error) return { error: 'Gagal melepas kunci. Silakan coba lagi.' }
  } else {
    const hours = Number(raw.replace(',', '.'))
    if (!(hours > 0 && hours <= 400)) return { error: 'Target jam harus antara 0 dan 400.' }
    const { error } = await admin
      .from('hr_month_targets')
      .upsert({ month: monthDate, target_hours: hours, note, created_by: actor.id, updated_at: new Date().toISOString() }, { onConflict: 'month' })
    if (error) {
      console.error('setMonthTarget failed:', error.message)
      return { error: 'Gagal menyimpan. Silakan coba lagi.' }
    }
  }
  await logActivity({
    actorUserId: actor.id,
    action: 'HR_TARGET_CHANGED',
    entityType: 'hr',
    entityId: `target:${month}`,
    metadata: { month, target_hours: raw ? Number(raw.replace(',', '.')) : null, note },
  })
  done()
  return { success: raw ? `Target ${month} dikunci.` : `Kunci target ${month} dilepas.` }
}
