import Link from 'next/link'
import { requireProfile } from '@/lib/auth/session'
import { canApproveLeave, permissionProjects } from '@/lib/auth/current-access'
import { applyProjectScope } from '@/lib/auth/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/ui/primitives'
import { TransferCancelForm, TransferDecisionForm, TransferRequestForm } from '@/components/tasks/TransferForms'
import { TransferCard, transferRange } from '@/components/tasks/TransferCard'
import { transferLists, transferUsers, type TransferView } from '@/lib/data/task-transfers'
import { TRANSFER_STATUS_LABEL, leaveTransferRange, tasksDueByLeaveEnd, wibLocalToISO } from '@/lib/tasks/transfer-rules'
import { KIND_LABEL, type LeaveKind } from '@/lib/hr/leave'
import { formatDate, formatDateTime } from '@/lib/utils/dates'

const SECTION = 'mt-6 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900'

function label(t: TransferView) {
  return (
    <>
      <strong>{t.task?.code}</strong> {t.task?.title}
      <span className="block text-xs text-zinc-600 dark:text-zinc-400">
        {t.fromName} → {t.toName} · {transferRange(t)}
        {t.note ? ` · ${t.note}` : ''}
      </span>
    </>
  )
}

/**
 * Alih task (backup saat cuti/sakit, 20 Nov 2026).
 * ?cuti=<leave id>: isian dari cuti/sakit (orang, rentang, task yang deadline-nya
 * sampai akhir cuti). ?user=<id>&mulai=&selesai=: isian manual PM. Tanpa ?user:
 * task milik sendiri.
 */
