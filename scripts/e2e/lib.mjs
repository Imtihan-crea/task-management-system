// Pustaka bersama skrip e2e (lihat README.md). Rahasia tidak pernah dicetak.
// Database lokal = database PRODUKSI: semua data uji berawalan "UJI-E2E".
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const BASE = process.env.BASE ?? 'http://localhost:3100'
export const PREFIX = 'UJI-E2E'
export const EMAIL_LIKE = 'uji-e2e-%@example.com'
export const OUT_DIR = path.join(os.homedir(), '.cache', 'taskmgmt-smoke')
const NPX_PLAYWRIGHT = path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules')

export const day = (n) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)

export function loadPlaywright() {
  const dir = process.env.PLAYWRIGHT_MODULE_DIR ?? NPX_PLAYWRIGHT
  return createRequire(dir.replace(/\/?$/, '/'))('playwright')
}

function loadEnv() {
  const text = fs.readFileSync(path.join(REPO, '.env.local'), 'utf8')
  return Object.fromEntries(
    text.split('\n').filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
  )
}

export function serviceClient() {
  const { createClient } = createRequire(REPO + '/')('@supabase/supabase-js')
  const env = loadEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

/** Tolak jalan kecuali konfirmasi eksplisit, target localhost, dan server tanpa email. */
export async function guard() {
  if (process.env.E2E_CONFIRM_PRODUCTION !== 'ya') {
    console.error('DITOLAK: database lokal adalah PRODUKSI. Set E2E_CONFIRM_PRODUCTION=ya (lihat scripts/e2e/README.md).')
    process.exit(2)
  }
  const url = new URL(BASE)
  if (url.hostname !== 'localhost' || url.protocol !== 'http:') {
    console.error('DITOLAK: BASE harus http://localhost:<port>.')
    process.exit(2)
  }
  const res = await fetch(BASE + '/login', { redirect: 'manual' }).catch(() => null)
  if (!res) {
    console.error(`DITOLAK: server tidak menjawab di ${BASE}. Jalankan: BREVO_API_KEY="" BREVO_SENDER_EMAIL="" ./node_modules/.bin/next start -p ${url.port || 3100}`)
    process.exit(2)
  }
  // Pastikan proses server dimulai dengan BREVO_API_KEY kosong (email mati).
  try {
    const pid = execSync(`ss -ltnp | grep ":${url.port || 80} " | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2`, { encoding: 'utf8' }).trim()
    const environ = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')
    const brevo = environ.find((e) => e.startsWith('BREVO_API_KEY='))
    if (brevo !== 'BREVO_API_KEY=') throw new Error('BREVO_API_KEY tidak kosong / tidak di-set kosong')
  } catch (e) {
    console.error('DITOLAK: tidak bisa memastikan server berjalan dengan email mati (' + e.message + '). Mulai ulang dengan: BREVO_API_KEY="" BREVO_SENDER_EMAIL="" ./node_modules/.bin/next start -p 3100')
    process.exit(2)
  }
}

export function adminEmail() {
  const md = fs.readFileSync(path.join(REPO, 'private/akun-admin.md'), 'utf8')
  return md.match(/\|\s*([^\s|]+@[^\s|]+)\s*\|/)[1]
}

/** Sesi admin dari link recovery sekali pakai; password TIDAK diubah. */
export async function loginAdmin(db, page) {
  const email = adminEmail()
  const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email })
  if (error) throw new Error('generateLink: ' + error.message)
  const { data: prof } = await db.from('profiles').select('id').eq('email', email).single()
  await page.goto(`${BASE}/reset-password#token_hash=${data.properties.hashed_token}&type=recovery`, { waitUntil: 'networkidle' })
  await page.locator('input[type="password"]').first().waitFor({ timeout: 30000 })
  return prof.id
}

export async function makeUser(db, key, role, name) {
  const email = `uji-e2e-${key}@example.com`
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } })
  if (error) throw new Error(`createUser ${key}: ${error.message}`)
  await new Promise((r) => setTimeout(r, 800))
  const { error: pe } = await db.from('profiles').upsert({ id: data.user.id, email, full_name: name, role, status: 'ACTIVE' })
  if (pe) throw new Error(`profile ${key}: ${pe.message}`)
  return { id: data.user.id, email, password }
}

