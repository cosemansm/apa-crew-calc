# Crew Dock — Brand Style Guide

> A comprehensive reference for colour, typography, component styles, tone, and design rules.
> Applies to the web app (app.crewdock.app), landing page, and all marketing materials.

---

## 1. Brand Identity

**Name:** Crew Dock

**What it is:** A payroll and scheduling tool built specifically for UK film & TV crew. It calculates wages, overtime, and turnaround costs against the APA recommended terms — precisely and reliably.

**Logo:** A pixel-art lighthouse rendered in a yellow rounded square. The lighthouse is intentional: it represents guidance, navigation, and safety — concepts that resonate with the chaos of a film shoot. The pixel aesthetic signals precision and craft without being cold.

**Logo rendering rules:**
- Always display inside a `#FFD528` yellow rounded-square container
- Apply `mix-blend-mode: multiply` when placing over a light background so the logo merges cleanly with the yellow
- The sidebar uses `h-10 w-10 rounded-2xl` — this is the canonical size
- Mobile header uses `h-8 w-8 rounded-xl`
- Never use the logo on a dark background without its yellow container
- Never stretch, recolour, or add a drop shadow to the logo itself

---

## 2. Colour System

The palette is warm and utilitarian. A single strong accent (yellow) does all the heavy lifting. Everything else is either neutral or structural.

### Primary Colours

| Name | Hex | Usage |
|---|---|---|
| **Brand Yellow** | `#FFD528` | Primary buttons, active nav, focus rings, logo background, highlights |
| **Deep Charcoal** | `#1F1F21` | Sidebar, dark cards, primary text, checked states |
| **Warm Off-White** | `#F5F3EE` | Page background |

### Secondary Colours

| Name | Hex | Usage |
|---|---|---|
| **Light Cream** | `#F0EDE8` | Secondary surfaces, tab backgrounds |
| **Subtle Border** | `#E5E2DC` | Borders, input outlines, dividers |
| **Muted Surface** | `#EDEAE4` | Hover states on ghost elements |
| **Muted Text** | `#8A8A8A` | Placeholder text, captions, secondary labels |
| **Card White** | `#FFFFFF` | Cards, popovers, form fields |

### Status Colours

| Name | Hex | Usage |
|---|---|---|
| **Destructive Red** | `#D45B5B` | Error states, delete actions, destructive confirmations |
| **Plan Green** | `#4ADE80` | Pro plan badge |
| **Plan Purple** | `#C084FC` | Lifetime plan badge |

### Page Background

The page background is not a flat colour — it is a fixed radial gradient that gives the cream a subtle warmth:

```css
background: radial-gradient(ellipse at 30% 20%, #FFF9E6 0%, #F5F3EE 50%, #EDE9E0 100%);
background-attachment: fixed;
```

This prevents the background from scrolling with content, keeping the sense of depth on long pages.

### CSS Custom Properties

All colour tokens live in `src/index.css` under the `@theme` block:

```css
--color-background: #F5F3EE;
--color-foreground: #1F1F21;
--color-card: #FFFFFF;
--color-card-foreground: #1F1F21;
--color-popover: #FFFFFF;
--color-popover-foreground: #1F1F21;
--color-primary: #FFD528;
--color-primary-foreground: #1F1F21;
--color-secondary: #F0EDE8;
--color-secondary-foreground: #2D2D3A;
--color-muted: #EDEAE4;
--color-muted-foreground: #8A8A8A;
--color-accent: #FFD528;
--color-accent-foreground: #1F1F21;
--color-destructive: #D45B5B;
--color-destructive-foreground: #FFFFFF;
--color-border: #E5E2DC;
--color-input: #E5E2DC;
--color-ring: #FFD528;
--color-sidebar: #1F1F21;
--color-sidebar-foreground: #FFFFFF;
```

### Colour Rules (Do & Don't)

**Do:**
- Use `#FFD528` as the single accent. One accent keeps the interface clean.
- Use low-opacity white variants (`white/60`, `white/10`) on the dark sidebar for layering without introducing new colours.
- Use colour to signal status: yellow = action, red = danger, green = success/premium, purple = exclusive.
- Use `#1F1F21` text on `#FFD528` backgrounds — the contrast is strong and on-brand.

