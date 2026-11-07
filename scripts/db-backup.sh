#!/usr/bin/env bash
# Backup logis database Supabase ke private/backups/<tanggal-jam>/ (gitignored).
# Butuh: Supabase CLI yang sudah login + pg_dump/psql (paket `postgresql`). Docker tidak perlu.
# Tidak butuh password database: CLI membuat login role sementara.
# File berisi DATA PRIBADI user: jangan commit, jangan kirim lewat chat.
set -euo pipefail
cd "$(dirname "$0")/.."

ref=$(node -e "import('./scripts/supabase-ref.mjs').then(m => console.log(m.projectRef()))")
final="private/backups/$(date +%Y-%m-%d_%H%M)"
# Ditulis ke .partial dulu; folder tanpa .partial = backup lengkap dan lolos cek.
dir="$final.partial"
mkdir -p "$dir"
chmod 700 private/backups "$dir"

# `db dump` biasa memaksa Docker. --dry-run mencetak skrip pg_dump resmi CLI
# (dengan login role sementara); skrip itu dijalankan langsung lewat pipe,
# jadi password sementara tidak pernah ditulis ke disk.
dump() { local out=$1; shift; supabase db dump --remote="$ref" --agent no --dry-run "$@" 2>/dev/null | bash > "$out"; }
dump "$dir/roles.sql" --role-only
dump "$dir/schema.sql"
# Data hanya schema yang dipakai aplikasi. Tabel internal storage (mis.
# storage.buckets_vectors) ditolak saat restore ("permission denied"), dan
# aplikasi tidak memakai Supabase Storage (uji restore 7 Nov 2026).
dump "$dir/data.sql" --data-only --use-copy --schema public,auth
chmod 600 "$dir"/*.sql

# Gagal keras bila dump kosong/terpotong (mis. login CLI kedaluwarsa), supaya
# timer systemd tercatat failed, bukan "sukses" dengan file kosong.
grep -q '^COPY "auth"."users"' "$dir/data.sql" || { echo "GAGAL: data.sql tanpa auth.users" >&2; exit 1; }
grep -q 'CREATE TABLE IF NOT EXISTS "public"."tasks"' "$dir/schema.sql" || { echo "GAGAL: schema.sql tanpa tabel tasks" >&2; exit 1; }

( cd "$dir" && sha256sum roles.sql schema.sql data.sql > SHA256SUMS && chmod 600 SHA256SUMS )
mv "$dir" "$final"
echo "Backup selesai: $final"
ls -l "$final"

# Salinan kedua terenkripsi di Google Drive (lihat docs/backup.md). Dilewati
# bila remote belum dibuat di laptop ini; gagal upload = skrip gagal.
remote=taskmgmt-backup-enkripsi
if rclone listremotes 2>/dev/null | grep -qx "$remote:"; then
  rclone copy "$final" "$remote:backups/$(basename "$final")"
  rclone cryptcheck "$final" "$remote:backups/$(basename "$final")"
  echo "Salinan terenkripsi di Drive: $remote:backups/$(basename "$final")"
else
  echo "PERINGATAN: remote $remote belum ada, salinan Drive dilewati." >&2
fi
