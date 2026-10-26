#!/usr/bin/env python3
"""Run the isolated GET-only source collector for the owner NSE paper pilot."""
from atlas.integrations.nse_pilot_capture import main

if __name__ == "__main__":
    raise SystemExit(main())
