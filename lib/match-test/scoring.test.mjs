import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const cache = new Map();
function load(file) {
  const filename=resolve(file);
  if(cache.has(filename)) return cache.get(filename);
  const loadedModule={exports:{}};
  cache.set(filename,loadedModule.exports);
  const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const context=vm.createContext({module:loadedModule,exports:loadedModule.exports,require:(specifier)=>load(resolve(dirname(filename),specifier+'.ts'))});
  new vm.Script(code,{filename}).runInContext(context);
  cache.set(filename,loadedModule.exports);
  return loadedModule.exports;
}
const plain=value=>JSON.parse(JSON.stringify(value));
const fixtureCodes={
Q01:{1:'KEEP_PRIVATE',3:'SHARE_LATER',5:'SHARE_NOW'},Q03:{1:'PROCESS_PRIVATELY',3:'PROCESS_THEN_SHARE',5:'TALK_TO_PROCESS'},
Q04:{1:'PAUSE_FIRST',3:'RESPOND_TO_DISCUSSION',5:'INITIATE_DISCUSSION'},Q07:{1:'SEPARATE_FINANCES',3:'SHARED_AND_PERSONAL',5:'JOINT_FINANCES'},
Q09:{1:'MINIMUM_SHARED_RULES',3:'COMMON_SPACE_RULES',5:'BROAD_SHARED_RULES'},Q10:{1:'OCCASION_BASED_VISITS',3:'OCCASIONAL_VISITS',5:'MONTHLY_VISITS'},
Q13:{1:'SHARED_REST',3:'SPLIT_REST_TIME',5:'PERSONAL_REST'},Q15:{1:'MAINLY_SHARED_LEISURE',3:'FLEXIBLE_LEISURE',5:'REGULAR_INDEPENDENT_LEISURE'},
Q16:{1:'DECIDE_AS_NEEDED',3:'BROAD_DIRECTION',5:'DETAILED_PLAN'}};
function fixture(overrides={}) {
  return Object.fromEntries(Array.from({length:18},(_,i)=>{
    const id='Q'+String(i+1).padStart(2,'0'), value=overrides[id]??3;
    return [id,fixtureCodes[id]?{kind:'scenario',optionId:fixtureCodes[id][value]}:{kind:'agreement',value}];
  }));
}
const domains=['emotional-openness','conflict-resolution','shared-life-coordination','family-interaction','personal-autonomy','future-planning'];

const {scoreMatchTest,scoreQuestionAnswer}=load(resolve(import.meta.dirname,'scoring.ts'));
const {MATCH_TEST_QUESTIONS:questions}=load(resolve(import.meta.dirname,'questions.ts'));
test('neutral, minimum and maximum scores use v3 answers with no reverse scoring',()=>{
 for(const [v,raw,display] of [[1,3,0],[3,9,50],[5,15,100]]) {
  const input=fixture(Object.fromEntries(Array.from({length:18},(_,i)=>['Q'+String(i+1).padStart(2,'0'),v])));
  const before=JSON.stringify(input), result=scoreMatchTest(input);
  assert.equal(result.ok,true);
  assert.deepEqual(plain(result.domainScores.map(d=>[d.rawScore,d.displayScore])),domains.map(()=>[raw,display]));
  assert.equal(JSON.stringify(input),before);
  assert.equal(JSON.stringify(result),JSON.stringify(scoreMatchTest(input)));
  assert.equal('totalScore' in result,false);
 }
});
test('all valid domain combinations score by meaning and equal weights',()=>{
 for(let domain=0;domain<6;domain++){
  const ids=Array.from({length:3},(_,i)=>'Q'+String(domain*3+i+1).padStart(2,'0'));
  const values=ids.map(id=>fixtureCodes[id]?[1,3,5]:[1,2,3,4,5]);
  for(const a of values[0])for(const b of values[1])for(const c of values[2]){
   const result=scoreMatchTest(fixture({[ids[0]]:a,[ids[1]]:b,[ids[2]]:c}));
   assert.equal(result.ok,true);
   const d=result.domainScores[domain], raw=a+b+c;
   assert.equal(d.rawScore,raw); assert.equal(d.displayScore,Math.round((raw-3)/12*100));
   assert.equal(d.band,raw<=7?'low':raw<=10?'middle':'high');
   assert.deepEqual(plain(d.adjustedScores.map(x=>x.score)),[a,b,c]);
  }
 }
});
test('scenario scoring is independent of display order and rejects other-question codes',()=>{
 const q=questions.find(q=>q.id==='Q01');
 assert.equal(scoreQuestionAnswer(q,{kind:'scenario',optionId:'SHARE_NOW'}),5);
 assert.equal(scoreQuestionAnswer({...q,options:[...q.options].reverse()},{kind:'scenario',optionId:'SHARE_NOW'}),5);
 assert.equal(scoreQuestionAnswer(q,{kind:'scenario',optionId:'MONTHLY_VISITS'}),null);
});
test('rejects incomplete, legacy, wrong-kind, injected-score and malformed answers',()=>{
 const missing=fixture();delete missing.Q18;
 const cases=[null,[],missing,{...fixture(),Q19:{kind:'agreement',value:3}},Object.fromEntries(Object.keys(fixture()).map(id=>[id,3])),
 ...[0,6,1.5,'3',null,NaN].map(value=>({...fixture(),Q02:{kind:'agreement',value}})),
 {...fixture(),Q01:{kind:'agreement',value:3}},
 {...fixture(),Q01:{kind:'scenario',optionId:'SHARE_NOW',score:1}},
 {...fixture(),Q02:{kind:'agreement',value:3,score:5}},
 {...fixture(),Q01:{kind:'scenario',optionId:'UNKNOWN'}}];
 for(const input of cases)assert.deepEqual(plain(scoreMatchTest(input)),{ok:false,error:'invalid-answers'});
});
