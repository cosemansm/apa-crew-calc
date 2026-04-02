-- ── Bookkeeping connections (shared: FreeAgent, Xero, QuickBooks) ─────────────
CREATE TABLE IF NOT EXISTS bookkeeping_connections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('xero', 'quickbooks', 'freeagent')),
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  tenant_id     TEXT,        -- Xero: organisation tenantId
  realm_id      TEXT,        -- QuickBooks: company realmId
  qbo_item_id   TEXT,        -- QuickBooks: Film Crew Services item ID
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, platform)
);

ALTER TABLE bookkeeping_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own connections"
  ON bookkeeping_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── VAT registration (used in all bookkeeping exports) ────────────────────────
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN DEFAULT false;

-- ── Job reference on projects (optional, flows to exports) ───────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS job_reference TEXT;
