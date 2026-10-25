export type KrakenQuote={
 symbol:string;currency:'USD';price:number;bid:null;ask:null;sourceAt:string;
 ageSeconds:number;tradeId:number;provider:string;status:string;
};
export declare const KRAKEN_ASSETS:ReadonlyArray<string>;
export declare function parseKrakenTrades(frame:string,now?:number):KrakenQuote[];
export declare function startKrakenStream(options:{
 onQuote:(quote:KrakenQuote)=>void;onStatus?:(status:string)=>void;
 WebSocketType?:typeof WebSocket;now?:()=>number;after?:typeof setTimeout;cancel?:typeof clearTimeout;
}):()=>void;
