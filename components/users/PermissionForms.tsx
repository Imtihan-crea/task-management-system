'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import {
  saveGlobalPermissions,
  setProjectPermission,
  type PermissionFormState,
} from '@/app/actions/permissions'

const INITIAL: PermissionFormState = undefined
const FIELD =
  'rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'

type Item = { permission: string; label: string; byRole: boolean; mode: 'default' | 'grant' | 'revoke'; perProject: boolean }

function Status({ state }: { state: PermissionFormState }) {
  if (state?.error) return <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>
  if (state?.success) return <p role="status" className="text-sm font-medium text-green-600">{state.success}</p>
  return null
}

/** Aturan untuk semua project / seluruh aplikasi, satu tombol simpan. */
export function GlobalPermissionsForm({ userId, groups }: { userId: string; groups: { title: string; items: Item[] }[] }) {
  const [state, formAction, pending] = useFormAction(saveGlobalPermissions, INITIAL)
  return (
    <form {...formAction} className="flex flex-col gap-4">
      <input type="hidden" name="user_id" value={userId} />
      {groups.map((g) => (
        <fieldset key={g.title}>
          <legend className="mb-2 text-sm font-bold">{g.title}</legend>
          <ul className="flex flex-col gap-2">
            {g.items.map((i) => (
              <li key={i.permission} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <label htmlFor={`perm_${i.permission}`} className="text-sm">
                  {i.label}
                  <span className="ml-2 text-xs text-zinc-600 dark:text-zinc-400">
                    peran: {i.byRole ? (i.perProject ? 'ya (project kelolaan)' : 'ya') : 'tidak'}
                  </span>
                </label>
                <select id={`perm_${i.permission}`} name={`perm:${i.permission}`} defaultValue={i.mode} className={FIELD}>
                  <option value="default">Ikut peran</option>
                  <option value="grant">{i.perProject ? 'Beri (semua project)' : 'Beri'}</option>
                  <option value="revoke">{i.perProject ? 'Cabut (semua project)' : 'Cabut'}</option>
                </select>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
      <Status state={state} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] w-full rounded-lg bg-kasuat-gold px-4 py-2 font-semibold text-kasuat-black disabled:opacity-50 sm:w-auto"
      >
        {pending ? 'Menyimpan...' : 'Simpan wewenang'}
      </button>
    </form>
  )
}

/** Tambah aturan untuk satu project. */
export function ProjectPermissionForm({
  userId,
  permissions,
  projects,
}: {
  userId: string
  permissions: { permission: string; label: string }[]
  projects: { id: string; code: string; name: string }[]
}) {
  const [state, formAction, pending] = useFormAction(setProjectPermission, INITIAL)
  return (
    <form {...formAction} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <input type="hidden" name="user_id" value={userId} />
      <label className="flex flex-col text-sm">
        Project
        <select name="project_id" required defaultValue="" className={FIELD}>
          <option value="">Pilih project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm">
        Izin
        <select name="permission" required defaultValue="" className={FIELD}>
          <option value="">Pilih izin</option>
          {permissions.map((p) => (
            <option key={p.permission} value={p.permission}>{p.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm">
        Aturan
        <select name="mode" defaultValue="grant" className={FIELD}>
          <option value="grant">Beri</option>
          <option value="revoke">Cabut</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700"
      >
        {pending ? 'Menyimpan...' : 'Tambah aturan'}
      </button>
      <div className="w-full"><Status state={state} /></div>
    </form>
  )
}

/** Hapus satu aturan project. */
export function RemoveProjectPermission({ userId, permission, projectId }: { userId: string; permission: string; projectId: string }) {
  const [state, formAction, pending] = useFormAction(setProjectPermission, INITIAL)
  return (
    <form {...formAction}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="permission" value={permission} />
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="mode" value="default" />
      <button type="submit" disabled={pending} className="min-h-[44px] text-sm font-medium text-red-600 hover:underline disabled:opacity-50">
        {pending ? 'Menghapus...' : 'Hapus'}
      </button>
      {state?.error && <span role="alert" className="ml-2 text-sm text-red-600">{state.error}</span>}
    </form>
  )
}
