export type CloudDayEvent={
  side:'BUY'|'SELL';at:string;completedBarAt:string;priceINR:number;
  quantity:number;feeINR:number;realizedPnlINR:number|null;note:string;
};
export type CloudDay={
 dayIST:string;checkpoints:number;modeledBuys:number;modeledSells:number;
 modeledFeesINR:number;realizedExitPnlINR:number;firstEquityINR:number|null;
 lastEquityINR:number|null;lastSnapshotAt:string|null;
 dayChangeINR:number|null;changeBasis:string;events:CloudDayEvent[];
};
export type CloudStrategyDaybook={
 strategyId:string;strategyName:string;status:string;
 virtualCapitalINR:number;virtualEquityINR:number;totalModeledPnlINR:number;
 realizedExitPnlINR:number;feesINR:number;maxDrawdownPct:number;
 closedTrades:number;modeledFillsInRetainedHistory:number;days:CloudDay[];
};
export type CloudPaperSummary={
 schema:1;mode:'PUBLIC_READ_ONLY_PAPER_DAYBOOK';currency:'INR';
 generatedFrom:string;source:string|null;sourceSymbol:string;interval:string;
 sourceBarClosedAt:string|null;lastAttemptAt:string|null;status:string;
 virtualCapitalPerIndependentStrategyINR:number;actualCapitalINR:0;
 realOrdersEnabled:false;strategyAccountsAreIndependent:true;
 runCount:number;skippedIntervals:number;alert:string|null;
 strategies:CloudStrategyDaybook[];disclaimer:string;
};
export declare function istDay(iso:string):string;
export declare function buildCloudPaperSummary(report:unknown):CloudPaperSummary;
