# Onboarding Flow Design Spec

## Overview

Multi-step onboarding wizard for new Crew Dock users. Appears after email confirmation, before the dashboard. Captures country, department, calculator tool preference, and bookkeeping software -- then forks to either dashboard or project creation.

## Flow

```
Sign up (email + password) -> Confirm email -> Add passkey (skippable)
  -> Welcome modal -> Country (1/4) -> Department (2/4) -> Workflow (3/4) -> Bookkeeping (4/4)
    -> Fork A: Go to dashboard
    -> Fork B: Create first project -> Calculator
```

## Auth Screens

### 01 -- Sign Up

Replaces the existing `LoginPage.tsx` registration tab.

- Centered lighthouse logo + "Crew Dock" wordmark above card
- Sign up / Sign in pill tabs (existing tab behaviour preserved)
- Fields: Work email, Password (8+ chars, one number), Confirm password
- Primary CTA: "Create account" (yellow)
- OR divider + "Continue with Google" (outline button with Google icon)
- Footer: Terms/Privacy links, "Already have an account? Sign in"
- Department field removed from signup (moves to onboarding step 2)

### 02 -- Confirm Email

New screen at `/sign-up/verify` (or shown inline after signup success).

- Lighthouse logo centered
- Title: "Confirm your email"
- Body: "We sent a confirmation link to your inbox. Click it to verify your email and finish setting up your account."
- Info box: "Can't find it? Check spam, or wait a minute -- mail servers can be slow."
- Buttons stacked vertically: "Resend link" (yellow, primary) on top, "Use a different email" (secondary) below

### 03 -- Add Passkey

New screen shown after email confirmation click lands user in the app.

- Lock/key icon
- Title: "Add a passkey"
- Body: "Sign in with your phone, Touch ID, or security key -- no password to remember."
- Device info box showing current device + capability
- Buttons: "Skip for now" (secondary) | "Set up passkey" (yellow, primary)
- Implementation: Supabase WebAuthn integration
- Skippable -- user can set up later in settings

## Activation Screens

All activation screens use the same layout: centered card on dotted background (radial gradient + dot pattern), lighthouse logo at top of each card, progress bar at bottom.

### 04 -- Welcome Modal

Shown once before the 4-step wizard begins.

- Large lighthouse logo (64px)
- Title: "Welcome to Crew Dock"
- Body: "Let's get you set up. Four quick questions so we can tailor the calculator to you."
- Step preview grid (4 columns): 01 Country, 02 Dept, 03 Workflow, 04 Books
- Note: "Takes about 60 seconds."
- CTA: "Let's go" (yellow)

### 05 -- Country (Step 1/4)

- Title: "Where are you based?"
- Subtitle: "This sets the right rate calculator and currency for you."
- PillList (vertical, single-select with flags):
  - UK, Ireland, Belgium, Netherlands, France, Other
- Default: pre-select based on IP geolocation (fallback: UK)
- Progress: 25%
- Side effect: sets engine (Belgium -> SDYM-BE, UK -> APA-UK, etc.) as verification/override of IP geolocation

### 06 -- Department (Step 2/4)

- Title: "What department are you in?"
- Subtitle: "You can always change this later."
- PillGrid (2 columns, single-select):
  - Direction, Production, Camera, Lighting, Sound, Art, Hair & Make-Up, Costume, Grip, SFX
- Sourced from engine's DEPARTMENTS list
- Progress: 50%
- Saved to `user_settings.department`

### 07 -- Workflow (Step 3/4)

- Title: "How do you calculate rates now?"
- Subtitle: "No wrong answers here."
- PillList (vertical, single-select):
  - Other apps, Google Sheets, My own brain, Pen & paper, Relying on others
- Progress: 75%
- Saved to new `user_settings.calculator_tool` column (analytics/market research data)

### 08 -- Bookkeeping (Step 4/4) + Fork

- Title: "Which bookkeeping software do you use?"
- Subtitle: "We can connect it later -- just a heads-up for now."
- PillGrid (2 columns): FreeAgent, Xero, QuickBooks, Sage, Wave, Other
- Full-width pill: "I don't use one"
- Progress: 100%
- Saved to new `user_settings.bookkeeping_software` column
- Fork section below progress bar:
  - "What next?" heading
  - Two buttons (centered text only, no subtext):
    - "Go to dashboard" (outline) -> `/dashboard`
    - "Create first project" (charcoal filled) -> `/projects/new`