**Don't:**
- Don't introduce new accent colours. A second brand colour dilutes the identity.
- Don't use pure `#000000` black anywhere. All blacks are `#1F1F21`.
- Don't use pure `#FFFFFF` as a page background. Backgrounds are always warm cream.
- Don't use opacity on the yellow primary itself (e.g. no `bg-primary/50` for a "soft" button) — use the secondary or ghost variants instead.
- Don't use the status colours (green, purple) for anything other than plan/status badges.

---

## 3. Typography

### Typefaces

Crew Dock uses two typefaces. Their roles are deliberately distinct.

| Role | Font | Weights | Character |
|---|---|---|---|
| **Headings, nav, labels, numbers** | JetBrains Mono | 400, 500, 600, 700 | Technical, precise, monospace |
| **Body, paragraphs, descriptions** | System UI (`-apple-system`, `SF Pro`, `system-ui`) | System defaults | Neutral, readable, fast-loading |

JetBrains Mono is loaded via Google Fonts and preloaded in `index.html`. It is a deliberate choice: film crew work in spreadsheets and call sheets. Monospace type feels native to their world. It also renders numbers in a fixed-width column, which is essential for financial figures.

System UI for body text is also intentional — it loads instantly, matches the OS, and keeps attention on the data rather than the design.

### Hierarchy

```
Page title / Hero heading    JetBrains Mono  700  text-3xl  letter-spacing: -0.02em
Section heading              JetBrains Mono  600  text-2xl  letter-spacing: -0.02em
Card title                   JetBrains Mono  600  text-2xl  leading-none tracking-tight
Sub-heading / dialog title   JetBrains Mono  600  text-base
Label (form field)           JetBrains Mono  500  text-sm   leading-none
Body text                    System UI       400  text-sm
Muted / caption              System UI       400  text-sm   text-muted-foreground
Badge                        JetBrains Mono  600  text-xs
Uppercase nav label          JetBrains Mono  500  text-xs   letter-spacing: 0.08em
```

### Letter Spacing Rules

- **Headings:** Always `letter-spacing: -0.02em`. Tightening gives headings a compact, designed appearance.
- **Uppercase labels:** `letter-spacing: 0.08em`. Opening up caps improves legibility.
- **Body and labels:** Default tracking (`tracking-tight` maximum for body, never looser than default for monospace numerals).
- **Numerals in tables/figures:** JetBrains Mono's fixed-width numerals align automatically — never manually space or pad financial figures with spaces.

### Typography Rules (Do & Don't)

**Do:**
- Use JetBrains Mono for anything a user reads as a label, heading, or number.
- Use tight tracking on headings.
- Rely on weight (not size) to create hierarchy within a card — a `font-semibold` label and a `font-normal` body at the same `text-sm` is usually enough.

**Don't:**
- Don't use a third typeface. Not even for code samples.
- Don't use very large type (`text-4xl` or above) inside the app — the UI is dense and data-forward.
- Don't set financial figures in System UI. Proportional fonts misalign decimal columns.
- Don't use `italic` — JetBrains Mono italic can feel decorative; the brand is utilitarian.
- Don't use `uppercase` text blocks for anything longer than a short label. Running text in all-caps is illegible.

---

## 4. Shape & Spacing

### Border Radius Scale

Crew Dock uses a generous, consistent radius scale. Rounded corners soften the technical nature of the content.

| Token | Value | Used for |
|---|---|---|
| `--radius-sm` | 8px | Small UI details |
| `--radius-md` | 12px (`rounded-lg`) | Tabs trigger, small chips |
| `--radius-lg` | 16px (`rounded-xl`) | Buttons, inputs, selects |
| `--radius-xl` | 24px (`rounded-2xl`) | Cards, dialogs, popovers |
| — | 48px (`rounded-3xl`) | Sidebar container |
| — | 9999px (`rounded-full`) | Badges, pills |

**Rule:** The radius increases with the physical size of the element. Small interactive controls use `rounded-xl`. Large container cards use `rounded-2xl`. The sidebar, which is the largest persistent element, uses `rounded-3xl`. Never apply a large radius to a small element or a small radius to a large container.

