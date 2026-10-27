export type SourceCandle={time:number;open:number;high:number;low:number;close:number;volume:number};
export function chartCandles(rows:SourceCandle[],now?:number):{time:number;open:number;high:number;low:number;close:number}[];
export function chartObservations(rows:{time:number;close:number}[],after?:number,now?:number):{time:number;value:number}[];
