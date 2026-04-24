# Non-UK Client VAT Zero-Rating

When a VAT-registered user invoices a client based outside the UK, VAT should not be charged. This is standard UK VAT treatment for services supplied to overseas clients.

## UI Changes

**InvoicePage** — add a checkbox **"Client is based outside the UK"** in the client details section. Only visible when the user is VAT registered. State is per-invoice (component state, not persisted to DB).

## Invoice Document Changes

When the checkbox is ticked and the user is VAT registered:

- Subtotal shown as normal
- VAT line shows **"VAT (0%): £0.00"**
- Note below the VAT summary: **"Outside the scope of UK VAT"**
- Total equals subtotal (no VAT added)

When the checkbox is unticked (or user is not VAT registered), behaviour is unchanged from today.

## Bookkeeping Export Changes

Pass a new boolean `clientOutsideUK` to all three export endpoints alongside `vatRegistered`.

When `vatRegistered === true && clientOutsideUK === true`:

| Platform   | Field             | Value              |
|------------|-------------------|--------------------|
| FreeAgent  | `sales_tax_rate`  | `"0.0"`            |
| Xero       | `TaxType`         | `"ZERORATEDOUTPUT"`|
| QuickBooks | `TaxCodeRef`      | `"NON"`            |

When `vatRegistered === true && clientOutsideUK === false`, existing 20% logic applies unchanged.

## Scope

- No database schema changes
- No changes for non-VAT-registered users
- No changes to the Settings page
- Checkbox state does not persist between invoice sessions
