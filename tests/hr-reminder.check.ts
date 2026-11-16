/**
 * Uji lib/hr/reminder.ts — pengingat Daily Tracker.
 * Jalankan: npm run test:hr-reminder
 */
import { pilotUsers, reminderEnabled, usersToRemind, type ReminderUser } from '../lib/hr/reminder'

let ok = 0
let gagal = 0
function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) ok++
  else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

const u = (id: string, o: Partial<ReminderUser> = {}): ReminderUser => ({ id, status: 'ACTIVE', is_developer: false, deleted_at: null, tracker_required: true, ...o })
const users = [u('a'), u('b'), u('dev', { is_developer: true }), u('off', { status: 'INACTIVE' }), u('inv', { status: 'INVITED' }), u('del', { deleted_at: '2026-11-01', status: 'INACTIVE' })]

cek('hari kerja: yang belum isi', usersToRemind(users, new Set(['b']), true), ['a'])
cek('hari libur: tidak ada', usersToRemind(users, new Set(), false), [])
cek('semua sudah isi', usersToRemind(users, new Set(['a', 'b']), true), [])
const A = '11111111-1111-1111-1111-111111111111'
const mix = [u(A), u('b')]
cek('mode uji: hanya akun ditunjuk', usersToRemind(mix, new Set(), true, pilotUsers(` ${A} , bukan-uuid`)), [A])
cek('mode uji kosong = semua', usersToRemind(mix, new Set(), true, pilotUsers('  ')), [A, 'b'])
cek('mode uji tanpa id sah = tidak ada', usersToRemind(mix, new Set(), true, pilotUsers('salah')), [])
cek('mode uji: akun ditunjuk sudah isi = tidak', usersToRemind(mix, new Set([A]), true, pilotUsers(A)), [])
cek('mode uji: akun Developer yang ditunjuk ikut', usersToRemind(users, new Set(), true, new Set(['dev'])), ['dev'])
cek('tanpa mode uji: Developer tetap dilewati', usersToRemind(users, new Set(), true, null).includes('dev'), false)
cek('tidak wajib isi tracker = tidak diingatkan', usersToRemind([u('x', { tracker_required: false }), u('y')], new Set(), true), ['y'])
cek('mode uji tetap kirim ke yang ditunjuk walau tidak wajib', usersToRemind([u('x', { tracker_required: false })], new Set(), true, new Set(['x'])), ['x'])
cek('saklar mati bawaan', reminderEnabled(undefined), false)
cek('saklar "1" tetap mati', reminderEnabled('1'), false)
cek('saklar true', reminderEnabled('true'), true)

console.log(`hr-reminder: ${ok} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)
