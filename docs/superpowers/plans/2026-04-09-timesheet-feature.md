# Timesheet Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free Timesheet view to `/invoices`, defaulting to it over the existing Invoice tab, with PDF download and CrewDock-branded document design.

**Architecture:** A new `TimesheetDocument` presentational component renders the styled timesheet HTML from props (selected days, user name, project). `InvoicePage` gains an `activeTab` state toggle; both tabs share the existing project/day selection state. PDF capture for timesheets uses the same html2canvas + jsPDF pattern already in `InvoicePage`.

**Tech Stack:** React, TypeScript, date-fns, html2canvas, jsPDF, Tailwind CSS, Supabase

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| **Create** | `src/components/TimesheetDocument.tsx` | Pure presentational component — renders branded timesheet HTML from props |
| **Modify** | `src/pages/InvoicePage.tsx` | Add `activeTab` state, tab toggle UI, `timesheetRef`, `handleTimesheetDownload`, render `TimesheetDocument` |

---

## Task 1: Create `TimesheetDocument` component

**Files:**
- Create: `src/components/TimesheetDocument.tsx`

This component is purely presentational — no data fetching, no side effects. It takes the already-fetched data as props and renders the light-themed branded timesheet.

- [ ] **Step 1: Create the file with types, helpers, and the full component**

