# Atlas — 26 October 2026 owner-independent continuation

A real Core4 Engineers deadline notification reached macOS, but clicking it could leave an already-open Atlas tab showing Live Paper Lab while its URL said **#ipo**. The app initialized its page from the fragment only once.

The app now responds to fragment changes, closes an open mobile menu, and focuses the requested content. Leaving ScalpStorm also clears its stale fragment. This preserves the existing IPO and ScalpStorm links.

## Verification

- The existing scheduled sender created the genuine Core4 deadline alert at **26 October 2026, 00:00:55 IST**; the browser reported display at **00:00:58 IST**.
- An authorized agent clicked the observed macOS notification at **08:00:07 IST**. The authenticated audit now reports **device_notification_clicked**, **browserDisplayed: true**, and **deviceConfirmed: true**. This verifies a device click; it does not claim Haji personally read the alert.
- No notification was resent and no synthetic receipt was created.
- Before the repair, a real-browser regression reproduced the wrong visible page after a fragment navigation. After the repair, all **seven browser checks** passed, including browser history, a 320px mobile menu, content focus, and clearing a stale ScalpStorm fragment.
- Actual Safari navigation through the same open owner tab now shows **IPO Intelligence** and **Core4 Engineers: Notification clicked**.
- **31 relevant Node tests** passed. TypeScript and the production frontend build passed.
- Reproduce the browser regression against the owner runtime with **node frontend/tests/notification-navigation.browser.mjs**. **ATLAS_BASE_URL** and **ATLAS_CHROME_PATH** support an alternate test server or Chrome installation. The harness blocks non-read HTTP requests.

## New forward-paper evidence

Checkpoints **27–29** have exact normalized-input receipts matching their published Git snapshot bytes. All **15 newly evaluated strategy signals** matched independent recomputation. Checkpoint 27 added one modeled Breakout 20 buy.

The Mac entered low-battery hibernation at **03:45:15 IST** with 1% battery and woke on AC power at **07:52:01 IST**. The existing services recovered without a manual restart. Checkpoint **30**, at **07:56:37 IST**, correctly retained the missed interval, recorded **NOT_EVALUATED** for all five strategies, and created no trades. Its input receipt and published bytes also match.

The old checkpoint verifier expected **RUNNING** and incorrectly treated this intentional skipped interval as a signal mismatch. A separate audit verifies evaluated decisions and skipped-interval invariants independently.

| Strategy | Virtual equity at checkpoint 30 | Marked P/L | Modeled fees | Fills | Completed exits |
| --- | ---: | ---: | ---: | ---: | ---: |
| SMA 9/21 | ₹98,983.67 | −₹1,016.33 | ₹99.90 | 1 | 0 |
| EMA 12/26 | ₹1,00,000.00 | ₹0.00 | ₹0.00 | 0 | 0 |
| RSI 14 | ₹1,00,000.00 | ₹0.00 | ₹0.00 | 0 | 0 |
| Breakout 20 | ₹98,452.52 | −₹1,547.48 | ₹99.90 | 1 | 0 |
| SPS pullback | ₹1,00,000.00 | ₹0.00 | ₹0.00 | 0 | 0 |

These are separate virtual accounts marked from the saved CoinDCX quote at **07:56:37 IST**, not realized trading returns or a combined portfolio. Cash, quantities, fees, costs and marked equity were independently reconciled. The original 1,860 fills, losses and risk halts remain preserved. Actual capital remains ₹0 and real orders remain disabled.

## Remaining acceptance conditions

The real deadline receipt and navigation repair are verified. Strategy qualification still needs sufficient genuine observations and permitted NSE history. No 20-session NSE backtest has been certified. Upstox remains parked pending Haji's activation confirmation.

GitHub's verified 2,000-minute included allowance was exhausted; its recorded reset is 1 November 2026. Production release still requires the exact-head hosted checks and normal final acceptance. This continuation does not bypass those conditions or change the frozen 84/100 milestone baseline.
