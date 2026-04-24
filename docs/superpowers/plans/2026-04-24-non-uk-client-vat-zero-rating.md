# Non-UK Client VAT Zero-Rating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zero-rate VAT on invoices when the user is VAT registered but the client is based outside the UK.

**Architecture:** Add a `clientOutsideUK` boolean state to InvoicePage, conditionally shown as a checkbox when the user is VAT registered. This flag flows into the VAT calculation, invoice document rendering, email message, and all three bookkeeping export payloads. Each export backend uses the flag to select the appropriate zero-rated tax code.

**Tech Stack:** React (TypeScript), Vercel serverless functions (TypeScript)

---

### Task 1: Add checkbox state and UI to InvoicePage

**Files:**
- Modify: `src/pages/InvoicePage.tsx:86-96` (state declarations)
- Modify: `src/pages/InvoicePage.tsx:790-793` (client details UI section)

- [ ] **Step 1: Add state variable**

After line 95 (`const [vatRegistered, setVatRegistered] = useState(false);`), add:

```typescript
const [clientOutsideUK, setClientOutsideUK] = useState(false);
```

- [ ] **Step 2: Add checkbox UI below client address input**

After the client address `<div>` block (line 790-793), add:

```tsx
{vatRegistered && (
  <div className="flex items-center gap-2 pt-1">
    <input
      type="checkbox"
      id="clientOutsideUK"
      checked={clientOutsideUK}
      onChange={e => setClientOutsideUK(e.target.checked)}
      className="h-4 w-4 rounded border-border"
    />
    <Label htmlFor="clientOutsideUK" className="text-sm font-normal cursor-pointer">
      Client is based outside the UK
    </Label>
  </div>
)}
```

- [ ] **Step 3: Verify the checkbox appears**

Run: `npm run dev`
Navigate to the invoice page. The checkbox should only be visible when the user is VAT registered. It should toggle on and off.

- [ ] **Step 4: Commit**

```bash
git add src/pages/InvoicePage.tsx
git commit -m "feat(invoice): add 'client outside UK' checkbox for VAT zero-rating"
```

---

### Task 2: Update VAT calculation and invoice document rendering

**Files:**
- Modify: `src/pages/InvoicePage.tsx:381-382` (VAT calculation)
- Modify: `src/pages/InvoicePage.tsx:1251-1282` (invoice document VAT section)
- Modify: `src/pages/InvoicePage.tsx:565` (email message)

- [ ] **Step 1: Update VAT calculation**

Change line 381-382 from:

```typescript
const vatAmount = vatNumber ? totalAmount * 0.2 : 0;
const totalWithVat = totalAmount + vatAmount;
```

To:

```typescript
const vatAmount = (vatNumber && !clientOutsideUK) ? totalAmount * 0.2 : 0;
const totalWithVat = totalAmount + vatAmount;
```

- [ ] **Step 2: Update invoice document VAT section**

Replace the VAT summary block (lines 1251-1282) — the content inside `{vatNumber ? ( ... ) : ( ... )}`:

```tsx
{vatNumber ? (
  <>
    <p style={{ color: '#9A9A9A', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
      Summary
    </p>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
      <span style={{ color: '#9A9A9A', fontSize: '12px' }}>Subtotal (ex. VAT)</span>
      <span style={{ color: '#FFFFFF', fontSize: '12px', fontFamily: 'monospace' }}>{currencySymbol}{totalAmount.toFixed(2)}</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
      <span style={{ color: '#9A9A9A', fontSize: '12px' }}>VAT ({clientOutsideUK ? '0' : '20'}%)</span>
      <span style={{ color: '#FFFFFF', fontSize: '12px', fontFamily: 'monospace' }}>{currencySymbol}{vatAmount.toFixed(2)}</span>
    </div>
    {clientOutsideUK && (
      <p style={{ color: '#9A9A9A', fontSize: '10px', margin: '0 0 10px', fontStyle: 'italic' }}>
        Outside the scope of UK VAT
      </p>
    )}
    <div style={{ borderTop: '1px solid #3A3A3C', paddingTop: '10px', marginBottom: '6px' }}>
      <p style={{ color: '#9A9A9A', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>
        Total Due {clientOutsideUK ? '' : '(inc. VAT)'}
      </p>
      <p style={{ color: '#FFD528', fontWeight: '800', fontSize: '26px', fontFamily: 'monospace', margin: '0' }}>
        {currencySymbol}{totalWithVat.toFixed(2)}
      </p>
    </div>
  </>
) : (
  <>
    <p style={{ color: '#9A9A9A', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>
      Total Due
    </p>
    <p style={{ color: '#FFD528', fontWeight: '800', fontSize: '26px', fontFamily: 'monospace', margin: '0 0 6px' }}>
      {currencySymbol}{totalAmount.toFixed(2)}
    </p>
  </>
)}
```