```tsx
// src/components/TimesheetDocument.tsx
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
          {/* Logo + wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 26, height: 26, background: '#FFD528', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="15" viewBox="0 0 48 46" fill="none">
                <path fill="#1F1F21" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/>
              </svg>
            </div>
            <span style={{ fontSize: 10, color: '#999', letterSpacing: '0.12em', textTransform: 'uppercase' }}>CrewDock</span>
          </div>
          {/* Name */}
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>{userName}</div>
          {/* Role pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {uniqueRoles.map(role => (
              <span key={role} style={{ fontSize: 10, color: '#555', background: '#f4f4f2', border: '1px solid #e0e0de', borderRadius: 3, padding: '2px 8px' }}>
                {role}
              </span>
            ))}
          </div>
        </div>
        {/* Right: project/client/period */}
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

            {/* Day header — single line */}
            <div style={{ background: '#fafaf8', padding: '13px 32px', borderBottom: '1px solid #ebebeb', display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Day-of-week badge */}
              <div style={{ background: '#FFD528', color: '#1F1F21', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '10px 14px', borderRadius: 4, textAlign: 'center', minWidth: 48, flexShrink: 0 }}>
                {dow}
              </div>
              {/* Date */}
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{dateStr}</div>
              <span style={{ color: '#ccc', flexShrink: 0 }}>·</span>
              {/* Call / Wrap */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
                <span style={{ color: '#bbb', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Call</span>
                <span style={{ color: '#1F1F21', fontWeight: 700 }}>{day.call_time}</span>
                <span style={{ color: '#ccc' }}>·</span>
                <span style={{ color: '#bbb', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Wrap</span>
                <span style={{ color: '#1F1F21', fontWeight: 700 }}>{day.wrap_time}</span>
              </div>
              <div style={{ flex: 1 }} />
              {/* Day total */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Day total</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtAmount(day.grand_total)}</div>
              </div>
            </div>

            {/* Line items */}
            <div style={{ padding: '4px 32px 14px', background: '#fff' }}>

              {/* Base Pay */}
              <div style={{ paddingTop: 12 }}>
                <div style={{ fontSize: 9, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 5 }}>Base Pay</div>
                {/* First line item = the day rate */}
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

              {/* Penalties & Allowances */}
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

              {/* Expenses */}
              {hasExpenses && (
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontSize: 9, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 5 }}>Expenses</div>
                  <Row desc={day.expenses_notes || 'Expenses'} qty="—" rate="—" amount={fmtAmount(day.expenses_amount!)} />
                </div>
              )}

              {/* Day subtotal */}
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
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/milocosemans/Git/apa-crew-calc && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing errors unrelated to `TimesheetDocument.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/components/TimesheetDocument.tsx
git commit -m "feat: add TimesheetDocument presentational component"
```

---

## Task 2: Add tab toggle and wire TimesheetDocument into InvoicePage

**Files:**
- Modify: `src/pages/InvoicePage.tsx`

This task adds the `activeTab` state, the tab toggle UI at the top of the page, and renders the `TimesheetDocument` in the timesheet tab. The project/day selection sidebar remains visible for both tabs.

- [ ] **Step 1: Add import for `TimesheetDocument` at the top of `InvoicePage.tsx`**

Find the existing imports block (around line 1-25). Add after the existing local imports:

```tsx
import { TimesheetDocument } from '@/components/TimesheetDocument';
import type { TimesheetDay } from '@/components/TimesheetDocument';
```

- [ ] **Step 2: Add `activeTab` state and `timesheetRef`**

Find the existing refs block (around line 123-124):
```tsx
const projectPickerRef = useRef<HTMLDivElement>(null);
const invoiceRef = useRef<HTMLDivElement>(null);
```

Add after those two lines:
```tsx
const timesheetRef = useRef<HTMLDivElement>(null);
const [activeTab, setActiveTab] = useState<'timesheet' | 'invoice'>('timesheet');
```

- [ ] **Step 3: Add `handleTimesheetDownload` function**

Find `handleDownload` (around line 383). Add a new function directly after `handleDownload`'s closing brace:

```tsx
const handleTimesheetDownload = async () => {
  if (!timesheetRef.current) return;
  setDownloading(true);
  try {
    const el = timesheetRef.current;
    const prevWidth        = el.style.width;
    const prevBorderRadius = el.style.borderRadius;
    const prevBoxShadow    = el.style.boxShadow;
    el.style.width        = '794px';
    el.style.borderRadius = '0';
    el.style.boxShadow    = 'none';

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    el.style.width        = prevWidth;
    el.style.borderRadius = prevBorderRadius;
    el.style.boxShadow    = prevBoxShadow;

    const imgData     = canvas.toDataURL('image/png', 1);
    const pdf         = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfWidth    = pdf.internal.pageSize.getWidth();
    const imgHeightMm = (canvas.height / canvas.width) * pdfWidth;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeightMm);

    const slug    = (selectedProject?.name ?? 'timesheet').toLowerCase().replace(/\s+/g, '-');
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    pdf.save(`timesheet-${slug}-${dateStr}.pdf`);
  } finally {
    setDownloading(false);
  }
};
```

- [ ] **Step 4: Add tab toggle UI at the top of the page content**

Search for the opening of the page content area — look for the `<div className="space-y-6">` or similar container that wraps the left/right columns. It will be inside the `return (` block, likely around line 470-490.

Find the `<Card>` that contains the project picker (it starts with something like `<Card className="..." ...>`). Add the tab toggle **above** that Card:

```tsx
{/* ── Tab toggle ── */}
<div className="flex gap-2 mb-2">
  <button
    type="button"
    onClick={() => setActiveTab('timesheet')}
    className={cn(
      'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
      activeTab === 'timesheet'
        ? 'bg-[#FFD528] text-[#1F1F21]'
        : 'bg-muted text-muted-foreground hover:text-foreground'
    )}
  >
    Timesheet
  </button>
  <button
    type="button"
    onClick={() => setActiveTab('invoice')}
    className={cn(
      'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
      activeTab === 'invoice'
        ? 'bg-[#FFD528] text-[#1F1F21]'
        : 'bg-muted text-muted-foreground hover:text-foreground'
    )}
  >
    Invoice
    {!isPremium && <Lock className="h-3 w-3" />}
  </button>
</div>
```

- [ ] **Step 5: Wrap the existing right-column invoice preview in a conditional**

Find the comment `{/* ── Right: Invoice Preview ──...*/}` (around line 629). The right column `<div className="space-y-3">` contains the Download/Send buttons and the `invoiceRef` div.

Wrap the **entire right column** in:

```tsx
{activeTab === 'timesheet' ? (
  /* ── Timesheet tab ── */
  <div className="space-y-3">
    <div className="flex gap-2">
      <Button
        className="flex-1 gap-2 bg-[#FFD528] text-[#1F1F21] hover:bg-[#FFD528]/90"
        onClick={handleTimesheetDownload}
        disabled={downloading || selectedDays.length === 0}
      >
        {downloading
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          : <><Download className="h-4 w-4" /> Download PDF</>
        }
      </Button>
      <Button
        variant="outline"
        className="gap-1.5"
        onClick={() => setActiveTab('invoice')}
      >
        Invoice {!isPremium && <Lock className="h-3 w-3" />}
      </Button>
    </div>
    <div
      ref={timesheetRef}
      className="rounded-2xl shadow-lg overflow-hidden"
    >
      <TimesheetDocument
        userName={companyName || user?.email || ''}
        projectName={selectedProject?.name ?? ''}
        clientName={selectedProject?.client_name ?? null}
        selectedDays={selectedDays as TimesheetDay[]}
      />
    </div>
  </div>
) : (
  /* ── Invoice tab — existing content, unchanged ── */
  <div className="space-y-3">
    {/* ...existing invoice right column content stays here exactly as-is... */}
  </div>
)}
```

**Important:** The existing invoice right-column JSX goes inside the second branch unchanged. Do not modify any of its existing code.

- [ ] **Step 6: Verify TypeScript**

```bash
cd /Users/milocosemans/Git/apa-crew-calc && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 7: Commit and push**

```bash
git add src/pages/InvoicePage.tsx
git commit -m "feat: add timesheet tab to InvoicePage with PDF download"
git push
```

---

## Task 3: Manual verification in production

After Vercel deploys (triggered by the push in Task 2):

- [ ] Open `app.crewdock.app/invoices`
- [ ] Confirm the page defaults to the Timesheet tab
- [ ] Pick a project with multiple days and different roles
- [ ] Confirm: role pills in header show all unique roles
- [ ] Confirm: each day header shows `[DON]  Date  ·  Call HH:MM  ·  Wrap HH:MM`
- [ ] Confirm: base pay first line reads `Basic Working Day — Gaffer` (or relevant day type + role)
- [ ] Confirm: client shows `—` when empty, client name when set
- [ ] Click **Download PDF** — verify the PDF renders correctly at A4 size
- [ ] Click **Invoice** tab — confirm existing invoice functionality is completely unchanged
- [ ] As a free user (or with isPremium forced false): confirm Invoice tab shows lock icon on button; Timesheet tab fully accessible
- [ ] Confirm no console errors

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Timesheet tab defaults on `/invoices` | Task 2, Step 4 — `useState('timesheet')` |
| Free feature, no pro lock | Task 2, Step 5 — timesheet branch has no ProLockOverlay |
| Invoice tab secondary, Pro-locked for free users | Task 2, Step 4 — lock icon on tab; existing ProLockOverlay untouched |
| CrewDock logo (bolt SVG on yellow) | Task 1 — inlined in TimesheetDocument header |
| Company name from user_settings | Task 2, Step 5 — `companyName` prop (already loaded in InvoicePage) |
| Role pills (unique roles) | Task 1 — `Array.from(new Set(...))` |
| Client dash when empty | Task 1 — `{clientName \|\| '—'}` |
| Period from min/max work_date | Task 1 — `period` derived from sorted days |
| Single-line day header: badge · date · call · wrap | Task 1 — day header flex row |
| Base pay: `{Day Type} — {Role}` | Task 1 — `\`${dayLabel} — ${day.role_name}\`` |
| DAY_TYPE_LABELS mapping (all 8 types) | Task 1 — `DAY_TYPE_LABELS` const |
| Overtime rows from `result_json.lineItems` | Task 1 — `lineItems.slice(1)` |
| Penalties group (only if present) | Task 1 — `hasPenalties` guard |
| Expenses group (only if present) | Task 1 — `hasExpenses` guard |
| Day subtotal per day | Task 1 — subtotal row at bottom of each day |
| Grand total in footer | Task 1 — `grandTotal` in footer |
| No VAT, no reference number | Task 1 — not rendered |
| Download PDF (A4 portrait, 2× scale) | Task 2, Step 3 — `handleTimesheetDownload` |
| Filename: `timesheet-{project}-{date}.pdf` | Task 2, Step 3 — slug + dateStr |
| Invoice functionality unchanged | Task 2, Step 5 — existing JSX moved into second branch verbatim |

**Placeholder scan:** None found.

**Type consistency:** `TimesheetDay` exported from `TimesheetDocument.tsx`, imported and cast in `InvoicePage.tsx`. `fmtAmount` used consistently throughout `TimesheetDocument`. `handleTimesheetDownload` uses `selectedProject` and `format` already in scope in `InvoicePage`.
