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

const api=load(resolve(import.meta.dirname,'session.ts'));
const state=(answers=fixture(),phase='result')=>({schemaVersion:2,testVersion:'3.0',phase,currentQuestionId:'Q18',answers});
function storage(){const values=new Map(),calls=[];return{values,calls,getItem(k){calls.push(['get',k]);return values.get(k)??null;},setItem(k,v){calls.push(['set',k]);values.set(k,v);},removeItem(k){calls.push(['remove',k]);values.delete(k);}};}
test('v3 contract restores partial and complete answers without reusing v2',()=>{
 assert.equal(api.MATCH_TEST_V3_STORAGE_KEY,'commatch-match-test:v3');
 const s=storage();s.values.set('commatch-match-test:v2','untouched');
 assert.equal(api.readMatchTestSession(s),null);
 const partial=state({Q01:fixture().Q01},'questions');partial.currentQuestionId='Q04';
 assert.equal(api.writeMatchTestSession(s,partial,false),false);
 assert.equal(api.writeMatchTestSession(s,partial,true),true);
 assert.deepEqual(plain(api.readMatchTestSession(s)),partial);
 assert.equal(api.writeMatchTestSession(s,state(),true),true);
 assert.deepEqual(plain(api.readMatchTestSession(s)),state());
 assert.equal(s.values.get('commatch-match-test:v2'),'untouched');
 assert.ok(s.calls.every(([,key])=>key==='commatch-match-test:v3'));
});
test('incomplete result resumes at first unanswered question and ignores stored report text',()=>{
 const partial=state({Q01:fixture().Q01});
 const parsed=api.parseMatchTestSession(JSON.stringify({...partial,analysis:{title:'untrusted'}}));
 assert.equal(parsed.phase,'questions');assert.equal(parsed.currentQuestionId,'Q04');assert.equal('analysis'in parsed,false);
});
test('rejects invalid versions, codes, kinds, IDs and values without touching v2',()=>{
 const bad=[{...state(),schemaVersion:1},{...state(),testVersion:'2.0'},{...state(),currentQuestionId:'Q99'},
 {...state(),phase:'unknown'}, {...state(),answers:{Q01:3}}, {...state(),answers:{Q01:{kind:'scenario',optionId:'MONTHLY_VISITS'}}},
 {...state(),answers:{Q02:{kind:'agreement',value:6}}},{...state(),answers:[]}, {...state(),answers:{Q99:{kind:'agreement',value:3}}}];
 for(const x of bad)assert.equal(api.parseMatchTestSession(JSON.stringify(x)),null);
 assert.equal(api.parseMatchTestSession('{'),null);assert.equal(api.parseMatchTestSession(null),null);
 const s=storage();s.values.set('commatch-match-test:v2','old');s.values.set(api.MATCH_TEST_V3_STORAGE_KEY,'{');
 assert.equal(api.readMatchTestSession(s),null);assert.equal(s.values.get('commatch-match-test:v2'),'old');
});
test('storage failures are isolated; restart clears only v3',()=>{
 const throwing={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 assert.equal(api.readMatchTestSession(throwing),null);assert.equal(api.writeMatchTestSession(throwing,state(),true),false);assert.equal(api.clearMatchTestSession(throwing),false);
 const s=storage();s.values.set('commatch-match-test:v2','old');s.values.set(api.MATCH_TEST_V3_STORAGE_KEY,'new');
 assert.equal(api.clearMatchTestSession(s),true);assert.equal(s.values.get('commatch-match-test:v2'),'old');assert.equal(s.values.has(api.MATCH_TEST_V3_STORAGE_KEY),false);
});
