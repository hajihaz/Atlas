# Atlas paper-daybook source chronology hardening — 20 October 2026

The daybook remains read-only and derives every displayed number from
`frontend/public/cloud-paper.json`. This patch narrows acceptance of
untrusted or malformed published data:

- Every equity observation and hypothetical fill must occur between
  the recorded source experiment's creation time and the last runner
  checkpoint (allowing five seconds for clock tolerance).
- A modeled trade's completed-bar timestamp cannot occur after its
  recorded quote time.
- Only explicitly labeled `HYPOTHETICAL_AFTER_OBSERVED_SIGNAL` events are
  accepted, with modeled exit P/L present on SELL and absent on BUY.
- Five initialized virtual accounts must have an actual creation time,
  runner timestamp and positive integer run count.
- Unit tests inject forged future profit, invalid trade mode and
  impossible timestamps. They must all fail closed.

The branch does not import exchange/broker software, use API keys, change
virtual balances, create trades or consume paid services. The cumulative
paper runner's own source gates remain unchanged.

Acceptance: PR frontend and Python CI, Vercel preview JSON smoke,
merge, production READY, and production daybook matching the raw
`cloud-paper.json` report. Actual recurring scheduled-run certification
is a separate pending gate.
