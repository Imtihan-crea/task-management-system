'use client'

import { useFormAction } from '@/lib/forms/use-form-action'
import Link from 'next/link'
import {
  addParticipant,
  createActionItem,
  createAgenda,
  createDecision,
  createTaskFromActionItem,
  deleteActionItem,
  deleteAgenda,
  deleteDecision,
  removeParticipant,
  reorderAgendas,
  updateActionItem,
  updateAgenda,
  updateAttendance,
  updateDecision,
  type MeetingFormState,
} from '@/app/actions/meetings'
import { ACTION_ITEM_STATUSES } from '@/lib/db/schema'
import { ACTION_ITEM_STATUS_LABELS, ATTENDANCE_LABELS } from '@/types/meeting'
import type { ActionItemRow, AgendaRow, DecisionRow, ParticipantRow } from '@/types/meeting'

const INITIAL: MeetingFormState = undefined

const inputCls =
  'w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-800'

const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-kasuat-gold px-4 py-2 text-sm font-semibold text-kasuat-black disabled:opacity-50'

const btnSecondary =
  'inline-flex min-h-[40px] items-center justify-center rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700'

const btnDanger =
  'inline-flex min-h-[40px] items-center justify-center rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 dark:border-red-700 dark:text-red-300'

function StateMessage({ state }: { state: MeetingFormState }) {
  return (
    <>
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm font-medium text-green-600">
          {state.success}
        </p>
      )}
    </>
  )
}

type UserOption = { id: string; full_name: string | null; email: string }

/* ============================================================================
 * AGENDA (§16)
 * ========================================================================== */

export function AgendaCreateForm({ meetingId }: { meetingId: string }) {
  const [state, formAction, pending] = useFormAction(createAgenda, INITIAL)
  return (
    <form {...formAction} className="flex flex-col gap-2 rounded-xl border p-3 dark:border-zinc-700">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input
        name="title"
        required
        maxLength={300}
        placeholder="Tambah agenda..."
        aria-label="Judul Agenda"
        className={inputCls}
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={btnSecondary}>
          {pending ? 'Menambah...' : '+ Tambah'}
        </button>
      </div>
      <StateMessage state={state} />
    </form>
  )
}

