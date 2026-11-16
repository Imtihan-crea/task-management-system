/**
 * Akun tanpa email asli memakai ID login `nama@<org>.invalid` (TLD .invalid
 * dicadangkan RFC 2606, tidak pernah bisa menerima email). Jangan kirim ke sana.
 */
export const isPlaceholderEmail = (email: string) => /\.invalid$/i.test(email.trim())
