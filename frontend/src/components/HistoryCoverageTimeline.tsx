type Day={day:string;symbols?:number;min_bars?:number;max_bars?:number};
export default function HistoryCoverageTimeline({dates,selected,onSelect}:{dates:Day[];selected:string;onSelect:(day:string)=>void}){
 const ordered=[...dates].sort((a,b)=>a.day.localeCompare(b.day));
 if(!ordered.length)return <p role="status">No dated minute bars are archived yet.</p>;
 return <div className="atlas-coverage-timeline"><div className="atlas-coverage-title"><strong>Historical data coverage</strong><span>{ordered.length} dates · choose a day below</span></div>
  <div className="atlas-coverage-bars" role="group" aria-label="Select a recorded market session">
   {ordered.map(item=>{const complete=item.symbols===10&&item.min_bars===375&&item.max_bars===375;
    return <button key={item.day} type="button" className={selected===item.day?'selected':''} onClick={()=>onSelect(item.day)} aria-pressed={selected===item.day}
     title={`${item.day}: ${item.symbols??0} archived stocks${complete?', full 375-minute sample':''}`} aria-label={`${item.day}, ${item.symbols??0} archived stocks${complete?', complete fixed sample':''}`}>
     <span style={{height:`${Math.max(12,Math.min(100,((item.symbols??0)/10)*100))}%`}} className={complete?'complete':'partial'}/></button>})}
  </div><div className="atlas-coverage-axis"><span>{ordered[0].day}</span><span>{ordered.at(-1)?.day}</span></div>
  <p><strong>What this graph means:</strong> each bar is one day; its height is the number of stocks with archived minute bars. Green means all ten sample stocks have 375 minutes. This is data availability, not investment return.</p>
 </div>;
}
