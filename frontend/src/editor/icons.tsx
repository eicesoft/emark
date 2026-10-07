import type { ItemType } from './menu'

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const numStyle = {
  fontSize: 9,
  fill: 'currentColor',
  stroke: 'none',
  textAnchor: 'middle' as const,
}

export function TypeIcon({ type }: { type: ItemType }) {
  switch (type) {
    case 'text':
      return (
        <svg {...base}>
          <path d="M4 7V5h16v2M12 5v14M9 19h6" />
        </svg>
      )
    case 'h1':
      return (
        <svg {...base}>
          <path d="M3 6v12M3 12h6M9 6v12" />
          <text x="17.5" y="17.5" {...numStyle}>
            1
          </text>
        </svg>
      )
    case 'h2':
      return (
        <svg {...base}>
          <path d="M3 6v12M3 12h6M9 6v12" />
          <text x="17.5" y="17.5" {...numStyle}>
            2
          </text>
        </svg>
      )
    case 'h3':
      return (
        <svg {...base}>
          <path d="M3 6v12M3 12h6M9 6v12" />
          <text x="17.5" y="17.5" {...numStyle}>
            3
          </text>
        </svg>
      )
    case 'bullet':
      return (
        <svg {...base}>
          <circle cx="4.5" cy="6" r="1.2" />
          <circle cx="4.5" cy="12" r="1.2" />
          <circle cx="4.5" cy="18" r="1.2" />
          <path d="M9 6h11M9 12h11M9 18h11" />
        </svg>
      )
    case 'ordered':
      return (
        <svg {...base}>
          <path d="M10 6h10M10 12h10M10 18h10" />
          <text x="4.5" y="8.5" {...numStyle} fontSize={7.5}>
            1
          </text>
          <text x="4.5" y="20.5" {...numStyle} fontSize={7.5}>
            2
          </text>
        </svg>
      )
    case 'quote':
      return (
        <svg {...base}>
          <path d="M9.5 7H5v5.5c0 3-1.5 4.5-4 5" />
          <path d="M20.5 7H16v5.5c0 3-1.5 4.5-4 5" />
        </svg>
      )
    case 'code':
      return (
        <svg {...base}>
          <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
        </svg>
      )
    case 'divider':
      return (
        <svg {...base}>
          <path d="M3 12h18" />
          <path d="M7 7h10" opacity="0.45" />
          <path d="M7 17h10" opacity="0.45" />
        </svg>
      )
    default:
      return null
  }
}
