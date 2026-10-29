import assert from 'node:assert/strict';
import { AuthSessionMissingError, AuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '../../..');
const moduleCache = new Map();

const jsx = (type, props) => ({ type, props: props ?? {} });
const reactStub = {
  useId: () => "test-radar",
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: (value) => ({ current: value }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
};

const authApi = { getCurrentUser: async () => ({ data: { user: null }, error: null }) };

const aliases = {
  '@/lib/match-test/questions': resolve(projectRoot, 'lib/match-test/questions.ts'),
  '@/lib/match-test/scoring': resolve(projectRoot, 'lib/match-test/scoring.ts'),
  '@/lib/match-test/analysis': resolve(projectRoot, 'lib/match-test/analysis.ts'),
  '@/lib/match-test/session': resolve(projectRoot, 'lib/match-test/session.ts'),
};

const loadModule = (filename) => {
  const resolvedFilename = resolve(filename);
  if (moduleCache.has(resolvedFilename)) return moduleCache.get(resolvedFilename).exports;
  const isPageModule = resolvedFilename === resolve(import.meta.dirname, 'page.tsx');
  const source = `${readFileSync(resolvedFilename, 'utf8')}${isPageModule ? `
export const __testExports = {
  MATCH_TEST_DISPLAY_QUESTIONS,
  createInitialMatchTestState,
  reduceMatchTestState,
  createMatchTestResult,
  QuestionScreen,
  ResultScreen,
  RadarChart,
  getRadarPoint,
};
` : ''}`;
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: resolvedFilename,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(resolvedFilename, loadedModule);
  const localRequire = (specifier) => {
    if (specifier === 'react/jsx-runtime') return { Fragment: Symbol('Fragment'), jsx, jsxs: jsx };
    if (specifier === 'react') return reactStub;
    if (specifier === 'next/link') return { __esModule: true, default: 'a' };
    if (specifier === 'lucide-react') return new Proxy({}, { get: () => 'svg' });
    if (specifier === '@/lib/auth/auth') {
      return authApi;
    }
    if (specifier === '@supabase/supabase-js') return { isAuthSessionMissingError };
    if (aliases[specifier]) return loadModule(aliases[specifier]);
    if (specifier.startsWith('.')) return loadModule(resolve(dirname(resolvedFilename), `${specifier}.ts`));
    throw new Error(`Unexpected require: ${specifier}`);
  };
  const wrapper = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`,
    { filename: resolvedFilename },
  ).runInThisContext();
  wrapper(loadedModule.exports, localRequire, loadedModule, resolvedFilename, dirname(resolvedFilename));
  return loadedModule.exports;
};

let pageModule;
let loadError;
try {
  pageModule = loadModule(resolve(import.meta.dirname, 'page.tsx'));
} catch (error) {
  loadError = error;
}

const questionsModule = loadModule(resolve(projectRoot, 'lib/match-test/questions.ts'));
const pageApi = pageModule?.__testExports;

const collectText = (value) => {
  if (Array.isArray(value)) return value.map(collectText).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  if (typeof value.type === 'function') return collectText(value.type(value.props ?? {}));
  return collectText(value.props?.children);
};

const findAll = (value, predicate, matches = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => findAll(item, predicate, matches));
    return matches;
  }
  if (!value || typeof value !== 'object') return matches;
  if (typeof value.type === 'function') {
    findAll(value.type(value.props ?? {}), predicate, matches);
    return matches;
  }
  if (predicate(value)) matches.push(value);
  findAll(value.props?.children, predicate, matches);
  return matches;
};

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

const neutralAnswers=fixture();
test('page preserves fixed eighteen-question order and v3 initial state',()=>{
 assert.ifError(loadError);
 assert.deepEqual(pageApi.MATCH_TEST_DISPLAY_QUESTIONS.map(q=>q.id),['Q01','Q04','Q07','Q10','Q13','Q16','Q02','Q05','Q08','Q11','Q14','Q17','Q03','Q06','Q09','Q12','Q15','Q18']);
 const s=pageApi.createInitialMatchTestState();assert.equal(s.schemaVersion,2);assert.equal(s.testVersion,'3.0');assert.deepEqual(s.answers,{});
});
test('navigation blocks invalid input, edits answers and restores previous selections',()=>{
 const s=pageApi.createInitialMatchTestState();
 assert.deepEqual(pageApi.reduceMatchTestState(s,{type:'answer',value:3}),s);
 assert.deepEqual(pageApi.reduceMatchTestState(s,{type:'next'}),s);
 const a=pageApi.reduceMatchTestState(s,{type:'answer',value:fixture().Q01});
 const next=pageApi.reduceMatchTestState(a,{type:'next'});assert.equal(next.currentQuestionId,'Q04');
 const back=pageApi.reduceMatchTestState(next,{type:'previous'});
 assert.deepEqual(back.answers.Q01,fixture().Q01);
 const edited=pageApi.reduceMatchTestState(back,{type:'answer',value:fixture({Q01:5}).Q01});
 assert.deepEqual(edited.answers.Q01,fixture({Q01:5}).Q01);
 assert.deepEqual(pageApi.reduceMatchTestState(edited,{type:'restart'}),s);
});
test('mixed question radios emit exact semantic answers or agreement values',()=>{
 for(const [id,count]of [['Q01',3],['Q02',5]]){
  const q=questionsModule.MATCH_TEST_QUESTIONS.find(q=>q.id===id);let answer;
  const tree=pageApi.QuestionScreen({question:q,questionNumber:1,onAnswer:v=>{answer=v;},onPrevious(){},onNext(){}});
  const radios=findAll(tree,n=>n.type==='input'&&n.props.type==='radio');
  assert.equal(radios.length,count);
  assert.equal(findAll(tree,n=>n.type==='fieldset').length,1);
  assert.equal(findAll(tree,n=>n.type==='legend').length,1);
  assert.ok(radios.every(r=>r.props.name==='match-test-answer'));
  radios[0].props.onChange();
  assert.deepEqual(answer,id==='Q01'?{kind:'scenario',optionId:'SHARE_NOW'}:{kind:'agreement',value:1});
  assert.equal(findAll(tree,n=>n.type==='button').find(n=>collectText(n).includes('다음 질문')).props.disabled,true);
 }
});
test('results require complete v3 answers; report sections and route contracts are preserved',()=>{
 assert.equal(pageApi.createMatchTestResult({Q01:3}),null);
 const analysis=pageApi.createMatchTestResult(fixture({Q01:5,Q03:1}));assert.ok(analysis);
 const tree=pageApi.ResultScreen({analysis,authState:'anonymous',onRestart(){}});
 const text=collectText(tree);
 for(const label of ['주요 관계 선호','상대와 조율해 볼 부분','대화해 볼 질문','영역별 상세 설명','응답 근거','실제 ComMatch 회원 추천 점수에도 반영되지 않습니다'])assert.ok(text.includes(label),label);
 assert.equal(findAll(tree,n=>n.type==='details'&&n.props['data-domain']).length,6);
 const headings=findAll(tree,n=>n.type==='h2').map(collectText);
 assert.deepEqual(headings,['6가지 관계 가치관','주요 관계 선호','상대와 조율해 볼 부분','대화해 볼 질문','다음 만남을 시작해 보세요','영역별 상세 설명과 응답 근거','결과를 볼 때 참고해 주세요']);
 for(const [auth,hrefs]of [['anonymous',['/signup','/login']],['authenticated',['/members','/dashboard']],['error',['/login','/signup']]]){
  const result=pageApi.ResultScreen({analysis,authState:auth,onRestart(){}});
  assert.deepEqual(findAll(result,n=>n.type==='a').map(n=>n.props.href),hrefs);
 }
 assert.equal(findAll(pageApi.ResultScreen({analysis,authState:'checking',onRestart(){}}),n=>n.props?.role==='status').length,1);
});
test('radar maps exact zero, quarter, half, three-quarter and full scores to all axes',()=>{
 for(let i=0;i<6;i++)for(const v of [0,25,50,75,100]){
  const p=pageApi.getRadarPoint(i,v);
  assert.ok(Math.abs(Math.hypot(p.x-200,p.y-200)-120*v/100)<1e-8);
 }
 assert.deepEqual(pageApi.getRadarPoint(0,100),{x:200,y:80});
 assert.deepEqual(pageApi.getRadarPoint(0,0),{x:200,y:200});
 assert.throws(()=>pageApi.getRadarPoint(0,101));
});
test('radar provides multi-color glass gradients, exact polygon points and readable score list',()=>{
 const scores=pageApi.createMatchTestResult(neutralAnswers).domainResults;
 const tree=pageApi.RadarChart({scores});
 assert.equal(findAll(tree,n=>n.type==='svg'&&n.props.role==='img').length,1);
 assert.ok(findAll(tree,n=>n.type==='linearGradient').length>=1);
 assert.ok(findAll(tree,n=>n.type==='feDropShadow').length>=1);
 assert.equal(findAll(tree,n=>n.type==='dt').length,6);assert.equal(findAll(tree,n=>n.type==='dd').length,6);
 const data=findAll(tree,n=>n.type==='polygon'&&n.props['data-testid']==='radar-data')[0];
 assert.equal(data.props.points,scores.map((d,i)=>{const p=pageApi.getRadarPoint(i,50);return p.x+','+p.y;}).join(' '));
 const grids=findAll(tree,n=>n.type==='polygon'&&n.props['data-grid']);
 assert.deepEqual(grids.map(n=>n.props['data-grid']),[25,50,75,100]);
 assert.equal(findAll(tree,n=>n.type==='circle'&&n.props['data-axis-icon']).length,6);
 assert.ok(collectText(tree).includes('50'));
 assert.match(findAll(tree,n=>n.type==='svg'&&n.props.role==='img')[0].props.className,/w-full/);
});

test('defers session restoration so mounting does not synchronously cascade state updates', () => {
  const originalUseEffect = reactStub.useEffect;
  const originalUseState = reactStub.useState;
  const originalWindow = globalThis.window;
  const effects = [];
  const updates = [];
  const scheduled = [];

  reactStub.useEffect = (effect) => { effects.push(effect); };
  reactStub.useState = (initial) => [
    typeof initial === 'function' ? initial() : initial,
    (value) => { updates.push(value); },
  ];
  globalThis.window = {
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: (callback) => { scheduled.push(callback); return 1; },
    clearTimeout: () => {},
  };

  try {
    pageModule.default();
    const cleanup = effects[0]();
    assert.equal(updates.length, 0);
    assert.equal(scheduled.length, 1);
    scheduled[0]();
    assert.equal(updates.length, 1);
    cleanup();
  } finally {
    reactStub.useEffect = originalUseEffect;
    reactStub.useState = originalUseState;
    globalThis.window = originalWindow;
  }
});


test('radar paint resolves locally and gloss stays inside the data boundary',()=>{
 const scores=pageApi.createMatchTestResult(neutralAnswers).domainResults;
 const tree=pageApi.RadarChart({scores});
 const svg=findAll(tree,n=>n.type==='svg'&&n.props.role==='img')[0];
 assert.equal(svg.props.viewBox,'0 0 400 400');
 assert.equal(collectText(findAll(svg,n=>n.type==='title')[0]),'\ub098\uc758 6\uac00\uc9c0 \uad00\uacc4 \uac00\uce58\uad00');
 assert.ok(collectText(tree).includes('\uace0\uc815 0\u2013100 \ub208\uae08'));

 const ids=new Set(findAll(tree,n=>n.props?.id).map(n=>n.props.id));
 for(const node of findAll(tree,n=>n.props))for(const key of ['fill','stroke','filter','clipPath']){
  const reference=/^url\(#(.+)\)$/.exec(node.props[key]??'');
  if(reference)assert.ok(ids.has(reference[1]),'unresolved '+key+' reference');
 }
 for(const id of svg.props['aria-labelledby'].split(' '))assert.ok(ids.has(id));
 const gloss=findAll(tree,n=>n.props?.['data-radar-gloss'])[0];
 assert.ok(gloss,'the highlight needs a data-boundary clip');
 const clipId=/^url\(#(.+)\)$/.exec(gloss.props.clipPath)?.[1];
 const clip=findAll(tree,n=>n.type==='clipPath'&&n.props.id===clipId)[0];
 const polygon=findAll(tree,n=>n.props?.['data-testid']==='radar-data')[0];
 assert.equal(findAll(clip,n=>n.type==='polygon')[0].props.points,polygon.props.points);
 assert.ok(findAll(tree,n=>n.type==='radialGradient').length>0);
 const background=findAll(svg,n=>n.props?.['data-radar-background'])[0];
 const painted=findAll(svg.props.children.filter(n=>n?.type!=='defs'),n=>['polygon','line','text'].includes(n.type));
 assert.ok(background);
 assert.equal(painted[0],background,'background must not cover grid lines or tick labels');
});

test('radar preserves mixed and zero data with grouped badges and readable scores',()=>{
 const base=pageApi.createMatchTestResult(neutralAnswers).domainResults;
 for(const values of [[0,25,50,75,100,0],[0,0,0,0,0,0],[100,100,100,100,100,100]]){
  const scores=base.map((d,i)=>({...d,displayScore:values[i]}));
  const tree=pageApi.RadarChart({scores});
  const data=findAll(tree,n=>n.props?.['data-testid']==='radar-data');
  assert.equal(data.length,1);
  const actual=data[0].props.points.split(' ').map(pair=>pair.split(',').map(Number));
  for(let i=0;i<6;i++){
   const angle=(-90+i*60)*Math.PI/180;
   assert.ok(Math.abs(actual[i][0]-(200+1.2*values[i]*Math.cos(angle)))<1e-8);
   assert.ok(Math.abs(actual[i][1]-(200+1.2*values[i]*Math.sin(angle)))<1e-8);
  }
  assert.deepEqual(findAll(tree,n=>n.type==='dd').map(n=>collectText(n)),values.map(v=>v+'/ 100'));
  const badges=findAll(tree,n=>n.props?.['data-axis-badge']);
  assert.equal(badges.length,6);
  badges.forEach((badge,i)=>{
   assert.equal(findAll(badge,n=>n.type==='circle'&&n.props['data-axis-icon']).length,1);
   assert.equal(collectText(badge),String(values[i]));
  });
  if(values.every(v=>v===0)){
   assert.equal(findAll(tree,n=>n.props?.['data-radar-gloss']).length,0);
   assert.equal(data[0].props.filter,undefined);
   assert.ok(actual.every(([x,y])=>x===200&&y===200));
  }
 }
});

test('auth effect distinguishes actual SDK session absence from other errors and exceptions',async()=>{
 const originalEffect=reactStub.useEffect,originalState=reactStub.useState,originalGetUser=authApi.getCurrentUser;
 const cases=[
  [{data:{user:null},error:new AuthSessionMissingError()},'anonymous'],
  [{data:{user:null},error:null},'anonymous'],
  [{data:{user:{id:'offline-test-user'}},error:null},'authenticated'],
  [{data:{user:null},error:new AuthApiError('bad request',400,'bad_request')},'error'],
  [{data:{user:{id:'offline-test-user'}},error:new AuthApiError('failed',503,'unexpected_failure')},'error'],
  [{data:{user:null},error:new Error('Auth session missing!')},'error'],
  [{data:{user:null},error:{name:'AuthSessionMissingError',status:400}},'error'],
  [new Error('offline network failure'),'error'],
  [new AuthSessionMissingError(),'error'],
 ];
 try{
  for(const [response,expected]of cases){
   const effects=[],updates=[];let slot=0;
   reactStub.useEffect=effect=>effects.push(effect);
   reactStub.useState=initial=>{const index=slot++;return [typeof initial==='function'?initial():initial,value=>updates.push([index,value])];};
   authApi.getCurrentUser=async()=>{if(response instanceof Error)throw response;return response;};
   pageModule.default();const cleanup=effects[2]();
   await new Promise(resolve=>setImmediate(resolve));
   assert.deepEqual(updates.filter(([index])=>index===2),[[2,expected]]);
   cleanup();
  }
  const effects=[],updates=[];let slot=0,resolveUser;
  reactStub.useEffect=effect=>effects.push(effect);
  reactStub.useState=initial=>{const index=slot++;return [typeof initial==='function'?initial():initial,value=>updates.push([index,value])];};
  authApi.getCurrentUser=()=>new Promise(resolve=>{resolveUser=resolve;});
  pageModule.default();const cleanup=effects[2]();cleanup();
  resolveUser({data:{user:{id:'offline-test-user'}},error:null});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(updates,[]);
 }finally{
  reactStub.useEffect=originalEffect;reactStub.useState=originalState;authApi.getCurrentUser=originalGetUser;
 }
});

test('all auth states preserve report, radar and evidence while offering only appropriate routes',()=>{
 const analysis=pageApi.createMatchTestResult(fixture({Q01:5,Q03:1}));
 const expected={
  anonymous:[['/signup','무료 회원가입'],['/login','기존 회원 로그인']],
  authenticated:[['/members','회원 탐색'],['/dashboard','내 대시보드']],
  error:[['/login','기존 회원 로그인'],['/signup','무료 회원가입']],
  checking:[],
 };
 const failure='테스트 결과는 그대로 확인할 수 있습니다. 회원 서비스 이용은 로그인 페이지에서 이어가세요. 처음 방문하셨다면 무료 회원가입을 선택해 주세요.';
 for(const state of Object.keys(expected)){
  const tree=pageApi.ResultScreen({analysis,authState:state,onRestart(){}});
  const links=findAll(tree,n=>n.type==='a');
  assert.deepEqual(links.map(n=>[n.props.href,collectText(n)]),expected[state]);
  if(links.length)assert.match(links[0].props.className,/bg-\[#175B35\]/);
  const text=collectText(tree);
  assert.ok(text.includes(analysis.title));
  assert.ok(text.includes('응답 근거'));
  assert.ok(text.includes(analysis.domainResults[0].evidence[0].label));
  assert.equal(findAll(tree,n=>n.props?.['data-testid']==='radar-data').length,1);
  assert.equal(findAll(tree,n=>n.type==='details'&&n.props['data-domain']).length,6);
  if(state==='error'){
   assert.ok(text.includes(failure));
   assert.ok(links.every(n=>!['/members','/dashboard'].includes(n.props.href)));
  }
 }
});