- [ ] **Step 3: Update email message**

Change line 565 from:

```typescript
`Hi ${clientName || 'there'},\n\nPlease find attached invoice ${invoiceNumber} for ${selectedProject?.name || 'recent work'}.\n\nTotal amount due: ${currencySymbol}${(vatNumber ? totalWithVat : totalAmount).toFixed(2)}${vatNumber ? ' (inc. VAT)' : ''}\nPayment terms: 30 days from receipt.\n\nKind regards,\n${companyName || 'Your Name'}`
```

To:

```typescript
`Hi ${clientName || 'there'},\n\nPlease find attached invoice ${invoiceNumber} for ${selectedProject?.name || 'recent work'}.\n\nTotal amount due: ${currencySymbol}${(vatNumber ? totalWithVat : totalAmount).toFixed(2)}${vatNumber ? (clientOutsideUK ? '' : ' (inc. VAT)') : ''}\nPayment terms: 30 days from receipt.\n\nKind regards,\n${companyName || 'Your Name'}`
```

- [ ] **Step 4: Verify invoice rendering**

Run: `npm run dev`
Test these scenarios on the invoice page:
1. VAT registered + client outside UK checked: VAT shows 0%, note "Outside the scope of UK VAT" appears, total equals subtotal
2. VAT registered + client outside UK unchecked: VAT shows 20% as before
3. Not VAT registered: no VAT section, unchanged

- [ ] **Step 5: Commit**

```bash
git add src/pages/InvoicePage.tsx
git commit -m "feat(invoice): zero-rate VAT for non-UK clients with scope note"
```

---

### Task 3: Pass clientOutsideUK flag to bookkeeping exports

**Files:**
- Modify: `src/pages/InvoicePage.tsx:274-346` (export handler calls)
- Modify: `src/services/bookkeeping/freeagent.ts:30-38` (FreeAgentExportPayload interface)
- Modify: `src/services/bookkeeping/freeagent.ts:261` (tax rate logic)
- Modify: `src/services/bookkeeping/xero.ts:26-34` (XeroExportPayload interface)
- Modify: `src/services/bookkeeping/quickbooks.ts:27-35` (QBOExportPayload interface)

- [ ] **Step 1: Add clientOutsideUK to FreeAgentExportPayload**

In `src/services/bookkeeping/freeagent.ts`, change the interface (line 30-38):

```typescript
export interface FreeAgentExportPayload {
  clientName: string;
  projectName: string;
  jobReference: string | null;
  invoiceNumber: string;
  days: InvoiceDay[];
  vatRegistered: boolean;
  clientOutsideUK: boolean;
  detailed: boolean;
}
```

- [ ] **Step 2: Update FreeAgent tax rate logic**

Change line 261 from:

```typescript
const taxRate = payload.vatRegistered ? '20.0' : '0.0';
```

To:

```typescript
const taxRate = (payload.vatRegistered && !payload.clientOutsideUK) ? '20.0' : '0.0';
```

- [ ] **Step 3: Add clientOutsideUK to XeroExportPayload**

In `src/services/bookkeeping/xero.ts`, change the interface (line 26-34):

```typescript
export interface XeroExportPayload {
  clientName: string;
  projectName: string;
  jobReference: string | null;
  invoiceNumber: string;
  days: InvoiceDay[];
  vatRegistered: boolean;
  clientOutsideUK: boolean;
  detailed: boolean;
}
```

- [ ] **Step 4: Add clientOutsideUK to QBOExportPayload**

In `src/services/bookkeeping/quickbooks.ts`, change the interface (line 27-35):

```typescript
export interface QBOExportPayload {
  clientName: string;
  projectName: string;
  jobReference: string | null;
  invoiceNumber: string;
  days: InvoiceDay[];
  vatRegistered: boolean;
  clientOutsideUK: boolean;
  detailed: boolean;
}
```

- [ ] **Step 5: Pass clientOutsideUK in all three export calls in InvoicePage**

In `src/pages/InvoicePage.tsx`, update the three export handler payloads:

**FreeAgent** (line 274-282) — add `clientOutsideUK` to the payload object:

