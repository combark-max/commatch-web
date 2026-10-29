'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,ChevronDown,RotateCcw,Heart,MessagesSquare,House,Users,Coffee,Compass} from 'lucide-react';
import {getCurrentUser} from '@/lib/auth/auth';
import {isAuthSessionMissingError} from '@supabase/supabase-js';
import {analyzeMatchTest,type MatchTestAnalysis,type Evidence} from '@/lib/match-test/analysis';
import {LIKERT_OPTIONS,MATCH_TEST_DOMAINS,MATCH_TEST_QUESTIONS} from '@/lib/match-test/questions';
import {parseMatchTestAnswer,scoreMatchTest} from '@/lib/match-test/scoring';
import {clearMatchTestSession,MATCH_TEST_DISPLAY_ORDER,readMatchTestSession,writeMatchTestSession,type MatchTestSessionState} from '@/lib/match-test/session';
import type {DomainId,MatchTestAnswer,MatchTestQuestion,QuestionId} from '@/lib/match-test/types';
type AuthState='checking'|'anonymous'|'authenticated'|'error';
type MatchTestAction={readonly type:'answer';readonly value:unknown}|{readonly type:'previous'|'next'|'restart'};
const DOMAIN_LABELS=Object.fromEntries(MATCH_TEST_DOMAINS.map(d=>[d.id,d.label])) as Record<DomainId,string>;
const QUESTION_BY_ID=new Map<QuestionId,MatchTestQuestion>(MATCH_TEST_QUESTIONS.map(q=>[q.id,q]));
const MATCH_TEST_DISPLAY_QUESTIONS=MATCH_TEST_DISPLAY_ORDER.map(id=>QUESTION_BY_ID.get(id)!);
const createInitialMatchTestState=():MatchTestSessionState=>({schemaVersion:2,testVersion:'3.0',phase:'questions',currentQuestionId:'Q01',answers:{}});
function reduceMatchTestState(state:MatchTestSessionState,action:MatchTestAction):MatchTestSessionState{
 if(action.type==='restart')return createInitialMatchTestState();
 if(action.type==='answer'){
  const answer=parseMatchTestAnswer(state.currentQuestionId,action.value);
  return answer?{...state,answers:{...state.answers,[state.currentQuestionId]:answer}}:state;
 }
 const index=MATCH_TEST_DISPLAY_ORDER.indexOf(state.currentQuestionId);
 if(action.type==='previous')return index>0?{...state,phase:'questions',currentQuestionId:MATCH_TEST_DISPLAY_ORDER[index-1]}:state;
 if(!parseMatchTestAnswer(state.currentQuestionId,state.answers[state.currentQuestionId]))return state;
 if(index<17)return {...state,currentQuestionId:MATCH_TEST_DISPLAY_ORDER[index+1]};
 return scoreMatchTest(state.answers).ok?{...state,phase:'result'}:state;
}
function createMatchTestResult(answers:unknown):MatchTestAnalysis|null{
 const scores=scoreMatchTest(answers);return scores.ok?analyzeMatchTest(scores):null;
}
type QuestionScreenProps={
 readonly question:MatchTestQuestion;readonly questionNumber:number;readonly selectedAnswer?:MatchTestAnswer;
 readonly onAnswer:(answer:MatchTestAnswer)=>void;readonly onPrevious:()=>void;readonly onNext:()=>void;
 readonly headingRef?:React.RefObject<HTMLLegendElement|null>;
};
function QuestionScreen({question,questionNumber,selectedAnswer,onAnswer,onPrevious,onNext,headingRef}:QuestionScreenProps){
 const options=question.kind==='scenario'?question.options.map(o=>({key:o.code,label:o.label,answer:{kind:'scenario',optionId:o.code} as MatchTestAnswer})):
 LIKERT_OPTIONS.map(o=>({key:String(o.value),label:o.label,answer:{kind:'agreement',value:o.value} as MatchTestAnswer}));
 return <div className="min-h-[calc(100vh-4rem)] bg-[#F4F8F4] px-4 py-8 sm:px-6 sm:py-12">
  <div className="mx-auto max-w-3xl rounded-3xl border border-green-900/10 bg-white p-5 shadow-sm sm:p-10">
   <header className="mb-7">
    <p className="text-sm font-semibold tracking-wider text-[#175B35]">ComMatch · 관계 가치관 3.0</p>
    <div className="mt-2 flex items-end justify-between gap-4"><h1 className="text-2xl font-bold text-[#183B1B] sm:text-3xl">관계 성향 테스트</h1><span className="shrink-0 font-semibold text-gray-600">{questionNumber} / 18</span></div>
    <progress value={questionNumber} max={18} aria-label={'테스트 진행률 '+questionNumber+' / 18'} className="mt-5 h-2 w-full accent-[#175B35]"/>
    <p className="mt-4 text-sm leading-6 text-gray-600">현재 자신의 선호에 가장 가까운 답변을 선택해 주세요. 연애·결혼 경험이 없더라도 해당 상황을 가정해 답할 수 있습니다. 정답은 없으며, 높은 점수가 더 좋은 성격을 의미하지 않습니다.</p>
   </header>
   <fieldset><legend ref={headingRef} tabIndex={-1} className="w-full outline-none">
    <span className="inline-flex rounded-full bg-green-50 px-3 py-1.5 text-sm font-semibold text-[#175B35]">{DOMAIN_LABELS[question.domainId]} · {question.kind==='scenario'?'상황 선택':'성향 동의'}</span>
    <span className="mt-4 block text-xl font-semibold leading-8 break-keep text-[#183B1B] sm:text-2xl sm:leading-9">{question.prompt}</span>
   </legend>
   <div className="mt-7 space-y-3">{options.map(option=>{
    const selected=JSON.stringify(selectedAnswer)===JSON.stringify(option.answer),id='match-test-'+question.id+'-'+option.key;
    return <label key={option.key} htmlFor={id} className={'flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl border-2 px-4 py-4 leading-7 transition-colors focus-within:ring-2 focus-within:ring-green-700 focus-within:ring-offset-2 '+(selected?'border-[#175B35] bg-green-50 text-[#183B1B]':'border-gray-200 text-gray-700 hover:border-green-700/40')}>
     <span>{option.label}</span><input id={id} name="match-test-answer" type="radio" value={option.key} checked={selected} onChange={()=>onAnswer(option.answer)} className="h-5 w-5 shrink-0 accent-[#175B35]"/>
    </label>;
   })}</div></fieldset>
   <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
    <button type="button" onClick={onPrevious} disabled={questionNumber===1} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 disabled:opacity-40"><ArrowLeft aria-hidden="true" size={20}/>이전 질문</button>
    <button type="button" onClick={onNext} disabled={!parseMatchTestAnswer(question.id,selectedAnswer)} className="min-h-14 rounded-xl bg-[#175B35] px-8 py-3 font-semibold text-white hover:bg-[#104628] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300">{questionNumber===18?'결과 보기':'다음 질문'}</button>
   </div>
  </div>
 </div>;
}
const AXIS_COLORS=['#175B35','#B45309','#2563EB','#7C3AED','#0F766E','#A94146'] as const;
const AXIS_ICONS=[Heart,MessagesSquare,House,Users,Coffee,Compass];
function getRadarPoint(index:number,value:number):{x:number;y:number}{
 if(!Number.isInteger(index)||index<0||index>5||!Number.isFinite(value)||value<0||value>100)throw new RangeError('Invalid radar coordinate');
 const angle=(-90+index*60)*Math.PI/180,radius=120*value/100;
 return {x:200+radius*Math.cos(angle),y:200+radius*Math.sin(angle)};
}
function RadarChart({scores}:{readonly scores:MatchTestAnalysis['domainResults']}){
 const id='relationship-radar-'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
 const points=(value:number)=>scores.map((_,i)=>{const p=getRadarPoint(i,value);return p.x+','+p.y;}).join(' ');
 const actual=scores.map((d,i)=>{const p=getRadarPoint(i,d.displayScore);return p.x+','+p.y;}).join(' ');
 const hasNonZeroScore=scores.some(d=>d.displayScore>0);
 return <figure className="grid min-w-0 items-center gap-5 rounded-3xl border border-white bg-[radial-gradient(ellipse_at_top_left,#E8F5EF_0%,#F1F4FF_45%,#FFF1F3_100%)] p-3 shadow-sm sm:p-7 lg:grid-cols-[minmax(0,1fr)_10rem] lg:gap-6" aria-label="6개 영역 관계 가치관">
  <div className="min-w-0">
   <svg role="img" aria-labelledby={id+'-title '+id+'-desc'} viewBox="0 0 400 400" className="mx-auto block h-auto w-full max-w-[560px] lg:max-w-[656px]">
    <title id={id+'-title'}>나의 6가지 관계 가치관</title>
    <desc id={id+'-desc'}>{scores.map(d=>DOMAIN_LABELS[d.domainId]+' '+d.displayScore+'점').join(', ')}. 점수는 선호 방향이며 우열이나 궁합 확률이 아닙니다.</desc>
    <defs>
     <linearGradient id={id+'-fill'} gradientUnits="userSpaceOnUse" x1="95" y1="85" x2="310" y2="315">
      <stop offset="0%" stopColor="#86EFAC" stopOpacity=".66"/>
      <stop offset="20%" stopColor="#FDE68A" stopOpacity=".56"/>
      <stop offset="40%" stopColor="#93C5FD" stopOpacity=".6"/>
      <stop offset="60%" stopColor="#C4B5FD" stopOpacity=".62"/>
      <stop offset="80%" stopColor="#99F6E4" stopOpacity=".56"/>
      <stop offset="100%" stopColor="#FDA4AF" stopOpacity=".64"/>
     </linearGradient>
     <radialGradient id={id+'-gloss'} gradientUnits="userSpaceOnUse" cx="178" cy="155" r="145">
      <stop offset="0%" stopColor="white" stopOpacity=".55"/>
      <stop offset="55%" stopColor="white" stopOpacity=".12"/>
      <stop offset="100%" stopColor="white" stopOpacity="0"/>
     </radialGradient>
     <clipPath id={id+'-data-clip'}><polygon points={actual}/></clipPath>
     <filter id={id+'-shadow'} filterUnits="userSpaceOnUse" x="60" y="60" width="280" height="280">
      <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#65768C" floodOpacity=".18"/>
     </filter>
     <filter id={id+'-badge-shadow'} x="-25%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#64748B" floodOpacity=".12"/>
     </filter>
     {scores.map((d,i)=><radialGradient key={d.domainId} id={id+'-badge-'+i} cx="25%" cy="15%" r="90%">
      <stop offset="0%" stopColor="white"/>
      <stop offset="55%" stopColor={AXIS_COLORS[i]} stopOpacity=".08"/>
      <stop offset="100%" stopColor={AXIS_COLORS[i]} stopOpacity=".24"/>
     </radialGradient>)}
    </defs>
    <polygon data-radar-background="true" points={points(100)} fill="white" fillOpacity=".45"/>
    {scores.map((d,i)=>{
     const end=getRadarPoint(i,100);return <line key={d.domainId} x1="200" y1="200" x2={end.x} y2={end.y} stroke={AXIS_COLORS[i]} strokeOpacity=".22"/>;
    })}
    {[25,50,75,100].map(level=><polygon key={level} data-grid={level} points={points(level)} fill="none" stroke="#8798AB" strokeOpacity={level===100?'.48':'.3'} strokeWidth="1"/>)}
    <polygon data-testid="radar-data" points={actual} fill={hasNonZeroScore?'url(#'+id+'-fill)':'none'} stroke="#527A7D" strokeOpacity=".9" strokeWidth="2" strokeLinejoin="round" filter={hasNonZeroScore?'url(#'+id+'-shadow)':undefined}/>
    {hasNonZeroScore&&<g data-radar-gloss="true" aria-hidden="true" clipPath={'url(#'+id+'-data-clip)'}>
     <rect x="80" y="80" width="240" height="240" fill={'url(#'+id+'-gloss)'}/>
    </g>}
    {[25,50,75,100].map(level=><text key={level} x="205" y={200-120*level/100+12} fill="#475569" fontSize="10" paintOrder="stroke" stroke="white" strokeOpacity=".85" strokeWidth="3" strokeLinejoin="round">{level}</text>)}
    {scores.map((d,i)=>{
     const p=getRadarPoint(i,d.displayScore),angle=(-90+i*60)*Math.PI/180;
     const x=200+161*Math.cos(angle),y=200+161*Math.sin(angle),Icon=AXIS_ICONS[i];
     return <g key={d.domainId}>
      <circle cx={p.x} cy={p.y} r="3.5" fill={AXIS_COLORS[i]} stroke="white" strokeWidth="1.5"/>
      <g data-axis-badge={d.domainId} aria-hidden="true" transform={'translate('+x+' '+y+')'}>
       <rect x="-20" y="-24" width="40" height="48" rx="20" fill="white" fillOpacity=".9" stroke={AXIS_COLORS[i]} strokeOpacity=".18" filter={'url(#'+id+'-badge-shadow)'}/>
       <circle data-axis-icon={d.domainId} cx="0" cy="-7" r="12" fill={'url(#'+id+'-badge-'+i+')'}/>
       <Icon aria-hidden="true" x={-7} y={-14} width={14} height={14} color={AXIS_COLORS[i]} strokeWidth={1.7}/>
       <text x="0" y="17" textAnchor="middle" fill={AXIS_COLORS[i]} fontSize="12.5" fontWeight="600">{d.displayScore}</text>
      </g>
     </g>;
    })}
   </svg>
   <p className="text-center text-sm leading-6 text-slate-600">고정 0–100 눈금 · 점수는 관계 선호 방향입니다.</p>
  </div>
  <figcaption className="min-w-0">
   <p className="sr-only">영역별 정확한 점수</p>
   <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1 lg:gap-2">{scores.map((d,i)=>{
    const Icon=AXIS_ICONS[i];
    return <div key={d.domainId} className="min-w-0 rounded-2xl border border-white bg-white/75 px-3 py-3">
     <dt className="flex items-start gap-2 text-sm leading-6 break-keep text-slate-700">
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white bg-white shadow-sm" style={{color:AXIS_COLORS[i]}}><Icon size={15} strokeWidth={1.7}/></span>
      <span className="min-w-0">{DOMAIN_LABELS[d.domainId]}</span>
     </dt>
     <dd className="mt-1 pl-9 text-lg font-semibold tabular-nums" style={{color:AXIS_COLORS[i]}}>{d.displayScore}<span className="ml-1 text-xs font-normal text-slate-600">/ 100</span></dd>
    </div>;
   })}</dl>
  </figcaption>
 </figure>;
}
function EvidenceList({evidence}:{readonly evidence:readonly Evidence[]}){
 return <ul className="mt-3 space-y-3 text-sm leading-6 text-gray-600">{evidence.map(e=><li key={e.questionId}><span className="font-semibold text-[#175B35]">{e.questionId}</span> · {e.prompt}<span className="mt-1 block rounded-lg bg-[#F4F8F4] px-3 py-2 text-gray-800">{e.label}</span></li>)}</ul>;
}
function ResultCta({authState}:{readonly authState:AuthState}){
 const linkClass='inline-flex min-h-12 items-center justify-center rounded-xl border border-[#175B35] px-6 py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2';
 if(authState==='checking')return <p role="status" className="text-gray-600">회원 상태를 확인하고 있습니다.</p>;
 const links=authState==='authenticated'
  ?[{href:'/members',label:'회원 탐색'},{href:'/dashboard',label:'내 대시보드'}]
  :authState==='error'
   ?[{href:'/login',label:'기존 회원 로그인'},{href:'/signup',label:'무료 회원가입'}]
   :[{href:'/signup',label:'무료 회원가입'},{href:'/login',label:'기존 회원 로그인'}];
 return <><p className="leading-7 text-gray-600">{authState==='error'
  ?'테스트 결과는 그대로 확인할 수 있습니다. 회원 서비스 이용은 로그인 페이지에서 이어가세요. 처음 방문하셨다면 무료 회원가입을 선택해 주세요.'
  :authState==='authenticated'?'테스트 결과는 회원 추천에 자동 반영되지 않습니다. 기존 회원 기능에서 인연을 탐색해 보세요.':'결과는 회원가입 없이 확인할 수 있습니다. 회원 기능을 이용하려면 가입하거나 로그인해 주세요.'}</p>
  <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">{links.map((link,i)=><Link key={link.href} href={link.href} className={linkClass+(i===0?' bg-[#175B35] text-white':' text-[#175B35]')}>{link.label}</Link>)}</div>
 </>;
}
type ResultScreenProps={readonly analysis:MatchTestAnalysis;readonly authState:AuthState;readonly onRestart:()=>void;readonly headingRef?:React.RefObject<HTMLHeadingElement|null>};
function ResultScreen({analysis,authState,onRestart,headingRef}:ResultScreenProps){
 const card='rounded-3xl border border-green-900/10 bg-white p-5 shadow-sm sm:p-8';
 const heading='text-xl font-semibold text-[#183B1B] sm:text-2xl';
 return <div className="min-h-[calc(100vh-4rem)] bg-[#F4F8F4] px-4 py-8 sm:px-6 sm:py-14"><div className="mx-auto max-w-4xl space-y-6">
  <header className="pb-2 text-center"><p className="text-sm font-semibold tracking-wider text-[#175B35]">ComMatch · 관계 가치관 리포트 3.0</p><h1 ref={headingRef} tabIndex={-1} className="mx-auto mt-3 max-w-3xl text-3xl font-semibold leading-snug tracking-tight break-keep text-[#183B1B] outline-none sm:text-4xl">{analysis.title}</h1><p className="mx-auto mt-5 max-w-2xl leading-8 text-gray-700">{analysis.summary}</p></header>
  <section aria-labelledby="radar-heading"><h2 id="radar-heading" className={heading+' mb-4'}>6가지 관계 가치관</h2><RadarChart scores={analysis.domainResults}/><p className="mt-3 text-sm leading-6 text-gray-600">높고 낮음은 선호 방향이며 우열·백분위·궁합 확률이 아닙니다. 중간 점수도 서로 다른 상황의 응답이 합쳐진 결과일 수 있습니다.</p></section>
  <section className={card} aria-labelledby="preferences-heading"><h2 id="preferences-heading" className={heading}>주요 관계 선호</h2>{analysis.preferences.length?analysis.preferences.map((p,i)=><article key={i} className="mt-5 border-t border-gray-100 pt-5"><p className="leading-8 text-gray-800">{p.description}</p><details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[#175B35]">이렇게 해석했습니다 · 응답 근거</summary><EvidenceList evidence={p.evidence}/></details></article>):<p className="mt-4 leading-7 text-gray-600">한 방향으로 단정할 근거가 충분하지 않습니다. 영역별 응답을 보며 구체적인 상황을 이야기해 보세요.</p>}</section>
  <section className={card} aria-labelledby="coordination-heading"><h2 id="coordination-heading" className={heading}>상대와 조율해 볼 부분</h2><p className="mt-3 text-sm leading-6 text-gray-600">문제가 있다는 판단이 아니라, 상대의 선호를 확인할 대화 주제입니다.</p><ul className="mt-4 space-y-3">{analysis.coordination.map(text=><li key={text} className="rounded-xl bg-[#F0F6ED] p-4 leading-7 text-gray-800">{text}</li>)}</ul></section>
  <section className={card} aria-labelledby="conversation-heading"><h2 id="conversation-heading" className={heading}>대화해 볼 질문</h2><ol className="mt-5 space-y-3">{analysis.questions.map((text,i)=><li key={text} className="flex gap-3 rounded-xl bg-[#FFF8F5] p-4 leading-7 text-gray-800"><span className="font-semibold text-[#A94146]">{String(i+1).padStart(2,'0')}</span><span>{text}</span></li>)}</ol></section>
  <section className={card+' text-center'} aria-label="다음 행동 안내"><h2 className={heading+' mb-4'}>다음 만남을 시작해 보세요</h2><ResultCta authState={authState}/></section>
  <section aria-labelledby="details-heading"><h2 id="details-heading" className={heading}>영역별 상세 설명과 응답 근거</h2><div className="mt-4 space-y-3">{analysis.domainResults.map(d=><details data-domain={d.domainId} key={d.domainId} className={card+' group'}><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3"><span><span className="block text-sm text-[#175B35]">{DOMAIN_LABELS[d.domainId]} · {d.displayScore} / 100</span><span className="mt-1 block font-semibold leading-7 text-gray-900">{d.title}</span></span><ChevronDown aria-hidden="true" size={20} className="shrink-0 transition-transform group-open:rotate-180"/></summary><div className="mt-4 border-t border-gray-100 pt-4"><p className="leading-8 text-gray-700">{d.description}</p>{analysis.patterns.filter(p=>p.domainId===d.domainId).map(p=><p key={p.id} className="mt-3 rounded-xl bg-[#F0F6ED] p-4 leading-7 text-gray-800">문항별 답변에서는 이런 선호도 나타났습니다. {p.description}</p>)}<h3 className="mt-5 font-semibold text-gray-800">응답 근거</h3><EvidenceList evidence={d.evidence}/></div></details>)}</div></section>
  <aside className="rounded-2xl border border-gray-200 p-5 text-sm leading-7 text-gray-600"><h2 className="font-semibold text-gray-800">결과를 볼 때 참고해 주세요</h2><p className="mt-2">{analysis.limitation}</p></aside>
  <div className="text-center"><button type="button" onClick={onRestart} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#175B35] px-6 py-3 font-semibold text-[#175B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"><RotateCcw aria-hidden="true" size={18}/>다시 테스트하기</button></div>
 </div></div>;
}

// Analytics loads separately; loading/transport errors cannot stop a test interaction.
function trackTestEvent(name: 'match_test_start' | 'match_test_complete') {
  void import('@/lib/analytics/promotion')
    .then(({ trackPromotionEvent }) => trackPromotionEvent(name))
    .catch(() => {});
}

export default function MatchTestPage() {
  const [testState, setTestState] = useState<MatchTestSessionState>(createInitialMatchTestState);
  const [isRestored, setIsRestored] = useState(false);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const questionHeadingRef = useRef<HTMLLegendElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const analyticsAttempt = useRef({ started: false, completed: false });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const restored = readMatchTestSession(window.sessionStorage);
      if (restored) {
        // Existing progress represents an existing attempt, not a new interaction.
        analyticsAttempt.current = {
          started: Object.keys(restored.answers).length > 0,
          completed: restored.phase === 'result',
        };
        setTestState(restored);
      }
      setIsRestored(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!isRestored) return;
    writeMatchTestSession(window.sessionStorage, testState, true);
  }, [isRestored, testState]);

  useEffect(() => {
    let active = true;
    void getCurrentUser()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthState(isAuthSessionMissingError(error)?'anonymous':'error');
          return;
        }
        setAuthState(data.user ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (active) setAuthState('error');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isRestored) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const frame = window.requestAnimationFrame(() => {
      if (testState.phase === 'result') resultHeadingRef.current?.focus();
      else questionHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isRestored, testState.currentQuestionId, testState.phase]);

  const currentIndex = MATCH_TEST_DISPLAY_ORDER.indexOf(testState.currentQuestionId);
  const currentQuestion = MATCH_TEST_DISPLAY_QUESTIONS[currentIndex] ?? MATCH_TEST_DISPLAY_QUESTIONS[0];
  const analysis = useMemo(
    () => (testState.phase === 'result' ? createMatchTestResult(testState.answers) : null),
    [testState.answers, testState.phase],
  );

  useEffect(() => {
    if (!isRestored || !analysis || analyticsAttempt.current.completed) return;
    analyticsAttempt.current.completed = true;
    trackTestEvent('match_test_complete');
  }, [isRestored, analysis]);

  const dispatch = (action: MatchTestAction) => {
    setTestState((current) => reduceMatchTestState(current, action));
  };

  const restart = () => {
    clearMatchTestSession(window.sessionStorage);
    analyticsAttempt.current = { started: false, completed: false };
    dispatch({ type: 'restart' });
  };

  if (!isRestored) {
    return <div className="min-h-[calc(100vh-4rem)] bg-[#F4F8F4]" aria-label="테스트 진행 상태 불러오는 중" />;
  }

  if (testState.phase === 'result' && analysis) {
    return <ResultScreen analysis={analysis} authState={authState} onRestart={restart} headingRef={resultHeadingRef} />;
  }

  return (
    <QuestionScreen
      question={currentQuestion}
      questionNumber={currentIndex + 1}
      selectedAnswer={testState.answers[currentQuestion.id]}
      onAnswer={(value) => {
        const answer = parseMatchTestAnswer(currentQuestion.id, value);
        if (!answer) return;
        if (!analyticsAttempt.current.started) {
          analyticsAttempt.current.started = true;
          trackTestEvent('match_test_start');
        }
        dispatch({ type: 'answer', value: answer });
      }}
      onPrevious={() => dispatch({ type: 'previous' })}
      onNext={() => dispatch({ type: 'next' })}
      headingRef={questionHeadingRef}
    />
  );
}
