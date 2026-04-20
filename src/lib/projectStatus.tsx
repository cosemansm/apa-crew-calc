// Shared project status types and components used by DashboardPage and ProjectsPage.

export type ProjectStatus = 'ongoing' | 'finished' | 'invoiced' | 'paid';

export const STATUS_CONFIG: Record<ProjectStatus, {
  label: string;
  calendarBg: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}> = {
  ongoing:  { label: 'Ongoing',  calendarBg: '#3B82F6', badgeBg: '#EFF6FF', badgeText: '#1D4ED8', badgeBorder: '#BFDBFE' },
  finished: { label: 'Finished', calendarBg: '#22C55E', badgeBg: '#F0FDF4', badgeText: '#15803D', badgeBorder: '#BBF7D0' },
  invoiced: { label: 'Invoiced', calendarBg: '#8B5CF6', badgeBg: '#F5F3FF', badgeText: '#6D28D9', badgeBorder: '#DDD6FE' },
  paid:     { label: 'Paid',     calendarBg: '#F59E0B', badgeBg: '#FFFBEB', badgeText: '#92400E', badgeBorder: '#FDE68A' },
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ongoing;
  return (
    <span
      style={{
        backgroundColor: cfg.badgeBg,
        color: cfg.badgeText,
        border: `1px solid ${cfg.badgeBorder}`,
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        padding: '2px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: cfg.calendarBg, display: 'inline-block', flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}
