import {MATCH_TEST_DOMAINS,MATCH_TEST_QUESTIONS} from './questions';
import type {QuestionId,MatchTestAnswer,MatchTestQuestion,MatchTestScoringResult,LikertValue,DomainScore} from './types';
const QUESTION_BY_ID = new Map<string,MatchTestQuestion>(MATCH_TEST_QUESTIONS.map(q=>[q.id,q]));
const invalid={ok:false,error:'invalid-answers'} as const;
const isRecord=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);

export function scoreQuestionAnswer(question:MatchTestQuestion,input:unknown):LikertValue|null {
 if(!isRecord(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'kind'))return null;
 if(question.kind==='scenario'){
  if(input.kind!=='scenario'||!Object.hasOwn(input,'optionId')||typeof input.optionId!=='string')return null;
  return question.options.find(option=>option.code===input.optionId)?.score??null;
 }
 if(input.kind!=='agreement'||!Object.hasOwn(input,'value')||typeof input.value!=='number'||!Number.isInteger(input.value)||input.value<1||input.value>5)return null;
 return input.value as LikertValue;
}
export function parseMatchTestAnswer(questionId:unknown,input:unknown):MatchTestAnswer|null {
 if(typeof questionId!=='string')return null;
 const q=QUESTION_BY_ID.get(questionId);
 if(!q||scoreQuestionAnswer(q,input)===null||!isRecord(input))return null;
 return q.kind==='scenario'?{kind:'scenario',optionId:input.optionId as string}:{kind:'agreement',value:input.value as LikertValue};
}
export function scoreMatchTest(input:unknown):MatchTestScoringResult {
 if(!isRecord(input)||Object.keys(input).length!==18||Object.keys(input).some(id=>!QUESTION_BY_ID.has(id)))return invalid;
 const entries=new Map<QuestionId,{questionId:QuestionId;score:LikertValue;answer:MatchTestAnswer}>();
 for(const q of MATCH_TEST_QUESTIONS){
  if(!Object.hasOwn(input,q.id))return invalid;
  const answer=parseMatchTestAnswer(q.id,input[q.id]),score=scoreQuestionAnswer(q,input[q.id]);
  if(!answer||score===null)return invalid;
  entries.set(q.id,{questionId:q.id,score,answer});
 }
 const domainScores:DomainScore[]=MATCH_TEST_DOMAINS.map(({id})=>{
  const adjustedScores=MATCH_TEST_QUESTIONS.filter(q=>q.domainId===id).map(q=>entries.get(q.id)!);
  const rawScore=adjustedScores.reduce((total,item)=>total+item.score,0);
  const normalizedScore=(rawScore-3)/12*100;
  return {domainId:id,rawScore,normalizedScore,displayScore:Math.round(normalizedScore),band:rawScore<=7?'low':rawScore<=10?'middle':'high',adjustedScores};
 });
 return {ok:true,domainScores};
}
