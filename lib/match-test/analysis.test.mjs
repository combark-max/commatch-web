import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

const {scoreMatchTest}=load(resolve(import.meta.dirname,'scoring.ts'));
const {analyzeMatchTest}=load(resolve(import.meta.dirname,'analysis.ts'));
const analyze=overrides=>analyzeMatchTest(scoreMatchTest(fixture(overrides)));
test('approved same-score fixtures preserve different meaningful patterns',()=>{
 const a=analyze({Q01:3,Q02:4,Q03:5}),b=analyze({Q01:5,Q02:4,Q03:3});
 assert.equal(a.domainResults[0].displayScore,75);assert.equal(b.domainResults[0].displayScore,75);
 assert.deepEqual(plain(a.patterns.map(p=>p.id)),['E2']);assert.deepEqual(plain(b.patterns.map(p=>p.id)),['E1']);
 assert.notEqual(a.summary,b.summary);
 for(const [o,id] of [[{Q04:1,Q05:5,Q06:3},'C1'],[{Q04:5,Q05:3,Q06:1},'C2'],[{Q16:1,Q17:5,Q18:3},'P1'],[{Q16:5,Q17:3,Q18:1},'P2']]){
  const r=analyze(o);assert.equal(r.patterns[0].id,id);
  assert.equal(r.domainResults[id[0]==='C'?1:5].displayScore,50);
 }
});
const ruleCases=[
 ['E1',{Q01:5,Q03:3},'Q01',3],['E2',{Q01:3,Q03:5},'Q03',3],
 ['C1',{Q04:1,Q05:4},'Q05',3],['C2',{Q04:5,Q06:2},'Q06',3],
 ['L1',{Q07:5,Q09:1},'Q09',3],['L2',{Q07:1,Q09:5},'Q07',3],
 ['F1',{Q10:5,Q11:2},'Q11',3],['F2',{Q10:1,Q11:4},'Q11',3],
 ['A1',{Q13:5,Q15:5},'Q15',3],['A2',{Q13:1,Q15:5},'Q13',3],
 ['P1',{Q16:1,Q17:4},'Q17',3],['P2',{Q16:5,Q18:2},'Q18',3]];
test('all twelve rules require every approved condition and preserve evidence',()=>{
 for(const [id,input,change,value] of ruleCases){
  const r=analyze(input), p=r.patterns.find(p=>p.id===id);assert.ok(p,id);assert.equal(p.evidence.length,2);
  assert.ok(p.question);assert.ok(p.description);
  assert.equal(analyze({...input,[change]:value}).patterns.some(p=>p.id===id),false,id+' boundary');
 }
});
test('four combinations use strong directions, including low preferences',()=>{
 const cases=[
 ['X1',{Q13:5,Q14:5,Q15:5,Q16:5,Q17:5,Q18:5}],
 ['X2',{Q07:5,Q08:5,Q09:5,Q10:1,Q11:1,Q12:1}],
 ['X3',{Q01:1,Q02:1,Q03:1,Q04:5,Q05:5,Q06:5}],
 ['X4',{Q13:1,Q14:1,Q15:1,Q16:1,Q17:1,Q18:1}]];
 for(const [id,input]of cases)assert.equal(analyze(input).combination?.id,id);
 const both=analyze({...cases[0][1],...cases[1][1]});
 assert.equal(both.combination.id,'X1');
 const weakerX1=analyze({...cases[0][1],Q13:3,...cases[1][1]});
 assert.equal(weakerX1.combination.id,'X2');
});
test('neutral, ties and uniformly strong results avoid false representatives',()=>{
 const n=analyze({});assert.equal(n.title,'상황별로 살펴보는 나의 관계 선호');assert.equal(n.patterns.length,0);
 const tie=analyze({Q01:5,Q02:5,Q03:5,Q04:5,Q05:5,Q06:5});
 assert.equal(tie.title,'응답에서 함께 두드러진 관계 선호');
 const all=Object.fromEntries(Array.from({length:18},(_,i)=>['Q'+String(i+1).padStart(2,'0'),[5,4,3][i%3]]));
 assert.equal(analyze(all).title,'여러 영역에서 선호가 뚜렷하게 나타난 관계');
 const lo=analyze({Q01:1,Q02:1,Q03:1});assert.deepEqual(plain(lo.highlightedDomainIds),['emotional-openness']);
 const compatible=analyze({Q13:1,Q14:4,Q15:5});assert.equal(compatible.domainResults[4].displayScore,58);assert.equal(compatible.patterns[0].id,'A2');
});
test('deterministic reports cap and deduplicate preferences, coordination and questions',()=>{
 const o={Q01:5,Q03:1,Q07:5,Q09:1,Q10:5,Q11:1,Q13:5,Q15:5};
 const a=analyze(o);assert.deepEqual(plain(a),plain(analyze(o)));
 assert.ok(a.preferences.length<=2);assert.ok(a.coordination.length<=2);assert.ok(a.questions.length<=3);
 assert.equal(new Set(a.questions).size,a.questions.length);
 assert.deepEqual(plain(a.patterns.map(p=>p.id)),['E1','L1','F1','A1']);
 assert.match(a.limitation,/실제 ComMatch 회원 추천 점수에도 반영되지 않습니다/);
 assert.equal('compatibilityProbability' in a,false);
});

