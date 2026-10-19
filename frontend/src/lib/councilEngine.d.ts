export type CouncilStrategy={id:string;name:string;status?:string;
  modeledReturnPct?:number;maxDrawdownPct?:number;endingEquityINR?:number};
export type CouncilLab={schema:number;mode:string;symbol:string;currency:string;
  liveOrdersEnabled:boolean;paperOrdersExecuted:boolean;paperLedgerStored:boolean;
  barCount:number;source:string;generatedAt:string;latestClosedAt:string|null;
  strategies:CouncilStrategy[]};
export type CouncilAgent={id:'scout'|'news'|'sentiment'|'charts'|'risk'|'decision';
  status:string;detail:string};
export type CouncilResult={schema:1;mode:'ADVISORY_RESEARCH_ONLY';symbol:string|null;
  strategyId:string;generatedAt:string;outcome:'WAIT'|'SKIP';agents:CouncilAgent[];
  roles:readonly string[];liveOrdersEnabled:false;realOrdersPlaced:0;rationale:string};
export type CouncilNews={schema:1;mode:'SOURCE_HEADLINES_ONLY';symbol:string;
  observedAt:string;source:string;publicationVerified:false;
  liveOrdersEnabled:false;realOrdersPlaced:0;status:string;
  articles:Array<{title:string;url:string;sourceDomain:string;discoveredAt:string}>};
export declare function evaluateCouncil(lab:CouncilLab|null,strategyId:string,
  now?:number,newsEvidence?:CouncilNews|null):CouncilResult;
