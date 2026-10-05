/**
 * Layout email Kasuat (brand).
 *
 * Dipakai untuk SEMUA email aplikasi — dibungkus sekali di `sendEmail`
 * (lib/email/notify.ts), jadi pengirim tidak perlu memikirkan branding.
 *
 * Keputusan desain:
 * - Logo berupa TEKS ("KASUAT" emas di bar emas gelap), bukan gambar.
 *   Gmail/Outlook memblokir gambar eksternal secara default — logo gambar
 *   akan tampil sebagai kotak rusak. Teks selalu tampil.
 * - Inline style saja (tanpa <style>), karena banyak klien email
 *   menghapus <style> di <head>.
 * - Lebar maks 600px: standar email transaksional.
 */

const BRAND_BG = '#131313'
const GOLD = '#C9A227'
const TEXT = '#222222'
const MUTED = '#777777'

export function escapeEmailHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Bungkus fragmen HTML body menjadi dokumen email lengkap ber-brand Kasuat.
 * `title` = subject email, ditampilkan sebagai judul di bawah header.
 */
export function brandEmailHtml(input: { title: string; bodyHtml: string }): string {
  return (
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background-color:#f4f4f4;">' +
    '<div style="max-width:600px;margin:0 auto;padding:24px 12px;">' +
    `<div style="background-color:${BRAND_BG};border-radius:12px 12px 0 0;padding:20px 24px;text-align:center;">` +
    `<div style="color:${GOLD};font-size:22px;font-weight:bold;letter-spacing:6px;font-family:Arial,Helvetica,sans-serif;">KASUAT</div>` +
    '<div style="color:#ffffff;font-size:12px;margin-top:4px;font-family:Arial,Helvetica,sans-serif;">Task Management System</div>' +
    '</div>' +
    '<div style="background-color:#ffffff;border-radius:0 0 12px 12px;padding:24px;font-family:Arial,Helvetica,sans-serif;">' +
    `<h2 style="color:${TEXT};font-size:18px;margin:0 0 16px 0;">${escapeEmailHtml(input.title)}</h2>` +
    `<div style="color:${TEXT};font-size:14px;line-height:1.6;">${input.bodyHtml}</div>` +
    `<hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0 12px 0;">` +
    `<p style="color:${MUTED};font-size:12px;margin:0;">Email ini dikirim otomatis oleh Kasuat Task Management System. Mohon tidak membalas email ini.</p>` +
    '</div>' +
    '</div>' +
    '</body></html>'
  )
}