test('remaining approved offline fixtures preserve exact displayed scores and explanations',()=>{
 const family=analyze({Q07:5,Q08:5,Q09:5,Q10:1,Q11:1,Q12:1});
 assert.deepEqual(plain(family.domainResults.map(d=>d.displayScore)),[50,50,100,0,50,50]);
 const independence=analyze({Q13:5,Q14:4,Q15:5});
 assert.equal(independence.domainResults[4].displayScore,92);
 assert.equal(independence.patterns[0].id,'A1');
 assert.ok(analyze({Q01:5,Q03:1}).patterns.some(p=>p.id==='E1'));
 assert.ok(analyze({Q01:1,Q03:5}).patterns.some(p=>p.id==='E2'));
 const weak=analyze({Q13:5,Q14:1,Q15:5,Q16:5,Q17:5,Q18:5});
 assert.equal(weak.combination,null);
 const decisive=analyze({Q13:5,Q14:2,Q15:5,Q16:5,Q17:5,Q18:5});
 assert.equal(decisive.combination.id,'X1');
});
test('equally strong high and low directions do not make one combination the sole representative',()=>{
 const all=Object.fromEntries(Array.from({length:18},(_,i)=>['Q'+String(i+1).padStart(2,'0'),5]));
 const report=analyze({...all,Q10:1,Q11:1,Q12:1});
 assert.equal(report.title,'여러 영역에서 선호가 뚜렷하게 나타난 관계');
 assert.equal(report.highlightedDomainIds.length,6);
 assert.equal(report.combination.id,'X1');
});
test('analysis never mutates frozen scores or original semantic answers',()=>{
 const scored=scoreMatchTest(fixture({Q01:5,Q03:1}));
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 freeze(scored);
 const before=JSON.stringify(scored);
 assert.deepEqual(plain(analyzeMatchTest(scored)),plain(analyzeMatchTest(scored)));
 assert.equal(JSON.stringify(scored),before);
});
// Approved copy substitutions only; reverse them to compare the complete pre-change reports.
const approvedCopyChanges=[
  [
    "개인적인 감정 정리를 선호하는 관계",
    "감정 공유의 범위와 시점을 살펴보는 나의 선호"
  ],
  [
    "상황에 따라 감정 공유를 정하는 관계",
    "감정을 나누는 방식을 함께 살펴보는 관계 선호"
  ],
  [
    "생각할 여유를 먼저 두는 관계",
    "대화의 시작과 표현 방식을 살펴보는 관계 선호"
  ],
  [
    "영역별 자율 관리를 선호하는 관계",
    "생활에서 각자 관리할 범위를 두고 싶은 관계 선호"
  ],
  [
    "공동 관리 범위를 살펴볼 관계",
    "함께 정할 생활의 범위를 살펴보는 관계 선호"
  ],
  [
    "필요 중심의 가족 교류를 선호하는 관계",
    "가족과의 연락·만남의 범위를 살펴보는 관계 선호"
  ],
  [
    "개인 시간과 함께함을 살펴볼 관계",
    "각자의 시간과 함께하는 시간을 살펴보는 관계 선호"
  ],
  [
    "계획의 범위와 시점을 살펴볼 관계",
    "무엇을 언제 함께 정할지 살펴보는 관계 선호"
  ],
  [
    "아직 한 방향으로 정해지지 않은 관계 선호",
    "상황별로 살펴보는 나의 관계 선호"
  ],
  [
    "기쁜 소식은 바로 나누지만, 힘든 마음은 먼저 정리하는 방식을 선호합니다.",
    "기쁜 소식은 바로 나누고, 힘든 마음은 우선 스스로 정리하고 싶어 합니다."
  ],
  [
    "좋은 소식의 즉시 공유보다, 힘든 일을 함께 이야기하며 정리하는 쪽이 두드러집니다.",
    "기쁜 소식은 바로 전하지 않아도, 힘든 마음은 함께 이야기하며 정리하고 싶어 합니다."
  ],
  [
    "의견 차이에는 생각할 시간을 먼저 두고, 다툰 뒤에는 다시 대화하고 싶어 합니다.",
    "의견이 다를 때는 생각할 시간을 갖고, 다툰 뒤에는 다시 대화하며 풀고 싶어 합니다."
  ],
  [
    "가벼운 의견 차이는 먼저 이야기하지만, 중요한 문제에서 자신의 생각을 말하려는 의향은 상대적으로 낮게 나타났습니다.",
    "가벼운 의견 차이가 생기면 먼저 대화를 꺼내고 싶어 합니다. 중요한 문제에서 내 생각을 말하고 싶다는 문장에는 동의 정도가 낮았습니다."
  ],
  [
    "재정은 함께 관리하되, 생활 방식은 각자 유지할 여지를 선호합니다.",
    "재정은 함께 관리하고, 생활 방식에는 각자의 방식을 유지할 여지를 두고 싶어 합니다."
  ],
  [
    "재정은 분담 후 각자 관리하면서도, 함께 사는 생활 기준은 넓게 합의하고 싶어 합니다.",
    "공통 지출을 분담한 뒤 나머지 예산은 각자 관리하고 싶어 합니다. 생활 전반의 기준은 함께 정하고 싶어 합니다."
  ],
  [
    "직접 만나는 시간은 정기적으로 갖되, 잦은 일상 연락은 덜 선호합니다.",
    "양가 가족과는 정기적으로 만나고, 잦은 일상 연락은 덜 선호합니다."
  ],
  [
    "직접 방문은 필요할 때 중심으로 하되, 안부와 일상은 자주 나누고 싶어 합니다.",
    "가족 방문은 주요 행사나 필요한 일이 있을 때를 중심으로 하고, 안부와 일상은 자주 나누고 싶어 합니다."
  ],
  [
    "자신의 휴식과 배우자의 독립적인 활동 시간을 모두 확보하는 구성을 선호합니다.",
    "나도 배우자도 각자 쉬거나 취미를 즐길 시간을 갖고 싶어 합니다."
  ],
  [
    "본인은 함께 쉬는 시간을 선호하면서도, 배우자의 독립적인 취미 시간은 정기적으로 두고 싶어 합니다.",
    "휴식은 함께하고 싶고, 서로의 독립적인 취미 시간도 정기적으로 갖고 싶어 합니다."
  ],
  [
    "장기 목표의 세부 계획은 유연하게 두되, 결혼 전 중요한 생활 조건은 미리 논의하고 싶어 합니다.",
    "공동 목표는 실제 상황이 되었을 때 결정하고, 결혼 전 중요한 생활 조건은 미리 상의하고 싶어 합니다."
  ],
  [
    "공동 목표의 시작 계획은 구체적으로 세우되, 정기적인 점검에 대한 선호는 낮게 나타났습니다.",
    "공동 목표의 준비는 구체적으로 정하고 싶어 합니다. 진행 상황을 정기적으로 점검하고 싶다는 문장에는 동의 정도가 낮았습니다."
  ],
  [
    "각자의 일상과 공동의 미래를 함께 챙기는 관계",
    "각자의 시간과 함께 준비하고 싶은 미래"
  ],
  [
    "독립적인 활동 시간을 확보하면서 공동의 미래도 구체적으로 준비하는 방향의 응답입니다.",
    "각자의 활동 시간을 확보하는 선호와 미래를 미리 준비하는 선호가 함께 나타났습니다."
  ],
  [
    "둘의 생활은 함께 정하고, 가족 교류는 필요한 때 중심으로",
    "둘의 생활 기준과 가족 교류의 범위"
  ],
  [
    "공동생활의 기준은 함께 조율하고, 가족 교류는 필요한 때를 중심으로 두는 방향의 응답입니다.",
    "생활 기준을 함께 조율하려는 선호는 높고, 가족 교류 영역의 선호는 낮은 쪽으로 나타났습니다. 두 영역을 구분해 이야기해 보세요."
  ],
  [
    "감정은 먼저 정리하고, 의견 차이는 대화로 다루는 관계",
    "감정 공유와 갈등 대화를 구분해 보는 관계 선호"
  ],
  [
    "감정은 개인적으로 정리하는 쪽을 선호하면서 의견 차이는 대화로 다루는 방향의 응답입니다.",
    "감정 공유 영역의 선호는 낮고, 의견 차이를 대화로 다루는 영역의 선호는 높은 쪽으로 나타났습니다."
  ],
  [
    "함께하는 시간을 중시하고, 미래는 상황에 맞춰 정하는 관계",
    "함께하는 시간과 미리 정할 계획의 범위"
  ],
  [
    "함께하는 여가를 선호하고 미래의 세부 결정은 상황에 맞춰 두는 방향의 응답입니다.",
    "함께하는 여가를 선호하는 쪽의 응답입니다. 미래를 미리 준비하는 영역의 점수는 낮은 편으로 나타났습니다."
  ],
  [
    "감정을 언제 어떻게 나눌지는 상황에 따라 다른 응답입니다.",
    "감정 공유 영역의 합산 점수는 중간 범위입니다. 기쁜 일과 힘든 일에 대한 답변을 나누어 살펴보세요."
  ],
  [
    "대화를 먼저 시작하거나 중요한 의견을 표현하려는 선호가 낮은 방향입니다. 갈등을 해결할 의지가 없다는 뜻은 아닙니다.",
    "대화 시작·화해 대화·의견 표현을 합산한 점수는 낮은 편입니다. 각 상황에서 어떤 방식이 편한지는 개별 답변을 함께 살펴보세요."
  ],
  [
    "가족 교류를 필요와 계기 중심으로 두는 방향입니다. 가족에 대한 애정의 크기를 뜻하지 않습니다.",
    "가족과의 연락·만남·만남 제안을 합산한 점수는 낮은 편입니다. 가족에 대한 애정의 크기를 뜻하지 않습니다."
  ],
  [
    "생각할 시간과 대화를 다시 시작할 방법을 확인해 보세요.",
    "의견을 꺼내는 방식과 대화를 시작할 시점을 함께 이야기해 보세요."
  ],
  [
    "힘든 일이 있을 때 어느 정도 기다린 뒤 말을 걸어주면 좋을까요?",
    "힘든 일이 있을 때 혼자 정리할 시간과 상대의 도움은 각각 어느 정도가 좋을까요?"
  ],
  [
    "중요한 의견을 편하게 말할 수 있도록 어떤 대화 방식이 필요할까요?",
    "중요한 문제에서 의견이 다르면, 서로의 생각을 어떻게 나누면 좋을까요?"
  ],
  [
    "생활 기준을 함께 정할 때 개인 예산은 어디까지 구분할까요?",
    "공통 지출과 개인 예산은 어떻게 나누고, 생활 기준은 어디까지 함께 정할까요?"
  ],
  [
    "방문 대신 어떤 방식의 연락으로 관계를 이어가면 좋을까요?",
    "자주 만나지 않을 때 어떤 방식으로 안부를 나누면 좋을까요?"
  ],
  [
    "정기 점검 대신 어떤 변화가 생겼을 때 계획을 다시 살펴볼까요?",
    "계획을 다시 살펴보고 싶어지는 때는 언제인가요?"
  ]
];

