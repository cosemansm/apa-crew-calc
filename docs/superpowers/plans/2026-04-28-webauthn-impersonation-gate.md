# WebAuthn Touch ID Gate for Admin Impersonation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require Touch ID (WebAuthn) biometric verification before the `admin-view-user-data` edge function returns any user data, preventing unauthorized access to sensitive impersonated user information.

**Architecture:** Client-side WebAuthn ceremonies (registration + authentication) backed by server-side credential storage and assertion verification in Supabase edge functions. The `admin-view-user-data` function gates on a valid WebAuthn assertion before returning data. Challenges are stored server-side with short TTL to prevent replay attacks.

**Tech Stack:** WebAuthn Web API (browser), `@simplewebauthn/server@11` (Deno edge functions via esm.sh), Supabase PostgreSQL for credential + challenge storage.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260428120000_create_webauthn_tables.sql` | Create | Tables for credentials + challenges |
| `supabase/functions/admin-webauthn-register-options/index.ts` | Create | Generate WebAuthn registration options |
| `supabase/functions/admin-webauthn-register-verify/index.ts` | Create | Verify registration attestation, store credential |
| `supabase/functions/admin-webauthn-auth-options/index.ts` | Create | Generate authentication challenge |
| `supabase/functions/admin-view-user-data/index.ts` | Modify | Require + verify WebAuthn assertion before returning data |
| `supabase/config.toml` | Modify | Register new functions |
| `src/lib/webauthn.ts` | Create | Client-side WebAuthn helpers (register + authenticate) |
| `src/contexts/ImpersonationContext.tsx` | Modify | Integrate WebAuthn authentication into impersonation flow |
| `src/pages/AdminPage.tsx` | Modify | Add Touch ID registration button + status indicator |

---

### Task 1: Database — WebAuthn tables

**Files:**
- Create: `supabase/migrations/20260428120000_create_webauthn_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- WebAuthn credential storage for admin biometric verification
CREATE TABLE public.webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only service_role can access (edge functions use service_role)
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.webauthn_credentials TO service_role;

-- Temporary challenge storage (short-lived, cleaned up on use)
CREATE TABLE public.webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.webauthn_challenges TO service_role;

-- Auto-cleanup challenges older than 5 minutes (run via pg_cron or manual)
-- For now, edge functions delete used/expired challenges inline.
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or apply via Supabase dashboard for remote)
Expected: Tables created successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260428120000_create_webauthn_tables.sql
git commit -m "feat(auth): add webauthn credentials and challenges tables"
```

---

### Task 2: Edge Function — Registration Options

**Files:**
- Create: `supabase/functions/admin-webauthn-register-options/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Add function config**

Add to `supabase/config.toml`:

```toml
[functions.admin-webauthn-register-options]
verify_jwt = false
```

- [ ] **Step 2: Write the edge function**

```typescript
// supabase/functions/admin-webauthn-register-options/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateRegistrationOptions } from 'https://esm.sh/@simplewebauthn/server@11.0.0'

const ADMIN_EMAIL = 'milo.cosemans@gmail.com'
const RP_NAME = 'Crew Dock Admin'
const RP_ID = Deno.env.get('WEBAUTHN_RP_ID') || 'app.crewdock.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const db = createClient(supabaseUrl, serviceRoleKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await db.auth.getUser(token)
    if (authError || !user || user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get existing credentials to exclude
    const { data: existingCreds } = await db
      .from('webauthn_credentials')
      .select('credential_id')
      .eq('user_id', user.id)

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.email!,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      excludeCredentials: (existingCreds ?? []).map(c => ({
        id: c.credential_id,
      })),
    })

    // Store challenge for verification
    // Delete any stale challenges first
    await db.from('webauthn_challenges')
      .delete()
      .eq('user_id', user.id)
      .eq('type', 'registration')

    await db.from('webauthn_challenges').insert({
      user_id: user.id,
      challenge: options.challenge,
      type: 'registration',
    })

    return new Response(JSON.stringify(options), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-webauthn-register-options/index.ts supabase/config.toml
git commit -m "feat(auth): add webauthn registration options endpoint"
```