```typescript
const { invoiceUrl } = await exportToFreeAgent(user.id, {
  clientName,
  projectName: selectedProject?.name ?? '',
  jobReference: jobReference.trim() || null,
  invoiceNumber,
  days: selectedDays,
  vatRegistered,
  clientOutsideUK,
  detailed: faDetailed,
});
```

**Xero** (line 304-312) — add `clientOutsideUK` to the payload object:

```typescript
const { invoiceUrl } = await exportToXero(user.id, {
  clientName,
  projectName: selectedProject?.name ?? '',
  jobReference: jobReference.trim() || null,
  invoiceNumber,
  days: selectedDays,
  vatRegistered,
  clientOutsideUK,
  detailed: xeroDetailed,
});
```

**QuickBooks** (line 339-347) — add `clientOutsideUK` to the payload object:

```typescript
const { invoiceUrl } = await exportToQBO(user.id, {
  clientName,
  projectName: selectedProject?.name ?? '',
  jobReference: jobReference.trim() || null,
  invoiceNumber,
  days: selectedDays,
  vatRegistered,
  clientOutsideUK,
  detailed: qboDetailed,
});
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/InvoicePage.tsx src/services/bookkeeping/freeagent.ts src/services/bookkeeping/xero.ts src/services/bookkeeping/quickbooks.ts
git commit -m "feat(bookkeeping): pass clientOutsideUK flag to all export services"
```

---

### Task 4: Update Xero and QuickBooks serverless API handlers

**Files:**
- Modify: `api/xero/export-invoice.ts:219-224` (payload type + tax type logic)
- Modify: `api/xero/export-invoice.ts:276` (destructure from req.body)
- Modify: `api/quickbooks/export-invoice.ts:379-385` (payload type + tax code logic)
- Modify: `api/quickbooks/export-invoice.ts:433` (destructure from req.body)

- [ ] **Step 1: Update Xero export payload type and tax logic**

In `api/xero/export-invoice.ts`, add `clientOutsideUK` to the payload type (around line 220):

```typescript
vatRegistered: boolean;
clientOutsideUK: boolean;
detailed: boolean;
```

Update the tax type logic (line 224) from:

```typescript
const taxType = payload.vatRegistered ? 'OUTPUT2' : 'NONE';
```

To:

```typescript
const taxType = (payload.vatRegistered && !payload.clientOutsideUK) ? 'OUTPUT2' : 'NONE';
```

Update the destructure (line 276) to include `clientOutsideUK`:

```typescript
const { userId, clientName, projectName, jobReference, invoiceNumber, days, vatRegistered, clientOutsideUK, detailed } = req.body;
```

And pass it through to the createXeroInvoice call (line 286):

```typescript
clientName, projectName, jobReference, invoiceNumber, days, vatRegistered, clientOutsideUK, detailed,
```

- [ ] **Step 2: Update QuickBooks export payload type and tax logic**

In `api/quickbooks/export-invoice.ts`, add `clientOutsideUK` to the payload type (around line 380):

```typescript
vatRegistered: boolean;
clientOutsideUK: boolean;
detailed: boolean;
```

Update the tax code logic (line 385) from:

```typescript
const taxCode = payload.vatRegistered ? 'TAX' : 'NON';
```

To:

```typescript
const taxCode = (payload.vatRegistered && !payload.clientOutsideUK) ? 'TAX' : 'NON';
```

Update the destructure (line 433) to include `clientOutsideUK`:

```typescript
const { userId, clientName, projectName, jobReference, invoiceNumber, days, vatRegistered, clientOutsideUK, detailed } = req.body;
```

And pass it through to the createQBOInvoice call (line 447):

```typescript
invoiceNumber, projectName, jobReference, days, vatRegistered, clientOutsideUK, detailed,
```

- [ ] **Step 3: Verify build**

Run: `tsc -b`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add api/xero/export-invoice.ts api/quickbooks/export-invoice.ts
git commit -m "feat(bookkeeping): zero-rate VAT for non-UK clients in Xero and QuickBooks exports"
```

---

### Task 5: Final verification and push

- [ ] **Step 1: Run type check**

Run: `tsc -b`
Expected: Clean build, no errors.

- [ ] **Step 2: Test all scenarios manually**

Run: `npm run dev`

Test matrix:
| VAT registered | Client outside UK | Expected VAT | Invoice note |
|----------------|-------------------|--------------|--------------|
| No | N/A (hidden) | No VAT section | None |
| Yes | Unchecked | 20% | None |
| Yes | Checked | 0% | "Outside the scope of UK VAT" |

- [ ] **Step 3: Push to GitHub**

```bash
git push
```