function regressionReports(){
 const rows=[Array(18).fill(3),Array(18).fill(1),Array(18).fill(5)];
 for(let d=0;d<6;d++)for(const a of [1,3,5])for(const b of [1,3,5])for(const c of [1,3,5]){
  const values=Array(18).fill(3);values.splice(d*3,3,a,b,c);rows.push(values);
 }
 const {MATCH_TEST_QUESTIONS:questions}=load(resolve(import.meta.dirname,'questions.ts'));
 let seed=17;
 for(let n=0;n<256;n++)rows.push(questions.map(q=>{
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return q.kind==='scenario'?[1,3,5][seed%3]:seed%5+1;
 }));
 return rows.map(values=>analyze(Object.fromEntries(values.map((v,i)=>['Q'+String(i+1).padStart(2,'0'),v]))));
}
test('approved copy is visible while 421 full reports retain scoring, rules, order and counts',()=>{
 const reports=regressionReports(),serialized=JSON.stringify(reports);
 for(const [,replacement]of approvedCopyChanges)assert.ok(serialized.includes(replacement),'missing approved copy: '+replacement);
});
test('copy substitutions leave all pre-change report data and selection behavior identical',()=>{
 const reverse=approvedCopyChanges.toSorted((a,b)=>b[1].length-a[1].length);
 const normalize=value=>{
  if(typeof value==='string')return reverse.reduce((text,[old,replacement])=>text.replaceAll(replacement,old),value);
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalize(item)]));
  return value;
 };
 const reports=regressionReports();assert.equal(reports.length,421);
 const digest=createHash('sha256').update(JSON.stringify(normalize(reports))).digest('hex');
 assert.equal(digest,'8ad40861a5cade37fe3707be163e8568490dfeb23963b174c1c14fe740852959');
});
