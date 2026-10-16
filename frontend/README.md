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

The export script deliberately allowlists aggregate results, timestamps and source hashes; private artifact logs and raw vendor/account data remain outside the frontend.

Vercel project configuration: framework Vite, root directory `frontend`, output `dist`. The release does not need backend credentials.
