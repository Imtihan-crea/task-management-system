/** Data karyawan di profil (migrasi 021). Murni supaya bisa dites. */

export const POSITION_LEVELS = [
  { value: 'STAFF', label: 'Staff / Officer / Specialist' },
  { value: 'SUPERVISOR', label: 'Supervisor / Coordinator' },
  { value: 'PROJECT_MANAGER', label: 'Project Manager' },
  { value: 'BUSINESS_LEAD', label: 'Business Lead' },
] as const

export type EmployeeFields = {
  division: string | null
  position_title: string | null
  position_level: string | null
  join_date: string | null
  annual_leave_quota: number | null
}

export type EmployeeInput = { [K in keyof EmployeeFields]: string }

/**
 * Validasi isian. Divisi & jabatan wajib dari pilihan aktif Master Reference;
 * nilai lama yang sudah diarsipkan boleh tetap (tidak diubah). Kosong = dikosongkan.
 */
export function parseEmployee(
  input: EmployeeInput,
  ctx: { divisions: string[]; positions: string[]; current: EmployeeFields; today: string }
): { value: EmployeeFields } | { error: string } {
  const pick = (v: string, options: string[], old: string | null, field: string) => {
    if (!v) return { ok: null }
    if (v === old || options.includes(v)) return { ok: v }
    return { error: `${field} harus dipilih dari Master Reference.` }
  }
  const division = pick(input.division, ctx.divisions, ctx.current.division, 'Divisi')
  if ('error' in division) return { error: division.error! }
  const position = pick(input.position_title, ctx.positions, ctx.current.position_title, 'Jabatan')
  if ('error' in position) return { error: position.error! }
  if (input.position_level && !POSITION_LEVELS.some((l) => l.value === input.position_level)) return { error: 'Level jabatan tidak valid.' }
  if (input.join_date && (!/^\d{4}-\d{2}-\d{2}$/.test(input.join_date) || Number.isNaN(Date.parse(input.join_date)))) {
    return { error: 'Tanggal masuk tidak valid.' }
  }
  if (input.join_date && input.join_date > ctx.today) return { error: 'Tanggal masuk tidak boleh di masa depan.' }
  let quota: number | null = null
  if (input.annual_leave_quota) {
    quota = Number(input.annual_leave_quota)
    if (!Number.isInteger(quota) || quota < 0 || quota > 60) return { error: 'Kuota cuti harus bilangan bulat 0–60.' }
  }
  return {
    value: {
      division: division.ok,
      position_title: position.ok,
      position_level: input.position_level || null,
      join_date: input.join_date || null,
      annual_leave_quota: quota,
    },
  }
}
