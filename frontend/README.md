# Atlas Control Center — public read-only research preview

React + TypeScript + Vite frontend for Atlas, deployed separately from the offline trading engine.

## Safety boundaries

- No broker API, execution endpoints, personal account balances, real orders, or bearer tokens are imported or exposed.
- `src/data/snapshot.json` is a **sanitized historical fixture** exported from locally certified artifacts, not a live feed. All research figures are explicitly labeled archived simulation.
- Public browser has **no capability to authorize capital, call brokers, change emergency state, or write to Atlas**.
- Live execution remains blocked; the existing Atlas Python security/governance gates are independent.

## Development

```bash
python3 scripts/export_atlas_dashboard.py # from Atlas repo root, with PYTHONPATH=src
cd frontend
npm ci
npm run build
npm run dev
```

For live read-only `/api/*` responses in local development, also start
`npm run dev:api` in a second terminal. This adapter binds to `127.0.0.1`
only, uses a fixed list of public GET handlers, and never places orders.
Without it, the Vite UI still loads but API requests fail closed.

The export script deliberately allowlists aggregate results, timestamps and source hashes; private artifact logs and raw vendor/account data remain outside the frontend.

Vercel project configuration: framework Vite, root directory `frontend`, output `dist`. The release does not need backend credentials.

## Git-triggered deployment troubleshooting

Vercel's `atlas-control-center` project is on the Hobby plan and linked to the personal `hajihaz/Atlas` GitHub repository. For Git-triggered deployments from a **private** repository, the commit author must resolve to the Vercel Hobby team owner. Verify both the Vercel owner's GitHub Login Connection and the email used for each **new** Git commit. A blocked deployment is not a frontend build failure and should not be bypassed by weakening deployment access checks.

Release acceptance: GitHub `atlas-ui` and `atlas-python-ci` must pass, Vercel's `source: git` deployment for the same main-branch SHA must reach `READY`, and the public `atlas-control-center-pi.vercel.app` domain must serve the read-only dashboard. A successful manual CLI deployment alone does not prove Git automation is working.

Keep the project root at `frontend`; do not inject broker credentials, enable backend trading, or expose unsanitized artifacts to resolve deployment errors.