export function AgendaItem({
  meetingId,
  agenda,
  isFirst,
  isLast,
  moveIds,
}: {
  meetingId: string
  agenda: AgendaRow
  isFirst: boolean
  isLast: boolean
  /** Semua id agenda berurutan — untuk reorder naik/turun. */
  moveIds: string[]
}) {
  const [updState, updAction, updPending] = useFormAction(updateAgenda, INITIAL)
  const [delState, delAction, delPending] = useFormAction(deleteAgenda, INITIAL, () => 'Hapus item Agenda ini?')
  const [moveState, moveAction, movePending] = useFormAction(reorderAgendas, INITIAL)

  const idx = moveIds.indexOf(agenda.id)
  const move = (dir: -1 | 1) => {
    const next = [...moveIds]
    const j = idx + dir
    if (j < 0 || j >= next.length) return next
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return next
  }

  return (
    <li className="rounded-xl border p-3 dark:border-zinc-700">
      <form {...updAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={agenda.id} />
        <input type="hidden" name="meeting_id" value={meetingId} />
        <input
          name="title"
          required
          maxLength={300}
          defaultValue={agenda.title}
          aria-label="Judul Agenda"
          className={inputCls}
        />
        <textarea
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={agenda.notes ?? ''}
          placeholder="Catatan agenda (opsional)..."
          aria-label="Catatan Agenda"
          className={inputCls}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={updPending} className={btnSecondary}>
            {updPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
        <StateMessage state={updState} />
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form {...moveAction}>
          <input type="hidden" name="meeting_id" value={meetingId} />
          {move(-1).map((v) => (
            <input key={v} type="hidden" name="ordered_ids" value={v} />
          ))}
          <button type="submit" disabled={isFirst || movePending} className={btnSecondary}>
            ↑
          </button>
        </form>
        <form {...moveAction}>
          <input type="hidden" name="meeting_id" value={meetingId} />
          {move(1).map((v) => (
            <input key={v} type="hidden" name="ordered_ids" value={v} />
          ))}
          <button type="submit" disabled={isLast || movePending} className={btnSecondary}>
            ↓
          </button>
        </form>
        <form {...delAction}>
          <input type="hidden" name="id" value={agenda.id} />
          <input type="hidden" name="meeting_id" value={meetingId} />
          <button type="submit" disabled={delPending} className={btnDanger}>
            {delPending ? 'Menghapus...' : 'Hapus'}
          </button>
        </form>
        {(moveState?.error || moveState?.success) && <StateMessage state={moveState} />}
        {(delState?.error || delState?.success) && <StateMessage state={delState} />}
      </div>
    </li>
  )
}

/* ============================================================================
 * DECISIONS (§18)
 * ========================================================================== */

export function DecisionCreateForm({ meetingId }: { meetingId: string }) {
  const [state, formAction, pending] = useFormAction(createDecision, INITIAL)
  return (
    <form {...formAction} className="flex flex-col gap-2 rounded-xl border p-3 dark:border-zinc-700">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input
        name="decision"
        required
        maxLength={500}
        placeholder="Tambah decision..."
        aria-label="Decision"
        className={inputCls}
      />
      <input
        name="rationale"
        maxLength={1000}
        placeholder="Alasan (opsional)..."
        aria-label="Alasan"
        className={inputCls}
      />
      <div>
        <button type="submit" disabled={pending} className={btnSecondary}>
          {pending ? 'Menambah...' : '+ Tambah'}
        </button>
      </div>
      <StateMessage state={state} />
    </form>
  )
}

export function DecisionItem({
  meetingId,
  decision,
  index,
}: {
  meetingId: string
  decision: DecisionRow
  index: number
}) {
  const [updState, updAction, updPending] = useFormAction(updateDecision, INITIAL)
  const [delState, delAction, delPending] = useFormAction(deleteDecision, INITIAL, () => 'Hapus Decision ini?')

  return (
    <li className="rounded-xl border p-3 dark:border-zinc-700">
      <form {...updAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={decision.id} />
        <input type="hidden" name="meeting_id" value={meetingId} />
        <label className="text-xs font-semibold text-zinc-500">#{index + 1}</label>
        <input
          name="decision"
          required
          maxLength={500}
          defaultValue={decision.decision}
          aria-label="Decision"
          className={inputCls}
        />
        <input
          name="rationale"
          maxLength={1000}
          defaultValue={decision.rationale ?? ''}
          placeholder="Alasan (opsional)..."
          aria-label="Alasan"
          className={inputCls}
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={updPending} className={btnSecondary}>
            {updPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
        <StateMessage state={updState} />
      </form>
      <form {...delAction} className="mt-2">
        <input type="hidden" name="id" value={decision.id} />
        <input type="hidden" name="meeting_id" value={meetingId} />
        <button type="submit" disabled={delPending} className={btnDanger}>
          {delPending ? 'Menghapus...' : 'Hapus'}
        </button>
        {(delState?.error || delState?.success) && <StateMessage state={delState} />}
      </form>
    </li>
  )
}

/* ============================================================================
 * ACTION ITEMS (§19) + CREATE TASK (§20)
 * ========================================================================== */

export function ActionItemCreateForm({
  meetingId,
  users,
}: {
  meetingId: string
  users: UserOption[]
}) {
  const [state, formAction, pending] = useFormAction(createActionItem, INITIAL)
  return (
    <form {...formAction} className="flex flex-col gap-3 rounded-xl border p-3 dark:border-zinc-700">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input
        name="title"
        required
        maxLength={300}
        placeholder="Tambah action item..."
        aria-label="Judul Action Item"
        className={inputCls}
      />
      <textarea
        name="description"
        rows={2}
        maxLength={2000}
        placeholder="Deskripsi (opsional)..."
        aria-label="Deskripsi Action Item"
        className={inputCls}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <select name="assignee_id" defaultValue="" aria-label="Assignee" className={inputCls}>
          <option value="">Assignee...</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.email}
            </option>
          ))}
        </select>
        <input name="deadline" type="date" aria-label="Deadline" className={inputCls} />
        <select name="priority" defaultValue="MEDIUM" aria-label="Prioritas" className={inputCls}>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>
      </div>
      <div>
        <button type="submit" disabled={pending} className={btnSecondary}>
          {pending ? 'Menambah...' : '+ Tambah Action Item'}
        </button>
      </div>
      <StateMessage state={state} />
    </form>
  )
}

