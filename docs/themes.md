# Themes

A theme is one CSS file in `web/themes/`. No build step, no JavaScript: the panel finds the
files on its own (`_contract.css` and any name starting with `_` don't count as themes), and
the `T` key cycles through them.

A theme is not a palette. It can change colors, faces, sizes, borders and the **whole grid**:
where each widget sits, how much room it gets, even which ones appear.

## The contract

Every theme defines, inside `[data-theme="<name>"]`, **all** of these variables (the
authoritative list is the `REQUIRED` block at the top of `web/themes/_contract.css`; a theme
missing one isn't merged):

| Variable | Role |
|---|---|
| `--bg`, `--fg`, `--dim` | page background, text, secondary text |
| `--surface`, `--surface-alt` | widget backgrounds |
| `--accent` | emphasis: agenda times, stale data |
| `--up`, `--down` | signal: rising and falling, free and busy, a source that went down |
| `--line` | borders and rules |
| `--font-display`, `--font-body` | faces for numbers and for text |
| `--radius`, `--gap`, `--pad` | corners, space between widgets, screen margin |
| `--size-clock` | the clock |
| `--size-big`, `--size-val`, `--size-sub`, `--size-lab` | big number, value, supporting line, label |

`--size-clock` is the size the clock has when it fits. When its cell is short of room it gives
way to content, but only down to 75% of that size.

### Two layers of tokens

Declare the theme's raw colors first, then bind the roles to them:

```css
[data-theme="terminal"] {
  --amber: #FFB000; --amber-dim: #BA8B42; --void: #0A0A08; --phosphor: #46D46A; --ember: #E2574C;
  --bg: var(--void); --fg: var(--amber); --dim: var(--amber-dim);
  --accent: var(--phosphor); --up: var(--phosphor); --down: var(--ember);
}
```

Widgets only know the roles. The contrast check follows the `var()`s down to the hex value, so
raw colors must be `#rrggbb`.

## The grid

The panel is a `grid` with nine areas, which the theme lays out as it likes in
`[data-theme="<name>"] .vitral-grid`:

| Area | Widget |
|---|---|
| `clock` | time and date |
| `work`, `home` | work and personal calendars |
| `next` | next event |
| `btc`, `fx` | bitcoin and exchange rate |
| `weather` | weather |
| `chain` | bitcoin on-chain |
| `count` | countdowns |

```css
[data-theme="terminal"] .vitral-grid {
  grid-template-rows: 1.1fr 1.55fr 1.05fr 1.3fr;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-areas: "clock clock chain chain" "work work home home" "next next count count" "btc fx weather weather";
}
```

An area missing from `grid-template-areas` drops off the screen.

### Three width bands

Measurements come from the panel's container, not the window, so the same theme serves a TV
and a phone, and also works embedded in a larger page.

| Panel | Layout |
|---|---|
| wider than 620px | the theme's grid, no scrolling |
| up to 620px | two columns, scrolling vertically |
| up to 370px | one column |

In the two narrow bands the contract imposes the grid (with `!important`); the theme still
owns colors, faces and sizes.

## Four rules

- **Stay inside your `[data-theme="..."]`.** No global selectors.
- **Measure in `cqw`**, never `px`, `vw` or `vh`. The one exception is borders and radius of
  1 to 3px.
- **No words in `content:`.** Text in CSS escapes translation; symbols such as `"› "` are fine.
- **WCAG AA on every text/background pair**: `--fg`, `--dim`, `--accent`, `--up` and `--down`
  at 4.5:1 on `--bg`, `--surface` and `--surface-alt`. If a widget in your theme has a
  background of its own (like Estação's yellow plate), the text color on it is yours to
  get right: the contrast of every text is measured against its actual background.

## Fitting

When content doesn't fit its cell, the panel drops what is optional first (extra currencies
and pairs, forecast hours, the second on-chain line, extra countdowns, and events past the
first three, replaced by "+N more"). The floor never goes: time and date, each widget's
value, the change, the high/low and sunset, the fee and the halving, and at least three
events per calendar (on an ordinary day, all of them). A theme whose grid can't hold the floor
isn't ready; adjust rows and columns, not the type sizes down to unreadable.

## Checking your theme

Bring the stack up (`docker compose up -d --build web`), press `T` until your theme comes up,
and look at it at a TV size (1920×1080), a laptop (1366×768) and a phone (360px wide), in both
languages (`L`). Look for text that is cut or runs into other text, a separator with no room
around it, type too small to read from across the room, and a clock squeezed below its floor.

Before merging, every theme runs through a quality matrix: several sizes, both languages and
three data sets, including a day so busy that every optional item has to give way. What can
be measured is checked there; what is ugly is up to your eyes, so compare your screenshots
with the other themes before sending the pull request.
