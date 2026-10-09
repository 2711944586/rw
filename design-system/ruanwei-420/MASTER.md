# Ruanwei 420 — Design System

The generator's first match was a marketing page (purple, testimonials, Fira Code). That match is rejected. This file is the system actually used.

## Thesis

A desk for one exam candidate. Warm paper, a text sidebar with one rust mark, and one ink task block. Density has two steps, 执行 and 诊断, on the same content width. Numbers use Geist. Chinese uses Noto Sans SC.

## Sources

- Product match: Productivity Tool — flat design, Swiss minimalism, clear hierarchy, functional color.
- Style match: Minimalism & Swiss Style — grid, one accent, no decorative shadow.
- Typography match: Noto Sans SC for headings and body.
- Chart match: 14 discrete days use bars; a score series of 4 or more can use a line. Empty days are a baseline, not a fake bar.
- Stack note: shadcn guidance applies to form labeling and focus. The production app stays Vite + vanilla JS until a separate migration. Do not add React to restyle a page.

## Tokens

| Role | Value |
|---|---|
| Paper | `#f4f1ea` |
| Surface | `#fffcf7` |
| Ink | `#1c1915` |
| Text | `#3f382f` |
| Muted | `#6f655b` |
| Line | `rgba(48, 38, 26, 0.10)` |
| Accent | `#9a3412` |
| Action block | `#1c1915` |
| On action | `#ffffff` |
| Space | 4 / 8 / 12 / 16 / 24 / 32 |
| Radius | 6 / 8 / 12 |
| Shadow | none |
| Type | 12 / 13 / 15 / 20 / 28 |
| Motion | 180ms, transform and opacity only |

## Page jobs

- Dashboard: the next task, then whether the last 14 days happened.
- Today: one current task. The log form stays secondary.
- Week: seven days read as columns.
- Review: one sentence, then the numbers that support it.
- Scores: the series first, summary numbers second.

## Do not

- Purple, teal, or green accents. The palette gate rejects saturated green and teal.
- Glass, large gradients, floating card shadows.
- Inline `style` attributes. Production CSP blocks them.
- New `!important`. The CSS debt ratchet cannot rise.
- A second headline that repeats the top bar. The dashboard keeps one live sentence under the page title.
