import { format, parseISO } from 'date-fns';

const DAY_TYPE_LABELS: Record<string, string> = {
  basic_working: 'Basic Working Day',
  continuous_working: 'Continuous Working Day',
  prep: 'Prep Day',
  recce: 'Recce Day',
  build_strike: 'Build / Strike Day',
  pre_light: 'Pre-Light Day',
  rest: 'Rest Day',
  travel: 'Travel Day',
};

interface DayResultJson {
  lineItems?: { description: string; hours?: number; rate?: number; total: number; timeFrom?: string; timeTo?: string }[];
  penalties?: { description: string; hours?: number; rate?: number; total: number }[];
  travelPay?: number;
  mileage?: number;
  mileageMiles?: number;
}

export interface TimesheetDay {
  id: string;
  work_date: string;
  role_name: string;
  day_type: string;
  call_time: string;
  wrap_time: string;
  grand_total: number;
  result_json?: DayResultJson;
  expenses_amount?: number;
  expenses_notes?: string;
}

interface TimesheetDocumentProps {
  userName: string;
  projectName: string;
  clientName: string | null;
  selectedDays: TimesheetDay[];
}

function fmtAmount(n: number) {
  return `£${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function Row({ desc, qty, rate, amount }: { desc: string; qty: string; rate: string; amount: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto auto auto',
      gap: 12,
      alignItems: 'center',
      padding: '6px 0',
      borderBottom: '1px solid #f2f2f0',
      fontSize: 11,
    }}>
      <div style={{ color: '#333' }}>{desc}</div>
      <div style={{ color: '#aaa', fontSize: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>{qty}</div>
      <div style={{ color: '#bbb', fontSize: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>{rate}</div>
      <div style={{ color: '#1F1F21', fontSize: 11, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 64 }}>{amount}</div>
    </div>
  );
}

export function TimesheetDocument({ userName, projectName, clientName, selectedDays }: TimesheetDocumentProps) {
  const sorted = [...selectedDays].sort((a, b) => a.work_date.localeCompare(b.work_date));
  const uniqueRoles = Array.from(new Set(sorted.map(d => d.role_name)));
  const grandTotal = sorted.reduce((sum, d) => sum + (d.grand_total || 0), 0);

  const period = sorted.length === 0 ? '' : (() => {
    const first = format(parseISO(sorted[0].work_date), 'd MMM yyyy');
    const last  = format(parseISO(sorted[sorted.length - 1].work_date), 'd MMM yyyy');
    return first === last ? first : `${first} – ${last}`;
  })();

  return (
    <div style={{ backgroundColor: '#ffffff', fontFamily: "'JetBrains Mono', 'Courier New', monospace", color: '#1F1F21' }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: '3px solid #FFD528', padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 26, height: 26, background: '#FFD528', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="15" viewBox="0 0 48 46" fill="none">
                <path fill="#1F1F21" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/>
              </svg>
            </div>
            <span style={{ fontSize: 10, color: '#999', letterSpacing: '0.12em', textTransform: 'uppercase' }}>CrewDock</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>{userName}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {uniqueRoles.map(role => (
              <span key={role} style={{ fontSize: 10, color: '#555', background: '#f4f4f2', border: '1px solid #e0e0de', borderRadius: 3, padding: '2px 8px' }}>
                {role}
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Timesheet</div>
          <div style={{ fontSize: 11, color: '#888', lineHeight: 1.75 }}>
            <span style={{ color: '#1F1F21', fontWeight: 600 }}>Project</span> : {projectName}<br />
            <span style={{ color: '#1F1F21', fontWeight: 600 }}>Client</span> : {clientName || '—'}<br />
            <span style={{ color: '#1F1F21', fontWeight: 600 }}>Period</span> : {period}
          </div>
        </div>
      </div>

      {/* ── Days ── */}
      {sorted.map((day, i) => {
        const dayLabel = DAY_TYPE_LABELS[day.day_type] ?? day.day_type;
        const dow      = format(parseISO(day.work_date), 'EEE').toUpperCase();
        const dateStr  = format(parseISO(day.work_date), 'd MMMM yyyy');
        const rj       = day.result_json ?? {};
        const lineItems  = rj.lineItems  ?? [];
        const penalties  = rj.penalties  ?? [];
        const hasPenalties = penalties.length > 0 || !!rj.travelPay || !!rj.mileage;
        const hasExpenses  = !!day.expenses_amount && day.expenses_amount > 0;

        return (
          <div key={day.id} style={{ borderBottom: i < sorted.length - 1 ? '1px solid #ebebeb' : 'none' }}>
            <div style={{ background: '#fafaf8', padding: '13px 32px', borderBottom: '1px solid #ebebeb', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ background: '#FFD528', color: '#1F1F21', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '10px 14px', borderRadius: 4, textAlign: 'center', minWidth: 48, flexShrink: 0 }}>
                {dow}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{dateStr}</div>
              <span style={{ color: '#ccc', flexShrink: 0 }}>·</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
                <span style={{ color: '#bbb', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Call</span>
                <span style={{ color: '#1F1F21', fontWeight: 700 }}>{day.call_time}</span>
                <span style={{ color: '#ccc' }}>·</span>
                <span style={{ color: '#bbb', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Wrap</span>
                <span style={{ color: '#1F1F21', fontWeight: 700 }}>{day.wrap_time}</span>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Day total</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtAmount(day.grand_total)}</div>
              </div>
            </div>

            <div style={{ padding: '4px 32px 14px', background: '#fff' }}>
              <div style={{ paddingTop: 12 }}>
                <div style={{ fontSize: 9, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 5 }}>Base Pay</div>
                {lineItems.length > 0 ? (
                  <>
                    <Row
                      desc={`${dayLabel} — ${day.role_name}`}
                      qty="1 day"
                      rate={lineItems[0].rate ? `${fmtAmount(lineItems[0].rate)}/day` : ''}
                      amount={fmtAmount(lineItems[0].total)}
                    />
                    {lineItems.slice(1).map((item, j) => (
                      <Row
                        key={j}
                        desc={item.description}
                        qty={item.hours != null ? `${item.hours} hrs` : '—'}
                        rate={item.rate != null ? `£${item.rate.toFixed(2)}/hr` : '—'}
                        amount={fmtAmount(item.total)}
                      />
                    ))}
                  </>
                ) : (
                  <Row
                    desc={`${dayLabel} — ${day.role_name}`}
                    qty="1 day"
                    rate="—"
                    amount={fmtAmount(day.grand_total)}
                  />
                )}
              </div>

              {hasPenalties && (
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontSize: 9, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 5 }}>Penalties &amp; Allowances</div>
                  {penalties.map((p, j) => (
                    <Row key={j} desc={p.description} qty={p.hours != null ? `${p.hours} hrs` : '—'} rate="—" amount={fmtAmount(p.total)} />
                  ))}
                  {rj.travelPay ? <Row desc="Travel pay" qty="—" rate="—" amount={fmtAmount(rj.travelPay)} /> : null}
                  {rj.mileage   ? <Row desc={`Mileage (${rj.mileageMiles ?? 0} mi)`} qty={`${rj.mileageMiles ?? 0} mi`} rate="—" amount={fmtAmount(rj.mileage)} /> : null}
                </div>
              )}

              {hasExpenses && (
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontSize: 9, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 5 }}>Expenses</div>
                  <Row desc={day.expenses_notes || 'Expenses'} qty="—" rate="—" amount={fmtAmount(day.expenses_amount!)} />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '10px 0 0', borderTop: '1px solid #e8e8e6', marginTop: 4 }}>
                <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Day subtotal</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1F1F21', textAlign: 'right', minWidth: 64 }}>{fmtAmount(day.grand_total)}</div>
              </div>
            </div>
          </div>
        );
      })}

      {/* ── Footer ── */}
      <div style={{ background: '#fafaf8', borderTop: '1px solid #e8e8e6', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: '#bbb', lineHeight: 1.6 }}>
          Generated by CrewDock · APA Rates 2025<br />
          This timesheet is not a VAT invoice.
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#aaa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>Total due</div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmtAmount(grandTotal)}</div>
        </div>
      </div>
    </div>
  );
}