---

### Task 3: Edge Function — Registration Verify

**Files:**
- Create: `supabase/functions/admin-webauthn-register-verify/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Add function config**

Add to `supabase/config.toml`:

```toml
[functions.admin-webauthn-register-verify]
verify_jwt = false
```

- [ ] **Step 2: Write the edge function**

```typescript
// supabase/functions/admin-webauthn-register-verify/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyRegistrationResponse } from 'https://esm.sh/@simplewebauthn/server@11.0.0'

const ADMIN_EMAIL = 'milo.cosemans@gmail.com'
const RP_ID = Deno.env.get('WEBAUTHN_RP_ID') || 'app.crewdock.app'
const ORIGIN = Deno.env.get('WEBAUTHN_ORIGIN') || 'https://app.crewdock.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const db = createClient(supabaseUrl, serviceRoleKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await db.auth.getUser(token)
    if (authError || !user || user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()

    // Retrieve stored challenge
    const { data: challengeRow, error: challengeError } = await db
      .from('webauthn_challenges')
      .select('challenge')
      .eq('user_id', user.id)
      .eq('type', 'registration')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (challengeError || !challengeRow) {
      return new Response(JSON.stringify({ error: 'No pending registration challenge' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return new Response(JSON.stringify({ error: 'Verification failed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { credential, credentialBackedUp } = verification.registrationInfo

    // Store the credential
    const { error: insertError } = await db.from('webauthn_credentials').insert({
      user_id: user.id,
      credential_id: credential.id,
      public_key: btoa(String.fromCharCode(...credential.publicKey)),
      counter: credential.counter,
      transports: credential.transports ?? [],
    })

    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to store credential' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Clean up used challenge
    await db.from('webauthn_challenges')
      .delete()
      .eq('user_id', user.id)
      .eq('type', 'registration')

    return new Response(JSON.stringify({ verified: true, backedUp: credentialBackedUp }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-webauthn-register-verify/index.ts supabase/config.toml
git commit -m "feat(auth): add webauthn registration verification endpoint"
```

---

### Task 4: Edge Function — Authentication Options (Challenge)

**Files:**
- Create: `supabase/functions/admin-webauthn-auth-options/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Add function config**

Add to `supabase/config.toml`:

```toml
[functions.admin-webauthn-auth-options]
verify_jwt = false
```

- [ ] **Step 2: Write the edge function**

```typescript
// supabase/functions/admin-webauthn-auth-options/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateAuthenticationOptions } from 'https://esm.sh/@simplewebauthn/server@11.0.0'

const ADMIN_EMAIL = 'milo.cosemans@gmail.com'
const RP_ID = Deno.env.get('WEBAUTHN_RP_ID') || 'app.crewdock.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const db = createClient(supabaseUrl, serviceRoleKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await db.auth.getUser(token)
    if (authError || !user || user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get registered credentials
    const { data: credentials } = await db
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', user.id)

    if (!credentials || credentials.length === 0) {
      return new Response(JSON.stringify({ error: 'No registered credentials. Register Touch ID first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credentials.map(c => ({
        id: c.credential_id,
        transports: c.transports ?? [],
      })),
      userVerification: 'required',
      timeout: 60_000,
    })

    // Store challenge
    await db.from('webauthn_challenges')
      .delete()
      .eq('user_id', user.id)
      .eq('type', 'authentication')

    await db.from('webauthn_challenges').insert({
      user_id: user.id,
      challenge: options.challenge,
      type: 'authentication',
    })

    return new Response(JSON.stringify(options), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-webauthn-auth-options/index.ts supabase/config.toml
git commit -m "feat(auth): add webauthn authentication challenge endpoint"
```

---

### Task 5: Modify `admin-view-user-data` — Require WebAuthn Assertion

**Files:**
- Modify: `supabase/functions/admin-view-user-data/index.ts:2,38-43`

- [ ] **Step 1: Add WebAuthn verification import and logic**

Add import at line 2:

```typescript
import { verifyAuthenticationResponse } from 'https://esm.sh/@simplewebauthn/server@11.0.0'
```

Add env constants after `ADMIN_EMAIL` (line 4):

```typescript
const RP_ID = Deno.env.get('WEBAUTHN_RP_ID') || 'app.crewdock.app'
const ORIGIN = Deno.env.get('WEBAUTHN_ORIGIN') || 'https://app.crewdock.app'
```

After the admin email check (line 36) and before parsing body, add WebAuthn verification. The body parsing needs to change to extract both `userId` and `webauthnAssertion`:

Replace the body parsing block (lines 38-44) with:

```typescript
    const body = await req.json()
    const { userId: targetUserId, webauthnAssertion } = body

    if (!targetUserId || typeof targetUserId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── WebAuthn: verify Touch ID assertion ──
    if (!webauthnAssertion) {
      return new Response(JSON.stringify({ error: 'WebAuthn assertion required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Retrieve stored challenge
    const { data: challengeRow, error: challengeError } = await db
      .from('webauthn_challenges')
      .select('challenge')
      .eq('user_id', callerUser.id)
      .eq('type', 'authentication')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (challengeError || !challengeRow) {
      return new Response(JSON.stringify({ error: 'No pending authentication challenge' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Look up the credential used
    const { data: storedCred } = await db
      .from('webauthn_credentials')
      .select('*')
      .eq('user_id', callerUser.id)
      .eq('credential_id', webauthnAssertion.id)
      .single()

    if (!storedCred) {
      return new Response(JSON.stringify({ error: 'Unknown credential' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Decode stored public key from base64
    const publicKeyBytes = Uint8Array.from(atob(storedCred.public_key), c => c.charCodeAt(0))

    const verification = await verifyAuthenticationResponse({
      response: webauthnAssertion,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: storedCred.credential_id,
        publicKey: publicKeyBytes,
        counter: storedCred.counter,
      },
    })

    if (!verification.verified) {
      return new Response(JSON.stringify({ error: 'Biometric verification failed' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Update counter to prevent replay attacks
    await db.from('webauthn_credentials')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('id', storedCred.id)

    // Clean up used challenge
    await db.from('webauthn_challenges')
      .delete()
      .eq('user_id', callerUser.id)
      .eq('type', 'authentication')
```

**Important:** The existing variable name on line 31 is `callerUser` — use that consistently in the WebAuthn verification block above.

- [ ] **Step 2: Verify the full function reads correctly**

Read the modified file end-to-end to confirm no syntax issues.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-view-user-data/index.ts
git commit -m "feat(auth): require webauthn assertion in admin-view-user-data"
```

---

### Task 6: Client-Side WebAuthn Library

**Files:**
- Create: `src/lib/webauthn.ts`

- [ ] **Step 1: Write the client-side helpers**

This uses the browser's native `navigator.credentials` API with `@simplewebauthn/browser` for encoding/decoding helpers.

```typescript
// src/lib/webauthn.ts
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { supabase } from '@/lib/supabase';

/**
 * Check if the current device supports platform authenticators (Touch ID, Face ID, Windows Hello).
 */
export async function isWebAuthnAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Register a new Touch ID credential for the current admin user.
 * Call this once from the admin panel to set up biometric access.
 */
export async function registerTouchId(): Promise<void> {
  // 1. Get registration options from server
  const { data: options, error: optionsError } = await supabase.functions.invoke(
    'admin-webauthn-register-options',
  );
  if (optionsError) {
    let detail = optionsError.message;
    if ('context' in optionsError && optionsError.context instanceof Response) {
      try { detail = (await optionsError.context.json()).error || detail; } catch {}
    }
    throw new Error(detail);
  }

  // 2. Trigger Touch ID ceremony
  const attestation = await startRegistration({ optionsJSON: options });

  // 3. Send attestation to server for verification
  const { error: verifyError } = await supabase.functions.invoke(
    'admin-webauthn-register-verify',
    { body: attestation },
  );
  if (verifyError) {
    let detail = verifyError.message;
    if ('context' in verifyError && verifyError.context instanceof Response) {
      try { detail = (await verifyError.context.json()).error || detail; } catch {}
    }
    throw new Error(detail);
  }
}

/**
 * Perform Touch ID authentication and return the signed assertion.
 * The assertion must be passed to admin-view-user-data along with the userId.
 */
export async function authenticateWithTouchId(): Promise<unknown> {
  // 1. Get authentication options (challenge) from server
  const { data: options, error: optionsError } = await supabase.functions.invoke(
    'admin-webauthn-auth-options',
  );
  if (optionsError) {
    let detail = optionsError.message;
    if ('context' in optionsError && optionsError.context instanceof Response) {
      try { detail = (await optionsError.context.json()).error || detail; } catch {}
    }
    throw new Error(detail);
  }

  // 2. Trigger Touch ID ceremony — returns signed assertion
  const assertion = await startAuthentication({ optionsJSON: options });

  return assertion;
}
```

- [ ] **Step 2: Install the browser package**

Run: `npm install @simplewebauthn/browser@^11.0.0`

- [ ] **Step 3: Commit**

```bash
git add src/lib/webauthn.ts package.json package-lock.json
git commit -m "feat(auth): add client-side webauthn helpers"
```

---

### Task 7: Integrate WebAuthn into ImpersonationContext

**Files:**
- Modify: `src/contexts/ImpersonationContext.tsx:119-144`

- [ ] **Step 1: Add WebAuthn import**

Add at the top of the file:

```typescript
import { authenticateWithTouchId } from '@/lib/webauthn';
```

- [ ] **Step 2: Modify `startImpersonation` to include WebAuthn**

Replace the `startImpersonation` callback (lines 119-144) with:

```typescript
  const startImpersonation = useCallback(async (userId: string) => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      // Step 1: Touch ID verification — get signed assertion
      const webauthnAssertion = await authenticateWithTouchId();

      // Step 2: Send both userId and assertion to edge function
      const { data, error } = await supabase.functions.invoke('admin-view-user-data', {
        body: { userId, webauthnAssertion },
      });
      if (error) {
        let detail = error.message;
        if ('context' in error && error.context instanceof Response) {
          try {
            const body = await error.context.json();
            detail = body.error || detail;
          } catch { /* response not JSON */ }
        }
        throw new Error(detail);
      }
      setData(data as ImpersonatedUserData);
    } catch (e) {
      Sentry.captureException(e, { extra: { context: 'ImpersonationContext startImpersonation', userId } });
      throw e;
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc -b`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/contexts/ImpersonationContext.tsx
git commit -m "feat(auth): require touch id before impersonation data fetch"
```

---

### Task 8: Admin UI — Touch ID Registration + Status

**Files:**
- Modify: `src/pages/AdminPage.tsx`

- [ ] **Step 1: Find the admin header area**

Read `src/pages/AdminPage.tsx` and locate the admin panel header/toolbar area where the registration button should go. Look for the section near the top of the admin UI where controls are rendered.

- [ ] **Step 2: Add Touch ID registration state and UI**

Add imports at the top of AdminPage:

```typescript
import { isWebAuthnAvailable, registerTouchId } from '@/lib/webauthn';
import { Fingerprint } from 'lucide-react';
```

Inside the AdminPage component, add state:

```typescript
const [touchIdAvailable, setTouchIdAvailable] = useState(false);
const [touchIdRegistering, setTouchIdRegistering] = useState(false);
const [touchIdRegistered, setTouchIdRegistered] = useState<boolean | null>(null);

// Check Touch ID availability on mount
useEffect(() => {
  isWebAuthnAvailable().then(setTouchIdAvailable);
}, []);

// Check if credential exists
useEffect(() => {
  if (!session?.access_token) return;
  supabase.functions.invoke('admin-webauthn-auth-options')
    .then(({ error }) => {
      // If no error, credentials exist; if error mentions "No registered credentials", not registered
      setTouchIdRegistered(!error);
    })
    .catch(() => setTouchIdRegistered(false));
}, [session?.access_token]);

const handleRegisterTouchId = async () => {
  setTouchIdRegistering(true);
  try {
    await registerTouchId();
    setTouchIdRegistered(true);
  } catch (err) {
    console.error('Touch ID registration failed:', err);
    alert(`Touch ID registration failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setTouchIdRegistering(false);
  }
};
```

Add the registration button in the admin toolbar/header area (near existing admin controls):

```tsx
{touchIdAvailable && (
  <button
    onClick={handleRegisterTouchId}
    disabled={touchIdRegistering || touchIdRegistered === true}
    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-charcoal text-white text-xs font-mono transition-all disabled:opacity-40"
    title={touchIdRegistered ? 'Touch ID registered' : 'Register Touch ID for impersonation'}
  >
    <Fingerprint className="h-4 w-4" />
    {touchIdRegistered ? 'Touch ID Active' : touchIdRegistering ? 'Registering...' : 'Register Touch ID'}
  </button>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc -b`
Expected: No errors

- [ ] **Step 4: Manual test**

1. Open admin panel at `/admin/users`
2. Verify "Register Touch ID" button appears
3. Click it — Touch ID prompt should appear
4. After registering, button should show "Touch ID Active"
5. Click the Eye icon on a user — Touch ID prompt should appear
6. After Touch ID, impersonation data loads as before

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminPage.tsx
git commit -m "feat(auth): add touch id registration ui to admin panel"
```

---

### Task 9: Environment Variables + Deploy

**Files:**
- No new files — configuration in Supabase dashboard

- [ ] **Step 1: Set environment variables in Supabase**

In the Supabase dashboard, add these secrets to the Edge Functions configuration:

- `WEBAUTHN_RP_ID` = `app.crewdock.app`
- `WEBAUTHN_ORIGIN` = `https://app.crewdock.app`

For local development, these default values are hardcoded in the functions, but you can override them with:

```bash
supabase secrets set WEBAUTHN_RP_ID=localhost WEBAUTHN_ORIGIN=http://localhost:5173
```

- [ ] **Step 2: Deploy edge functions**

```bash
supabase functions deploy admin-webauthn-register-options
supabase functions deploy admin-webauthn-register-verify
supabase functions deploy admin-webauthn-auth-options
supabase functions deploy admin-view-user-data
```

- [ ] **Step 3: Apply migration to production**

Run the migration against production via Supabase dashboard or CLI.

- [ ] **Step 4: End-to-end test on production**

1. Go to `https://app.crewdock.app/admin/users`
2. Register Touch ID
3. Impersonate a user — Touch ID should be required
4. Verify data loads correctly after biometric verification

- [ ] **Step 5: Final commit + push**

```bash
git push origin main
```

---

## Notes

- **RP ID for local dev:** WebAuthn RP ID must match the domain. For `localhost`, set `WEBAUTHN_RP_ID=localhost` and `WEBAUTHN_ORIGIN=http://localhost:5173`. The defaults target production.
- **Multiple devices:** Each browser/device needs its own registration. If you switch browsers, you'll need to register Touch ID again.
- **Fallback:** If Touch ID is unavailable (no platform authenticator), the impersonation button won't work. This is intentional — no biometric = no access to user data.
- **Challenge TTL:** Challenges are cleaned up on use. Stale challenges from aborted ceremonies accumulate but are harmless (overwritten on next attempt). Consider adding a pg_cron job to purge challenges older than 5 minutes if the table grows.
