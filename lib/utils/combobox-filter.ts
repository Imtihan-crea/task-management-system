/**
 * Penyaring daftar Combobox: tak peduli huruf besar/kecil, cocok di mana pun
 * dalam teks. Yang diawali ketikan tampil lebih dulu; urutan asli dijaga.
 */
export function filterOptions(options: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...options]
  const starts: string[] = []
  const inside: string[] = []
  for (const o of options) {
    const i = o.toLowerCase().indexOf(q)
    if (i === 0) starts.push(o)
    else if (i > 0) inside.push(o)
  }
  return [...starts, ...inside]
}
