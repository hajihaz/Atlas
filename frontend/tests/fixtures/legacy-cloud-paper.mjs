// Fixed hypothetical legacy ledger for unit tests. Never use the moving
// published report as an editable fixture: scheduled runs append real proof.
import {freshState} from '../../../scripts/scheduled_paper_engine.mjs';
export function legacyCloudPaperFixture(){
 const created='2026-10-19T22:37:32.197Z';
 const report=freshState('BTCINR',Date.parse('2026-10-19T22:00:00.000Z'),
   Date.parse(created),{sourceAt:'2026-10-19T22:37:31.000Z'});
 return {...report,lastRunAt:'2026-10-20T12:40:18.345Z',
   lastProviderAt:'2026-10-20T12:40:17.000Z',
   lastBarClosedAt:'2026-10-20T12:00:00.000Z',
   runCount:4,skippedIntervals:6,status:'DEGRADED',
   lastSourceCheck:{status:'BLOCKED',code:'CLOSED_CANDLE_TOO_OLD',
     candleAgeMinutes:97,latencyClass:'RECENT_OR_UNVERIFIED'}};
}
