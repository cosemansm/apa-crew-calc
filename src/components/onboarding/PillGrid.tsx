interface PillGridProps {
  items: string[]
  selected: string | null
  onSelect: (value: string) => void
  columns?: number
}

export function PillGrid({ items, selected, onSelect, columns = 2 }: PillGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
      {items.map((item) => {
        const isSel = selected === item
        return (
          <button
            key={item}
            type="button"
            onClick={() => onSelect(item)}
            className="transition-all"
            style={{
              padding: '14px 10px',
              borderRadius: 12,
              background: isSel ? '#FFF8D6' : '#fff',
              border: isSel ? '2px solid #FFD528' : '1px solid #E5E2DC',
              fontSize: 13,
              fontWeight: isSel ? 600 : 400,
              textAlign: 'center',
              boxShadow: isSel ? '0 2px 12px rgba(255,213,40,0.15)' : 'none',
            }}
          >
            {item}
          </button>
        )
      })}
    </div>
  )
}
