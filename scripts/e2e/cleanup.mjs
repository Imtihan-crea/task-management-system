// Hapus permanen semua data uji UJI-E2E. Aman dijalankan berulang.
import { guard, serviceClient, runCleanup } from './lib.mjs'

await guard()
const { lines, ok } = await runCleanup(serviceClient())
console.log(lines.join('\n'))
process.exit(ok ? 0 : 1)