export async function loginPassword(page, u) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', u.email)
  await page.fill('input[type="password"]', u.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/dashboard/, { timeout: 30000 })
}

/** Hapus permanen semua data berawalan UJI-E2E (urutan aman FK). Mengembalikan baris log + sisa. */
export async function runCleanup(db) {
  const out = []
  const log = (t, n, e) => out.push(`${t}: ${e ? 'ERR ' + e.message : n}`)
  const none = ['00000000-0000-0000-0000-000000000000']
  const ids = async (table, col, op, val) => {
    const q = db.from(table).select('id')
    const { data } = op === 'like' ? await q.like(col, val) : await q.in(col, val)
    return (data ?? []).map((r) => r.id)
  }
  const projectIds = await ids('projects', 'name', 'like', `${PREFIX}%`)
  const userIds = await ids('profiles', 'email', 'like', EMAIL_LIKE)
  const inP = projectIds.length ? projectIds : none
  const inU = userIds.length ? userIds : none
  const uniq = (...a) => [...new Set(a.flat())]
  const taskIds = uniq(await ids('tasks', 'project_id', 'in', inP), await ids('tasks', 'title', 'like', `${PREFIX}%`))
  const sugIds = await ids('task_suggestions', 'project_id', 'in', inP)
  const meetIds = uniq(await ids('meetings', 'project_id', 'in', inP), await ids('meetings', 'title', 'like', `${PREFIX}%`))
  const wsIds = await ids('workstreams', 'project_id', 'in', inP)
  const entityIds = [...taskIds, ...sugIds, ...meetIds, ...wsIds, ...projectIds, ...userIds]
  out.push(`ditemukan projects=${projectIds.length} users=${userIds.length} tasks=${taskIds.length} suggestions=${sugIds.length} meetings=${meetIds.length} workstreams=${wsIds.length}`)

  const del = async (table, build) => {
    const { data, error } = await build(db.from(table).delete()).select('*')
    log(table, data?.length ?? 0, error)
  }
  const orNone = (a) => (a.length ? a : none)
  await del('notifications', (q) => q.in('user_id', inU))
  await del('notifications', (q) => q.in('entity_id', orNone(entityIds)))
  let ev = 0
  for (const id of entityIds) {
    const { data } = await db.from('notification_events').delete().like('event_key', `%${id}%`).select('event_key')
    ev += data?.length ?? 0
  }
  out.push(`notification_events: ${ev}`)
  await del('activity_logs', (q) => q.in('actor_user_id', inU))
  await del('activity_logs', (q) => q.in('project_id', inP))
  await del('activity_logs', (q) => q.in('entity_id', orNone(entityIds)))
  const inM = orNone(meetIds)
  for (const t of ['meeting_action_items', 'meeting_decisions', 'meeting_agendas', 'meeting_participants']) {
    await del(t, (q) => q.in('meeting_id', inM))
  }
  await del('meetings', (q) => q.in('id', inM))
  await del('tasks', (q) => q.in('id', orNone(taskIds)))
  await del('task_suggestions', (q) => q.in('id', orNone(sugIds)))
  await del('workstreams', (q) => q.in('id', orNone(wsIds)))
  await del('project_managers', (q) => q.in('project_id', inP))
  await del('projects', (q) => q.in('id', inP))
  await del('notification_preferences', (q) => q.in('user_id', inU))
  await del('meeting_participants', (q) => q.in('user_id', inU))
  await del('profiles', (q) => q.in('id', inU))
  for (const id of userIds) {
    const { error } = await db.auth.admin.deleteUser(id)
    log('auth.users', 1, error)
  }
  const count = async (table, col, pat) => (await db.from(table).select('id').like(col, pat)).data?.length ?? 0
  const left = {
    projects: await count('projects', 'name', `${PREFIX}%`),
    tasks: await count('tasks', 'title', `${PREFIX}%`),
    meetings: await count('meetings', 'title', `${PREFIX}%`),
    profiles: await count('profiles', 'email', EMAIL_LIKE),
  }
  out.push('sisa: ' + JSON.stringify(left))
  return { lines: out, left, ok: Object.values(left).every((n) => n === 0) }
}

export function writeOut(name, data) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, name), typeof data === 'string' ? data : JSON.stringify(data, null, 1))
}
