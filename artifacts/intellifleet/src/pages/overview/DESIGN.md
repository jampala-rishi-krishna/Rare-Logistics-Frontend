# Driver Overview v2 — design plan

Dense but calm: white surfaces, black text, 1px lines, the dashboard's status colours, tabular numbers, one accent
(the current step in the rail). No new fonts. Every colour status also carries an icon and a word.

## Tokens (only these; source = `src/lib/themeTokens.ts` → CSS variables in `src/index.css`)

| Role | Token (`T.*`) | CSS var | Tailwind usage in this folder |
|------|---------------|---------|-------------------------------|
| page / surfaces | canvas | `--card` | `bg-card` |
| grouped areas, hover, pressed tile, table head | surface | `--muted` | `bg-muted` |
| text, primary button, done rail steps | ink | `--foreground` | `text-foreground`, `bg-foreground` |
| text on ink | onInk | `--primary-foreground` | `text-primary-foreground` |
| secondary text (lightest allowed) | muted | `--muted-foreground` | `text-muted-foreground` |
| 1px lines | line | `--border` | `border-border` |
| delivered / received / closed | positive / positiveBg | `--success`, `--success-bg` | `text-[hsl(var(--success))]`, `bg-[hsl(var(--success-bg))]` |
| partial / with officer / loading wait | warning / warningBg | `--warning`, `--warning-bg` | `text-[hsl(var(--warning))]` … |
| not delivered / missing / wrong / no activity | negative / negativeBg | `--destructive`, `--destructive-bg` | `text-destructive`, `bg-[hsl(var(--destructive-bg))]` |
| the ONE accent: current rail step, focus ring | accent / accentBg | `--info`, `--info-bg` | `text-[hsl(var(--info))]` |
| order type badges | orderSO/TO/… | `--order-*` | via the shared `OrderTypeBadge` |

No hex literals anywhere under `pages/overview/**` (unit test `src/lib/overviewNoHex.test.ts`).

## Type scale (DM Sans, `tabular-nums` on every number)

| Use | Size / weight |
|-----|---------------|
| page title "Driver Overview" | AppShell title (unchanged) |
| tile number | 28px / 600, tabular |
| section heading (drawer sections, date groups) | 13px / 600, sentence case (no uppercase tracking) |
| row primary (plate) | 15px / 700, mono for plate / SO numbers |
| body / table cells | 13px / 400–500 |
| secondary / sub-text / captions | 12px / 400 muted |
| chips | 12px / 600 with icon |

Radii: 6px controls, 8px containers (dashboard default). Shadows: none except the drawer edge.

## Layout sketch (1440)

```
[◀ Thu, 15 Oct ▶] [Today] [Range]  [Warehouse: All ▾]  [🔍 Driver, truck, SO, invoice…        ]   Updated 12 s ago  [Export CSV]
┌Loading──┐┌On the road┐┌Back, invoices due┐┌Closed┐┌⚠ Needs attention┐   ← 5 tiles = status filter (aria-pressed)
48 orders: 30 delivered, 2 partial, 1 not delivered, 15 to go · 2,264 kg+ on these trips
Trips (5) | Invoices to collect (5) | Issues (2 open)                                   [List | Table]
──────────────────────────────────────────────────────────────────────────────────────────────────
TRK-2002  Trip 1 of 1 · METS │ Casey Runner ☎ · Sam Helper ☎ │ Load ✓ ─ Deliver 3 of 5 ─ Return │ ✓1 ◐1 ✕1 │ 3/5 received │ No activity 42 min
          ⚠ No activity  ✕ Not delivered  ◐ Partial  📍 Far check-in
…
Not assigned today (1) ▸
```

Trip row = one `<button>`-like row (role=button, Enter/Space) in a 1px-ruled list, columns on ≥1024: truck | crew | rail |
outcomes | invoices | last activity; attention chips on a second line. < 1024 the columns wrap into two/three lines;
390 = stacked card per trip (still 1px rules, no shadows).

Drawer: right, 560px, full height, 1px left line + soft shadow; < 768px full-screen sheet. Header sticky with
◀ ▶ (prev/next trip) and ✕. Sections: Header · Stops · Invoices · Issues · Activity log (collapsed) · Other days (collapsed).

Rail: three equal segments joined by 1px lines. Done = ink check, current = accent (info) bold label + sub-text, future = muted.
Closed shows "Closed ✓" in positive.

## Check against generic defaults
- No KPI "cards with coloured big numbers" (old strip): tiles are flat, number in ink; colour only on the attention tile icon.
- No blue initials avatars: names are text with a phone link.
- No uppercase micro-labels; sentence case everywhere (SPEC 3.9).
- No rounded-xl + shadow cards stacked; lists are ruled rows inside one bordered container.
- No progress bars duplicating numbers; the rail carries progress as words ("3 of 5 stops").
- Accent used once (current step); everything else ink / muted / status colours with icon + word.
