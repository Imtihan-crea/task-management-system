'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import { addCalendarDay, removeCalendarDay, saveHrRules, setMonthTarget, type HrSettingsState } from '@/app/actions/hr-settings'
import type { TrackerRules } from '@/lib/hr/tracker'

const INITIAL: HrSettingsState = undefined
const INPUT = 'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'
const BTN = 'min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50'
const LABEL = 'mb-1 block text-sm font-medium'

function Status({ state }: { state: HrSettingsState }) {
  if (state?.error) return <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>
  if (state?.success) return <p role="status" className="text-sm font-medium text-green-600">{state.success}</p>
  return null
}

function Triple({ prefix, label, values, unit }: { prefix: string; label: string; values: number[]; unit: string }) {
  const names = ['Lebih dari target (≥)', 'Sesuai target (≥)', 'Cukup (≥)']
  return (
    <fieldset className="rounded-lg border p-3 dark:border-zinc-700">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {names.map((n, i) => (
          <div key={n}>
            <label htmlFor={`${prefix}_${i}`} className="mb-1 block text-xs">{n}</label>
            <input id={`${prefix}_${i}`} name={`${prefix}_${i}`} inputMode="decimal" required defaultValue={String(values[i])} className={INPUT} />
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{unit}. Di bawah angka terakhir = Kurang.</p>
    </fieldset>
  )
}

export function RulesForm({ rules, today }: { rules: TrackerRules; today: string }) {
  const [state, formProps, pending] = useFormAction(saveHrRules, INITIAL)
  return (
    <form {...formProps} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="hours_per_day" className={LABEL}>Jam kerja per hari kerja</label>
          <input id="hours_per_day" name="hours_per_day" inputMode="decimal" required defaultValue={String(rules.hoursPerDay)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="effective_from" className={LABEL}>Berlaku mulai</label>
          <input id="effective_from" name="effective_from" type="date" required defaultValue={today} className={INPUT} />
        </div>
      </div>
      <Triple prefix="daily" label="Status harian" values={rules.dailyThresholds} unit="Jam per hari" />
      <Triple prefix="weekly" label="Status mingguan" values={rules.weeklyThresholds} unit="Jam per minggu" />
      <div className="flex items-center gap-2">
        <input id="leave_reduces_target" name="leave_reduces_target" type="checkbox" defaultChecked={rules.leaveReducesTarget} className="h-5 w-5" />
        <label htmlFor="leave_reduces_target" className="text-sm font-medium">Cuti, izin, dan sakit yang disetujui mengurangi target jam bulan itu (mati = seperti sheet lama)</label>
      </div>
      <Triple prefix="monthly" label="Status bulanan" values={rules.monthlyPerDay} unit="Jam per hari kerja; 'lebih' = di atas hari kerja × angka ini" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BTN}>{pending ? 'Menyimpan...' : 'Simpan aturan'}</button>
        <Status state={state} />
      </div>
    </form>
  )
}

export function CalendarAddForm() {
  const [state, formProps, pending] = useFormAction(addCalendarDay, INITIAL)
  return (
    <form {...formProps} className="grid gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
      <div>
        <label htmlFor="cal_day" className={LABEL}>Tanggal</label>
        <input id="cal_day" name="day" type="date" required className={INPUT} />
      </div>
      <div>
        <label htmlFor="cal_kind" className={LABEL}>Jenis</label>
        <select id="cal_kind" name="kind" defaultValue="HOLIDAY" className={INPUT}>
          <option value="HOLIDAY">Libur / cuti bersama</option>
          <option value="WORKDAY">Hari kerja pengganti</option>
        </select>
      </div>
      <div>
        <label htmlFor="cal_name" className={LABEL}>Keterangan</label>
        <input id="cal_name" name="name" required maxLength={120} className={INPUT} />
      </div>
      <button type="submit" disabled={pending} className={BTN}>{pending ? 'Menyimpan...' : 'Tambah'}</button>
      <div className="sm:col-span-4"><Status state={state} /></div>
    </form>
  )
}

export function CalendarRemoveButton({ day }: { day: string }) {
  const [state, formProps, pending] = useFormAction(removeCalendarDay, INITIAL, () => `Hapus ${day} dari kalender?`)
  return (
    <form {...formProps} className="inline">
      <input type="hidden" name="day" value={day} />
      <button type="submit" disabled={pending} className="min-h-[44px] px-2 text-sm font-semibold text-red-700 hover:underline disabled:opacity-50">Hapus</button>
      <Status state={state} />
    </form>
  )
}

export function MonthTargetForm({ month }: { month: string }) {
  const [state, formProps, pending] = useFormAction(setMonthTarget, INITIAL)
  return (
    <form {...formProps} className="grid gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
      <div>
        <label htmlFor="target_month" className={LABEL}>Bulan</label>
        <input id="target_month" name="month" type="month" required defaultValue={month} className={INPUT} />
      </div>
      <div>
        <label htmlFor="target_hours" className={LABEL}>Target jam</label>
        <input id="target_hours" name="target_hours" inputMode="decimal" className={INPUT} aria-describedby="target_hint" />
      </div>
      <div>
        <label htmlFor="target_note" className={LABEL}>Catatan (opsional)</label>
        <input id="target_note" name="note" maxLength={500} className={INPUT} />
      </div>
      <button type="submit" disabled={pending} className={BTN}>{pending ? 'Menyimpan...' : 'Simpan'}</button>
      <p id="target_hint" className="text-xs text-zinc-600 sm:col-span-4 dark:text-zinc-400">Kosongkan target jam untuk melepas kunci (kembali ke hari kerja × jam per hari).</p>
      <div className="sm:col-span-4"><Status state={state} /></div>
    </form>
  )
}
