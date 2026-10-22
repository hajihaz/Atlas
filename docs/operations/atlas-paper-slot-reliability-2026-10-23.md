# Atlas paper scheduling: safe earlier forward-recovery slots

Date: 2026-10-23. Research only; no broker API, capital or fee plan changes.

## Observed release evidence
Source of record: the genuine `frontend/public/cloud-paper.json` ledger, saved
2026-10-22 22:22:01.310 UTC on main commit `05bc30f`.

- Recorded runner attempts: 16; 14 append-only retained checkpoint records.
- Nine source-accepted records: two `RUNNING` and seven `GAP_SKIPPED`.
- Five source-rejected records: one `CLOSED_CANDLE_TOO_OLD` and four
  `SIMULATION_VALIDATION_FAILED`. The generic four require log-level
  diagnosis; they cannot honestly be classified as provider failures.
- Cumulative missed two-hour intervals: 28; actual hypothetical fills: zero.
- Each of five independent strategy accounts retains the original ₹1,00,000
  virtual model balance. Actual capital remains ₹0.
- Source-accepted recorded candle ages were 20, 22, 26, 28, 30, 40,
  69, 74 and 86 minutes. These are recorded ages at run time, NOT a
  guarantee of when each bar first became available.

## Intervention
Prior nominal attempts occurred at 65 and 77 minutes after each even-hour
UTC source-bar close; these left only 25 and 13 minutes of the strict
90-minute gate for GitHub schedule slippage.

New cost-neutral nominal attempts after each even UTC bar close:
- `35 0-22/2 * * *` (+35 min, early opportunity);
- `20 1-23/2 * * *` (+80 min, hedge observed 77-minute delayed source).

The budget remains **24 nominal attempts per UTC day** (2 per two-hour
bar, unchanged). Eligibility continues to require 55 consecutive source
bars, independently fresh <=90-second public quote, and source-bar age
<=90 minutes. The UI's `assessPaperCadence` uses the exact new slots.
An overdue hint means the expected saved ledger did not appear by the
grace window, not proof that GitHub Actions failed.

## Recoverability and acceptance
If one source bar was missed, `advanceCloud` still records
`GAP_SKIPPED` with zero retroactive fills. Only a subsequently observed
**consecutive** fresh bar may model an entirely new future signal.
This intervention improves schedule timing opportunities, not guaranteed
continuous execution or recovered missed trades.

Must verify workflow/UI slot consistency, simulated boundary tests, Node
and Python CI, clean diff excluding `frontend/public/cloud-paper.json`,
and GitHub/Vercel release evidence. No synthetic backfill or P/L claims.
A genuine next accepted consecutive checkpoint is required to demonstrate
the change actually improves forward execution; cannot be asserted from CI.
