'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFormAction } from '@/lib/forms/use-form-action'
import {
  cancelTransfer,
  decideTransfer,
  endTransferAction,
  requestTransfer,
  type TransferFormState,
} from '@/app/actions/task-transfers'

const INITIAL: TransferFormState = undefined
const INPUT = 'min-h-[44px] w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800'
const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-kasuat-gold px-4 py-2 text-sm font-semibold text-kasuat-black disabled:opacity-50'
const SECONDARY = 'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-400 px-4 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200'

function Message({ state }: { state: TransferFormState }) {
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

export type TransferUser = { id: string; name: string }
export type TransferTaskOption = { id: string; code: string; title: string; detail?: string }

/**
 * Daftar centang dengan "Pilih semua" (termasuk keadaan sebagian).
 * Nilai terpilih dikirim sebagai `name` berulang.
 */
export function CheckList({
  name,
  items,
  initiallyChecked = true,
  label,
}: {
  name: string
  items: { id: string; label: ReactNode }[]
  initiallyChecked?: boolean
  label: string
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initiallyChecked ? items.map((i) => i.id) : []))
  const allRef = useRef<HTMLInputElement>(null)
  const all = items.length > 0 && checked.size === items.length
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = checked.size > 0 && !all
  }, [checked, all])

  return (
    <fieldset className="flex flex-col gap-1 rounded-lg border p-3 dark:border-zinc-700">
      <legend className="px-1 text-sm font-medium">
        {label} ({checked.size} dari {items.length} dipilih)
      </legend>
      <label className="flex min-h-[44px] items-center gap-2 border-b pb-2 text-sm font-semibold dark:border-zinc-700">
        <input
          ref={allRef}
          type="checkbox"
          checked={all}
          onChange={() => setChecked(all ? new Set() : new Set(items.map((i) => i.id)))}
          className="h-5 w-5"
        />
        Pilih semua
      </label>
      {items.map((item) => (
        <label key={item.id} className="flex min-h-[44px] items-start gap-2 py-1 text-sm">
          <input
            type="checkbox"
            name={name}
            value={item.id}
            checked={checked.has(item.id)}
            onChange={() =>
              setChecked((prev) => {
                const next = new Set(prev)
                if (next.has(item.id)) next.delete(item.id)
                else next.add(item.id)
                return next
              })
            }
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>{item.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

/**
 * Ajukan (consultant) atau langsung alihkan (PM/Admin) satu/banyak task.
 * Sementara: rentang tanggal + jam (WIB), dari menit sampai bulan.
 */
export function TransferRequestForm({
  tasks,
  users,
  byManager,
  defaultStart = '',
  defaultEnd = '',
  leaveRequestId,
}: {
  tasks: TransferTaskOption[]
  users: TransferUser[]
  byManager: boolean
  defaultStart?: string
  defaultEnd?: string
  leaveRequestId?: string
}) {
  const [kind, setKind] = useState<'TEMPORARY' | 'PERMANENT'>('TEMPORARY')
  const [state, formAction, pending] = useFormAction(requestTransfer, INITIAL)

  return (
    <form {...formAction} className="flex flex-col gap-3">
      {leaveRequestId && <input type="hidden" name="leave_request_id" value={leaveRequestId} />}
      {tasks.length === 1 ? (
        <input type="hidden" name="task_id" value={tasks[0].id} />
      ) : (
        <CheckList
          name="task_id"
          label="Task yang dialihkan"
          items={tasks.map((t) => ({
            id: t.id,
            label: (
              <>
                <strong>{t.code}</strong> {t.title}
                {t.detail && <span className="block text-xs text-zinc-600 dark:text-zinc-400">{t.detail}</span>}
              </>
            ),
          }))}
        />
      )}

      <div>
        <label htmlFor="transfer_to" className="mb-1 block text-sm font-medium">
          Pengganti
        </label>
        <select id="transfer_to" name="to_user_id" required defaultValue="" className={INPUT}>
          <option value="" disabled>
            Pilih consultant pengganti
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Jenis</legend>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="radio" name="kind" value="TEMPORARY" checked={kind === 'TEMPORARY'} onChange={() => setKind('TEMPORARY')} className="h-5 w-5" />
          Sementara (pilih rentang waktu)
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="radio" name="kind" value="PERMANENT" checked={kind === 'PERMANENT'} onChange={() => setKind('PERMANENT')} className="h-5 w-5" />
          Permanen
        </label>
      </fieldset>

      {kind === 'TEMPORARY' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="transfer_start" className="mb-1 block text-sm font-medium">
              Mulai (WIB)
            </label>
            <input id="transfer_start" type="datetime-local" name="starts_at" required defaultValue={defaultStart} className={INPUT} />
          </div>
          <div>
            <label htmlFor="transfer_end" className="mb-1 block text-sm font-medium">
              Selesai (WIB)
            </label>
            <input id="transfer_end" type="datetime-local" name="ends_at" required defaultValue={defaultEnd} className={INPUT} />
          </div>
          {byManager && (
            <label className="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="auto_return" className="h-5 w-5" />
              Kembalikan otomatis ke pemegang asal saat masa habis (tanpa ditanya)
            </label>
          )}
          {!byManager && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
              Saat masa habis, PM yang memutuskan task dikembalikan atau tidak.
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="transfer_note" className="mb-1 block text-sm font-medium">
          Catatan (opsional)
        </label>
        <textarea id="transfer_note" name="note" rows={2} maxLength={1000} className="w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800" />
      </div>

      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? 'Menyimpan...' : byManager ? 'Alihkan' : 'Ajukan ke PM'}
      </button>
      <Message state={state} />
    </form>
  )
}

/** PM/Admin: setujui/tolak satu atau banyak pengajuan (centang). */
export function TransferDecisionForm({ items }: { items: { id: string; label: ReactNode }[] }) {
  const [state, formAction, pending] = useFormAction(decideTransfer, INITIAL, (fd) =>
    fd.get('decision') === 'reject' ? `Tolak ${fd.getAll('id').length} pengajuan alih task?` : null
  )
  return (
    <form {...formAction} className="flex flex-col gap-3">
      {items.length === 1 ? (
        <>
          <input type="hidden" name="id" value={items[0].id} />
          <div className="text-sm">{items[0].label}</div>
        </>
      ) : (
        <CheckList name="id" label="Pengajuan" items={items} initiallyChecked={false} />
      )}
      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <input type="checkbox" name="auto_return" className="h-5 w-5" />
        Untuk alih sementara: kembalikan otomatis saat masa habis
      </label>
      <textarea name="decision_note" rows={2} maxLength={1000} placeholder="Catatan untuk pengaju (opsional)" aria-label="Catatan untuk pengaju" className="w-full rounded-lg border px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-800" />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" name="decision" value="approve" disabled={pending} className={`${PRIMARY} flex-1`}>
          Setujui
        </button>
        <button type="submit" name="decision" value="reject" disabled={pending} className={`${SECONDARY} flex-1`}>
          Tolak
        </button>
      </div>
      <Message state={state} />
    </form>
  )
}

/** Batalkan alih task yang belum dimulai (pengaju atau PM). */
export function TransferCancelForm({ items }: { items: { id: string; label: ReactNode }[] }) {
  const [state, formAction, pending] = useFormAction(cancelTransfer, INITIAL, (fd) => `Batalkan ${fd.getAll('id').length} alih task?`)
  return (
    <form {...formAction} className="flex flex-col gap-2">
      {items.length === 1 ? (
        <input type="hidden" name="id" value={items[0].id} />
      ) : (
        <CheckList name="id" label="Alih task" items={items} initiallyChecked={false} />
      )}
      <button type="submit" disabled={pending} className={SECONDARY}>
        {pending ? 'Membatalkan...' : 'Batalkan alih task'}
      </button>
      <Message state={state} />
    </form>
  )
}

/** PM/Admin: akhiri alih task berjalan / masa habis. */
export function TransferEndForm({ id, fromName, toName, endsAt }: { id: string; fromName: string; toName: string; endsAt: string }) {
  const [state, formAction, pending] = useFormAction(endTransferAction, INITIAL, (fd) =>
    fd.get('action') === 'return' ? `Kembalikan task ke ${fromName}?` : null
  )
  return (
    <form {...formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" name="action" value="return" disabled={pending} className={`${PRIMARY} flex-1`}>
          Kembalikan ke {fromName}
        </button>
        <button type="submit" name="action" value="keep" disabled={pending} className={`${SECONDARY} flex-1`}>
          Biarkan di {toName}
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={`extend_${id}`} className="mb-1 block text-sm font-medium">
            Perpanjang sampai (WIB)
          </label>
          <input id={`extend_${id}`} type="datetime-local" name="ends_at" defaultValue={endsAt} className={INPUT} />
        </div>
        <button type="submit" name="action" value="extend" disabled={pending} className={SECONDARY}>
          Perpanjang
        </button>
      </div>
      <Message state={state} />
    </form>
  )
}