export function ActionItemCard({
  meetingId,
  item,
  users,
  workstreams,
  canCreateTask,
  taskProjects,
  taskCode,
}: {
  meetingId: string
  item: ActionItemRow
  users: UserOption[]
  workstreams: { id: string; code: string; name: string }[]
  canCreateTask: boolean
  /** Meeting tanpa project: project dipilih saat Create Task (audit A10). */
  taskProjects?: { id: string; code: string; name: string }[]
  /** Kode task kalau sudah dibuat (T-081) — untuk link balik §21. */
  taskCode?: string | null
}) {
  const [updState, updAction, updPending] = useFormAction(updateActionItem, INITIAL)
  const [delState, delAction, delPending] = useFormAction(deleteActionItem, INITIAL, () => 'Hapus Action Item ini?')
  const [taskState, taskAction, taskPending] = useFormAction(createTaskFromActionItem, INITIAL)

  return (
    <li className="rounded-xl border p-3 dark:border-zinc-700">
      <form {...updAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="meeting_id" value={meetingId} />
        <input
          name="title"
          required
          maxLength={300}
          defaultValue={item.title}
          aria-label="Judul Action Item"
          className={inputCls}
        />
        <textarea
          name="description"
          rows={2}
          maxLength={2000}
          defaultValue={item.description ?? ''}
          aria-label="Deskripsi Action Item"
          className={inputCls}
        />
        <div className="grid gap-2 sm:grid-cols-4">
          <select
            name="assignee_id"
            defaultValue={item.assignee_id ?? ''}
            aria-label="Assignee"
            className={inputCls}
          >
            <option value="">Assignee...</option>
            {item.assignee_id && !users.some((u) => u.id === item.assignee_id) && (
              <option value={item.assignee_id}>Assignee saat ini (nonaktif)</option>
            )}
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
          <input
            name="deadline"
            type="date"
            defaultValue={item.deadline ?? ''}
            aria-label="Deadline"
            className={inputCls}
          />
          <select
            name="priority"
            defaultValue={item.priority ?? 'MEDIUM'}
            aria-label="Prioritas"
            className={inputCls}
          >
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
          <select
            name="status"
            defaultValue={item.status}
            aria-label="Status Action Item"
            className={inputCls}
          >
            {ACTION_ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ACTION_ITEM_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={updPending} className={btnSecondary}>
            {updPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
        <StateMessage state={updState} />
      </form>

      {/* Task link / Create Task (§20, §21, §22) */}
      <div className="mt-2 border-t pt-2 dark:border-zinc-700">
        {item.task_id && taskCode ? (
          <p className="text-sm">
            ✓ Task:{' '}
            <Link
              href={`/tasks/${item.task_id}`}
              className="font-mono font-semibold text-kasuat-deep-gold hover:underline"
            >
              {taskCode}
            </Link>
          </p>
        ) : canCreateTask ? (
          <form {...taskAction} className="flex flex-col gap-2">
            <input type="hidden" name="action_item_id" value={item.id} />
            <input type="hidden" name="meeting_id" value={meetingId} />
            {taskProjects && (
              <select name="project_id" required defaultValue="" aria-label="Project" className={inputCls}>
                <option value="" disabled>
                  {taskProjects.length > 0 ? 'Pilih Project...' : 'Tidak ada Project'}
                </option>
                {taskProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            )}
            {/* Audit B11: assignee + deadline task dipilih eksplisit (default
                dari action item), bukan diam-diam kosong / hari ini. */}
            <select
              name="assignee_id"
              required
              defaultValue={users.some((u) => u.id === item.assignee_id) ? (item.assignee_id ?? '') : ''}
              aria-label="Assignee Task"
              className={inputCls}
            >
              <option value="" disabled>
                Assignee Task...
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
            </select>
            <input
              name="deadline"
              type="date"
              required
              defaultValue={item.deadline ?? ''}
              aria-label="Deadline Task"
              className={inputCls}
            />
            {/* Metadata diwarisi dari action item; workstream opsional (§20). */}
            {workstreams.length > 0 && (
              <select name="workstream_id" defaultValue="" aria-label="Workstream (opsional)" className={inputCls}>
                <option value="">Workstream (opsional)...</option>
                {workstreams.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            )}
            <div>
              <button type="submit" disabled={taskPending} className={btnPrimary}>
                {taskPending ? 'Membuat...' : 'Buat Task'}
              </button>
            </div>
            <StateMessage state={taskState} />
          </form>
        ) : (
          <p className="text-sm text-zinc-500">Task: Belum dibuat</p>
        )}
      </div>

      {!(item.task_id && taskCode) && (
        <form {...delAction} className="mt-2">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="meeting_id" value={meetingId} />
          <button type="submit" disabled={delPending} className={btnDanger}>
            {delPending ? 'Menghapus...' : 'Hapus'}
          </button>
          {(delState?.error || delState?.success) && <StateMessage state={delState} />}
        </form>
      )}
    </li>
  )
}

/* ============================================================================
 * PARTICIPANTS (§39)
 * ========================================================================== */

export function ParticipantAddForm({
  meetingId,
  users,
}: {
  meetingId: string
  users: UserOption[]
}) {
  const [state, formAction, pending] = useFormAction(addParticipant, INITIAL)
  return (
    <form {...formAction} className="flex flex-col gap-2 rounded-xl border p-3 dark:border-zinc-700">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <select name="user_id" defaultValue="" aria-label="User Kasuat" className={inputCls}>
        <option value="">Pilih user...</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name || u.email}
          </option>
        ))}
      </select>
      <div>
        <button type="submit" disabled={pending} className={btnSecondary}>
          {pending ? 'Menambah...' : '+ Tambah Peserta'}
        </button>
      </div>
      <StateMessage state={state} />
    </form>
  )
}

export function ParticipantRow({
  meetingId,
  participant,
  displayName,
  canRemove,
  isSelf,
}: {
  meetingId: string
  participant: ParticipantRow
  /** Nama tampilan (dari profiles untuk user internal). */
  displayName: string
  canRemove: boolean
  isSelf: boolean
}) {
  const [delState, delAction, delPending] = useFormAction(removeParticipant, INITIAL, () => 'Hapus peserta ini dari Meeting?')
  const [attState, attAction, attPending] = useFormAction(updateAttendance, INITIAL)

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 dark:border-zinc-700">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {displayName}
          {participant.is_organizer && (
            <span className="ml-2 rounded-full bg-kasuat-gold px-2 py-0.5 text-xs font-semibold text-kasuat-black">
              Organizer
            </span>
          )}
          {isSelf && <span className="ml-2 text-xs text-zinc-500">(Anda)</span>}
        </p>
        {!participant.user_id && participant.external_email && (
          <p className="truncate text-xs text-zinc-500">{participant.external_email}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {participant.user_id && (isSelf || canRemove) && (
          <form {...attAction} className="flex items-center gap-1">
            <input type="hidden" name="meeting_id" value={meetingId} />
            <input type="hidden" name="participant_id" value={participant.id} />
            <select
              name="attendance"
              defaultValue={participant.attendance}
              aria-label="Kehadiran"
              className="min-h-[40px] rounded-lg border px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              {(Object.keys(ATTENDANCE_LABELS) as (keyof typeof ATTENDANCE_LABELS)[]).map((a) => (
                <option key={a} value={a}>
                  {ATTENDANCE_LABELS[a]}
                </option>
              ))}
            </select>
            <button type="submit" disabled={attPending} className={btnSecondary}>
              OK
            </button>
          </form>
        )}
        {!participant.user_id && (
          <span className="text-xs text-zinc-500">{ATTENDANCE_LABELS[participant.attendance] ?? participant.attendance}</span>
        )}
        {canRemove && (
          <form {...delAction}>
            <input type="hidden" name="meeting_id" value={meetingId} />
            <input type="hidden" name="participant_id" value={participant.id} />
            <button type="submit" disabled={delPending} className={btnDanger}>
              {delPending ? '...' : 'Hapus'}
            </button>
          </form>
        )}
      </div>
      {(delState?.error || delState?.success) && <StateMessage state={delState} />}
      {(attState?.error || attState?.success) && <StateMessage state={attState} />}
    </li>
  )
}