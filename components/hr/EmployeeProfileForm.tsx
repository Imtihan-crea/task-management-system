'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import { updateEmployeeProfile, type EmployeeFormState } from '@/app/actions/employee-profile'
import { POSITION_LEVELS, type EmployeeFields } from '@/lib/hr/employee'

const INITIAL: EmployeeFormState = undefined
const INPUT = 'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-800'
const LABEL = 'mb-1 block text-sm font-medium'

/** Pilihan aktif + nilai sekarang (bisa sudah diarsipkan) supaya tidak hilang dari dropdown. */
const withCurrent = (options: string[], current: string | null) => (current && !options.includes(current) ? [current, ...options] : options)

export function EmployeeProfileForm({
  userId,
  values,
  divisions,
  positions,
  canEdit,
}: {
  userId: string
  values: EmployeeFields
  divisions: string[]
  positions: string[]
  canEdit: boolean
}) {
  const [state, formProps, pending] = useFormAction(updateEmployeeProfile, INITIAL)
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="user_id" value={userId} />
      <fieldset disabled={!canEdit} className="contents">
        <div>
          <label htmlFor="emp_division" className={LABEL}>Divisi</label>
          <select id="emp_division" name="division" defaultValue={values.division ?? ''} className={INPUT}>
            <option value="">-</option>
            {withCurrent(divisions, values.division).map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="emp_position" className={LABEL}>Jabatan</label>
          <select id="emp_position" name="position_title" defaultValue={values.position_title ?? ''} className={INPUT}>
            <option value="">-</option>
            {withCurrent(positions, values.position_title).map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="emp_level" className={LABEL}>Level jabatan (untuk form 360°)</label>
          <select id="emp_level" name="position_level" defaultValue={values.position_level ?? ''} className={INPUT}>
            <option value="">-</option>
            {POSITION_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="emp_join" className={LABEL}>Tanggal masuk</label>
          <input id="emp_join" name="join_date" type="date" defaultValue={values.join_date ?? ''} className={INPUT} />
        </div>
        <div>
          <label htmlFor="emp_quota" className={LABEL}>Hak cuti tahunan (hari)</label>
          <input id="emp_quota" name="annual_leave_quota" type="number" min={0} max={60} step={1} defaultValue={values.annual_leave_quota ?? ''} className={INPUT} />
        </div>
      </fieldset>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className="min-h-[44px] rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50">
            {pending ? 'Menyimpan...' : 'Simpan data karyawan'}
          </button>
          {state?.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
          {state?.success && <p role="status" className="text-sm font-medium text-green-600">{state.success}</p>}
        </div>
      )}
    </form>
  )
}
