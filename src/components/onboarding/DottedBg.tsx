export function DottedBg({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-start justify-center py-10"
      style={{
        backgroundImage: `radial-gradient(circle, #C9C4B9 1px, transparent 1px), radial-gradient(ellipse at 30% 20%, #FFF9E6 0%, #F5F3EE 50%, #EDE9E0 100%)`,
        backgroundSize: '22px 22px, 100% 100%',
      }}
    >
      {children}
    </div>
  )
}