export default async function TaskTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; mulai?: string; selesai?: string; cuti?: string }>
}) {
  const profile = await requireProfile()
  const sp = await searchParams
  const [lists, users, scope] = await Promise.all([
    transferLists(profile.id),
    transferUsers(),
    permissionProjects(profile.id, 'tasks.edit'),
  ])
  const isManager = scope.all || scope.include.length > 0

  // ?cuti=<id>: isian dari cuti/sakit (pemilik cuti sendiri, atau PM/Admin).
  const { data: leave } = sp.cuti
    ? await createAdminClient()
        .from('leave_requests')
        .select('id, user_id, kind, start_date, end_date, status')
        .eq('id', sp.cuti)
        .in('status', ['PENDING', 'APPROVED'])
        .maybeSingle<{ id: string; user_id: string; kind: LeaveKind; start_date: string; end_date: string; status: string }>()
    : { data: null }
  // Data cuti (termasuk sakit) hanya untuk: pemiliknya, penyetuju cuti, atau PM/Admin
  // yang mengelola project tempat orang itu punya task terbuka.
  let leaveAllowed = Boolean(leave) && (leave!.user_id === profile.id || (await canApproveLeave(profile.id)))
  if (leave && !leaveAllowed && isManager) {
    const { data: theirs } = await createAdminClient()
      .from('tasks')
      .select('project_id')
      .eq('assignee_id', leave.user_id)
      .eq('is_deleted', false)
      .not('status', 'in', '("DONE","CANCELLED")')
      .limit(500)
    leaveAllowed = ((theirs ?? []) as { project_id: string }[]).some((t) =>
      scope.all ? !scope.exclude.includes(t.project_id) : scope.include.includes(t.project_id)
    )
  }
  const fromLeave = leaveAllowed ? leave : null
  const leaveRange = fromLeave ? leaveTransferRange(fromLeave, new Date()) : null

  const targetId = fromLeave ? fromLeave.user_id : isManager && sp.user ? sp.user : profile.id
  const targetName = users.find((u) => u.id === targetId)?.name ?? profile.full_name ?? profile.email

  // Task terbuka milik orang yang dialihkan (PM: hanya di project yang ia kelola).
  let taskQuery = createAdminClient()
    .from('tasks')
    .select('id, code, title, deadline, project_id')
    .eq('assignee_id', targetId)
    .eq('is_deleted', false)
    .not('status', 'in', '("DONE","CANCELLED")')
    .order('deadline', { ascending: true })
    .limit(300)
  if (targetId !== profile.id) taskQuery = applyProjectScope(taskQuery, scope, 'project_id')
  const { data: taskRows } = await taskQuery
  const busy = new Set([...lists.manage, ...lists.mine].map((t) => t.task_id))
  const tasks = ((taskRows ?? []) as { id: string; code: string; title: string; deadline: string }[]).filter((t) => !busy.has(t.id))
  // Isian awal rentang: dari cuti, atau ?mulai/?selesai.
  const mulai = leaveRange?.start ?? (wibLocalToISO(sp.mulai ?? '') ? sp.mulai! : '')
  const selesai = leaveRange?.end ?? (wibLocalToISO(sp.selesai ?? '') ? sp.selesai! : '')
  // Dari cuti: yang tercentang hanya task dengan deadline sampai hari terakhir cuti.
  const checkedIds = fromLeave ? tasksDueByLeaveEnd(tasks, fromLeave.end_date).map((t) => t.id) : undefined

  const pending = lists.manage.filter((t) => t.status === 'PENDING' && t.requested_by !== profile.id)
  const expired = lists.manage.filter((t) => t.status === 'EXPIRED')
  const running = [...lists.manage.filter((t) => t.status === 'ACTIVE' || t.status === 'SCHEDULED'), ...lists.mine]
  const cancellable = [...lists.manage, ...lists.mine].filter(
    (t) => (t.status === 'PENDING' || t.status === 'SCHEDULED') && (t.requested_by === profile.id || lists.manage.includes(t))
  )
  const managed = new Set(lists.manage.map((t) => t.id))

  return (
    <AppShell>
      <PageHeader
        title="Alih Task"
        subtitle="Alihkan task ke consultant lain saat cuti, sakit, atau berhalangan: sementara (rentang tanggal dan jam) atau permanen."
      />

      {pending.length > 0 && (
        <section className={SECTION}>
          <h2 className="mb-3 text-lg font-bold">Menunggu keputusan Anda ({pending.length})</h2>
          <TransferDecisionForm items={pending.map((t) => ({ id: t.id, label: label(t) }))} />
        </section>
      )}

      {expired.length > 0 && (
        <section className={SECTION}>
          <h2 className="mb-1 text-lg font-bold">Masa alih habis ({expired.length})</h2>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Task tetap dipegang pengganti sampai Anda memilih: kembalikan, biarkan, atau perpanjang.
          </p>
          <div className="flex flex-col gap-3">
            {expired.map((t) => (
              <TransferCard key={t.id} t={t} canManage userId={profile.id} showTask />
            ))}
          </div>
        </section>
      )}

      <section className={SECTION}>
        <h2 className="mb-1 text-lg font-bold">
          {isManager ? 'Alihkan task' : 'Ajukan alih task saya'}
          {targetId !== profile.id ? `: ${targetName}` : ''}
        </h2>
        {fromLeave && (
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Untuk {KIND_LABEL[fromLeave.kind]} {formatDate(fromLeave.start_date)} – {formatDate(fromLeave.end_date)}
            {fromLeave.status === 'PENDING' ? ' (masih menunggu persetujuan)' : ''}. Task dengan deadline sampai hari terakhir cuti sudah dicentang.
          </p>
        )}
        {isManager && !fromLeave && (
          <form className="mb-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="pick_user" className="mb-1 block text-sm font-medium">
                Task milik
              </label>
              <select id="pick_user" name="user" defaultValue={targetId} className="min-h-[44px] rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="min-h-[44px] rounded-lg border px-3 py-2 text-sm font-semibold dark:border-zinc-700">
              Tampilkan
            </button>
          </form>
        )}
        {tasks.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Tidak ada task terbuka yang bisa dialihkan.</p>
        ) : (
          <TransferRequestForm
            tasks={tasks.map((t) => ({ id: t.id, code: t.code, title: t.title, detail: `Deadline ${formatDate(t.deadline)}` }))}
            users={users.filter((u) => u.id !== targetId)}
            byManager={isManager}
            defaultStart={mulai}
            defaultEnd={selesai}
            leaveRequestId={fromLeave?.id}
            checkedIds={checkedIds}
          />
        )}
      </section>

      {running.length > 0 && (
        <section className={SECTION}>
          <h2 className="mb-3 text-lg font-bold">Berjalan dan terjadwal ({running.length})</h2>
          <div className="flex flex-col gap-3">
            {running.map((t) => (
              <TransferCard key={t.id} t={t} canManage={managed.has(t.id)} userId={profile.id} showTask />
            ))}
          </div>
          {cancellable.length > 1 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">Batalkan beberapa sekaligus</h3>
              <TransferCancelForm items={cancellable.map((t) => ({ id: t.id, label: label(t) }))} />
            </div>
          )}
        </section>
      )}

      <section className={SECTION}>
        <h2 className="mb-3 text-lg font-bold">Riwayat</h2>
        {lists.history.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Belum ada riwayat alih task.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-600 dark:text-zinc-400">
                  <th className="py-2 pr-3">Task</th>
                  <th className="py-2 pr-3">Dari → Ke</th>
                  <th className="py-2 pr-3">Rentang</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Diajukan</th>
                </tr>
              </thead>
              <tbody>
                {lists.history.map((t) => (
                  <tr key={t.id} className="border-b align-top dark:border-zinc-800">
                    <td className="py-2 pr-3">
                      {t.task ? (
                        <Link href={`/tasks/${t.task.id}`} className="underline">
                          {t.task.code}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {t.fromName} → {t.toName}
                    </td>
                    <td className="py-2 pr-3">{transferRange(t)}</td>
                    <td className="py-2 pr-3">{TRANSFER_STATUS_LABEL[t.status]}</td>
                    <td className="py-2">{formatDateTime(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  )
}

