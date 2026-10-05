/**
 * Uji boundary lib/email/layout.ts — branding email Kasuat.
 * Jalankan: npm run test:layout
 */
import { brandEmailHtml, escapeEmailHtml } from '../lib/email/layout'

let ok = 0
let gagal = 0

function cek(label: string, aktual: unknown, harap: unknown): void {
  if (JSON.stringify(aktual) === JSON.stringify(harap)) {
    ok++
  } else {
    gagal++
    console.log(`  [GAGAL] ${label} -> ${JSON.stringify(aktual)} (harus ${JSON.stringify(harap)})`)
  }
}

/* ---------- escape ---------- */
cek('escape dasar', escapeEmailHtml('<b>"x" & y</b>'), '&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;')
cek('escape null', escapeEmailHtml(null), '')

/* ---------- struktur dokumen ---------- */
const html = brandEmailHtml({ title: '[Reminder] M-003 Standup', bodyHtml: '<p>Isi</p>' })
cek('doctype + html lengkap', html.startsWith('<!DOCTYPE html>') && html.endsWith('</html>'), true)
cek('brand KASUAT', html.includes('KASUAT'), true)
cek('subject jadi judul (di-escape)', html.includes('[Reminder] M-003 Standup'), true)
cek('body ikut', html.includes('<p>Isi</p>'), true)
cek('footer no-reply', html.includes('tidak membalas'), true)
cek('tanpa gambar eksternal (anti-blokir Gmail)', !html.includes('<img'), true)
cek('style inline (tanpa <style>)', !html.includes('<style'), true)
cek('lebar email standar 600px', html.includes('max-width:600px'), true)

/* ---------- subject berbahaya di-escape di judul ---------- */
const evil = brandEmailHtml({ title: '<script>x</script>', bodyHtml: '<p>A</p>' })
cek('subject ter-escape', evil.includes('&lt;script&gt;') && !evil.includes('<script>'), true)

/* ---------- body dianggap HTML terpercaya dari builder internal ---------- */
const trusted = brandEmailHtml({ title: 'T', bodyHtml: '<ul><li><strong>A</strong></li></ul>' })
cek('body tidak di-escape ulang', trusted.includes('<li><strong>A</strong></li>'), true)

console.log(`LULUS: ${ok}`)
console.log(`GAGAL: ${gagal}`)
if (gagal > 0) process.exit(1)