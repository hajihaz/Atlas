export type PaperCadence = {state:'INVALID_FUTURE_SNAPSHOT'|'LATE_OR_NOT_PUBLISHED'|'CHECKPOINT_SAVED'|'AWAITING_FIRST_RUN';lastDueAt:string;nextDueAt:string;lastRunAgeMinutes:number|null;overdue:boolean;unpublishedNominalSlots48h:number|null};
export declare function assessPaperCadence(lastRunAt:string|null, now?:number):PaperCadence;