## Post-Onboarding Branch

### 09a -- New Project (if "Create first project" chosen)

- Title: "Name your first project"
- Subtitle: "You'll go straight to the calculator next."
- Fields: Project name (text, mono font), Client (optional)
- Footer: "Back" link | "Open calculator" (yellow CTA)
- Creates project and redirects to calculator page

## Design Tokens

### Colors
- Yellow (primary): `#FFD528`
- Charcoal (text): `#1F1F21`
- Cream (bg): `#F5F3EE`
- Light cream: `#F0EDE8`
- Border: `#E5E2DC`
- Muted text: `#8A8A8A`
- Selected pill bg: `#FFF8D6`
- Page background: `radial-gradient(ellipse at 30% 20%, #FFF9E6 0%, #F5F3EE 50%, #EDE9E0 100%)` with dot overlay

### Shadows
- Card: `0 2px 16px rgba(0,0,0,0.04)`
- Step card: `0 2px 16px rgba(0,0,0,0.06)`
- Primary button: `0 2px 12px rgba(255,213,40,0.30)`
- Selected pill: `0 2px 12px rgba(255,213,40,0.15)`

### Border Radii
- Auth card: 24px
- Step card: 20px
- Inputs/buttons: 16px
- Pills: 12px
- Logo (small): 10px
- Logo (large): 14-16px

### Typography
- Headings/labels/buttons: JetBrains Mono
- Body text: system font stack (SF Pro, Segoe UI, system-ui)
- Card title: 18px, weight 700, letter-spacing -0.02em
- Subtitle: 12px, muted text color
- Input labels: 13px mono, weight 500
- Button text: 14px mono, weight 600
- Pills: 13-14px body font

## Component Structure

### StepCard
Shared wrapper for activation steps 05-08:
- White card, 20px radius, 28px padding
- Lighthouse logo at top (36px)
- Title + subtitle centered
- Content area (PillList or PillGrid)
- Footer: "Skip" (left) + "Continue" (right, charcoal bg; final step uses yellow bg)
- Progress bar at bottom (4px height, yellow fill, animated width transition)

### PillList
Vertical single-column options. Unselected: white bg, border. Selected: yellow-tinted bg, yellow border, bold, subtle shadow.

### PillGrid
2-column grid of pills. Same selected/unselected states as PillList but in grid layout.

### DottedBg
Page wrapper: radial gradient background with 22px dot pattern overlay.

## Data Model Changes

### user_settings table additions
- `onboarding_completed` (boolean, default false) -- gates dashboard access
- `calculator_tool` (text, nullable) -- "Other apps" | "Google Sheets" | "My own brain" | "Pen & paper" | "Relying on others"
- `bookkeeping_software` (text, nullable) -- "FreeAgent" | "Xero" | "QuickBooks" | "Sage" | "Wave" | "Other" | null

### Existing columns used
- `department` (already exists) -- populated from onboarding step 2
- `profiles.signup_country` (already exists) -- updated/verified by onboarding step 1
- `profiles.default_engine` (already exists) -- set based on country selection

### Migration for existing users
- Backfill `onboarding_completed = true` for all existing users so they skip the wizard

## Routing

- `/login` -- LoginPage with redesigned Sign up / Sign in tabs
- `/onboarding` -- OnboardingPage (new, ProtectedRoute)
  - Renders welcome modal, then steps 1-4, then fork
  - State managed locally (React state, no URL sub-routes needed)
- `/projects/new` -- NewProjectPage (new or part of existing projects flow)
- ProtectedRoute updated: if user is authenticated but `onboarding_completed === false`, redirect to `/onboarding`
- Email confirmation redirect URL changed from `/dashboard` to `/onboarding` (with passkey prompt as intermediate)

## Behaviour

- All 4 activation steps are skippable via "Skip" link
- Skipping saves nothing for that step
- Progress bar always advances (skip counts as completing the step)
- Back navigation not needed (steps are independent, skip handles opting out)
- On completion (or skip-all), `onboarding_completed` set to `true`
- Country selection overrides IP geolocation engine assignment
- Passkey screen: implemented via Supabase WebAuthn, skippable, can be set up later in Settings

## Open Questions

1. Passkey: full screen (as designed) or softer in-app banner after dashboard?
2. Welcome modal: full-bleed page or true modal over blurred dashboard?
3. New project creation page: reuse existing project creation flow or build dedicated onboarding version?
