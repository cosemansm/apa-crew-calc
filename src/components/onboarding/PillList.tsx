interface PillListItem {
  value: string
  label: string
  icon?: string
}

interface PillListProps {
  items: PillListItem[]
  selected: string | null
  onSelect: (value: string) => void
}

export function PillList({ items, selected, onSelect }: PillListProps) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const isSel = selected === item.value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            className="text-left transition-all"
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              background: isSel ? '#FFF8D6' : '#fff',
              border: isSel ? '2px solid #FFD528' : '1px solid #E5E2DC',
              fontSize: 14,
              fontWeight: isSel ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: isSel ? '0 2px 12px rgba(255,213,40,0.15)' : 'none',
            }}
          >
            {item.icon && <span style={{ fontSize: 20 }}>{item.icon}</span>}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
