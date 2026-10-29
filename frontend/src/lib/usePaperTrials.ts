// Retired legacy five-strategy browser engine. Persisted local history is not erased.
// The only allowed Atlas strategy is ScalpStorm X, run by the separate paper engine.
import type {PaperGroup} from './paperEngine.js';
const denied=()=>{};
export function usePaperTrials(){
 return {group:null as PaperGroup|null,providerMessage:'Retired: only ScalpStorm X is active.',
  start:denied,pause:denied,resume:denied,clear:denied};
}
