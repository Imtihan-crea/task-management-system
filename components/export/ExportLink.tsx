const FORMATS = [
  { format: 'xlsx', label: 'Excel' },
  { format: 'pdf', label: 'PDF' },
  { format: 'docx', label: 'Word' },
] as const

/**
 * Tombol unduh Excel / PDF / Word. Sengaja <a>, bukan next/link: tujuannya route
 * handler berkas, bukan halaman (Link akan mencoba prefetch/navigasi klien).
 */
export function ExportLink({ href }: { href: string }) {
  const join = href.includes('?') ? '&' : '?'
  return (
    <div role="group" aria-label="Export data" className="inline-flex items-center gap-1">
      <span className="text-sm font-semibold text-kasuat-black dark:text-zinc-100">Export</span>
      {FORMATS.map(({ format, label }) => (
        <a
          key={format}
          href={format === 'xlsx' ? href : `${href}${join}format=${format}`}
          download
          aria-label={`Export ${label}`}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-kasuat-black hover:border-kasuat-deep-gold dark:border-zinc-700 dark:text-zinc-100"
        >
          {label}
        </a>
      ))}
    </div>
  )
}
