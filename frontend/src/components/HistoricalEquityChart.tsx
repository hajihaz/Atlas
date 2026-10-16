import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Point = { dateLabel: string; equity: number };
type Props = { data: Point[]; min: number; max: number };
const usd = (n: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(n);

export default function HistoricalEquityChart({ data, min, max }: Props) {
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:10,right:5,left:-15,bottom:5}}><defs><linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#72e5bb" stopOpacity={0.25}/><stop offset="95%" stopColor="#72e5bb" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#24313d" strokeDasharray="4 7" vertical={false}/><XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{fill:'#697c8c',fontSize:11}} minTickGap={23} dy={12}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#697c8c',fontSize:11}} tickFormatter={(v:number)=>`$${(v/1000).toFixed(0)}k`} domain={[min,max]} width={56}/><Tooltip cursor={{stroke:'#86eac5',strokeDasharray:'3 6'}} content={({active,payload,label})=>active&&payload?.length ? <div className="chart-tooltip"><span>Historical date · {label}</span><strong>{usd(Number(payload[0].value))}</strong></div> : null}/><ReferenceLine y={100000} stroke="#658078" strokeDasharray="3 6"/><Area type="monotone" dataKey="equity" stroke="#8eebc9" strokeWidth={2.7} fill="url(#equityFill)" dot={false} activeDot={{r:4,fill:'#b0f7dd',stroke:'#0f191d',strokeWidth:3}} isAnimationActive={false}/></AreaChart></ResponsiveContainer>;
}
