export function recoveryPlan(position: {cursor?:string}|null|undefined, state: {cursor?:string}|null|undefined, firstCursor: string|null): {needed:boolean;fromCursor:string|null;toCursor:string|null;stateAvailable:boolean;instruction:string}
export type HumanTrace = {id:string;bookId:string;kind:'highlight'|'annotation';author:{role:string;name:string};quote:string;text?:string;createdAt:string;cursor?:string;locator?:unknown}
export function humanTraces(highlights:unknown[],annotations:unknown[],authorName?:string): HumanTrace[]
export function tracesInBlocks(traces:HumanTrace[],chapters:{index:number;paragraphs:string[]}[],blocks:{rangeId:string}[]): HumanTrace[]
export function sampleAnnotations(traces:HumanTrace[],chapters:Map<string,{index:number;paragraphs:string[]}[]>,limit?:number,random?:()=>number): HumanTrace[]
