import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth/permissions'
import { PERMISSION_SCOPE } from '@/lib/auth/access'
import { PERMISSION_GROUPS, PERMISSION_LABEL } from '@/lib/auth/permission-labels'
import { GlobalPermissionsForm, ProjectPermissionForm, RemoveProjectPermission } from '@/components/users/PermissionForms'
import type { UserRole } from '@/types/profile'

/** Tab Wewenang di detail user; hanya dirender untuk Super Admin / Developer. */
export async function PermissionsSection({
  user,
}: {
  user: { id: string; role: UserRole; is_super_admin: boolean; is_developer: boolean }
}) {
  if (user.is_super_admin || user.is_developer) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <h2 className="text-lg font-bold">Wewenang</h2>
        <p className="mt-2 text-sm">{user.is_super_admin ? 'Super Admin' : 'Developer'} selalu punya semua izin.</p>
      </section>
    )
  }

  const admin = createAdminClient()
  const [{ data: rows }, { data: projects }] = await Promise.all([
    admin.from('user_permissions').select('permission, project_id, granted').eq('user_id', user.id),
    admin.from('projects').select('id, code, name').order('name').limit(500),
  ])
  const rules = (rows ?? []) as { permission: string; project_id: string | null; granted: boolean }[]
  const projectList = (projects ?? []) as { id: string; code: string; name: string }[]
  const projectName = new Map(projectList.map((p) => [p.id, `${p.code} · ${p.name}`]))
  const globalMode = (p: string) => {
    const r = rules.find((x) => x.permission === p && x.project_id === null)
    return r ? (r.granted ? 'grant' : 'revoke') : 'default'
  }

  const groups = PERMISSION_GROUPS.map((g) => ({
    title: g.title,
    items: g.items.map((i) => ({
      permission: i.permission,
      label: i.label,
      byRole: can(user.role, i.permission),
      perProject: PERMISSION_SCOPE[i.permission] === 'project',
      mode: globalMode(i.permission) as 'default' | 'grant' | 'revoke',
    })),
  }))
  const projectPerms = PERMISSION_GROUPS.flatMap((g) => g.items).filter((i) => PERMISSION_SCOPE[i.permission] === 'project')
  const projectRules = rules.filter((r) => r.project_id !== null)

  return (
    <section className="rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
      <h2 className="text-lg font-bold">Wewenang</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Peran menjadi paket awal. &quot;Beri&quot; atau &quot;Cabut&quot; berlaku untuk akun ini saja. Izin project dari
        peran PM hanya berlaku di project yang ia kelola. Aturan per project menang atas aturan semua project.
      </p>

      <div className="mt-4">
        <GlobalPermissionsForm userId={user.id} groups={groups} />
      </div>

      <h3 className="mt-6 text-base font-bold">Aturan per project</h3>
      {projectRules.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Belum ada.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {projectRules.map((r) => (
            <li key={`${r.permission}:${r.project_id}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <b>{r.granted ? 'Beri' : 'Cabut'}</b> {PERMISSION_LABEL[r.permission] ?? r.permission} di{' '}
                {projectName.get(r.project_id!) ?? 'project terhapus'}
              </span>
              <RemoveProjectPermission userId={user.id} permission={r.permission} projectId={r.project_id!} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <ProjectPermissionForm userId={user.id} permissions={projectPerms} projects={projectList} />
      </div>
    </section>
  )
}
