export type StreamQuote={
  symbol:string;currency:'INR';price:number;bid:null;ask:null;
  sourceAt:string;ageSeconds:number;status:string;provider:string;
};
export declare const STREAM_ASSETS:ReadonlyArray<string>;
export declare function parseMarketFrame(frame:string,now?:number):StreamQuote[];
export declare function startPublicStream(options:{
  onQuote:(quote:StreamQuote)=>void;
  onStatus?:(status:string)=>void;
  WebSocketType?:typeof WebSocket;
  now?:()=>number;
  after?:typeof setTimeout;
  cancel?:typeof clearTimeout;
}):()=>void;
