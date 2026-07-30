import { cn } from '../../lib/cn'

const palette = [
  'bg-dept-repair-bg text-dept-repair-text',
  'bg-dept-finance-bg text-dept-finance-text',
  'bg-dept-sales-bg text-dept-sales-text',
  'bg-dept-logistics-bg text-dept-logistics-text',
]

function hashToIndex(input: string, mod: number) {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash % mod
}

export function Avatar({
  initials,
  size = 'md',
  className,
}: {
  initials: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-12 w-12 text-lg',
  }[size]
  const colorClasses = palette[hashToIndex(initials, palette.length)]

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium',
        sizeClasses,
        colorClasses,
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
