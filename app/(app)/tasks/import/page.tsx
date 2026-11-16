import Link from 'next/link'
import { requireManager } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/AppShell'
import { ImportTimelineForm } from '@/components/tasks/ImportTimelineForm'
import { getActiveUsers } from '@/lib/data/users'

export default async function ImportTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const profile = await requireManager()
  const params = await searchParams
  const presetProject = typeof params.project === 'string' ? params.project : ''
  const admin = createAdminClient()

  // PM hanya bisa import ke project miliknya (sama dengan halaman Buat Task).
  let query = admin.from('projects').select('id, code, name').not('status', 'in', '(COMPLETED,CANCELLED)').order('name').limit(500)
  if (profile.role === 'PROJECT_MANAGER') {
    const { data: links } = await admin.from('project_managers').select('project_id').eq('user_id', profile.id)
    const ids = ((links ?? []) as { project_id: string }[]).map((l) => l.project_id)
    query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }
  const [{ data: projects }, users] = await Promise.all([query, getActiveUsers()])

  return (
    <AppShell>
      <Link href="/tasks" className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:underline">
        &larr; Kembali ke Tasks
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Import Task dari Excel</h1>

      <div className="mt-4 rounded-2xl bg-white p-5 text-sm shadow dark:bg-zinc-900">
        <p>
          Format: file Excel timeline harian dengan sheet <b>Timeline</b>. Kolom yang dibaca: Divisi, Task, Jenis,
          PIC (peran), Nama PIC, Mulai, Deadline, Progres manual %, Status, Tgl Selesai, Catatan / update.
        </p>
        <ul className="mt-2 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
          <li>Divisi menjadi Workstream (dibuat otomatis bila belum ada).</li>
          <li>Nama PIC dicocokkan dengan nama user aktif.</li>
          <li>Status: Belum mulai, Berjalan, Ditahan, Selesai, Batal. Progres 100% dianggap Selesai.</li>
          <li>
            Import ulang file yang sudah diperbarui aman: task dengan Divisi dan judul yang sama diperbarui, bukan
            dobel. Mengganti judul atau Divisi di Excel membuat task baru.
          </li>
          <li>Kalau ada baris yang salah, tidak ada yang disimpan dan daftar kesalahannya ditampilkan.</li>
          <li>Import tidak mengirim notifikasi atau email ke PIC.</li>
        </ul>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-5 shadow dark:bg-zinc-900">
        <ImportTimelineForm
          projects={(projects ?? []) as { id: string; code: string; name: string }[]}
          users={users}
          presetProject={presetProject}
        />
      </div>
    </AppShell>
  )
}
