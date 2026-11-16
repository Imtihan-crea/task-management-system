/**
 * Uji lib/hr/reminder.ts — pengingat Daily Tracker.
 * Jalankan: npm run test:hr-reminder
 */
import { reminderEnabled, usersToRemind, type ReminderUser } from '../lib/hr/reminder'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const u = (id: string, o: Partial<ReminderUser> = {}): ReminderUser => ({ id, status: 'ACTIVE', is_developer: false, deleted_at: null, ...o })
const users = [u('a'), u('b'), u('dev', { is_developer: true }), u('off', { status: 'INACTIVE' }), u('inv', { status: 'INVITED' }), u('del', { deleted_at: '2026-11-01', status: 'INACTIVE' })]

cek('hari kerja: yang belum isi', usersToRemind(users, new Set(['b']), true), ['a'])
cek('hari libur: tidak ada', usersToRemind(users, new Set(), false), [])
cek('semua sudah isi', usersToRemind(users, new Set(['a', 'b']), true), [])
cek('saklar mati bawaan', reminderEnabled(undefined), false)
cek('saklar "1" tetap mati', reminderEnabled('1'), false)
cek('saklar true', reminderEnabled('true'), true)

console.log(`hr-reminder: ${ok} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)
