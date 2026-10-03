import Image from 'next/image'

/**
 * Logo Kasuat (§41–45). Variant mengikuti background:
 * - terang → Gold + Black
 * - gelap → White
 *
 * Aturan: jangan ubah warna, stretch, rotate, shadow, glow.
 * Clearspace minimum = tinggi simbol (dijaga via padding parent).
 */
export function KasuatLogo({
  variant = 'color',
  height = 28,
}: {
  variant?: 'color' | 'white'
  height?: number
}) {
  const src =
    variant === 'white'
      ? '/brand/kasuat-logo-white.svg'
      : '/brand/kasuat-logo.svg'

  return (
    <Image
      src={src}
      alt="Kasuat"
      height={height}
      width={height * 4}
      priority
      style={{ height, width: 'auto' }}
    />
  )
}

export function KasuatMark({
  variant = 'color',
  size = 32,
  decorative = false,
}: {
  variant?: 'color' | 'white'
  size?: number
  decorative?: boolean
}) {
  const src =
    variant === 'white' ? '/brand/kasuat-mark-white.svg' : '/brand/kasuat-mark.svg'

  return (
    <Image
      src={src}
      alt={decorative ? '' : 'Kasuat'}
      aria-hidden={decorative || undefined}
      height={size}
      width={size}
      style={{ height: size, width: size }}
    />
  )
}
