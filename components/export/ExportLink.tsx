/**
 * Tombol unduh Excel. Sengaja <a>, bukan next/link: tujuannya route handler
 * berkas, bukan halaman (Link akan mencoba prefetch/navigasi klien).
 */
export function ExportLink({ href, label = 'Export Excel' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-kasuat-black hover:border-kasuat-deep-gold dark:border-zinc-700 dark:text-zinc-100"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M10 3v10m0 0-4-4m4 4 4-4M4 15v2h12v-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </a>
  )
}
