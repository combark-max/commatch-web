import type {QuestionId,MatchTestAnswer} from './types';
import {parseMatchTestAnswer,scoreMatchTest} from './scoring';
export const MATCH_TEST_V3_STORAGE_KEY='commatch-match-test:v3';
export const MATCH_TEST_DISPLAY_ORDER=[
 'Q01','Q04','Q07','Q10','Q13','Q16',
 'Q02','Q05','Q08','Q11','Q14','Q17',
 'Q03','Q06','Q09','Q12','Q15','Q18',
] as const satisfies readonly QuestionId[];
export type MatchTestSessionState={
 readonly schemaVersion:2;readonly testVersion:'3.0';readonly phase:'questions'|'result';
 readonly currentQuestionId:QuestionId;readonly answers:Readonly<Partial<Record<QuestionId,MatchTestAnswer>>>;
};
type SessionStorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const isRecord=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
export function parseMatchTestSession(serialized:string|null):MatchTestSessionState|null{
 if(!serialized)return null;
 try{
  const v:unknown=JSON.parse(serialized);
  if(!isRecord(v)||v.schemaVersion!==2||v.testVersion!=='3.0'||(v.phase!=='questions'&&v.phase!=='result')||
   !MATCH_TEST_DISPLAY_ORDER.includes(v.currentQuestionId as QuestionId)||!isRecord(v.answers))return null;
  const answers:Partial<Record<QuestionId,MatchTestAnswer>>={};
  for(const [id,input]of Object.entries(v.answers)){
   const answer=parseMatchTestAnswer(id,input);if(!answer)return null;answers[id as QuestionId]=answer;
  }
  const incomplete=v.phase==='result'&&!scoreMatchTest(answers).ok;
  return {schemaVersion:2,testVersion:'3.0',phase:incomplete?'questions':v.phase,
   currentQuestionId:incomplete?MATCH_TEST_DISPLAY_ORDER.find(id=>!answers[id])??'Q01':v.currentQuestionId as QuestionId,answers};
 }catch{return null;}
}
export function readMatchTestSession(storage:SessionStorageLike):MatchTestSessionState|null{
 try{
  const raw=storage.getItem(MATCH_TEST_V3_STORAGE_KEY);
  if(raw===null)return null;
  const value=parseMatchTestSession(raw);
  if(!value){try{storage.removeItem(MATCH_TEST_V3_STORAGE_KEY);}catch{/* Memory flow remains available. */}}
  return value;
 }catch{return null;}
}
export function writeMatchTestSession(storage:SessionStorageLike,state:MatchTestSessionState,restorationComplete:boolean):boolean{
 if(!restorationComplete)return false;
 try{
  const canonical=parseMatchTestSession(JSON.stringify(state));if(!canonical)return false;
  storage.setItem(MATCH_TEST_V3_STORAGE_KEY,JSON.stringify(canonical));return true;
 }catch{return false;}
}
export function clearMatchTestSession(storage:SessionStorageLike):boolean{
 try{storage.removeItem(MATCH_TEST_V3_STORAGE_KEY);return true;}catch{return false;}
}
