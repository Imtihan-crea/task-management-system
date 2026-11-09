/** Kode Workstream: A..Z, AA.. (sama dengan public.num_to_letters di migrasi 005). */
export function numToLetters(n: number): string {
  if (!n || n < 1) return 'A'
  let m = n
  let out = ''
  while (m > 0) {
    m -= 1
    out = String.fromCharCode(65 + (m % 26)) + out
    m = Math.floor(m / 26)
  }
  return out
}

export function lettersToNum(code: string): number {
  let n = 0
  for (const ch of code) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

/** Kode berikutnya = maks(kode yang ada)+1; tahan terhadap lubang akibat hapus. */
export function nextWorkstreamCode(existing: string[]): string {
  const max = existing
    .filter((c) => /^[A-Z]+$/.test(c))
    .reduce((a, c) => Math.max(a, lettersToNum(c)), 0)
  return numToLetters(max + 1)
}
