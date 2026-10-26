export interface DayTraderDemo {
  sessions: Array<{session:string; reason:string; shares:number; entry:number|null; exit:number|null; netPnl:number}>;
  totalNet:number;
  monteCarlo:{trials:number; p05:number; median:number; p95:number; positiveFraction:number; seed:number};
  safetyLabel:string;
}
export function validateDayTraderDemo(input:unknown):DayTraderDemo;
