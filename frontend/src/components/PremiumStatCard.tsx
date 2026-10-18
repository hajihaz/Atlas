import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type CardTone = 'mint' | 'blue' | 'violet' | 'amber';

type Props = {
  icon: LucideIcon;
  title: string;
  value: string;
  sub: string;
  subIcon: ReactNode;
  isPositive?: boolean;
  kind?: 'warning';
  tone?: CardTone;
  tag?: string;
  series?: readonly number[];
};

function HistoricSparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2 || values.some(value => !Number.isFinite(value))) return null;
  const low = Math.min(...values);
  const spread = Math.max(...values) - low || 1;
  const coordinates = values.map((value, index) => {
    const x = 3 + (index / (values.length - 1)) * 154;
    const y = 40 - ((value - low) / spread) * 32;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return (
    <svg className="premium-stat-spark" viewBox="0 0 160 48" role="img"
      aria-label="Historical replay trend, not live portfolio performance" preserveAspectRatio="none">
      <polyline points={coordinates} fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/** Dependency-free motion-style card; all effects respect reduced-motion settings. */
export default function PremiumStatCard({
  icon: Icon, title, value, sub, subIcon, isPositive, kind,
  tone = 'mint', tag, series,
}: Props) {
  return (
    <article className={`premium-stat-card panel premium-glass tone-${tone}`}>
      <div className="premium-stat-head">
        <span className="premium-stat-title">{title}</span>
        <span className="premium-stat-icon"><Icon size={19} strokeWidth={1.8}/></span>
      </div>
      <div className="premium-stat-middle">
        <strong className={`premium-stat-value ${kind === 'warning' ? 'warning-text' : ''}`}>
          {value}
        </strong>
        {series && <HistoricSparkline values={series}/>}
      </div>
      <div className={`premium-stat-foot ${isPositive ? 'positive' : ''}`}>
        <span className="premium-stat-subicon">{subIcon}</span>
        <span>{sub}</span>
      </div>
      {tag && <span className="premium-stat-tag">{tag}</span>}
    </article>
  );
}
