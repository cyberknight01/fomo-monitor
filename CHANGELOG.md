# Changelog

## V0.1.1 — Alert reliability and financial display

- Persist the arming market cap so a crossed level can still be detected if transient market state is lost.
- Show current market cap, last threshold check, Telegram readiness, and pending/sent status for every rule.
- Show estimated average entry market cap prominently for KOLs in all three ranking filters.
- Present recorded buy/sell amount and market cap with distinct green, red, and yellow financial emphasis.

## V0.1 — Initial GitHub release

- Chrome Manifest V3 background API monitor for positions and followed KOLs.
- Chinese and English UI, resizable monitor window, sticky monitor and settings headers.
- Market cap and next KOL batch countdowns based on Chrome alarm scheduling.
- Telegram action badges and bold titles for first buys, additions, reductions and exits.
- Per-token controls, upward/downward market cap levels, ranking filters and recorded activity.
- 54 automated tests and a GitHub Actions test workflow.

Countdowns are estimates of scheduled work, not guaranteed delivery times. Lowest-entry ranking covers only the returned holder sample. AI analysis remains a disabled future feature.
