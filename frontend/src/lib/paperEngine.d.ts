export type PaperEvent={
 side:'BUY'|'SELL'; observedAt:string;sourceBarCloseAt:string;priceINR:number;
 feeINR:number;quantity:number;realizedPnlINR:number|null;
 executionType:'VIRTUAL_SOURCE_SNAPSHOT';
};
export type PaperSession={
 strategyId:string;status:string;startedAt:number;lastProcessedClose:number;
 cash:number;quantity:number;feesINR:number;equityINR:number;lastQuoteAt:string|null;
 entryValueINR:number;events:PaperEvent[];pausedReason:string|null;
};
export type PaperGroup={
 schema:1;mode:'LOCAL_FORWARD_PAPER_TRIAL';symbol:string;currency:'INR';
 createdAt:string;updatedAt:string;capitalPerStrategyINR:number;
 realOrdersEnabled:false;sessions:PaperSession[];
};
export declare const PAPER_STORE_KEY:string;
export declare function createPaperGroup(symbol?:string,now?:number):PaperGroup;
export declare function pausePaperGroup(group:PaperGroup,reason?:string,now?:number):PaperGroup;
export declare function resumePaperGroup(group:PaperGroup,now?:number):PaperGroup;
export declare function advancePaperGroup(group:PaperGroup,
 bars:Array<{time:number;open:number;high:number;low:number;close:number;volume:number}>,
 quote:{symbol:string;currency:'INR';price:number;sourceAt:string},now?:number):PaperGroup;
export declare function summarizePaperGroup(group:PaperGroup|null):Array<{
 strategyId:string;status:string;capitalINR:number;virtualEquityINR:number;
 modeledPnlINR:number;events:number;openPosition:boolean;lastQuoteAt:string|null;
 pausedReason:string|null;
}>;
