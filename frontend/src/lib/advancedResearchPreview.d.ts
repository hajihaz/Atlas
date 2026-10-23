export type AdvancedResearchTrade={time:number;side:'BUY'|'SELL';priceINR:number;
 quantity:number;feeINR:number;realizedPnlINR:number|null};
export type AdvancedResearchStrategy={
 id:string;name:string;version:string;capitalINR:number;endingEquityINR:number;
 modeledReturnPct:number;modeledNetPnlINR:number;realizedPnlINR:number;
 maxDrawdownPct:number;closedTrades:number;wins:number;winRatePct:number|null;
 feesINR:number;openQuantity:number;trades:AdvancedResearchTrade[];
 equity:{time:number;equityINR:number}[];riskEventCount:number;
};
export type AdvancedResearchPreview={
 symbol:string;generatedAt:string;fixtureOnly:boolean;mode:string;
 barCount:number;sourceProvider:string;dataHash:string;envelopeHash:string;
 strategies:AdvancedResearchStrategy[];
 sourceVerifiedByBrowser:false;performanceCertified:false;
 forwardPaperImported:false;realOrdersEnabled:false;
};
export declare function inspectAdvancedResearchEnvelope(value:unknown):AdvancedResearchPreview;
