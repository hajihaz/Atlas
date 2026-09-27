"""Trading calendars — the ground truth for "was there a session?" (gap detection)."""

from __future__ import annotations

from atlas.data.calendars.nse_calendar import NSE, TradingCalendar

__all__ = ["NSE", "TradingCalendar"]
