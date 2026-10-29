// Exclusive owner-approved strategy surface. Legacy algorithms are research archives only.
import ScalpStormDetailed from './ScalpStormDetailed';
import ScalpStormAllocationPlan from './ScalpStormAllocationPlan';
export default function StrategyLabPage(_props:{mode?:'strategies'|'research'|'scalpstorm';goRisk?:()=>void}){
 return <><ScalpStormDetailed/><ScalpStormAllocationPlan/></>;
}
