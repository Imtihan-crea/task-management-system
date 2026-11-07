#!/usr/bin/env node
/**
 * Pemeriksa data privat (7 Nov 2026).
 *
 * Memindai file yang TER-TRACK git dan gagal kalau menemukan:
 * - JWT / service role / token
 * - API key (Supabase PAT, Brevo, OpenAI-style, GitHub, Google)
 * - connection string Postgres yang mengandung password
 * - private key
 * - assignment secret yang nilainya bukan placeholder
 * - email pribadi (domain di luar allowlist placeholder)
 *
 * Nilai temuan TIDAK pernah dicetak — hanya nama aturan + file:baris.
 * Jalankan: npm run check:secrets
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ALLOWED_EMAIL_DOMAINS = new Set([
  'contoh.com',
  'example.com',
  'email.com',
  'domain.com',
  'test.com',
  'localhost',
  'supabase.com',
  'supabase.io',
  'vercel.com',
  'github.com',
  'google.com',
])

const SKIP_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'next-env.d.ts',
  'tsconfig.tsbuildinfo',
])

const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.zip', '.mp4',
])

const PLACEHOLDER = /(contoh|example|redacted|placeholder|isi_|your_|changeme|xxxx|string_|acak|\[redacted\]|<[a-z_]+>)/i

const RULES = [
  {
    name: 'JWT / token',
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  { name: 'Supabase PAT', re: /sbp_[A-Za-z0-9]{20,}/g },
  { name: 'Brevo API key', re: /xkeysib-[A-Za-z0-9-]{20,}/g },
  { name: 'OpenAI-style key', re: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{30,}/g },
  {
    name: 'Postgres URI berisi password',
    re: /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`@]+@/g,
  },
  {
    name: 'Private key',
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
]

const SECRET_ASSIGNMENT =
  /(SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|BREVO_API_KEY|CRON_SECRET|DATABASE_URL)[ \t]*=[ \t]*([^\s#"']{16,})/g

const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

function listTrackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    return out.split('\0').filter(Boolean)
  } catch {
    return walk('.')
  }
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next') {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

function isBinary(buffer) {
  const sample = buffer.subarray(0, 8000)
  return sample.includes(0)
}

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

const files = listTrackedFiles()
const findings = []

for (const file of files) {
  const base = file.split(/[\\/]/).pop()
  if (SKIP_FILES.has(base)) continue
  if (SKIP_EXT.has(extname(file).toLowerCase())) continue

  let buffer
  try {
    buffer = readFileSync(file)
  } catch {
    continue
  }
  if (isBinary(buffer)) continue

  const text = buffer.toString('utf8')

  for (const rule of RULES) {
    rule.re.lastIndex = 0
    let match
    while ((match = rule.re.exec(text))) {
      findings.push({ file, line: lineOf(text, match.index), rule: rule.name })
    }
  }

  SECRET_ASSIGNMENT.lastIndex = 0
  let assign
  while ((assign = SECRET_ASSIGNMENT.exec(text))) {
    const value = assign[2]
    if (PLACEHOLDER.test(value)) continue
    findings.push({
      file,
      line: lineOf(text, assign.index),
      rule: `Nilai ${assign[1]} bukan placeholder`,
    })
  }

  EMAIL_RE.lastIndex = 0
  let email
  while ((email = EMAIL_RE.exec(text))) {
    const domain = email[1].toLowerCase()
    if (ALLOWED_EMAIL_DOMAINS.has(domain)) continue
    findings.push({ file, line: lineOf(text, email.index), rule: 'Email pribadi' })
  }
}

const unique = []
const seen = new Set()
for (const f of findings) {
  const key = `${f.file}:${f.line}:${f.rule}`
  if (seen.has(key)) continue
  seen.add(key)
  unique.push(f)
}

console.log(`Memeriksa ${files.length} file ter-track...`)

if (unique.length === 0) {
  console.log('BERSIH: tidak ada data privat terdeteksi.')
  process.exit(0)
}

console.log(`\nDITEMUKAN ${unique.length} temuan (nilai sengaja tidak dicetak):`)
for (const f of unique) {
  console.log(`  [${f.rule}] ${relative('.', f.file)}:${f.line}`)
}
console.log('\nPerbaiki: ganti dengan placeholder, atau rotasi secret kalau sudah bocor.')
process.exit(1)