### Spacing

The default unit is 4px (Tailwind's default scale). Consistent spacing units throughout:

- **Component internal padding:** `p-6` (24px) for cards, dialogs
- **Button padding:** `px-4 py-2` default; `px-8` for large CTAs
- **Input/select padding:** `px-3 py-2` (12px × 8px)
- **Badge padding:** `px-2.5 py-0.5`
- **Gap between related items:** `gap-2` or `gap-3`
- **Gap between sections:** `space-y-6` or `gap-6`
- **Main content horizontal padding:** `px-4` mobile → `px-6 lg:px-8` desktop

**Rule:** Use the 4px grid. Avoid arbitrary values like `px-5` or `py-3.5` unless there is a specific optical alignment reason.

---

## 5. Shadow System

Shadows establish depth. They are always soft and tinted (not grey-black).

| Context | Shadow |
|---|---|
| Card (rest) | `0 2px 16px rgba(0,0,0,0.04)` |
| Card (hover) | `0 4px 24px rgba(0,0,0,0.06)` |
| Primary button (rest) | `0 2px 12px rgba(255,213,40,0.30)` |
| Primary button (hover) | `0 4px 20px rgba(255,213,40,0.40)` |
| Dialog, popover | `shadow-xl` (Tailwind) |
| Sidebar, mobile header | `shadow-2xl` (Tailwind) |
| Select/dropdown panel | `shadow-lg` (Tailwind) |

Primary button shadow is yellow-tinted (using the brand colour at low opacity). This gives buttons a subtle glow that reinforces the yellow as the action colour.

**Rules:**
- Never use a harsh `box-shadow: 0 0 0 1px black` inset shadow — use border tokens instead.
- Always add a transition when a shadow changes on hover: `transition-shadow duration-200`.
- Don't layer multiple shadows on the same element.

---

## 6. Component Reference

### Buttons

**Primary (default)**
```
bg-primary (#FFD528) · text-primary-foreground (#1F1F21) · font-semibold
rounded-xl · h-10 · px-4 py-2
shadow-[0_2px_12px_rgba(255,213,40,0.3)]
hover:brightness-105 hover:shadow-[0_4px_20px_rgba(255,213,40,0.4)]
active:scale-[0.98]
transition-all duration-200
```

**Secondary**
```
bg-secondary (#F0EDE8) · text-secondary-foreground (#2D2D3A)
border border-border
rounded-xl · h-10
hover:bg-secondary/80
```

**Outline**
```
border border-border · bg-transparent · text-foreground
rounded-xl · h-10
hover:bg-muted
```

**Destructive**
```
bg-destructive (#D45B5B) · text-white
rounded-xl · h-10
hover:bg-destructive/90
```

**Ghost**
```
bg-transparent · text-foreground
rounded-xl · h-10
hover:bg-muted hover:text-foreground
```

**Size variants:**
- `sm`: `h-9 rounded-xl px-3 text-xs`
- `default`: `h-10 px-4 py-2`
- `lg`: `h-11 rounded-xl px-8`
- `icon`: `h-10 w-10` (square, no text)

**Rules:**
- Use **primary** for the single most important action on any screen (submit, save, create).
- Use **outline** or **secondary** for secondary actions alongside a primary.
- Use **destructive** only for irreversible actions (delete, remove). Always pair with a confirmation dialog.
- Never put two primary buttons side by side.
- Never disable a button silently — if action is unavailable, explain why nearby.

---

### Cards

```
bg-card (white) · text-card-foreground (#1F1F21)
rounded-2xl · border border-border
shadow-[0_2px_16px_rgba(0,0,0,0.04)]
hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)]
transition-shadow duration-200
```

Internal structure:
- `CardHeader`: `p-6 flex flex-col space-y-1.5`
- `CardTitle`: JetBrains Mono `text-2xl font-semibold`
- `CardDescription`: `text-sm text-muted-foreground`
- `CardContent`: `p-6 pt-0`
- `CardFooter`: `p-6 pt-0 flex items-center`

**Rules:**
- Cards are white on the warm-cream background — this contrast defines sections.
- Don't nest cards inside cards.
- Keep card titles short (2–4 words). Use `CardDescription` for elaboration.
- Don't put more than one primary action inside a card footer.

---

### Form Inputs

```
h-11 · rounded-xl · border border-border · bg-white
px-3 py-2 · text-sm
placeholder:text-muted-foreground
focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-primary
transition-colors duration-200
disabled:cursor-not-allowed disabled:opacity-50
```

**Rules:**
- All inputs are `h-11` — taller than Tailwind default for touch comfort.
- Focus ring uses the brand yellow at 20% opacity (`ring-ring/20`) combined with a solid yellow border — subtle but unmistakable.
- Never rely on placeholder text as a label. Always pair with a `<Label>` above.
- Textarea uses the same border/focus rules with `min-h-[80px]`.

---

### Select / Dropdown

```
Trigger: h-11 rounded-xl border border-border bg-white px-3 py-2 text-sm
Content: rounded-xl border border-border bg-white shadow-lg max-h-96 overflow-auto
Item: py-1.5 pl-8 pr-2 rounded-sm text-sm
focus:bg-accent focus:text-accent-foreground
```

Animations: `zoom-in-95` on open, `zoom-out-95` on close, combined with slide-in from the appropriate side.

---

### Badges

```
rounded-full · border · px-2.5 py-0.5 · text-xs font-semibold
inline-flex items-center
```

| Variant | Style |
|---|---|
| Default | `bg-primary (#FFD528) text-primary-foreground (#1F1F21)` |
| Secondary | `bg-secondary text-secondary-foreground` |
| Destructive | `bg-destructive text-white` |
| Outline | `text-foreground` (border only, no fill) |

**Plan-specific badges (sidebar):**
- Trial: yellow `#FFD528`, `bg-[#FFD528]/10`, `border-[#FFD528]/25`
- Pro: green `#4ADE80`, `bg-[#4ADE80]/10`, `border-[#4ADE80]/25`
- Lifetime: purple `#C084FC`, `bg-purple-500/10`, `border-purple-500/25`

---

### Navigation (Sidebar)

```
Container: rounded-3xl bg-[#1F1F21] shadow-2xl
Nav item: h-11 rounded-2xl transition-all duration-200
Active: bg-[#FFD528] text-[#1F1F21] font-semibold
Inactive: text-white/60 hover:text-white hover:bg-white/10
Logo container: h-10 w-10 rounded-2xl bg-[#FFD528]
Divider: border-white/10
```

**Rules:**
- Exactly one nav item is active at a time. Active state is yellow — unmistakable.
- Inactive items use `white/60` at rest, `white` on hover. Never use a colour other than white for inactive sidebar text.
- Icons and labels are vertically centred at `h-11`.
- Never add secondary navigation inside the sidebar (nested menus, accordions). Keep it flat.

---

### Tabs

```
List: bg-secondary rounded-xl p-1 inline-flex
Trigger: px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
Active: bg-white text-foreground shadow-sm
Inactive: text-muted-foreground hover:text-foreground
```

---

### Dialogs / Modals

```
Overlay: bg-black/50
Content: fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
         rounded-2xl bg-white border border-border p-6 shadow-xl max-w-md
Animations: zoom-in-95 (open), zoom-out-95 (close), fade-in-0/fade-out-0
```

**Rules:**
- Max width `max-w-md` for standard dialogs. Use `max-w-lg` for complex forms, never wider.
- Destructive confirm dialogs must contain clear consequence language and a red button.
- Don't stack two dialogs — use a single flow with back/forward.

---

### Checkbox & Switch

**Checkbox:**
```
h-4 w-4 · rounded-sm · border border-border
Checked: bg-[#1F1F21] text-white border-[#1F1F21]
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
```

**Switch:**
```
h-6 w-11 · rounded-full
Unchecked: bg-input
Checked: bg-[#1F1F21]
Thumb: h-5 w-5 rounded-full bg-white shadow-lg
        translate-x-0 (off) → translate-x-5 (on)
transition-transform
```

Checked states use charcoal (`#1F1F21`) not yellow — yellow is reserved for primary actions. Toggles and checkboxes confirm a state, not initiate an action.

---

## 7. Motion & Animation

All transitions use `duration-200` (200ms). This is fast enough to feel snappy, slow enough to register.

| Interaction | Transition |
|---|---|
| Button hover | `transition-all duration-200` (shadow + brightness) |
| Button press | `active:scale-[0.98]` (instant) |
| Card hover | `transition-shadow duration-200` |
| Input focus | `transition-colors duration-200` |
| Dialog open/close | `zoom-in-95` / `zoom-out-95` + `fade-in-0` / `fade-out-0` |
| Popover/select open | Same as dialog + slide from edge |
| Switch toggle | `transition-transform` on thumb |

**Rules:**
- Don't animate layout properties (width, height, padding) — they are expensive and janky. Animate opacity, transform, and shadow.
- Don't use bounce or spring easing — the brand is precise and calm, not playful.
- Don't animate on page load (no entrance animations for content). Elements should appear immediately; transitions only on interaction.
- `duration-200` is the standard. Only go longer (300ms max) for full-page transitions.

---

## 8. Focus & Accessibility

Every interactive element shares the same focus style:

```
focus-visible:ring-2 focus-visible:ring-ring (#FFD528) focus-visible:ring-offset-2
```

The yellow focus ring is highly visible against both white surfaces and the dark sidebar.

**Rules:**
- Never remove the focus ring (`outline: none` without a replacement is forbidden).
- Always use `focus-visible` rather than `focus` — avoids focus rings on mouse click.
- Muted text (`#8A8A8A` on white `#FFFFFF`) achieves approximately 3.6:1 contrast. Use sparingly and never for critical information.
- Primary text (`#1F1F21` on `#F5F3EE`) achieves approximately 14:1 contrast.
- `#1F1F21` on `#FFD528` achieves approximately 9:1 contrast — fully AA+ compliant.
- Disabled elements use `opacity-50` — always pair with `pointer-events-none` and a visible reason why the action is unavailable.

---

## 9. Tone of Voice

Crew Dock serves experienced UK film & TV crew who deal with tight budgets, long days, and complex APA rules. The tone must match.

**Core characteristics:**

| Trait | Meaning |
|---|---|
| **Direct** | No waffle. Say what it does. |
| **Precise** | Use exact numbers and terms. "11 hours" not "over ten hours". |
| **Professional** | No emojis, no exclamation marks in the UI. |
| **Knowledgeable** | Use industry language: TOC, turnaround, basic rate, call fee. |
| **Calm** | Errors are informative, not alarming. Warnings are factual, not dramatic. |

**UI copy rules:**

- Labels are short and noun-led: "Basic Rate", "Call Time", "Turnaround"
- Buttons are verb-led: "Save", "Add Job", "Remove", "Calculate"
- Error messages state what happened and what to do: "Rate is required" not "Oops! Something went wrong."
- Empty states explain what the screen does: "No jobs yet. Add a job to start calculating pay."
- Never use "click here" — use the actual action: "View job" or "Add a rate"
- Avoid marketing language inside the app: no "powerful", "easy", "amazing", "revolutionary"

---

## 10. Design Don'ts (Summary)

A quick reference of things never to do.

- **Don't** introduce a second brand accent colour
- **Don't** use pure `#000000` or pure `#FFFFFF` as background
- **Don't** put two primary buttons on the same screen
- **Don't** use `italic` text
- **Don't** use very large type (`text-4xl`+) inside the app
- **Don't** set financial figures in a proportional font
- **Don't** use opacity on the yellow primary (use a different variant instead)
- **Don't** remove the focus ring
- **Don't** animate layout properties
- **Don't** add bounce or spring easing
- **Don't** nest cards inside cards
- **Don't** use the logo without its yellow container
- **Don't** add gradients or decorative backgrounds inside cards or components
- **Don't** use green, purple, or red for anything other than status/plan indicators
- **Don't** use emojis, exclamation marks, or marketing language in app copy
- **Don't** use `bg-primary/50` for "softer" yellow — use `bg-secondary` or ghost variant
- **Don't** use arbitrary spacing values — stick to the 4px Tailwind grid
