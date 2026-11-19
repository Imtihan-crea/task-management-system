import { Popover } from '@/components/ui/Popover'

const FORMATS = [
  { format: 'xlsx', label: 'Excel (.xlsx)' },
  { format: 'pdf', label: 'PDF' },
  { format: 'docx', label: 'Word (.docx)' },
] as const

/**
 * Satu tombol "Export" dengan menu Excel / PDF / Word. Isi menu sengaja <a download>,
 * bukan next/link: tujuannya route handler berkas, bukan halaman (Link akan mencoba prefetch/navigasi klien).
 */
export function ExportLink({ href }: { href: string }) {
  const join = href.includes('?') ? '&' : '?'
  return (
    <Popover
      label="Export data"
      nameFromContent
      align="left"
      panelClassName="right-0 min-w-44 sm:left-auto sm:w-48"
      button={
        <>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Export
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </>
      }
    >
      <ul className="py-1">
        {FORMATS.map(({ format, label }) => (
          <li key={format}>
            <a
              href={format === 'xlsx' ? href : `${href}${join}format=${format}`}
              download
              aria-label={`Export ${label}`}
              className="flex min-h-[44px] items-center px-4 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </Popover>
  )
}
