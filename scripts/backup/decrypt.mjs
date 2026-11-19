#!/usr/bin/env node
// Buka berkas backup email TMS (.tmsbak.txt) menjadi JSON di stdout.
// Pakai: node scripts/backup/decrypt.mjs <berkas> > backup.json
// Passphrase dari env BACKUP_PASSPHRASE, atau diketik saat diminta (tidak tampil).
// Format sama dengan lib/backup/backup.ts (decryptBackup); ubah keduanya bersamaan.
import { createDecipheriv, scryptSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const HEADER = 'TMSBAK1'

function decrypt(text, passphrase) {
  const [first, ...rest] = text.split('\n')
  if (first.trim() !== HEADER) throw new Error('Bukan berkas backup TMS (header tidak dikenal).')
  const raw = Buffer.from(rest.join(''), 'base64')
  if (raw.length < 16 + 12 + 16 + 1) throw new Error('Berkas backup terpotong.')
  const salt = raw.subarray(0, 16)
  const iv = raw.subarray(16, 28)
  const key = scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(Buffer.concat([Buffer.from(HEADER), salt, iv]))
  decipher.setAuthTag(raw.subarray(28, 44))
  let plain
  try {
    plain = Buffer.concat([decipher.update(raw.subarray(44)), decipher.final()])
  } catch {
    throw new Error('Passphrase salah atau berkas rusak.')
  }
  return gunzipSync(plain).toString('utf8')
}

/** Baca passphrase dari terminal tanpa menampilkannya (ke stderr, supaya stdout tetap JSON murni). */
function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    if (!stdin.isTTY) return reject(new Error('Isi BACKUP_PASSPHRASE di env bila tidak memakai terminal.'))
    process.stderr.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    stdin.on('data', function onData(ch) {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.off('data', onData)
        process.stderr.write('\n')
        resolve(value)
      } else if (ch === '\u0003') {
        process.exit(130)
      } else if (ch === '\u007f') {
        value = value.slice(0, -1)
      } else {
        value += ch
      }
    })
  })
}

const file = process.argv[2]
if (!file) {
  console.error('Pakai: node scripts/backup/decrypt.mjs <berkas.tmsbak.txt> > backup.json')
  process.exit(2)
}
try {
  const passphrase = process.env.BACKUP_PASSPHRASE || (await askHidden('Passphrase backup: '))
  process.stdout.write(decrypt(readFileSync(file, 'utf8'), passphrase))
} catch (error) {
  console.error(`GAGAL: ${error.message}`)
  process.exit(1)
}
