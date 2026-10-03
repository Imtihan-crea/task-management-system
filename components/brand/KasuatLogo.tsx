import Image from 'next/image'

/**
 * Logo Kasuat (§41–45).
 *
 * Aset yang tersedia: PNG varian putih (teks putih + mark gold).
 * Dipakai di permukaan gelap (header dark, login) sesuai varian White
 * pada guideline. Varian Gold+Black untuk background terang BELUM ada —
 * jangan paksa logo putih di background terang.
 */
export function KasuatLogo({ height = 28 }: { height?: number }) {
  return (
    <Image
      src="/brand/kasuat-logo-white.png"
      alt="Kasuat"
      height={height}
      width={height * 4}
      priority
      style={{ height, width: 'auto' }}
    />
  )
}
