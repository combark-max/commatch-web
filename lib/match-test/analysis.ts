import {MATCH_TEST_DOMAINS,MATCH_TEST_QUESTIONS,LIKERT_OPTIONS} from './questions';
import type {DomainId,QuestionId,AnswerEvidence,DomainScore,MatchTestScoringResult} from './types';
type SuccessfulScoringResult=Extract<MatchTestScoringResult,{ok:true}>;
type Condition=readonly [QuestionId,string|readonly (string|number)[]];
type Rule={readonly id:string;readonly domainId:DomainId;readonly priority:number;readonly evidenceIds:readonly QuestionId[];readonly conditions:readonly Condition[];readonly description:string;readonly question:string;readonly topic:string};
export type PatternResult=Omit<Rule,'conditions'|'evidenceIds'> & {readonly evidence:readonly Evidence[]};
export type Evidence=AnswerEvidence & {readonly prompt:string;readonly label:string};
type CombinationRule={readonly id:string;readonly conditions:readonly (readonly [number,'low'|'high'])[];readonly title:string;readonly description:string;readonly coordination:string;readonly question:string;readonly topic:string};
export type CombinationResult=Omit<CombinationRule,'conditions'> & {readonly domainIds:readonly DomainId[]};
export type DomainAnalysis=DomainScore & {readonly title:string;readonly description:string;readonly conversationQuestion:string;readonly evidence:readonly Evidence[]};
export type MatchTestAnalysis={
 readonly title:string;readonly summary:string;readonly domainResults:readonly DomainAnalysis[];readonly patterns:readonly PatternResult[];
 readonly preferences:readonly {description:string;evidence:readonly Evidence[]}[];readonly coordination:readonly string[];readonly questions:readonly string[];
 readonly combination:CombinationResult|null;readonly highlightedDomainIds:readonly DomainId[];readonly limitation:string;
};
const RULES=[
  {
    "id": "E1",
    "domainId": "emotional-openness",
    "priority": 1,
    "evidenceIds": [
      "Q01",
      "Q03"
    ],
    "conditions": [
      [
        "Q01",
        "SHARE_NOW"
      ],
      [
        "Q03",
        [
          "PROCESS_THEN_SHARE",
          "PROCESS_PRIVATELY"
        ]
      ]
    ],
    "description": "기쁜 소식은 바로 나누고, 힘든 마음은 우선 스스로 정리하고 싶어 합니다.",
    "question": "힘든 일이 있을 때 혼자 정리할 시간과 상대의 도움은 각각 어느 정도가 좋을까요?",
    "topic": "emotionTiming"
  },
  {
    "id": "E2",
    "domainId": "emotional-openness",
    "priority": 1,
    "evidenceIds": [
      "Q01",
      "Q03"
    ],
    "conditions": [
      [
        "Q01",
        [
          "SHARE_LATER",
          "KEEP_PRIVATE"
        ]
      ],
      [
        "Q03",
        "TALK_TO_PROCESS"
      ]
    ],
    "description": "기쁜 소식은 바로 전하지 않아도, 힘든 마음은 함께 이야기하며 정리하고 싶어 합니다.",
    "question": "고민을 이야기할 때 공감과 해결책 중 무엇이 더 필요한가요?",
    "topic": "emotionSupport"
  },
  {
    "id": "C1",
    "domainId": "conflict-resolution",
    "priority": 2,
    "evidenceIds": [
      "Q04",
      "Q05"
    ],
    "conditions": [
      [
        "Q04",
        "PAUSE_FIRST"
      ],
      [
        "Q05",
        [
          4,
          5
        ]
      ]
    ],
    "description": "의견이 다를 때는 생각할 시간을 갖고, 다툰 뒤에는 다시 대화하며 풀고 싶어 합니다.",
    "question": "잠시 쉬었다가 대화한다면 언제 다시 이야기하기로 정하면 좋을까요?",
    "topic": "conflictTiming"
  },
  {
    "id": "C2",
    "domainId": "conflict-resolution",
    "priority": 2,
    "evidenceIds": [
      "Q04",
      "Q06"
    ],
    "conditions": [
      [
        "Q04",
        "INITIATE_DISCUSSION"
      ],
      [
        "Q06",
        [
          1,
          2
        ]
      ]
    ],
    "description": "가벼운 의견 차이가 생기면 먼저 대화를 꺼내고 싶어 합니다. 중요한 문제에서 내 생각을 말하고 싶다는 문장에는 동의 정도가 낮았습니다.",
    "question": "중요한 문제에서 의견이 다르면, 서로의 생각을 어떻게 나누면 좋을까요?",
    "topic": "conflictExpression"
  },
  {
    "id": "L1",
    "domainId": "shared-life-coordination",
    "priority": 1,
    "evidenceIds": [
      "Q07",
      "Q09"
    ],
    "conditions": [
      [
        "Q07",
        "JOINT_FINANCES"
      ],
      [
        "Q09",
        "MINIMUM_SHARED_RULES"
      ]
    ],
    "description": "재정은 함께 관리하고, 생활 방식에는 각자의 방식을 유지할 여지를 두고 싶어 합니다.",
    "question": "공동 예산과 별개로 각자 정해도 되는 생활 기준은 무엇일까요?",
    "topic": "sharedBoundaries"
  },
  {
    "id": "L2",
    "domainId": "shared-life-coordination",
    "priority": 1,
    "evidenceIds": [
      "Q07",
      "Q09"
    ],
    "conditions": [
      [
        "Q07",
        "SEPARATE_FINANCES"
      ],
      [
        "Q09",
        "BROAD_SHARED_RULES"
      ]
    ],
    "description": "공통 지출을 분담한 뒤 나머지 예산은 각자 관리하고 싶어 합니다. 생활 전반의 기준은 함께 정하고 싶어 합니다.",
    "question": "공통 지출과 개인 예산은 어떻게 나누고, 생활 기준은 어디까지 함께 정할까요?",
    "topic": "sharedBoundaries"
  },
  {
    "id": "F1",
    "domainId": "family-interaction",
    "priority": 2,
    "evidenceIds": [
      "Q10",
      "Q11"
    ],
    "conditions": [
      [
        "Q10",
        "MONTHLY_VISITS"
      ],
      [
        "Q11",
        [
          1,
          2
        ]
      ]
    ],
    "description": "양가 가족과는 정기적으로 만나고, 잦은 일상 연락은 덜 선호합니다.",
    "question": "직접 만나는 사이에는 어느 정도 연락하는 것이 편할까요?",
    "topic": "familyContact"
  },
  {
    "id": "F2",
    "domainId": "family-interaction",
    "priority": 2,
    "evidenceIds": [
      "Q10",
      "Q11"
    ],
    "conditions": [
      [
        "Q10",
        "OCCASION_BASED_VISITS"
      ],
      [
        "Q11",
        [
          4,
          5
        ]
      ]
    ],
    "description": "가족 방문은 주요 행사나 필요한 일이 있을 때를 중심으로 하고, 안부와 일상은 자주 나누고 싶어 합니다.",
    "question": "자주 만나지 않을 때 어떤 방식으로 안부를 나누면 좋을까요?",
    "topic": "familyContact"
  },
  {
    "id": "A1",
    "domainId": "personal-autonomy",
    "priority": 3,
    "evidenceIds": [
      "Q13",
      "Q15"
    ],
    "conditions": [
      [
        "Q13",
        "PERSONAL_REST"
      ],
      [
        "Q15",
        "REGULAR_INDEPENDENT_LEISURE"
      ]
    ],
    "description": "나도 배우자도 각자 쉬거나 취미를 즐길 시간을 갖고 싶어 합니다.",
    "question": "각자의 시간을 확보하면서 함께할 시간은 어떻게 정할까요?",
    "topic": "autonomyTime"
  },
  {
    "id": "A2",
    "domainId": "personal-autonomy",
    "priority": 3,
    "evidenceIds": [
      "Q13",
      "Q15"
    ],
    "conditions": [
      [
        "Q13",
        "SHARED_REST"
      ],
      [
        "Q15",
        "REGULAR_INDEPENDENT_LEISURE"
      ]
    ],
    "description": "휴식은 함께하고 싶고, 서로의 독립적인 취미 시간도 정기적으로 갖고 싶어 합니다.",
    "question": "한 사람이 개인 활동을 하는 날 다른 사람은 어떻게 쉬면 좋을까요?",
    "topic": "autonomyTime"
  },
  {
    "id": "P1",
    "domainId": "future-planning",
    "priority": 2,
    "evidenceIds": [
      "Q16",
      "Q17"
    ],
    "conditions": [
      [
        "Q16",
        "DECIDE_AS_NEEDED"
      ],
      [
        "Q17",
        [
          4,
          5
        ]
      ]
    ],
    "description": "공동 목표는 실제 상황이 되었을 때 결정하고, 결혼 전 중요한 생활 조건은 미리 상의하고 싶어 합니다.",
    "question": "미리 정할 생활 조건과 나중에 결정할 목표를 어떻게 나눌까요?",
    "topic": "futurePlanning"
  },
  {
    "id": "P2",
    "domainId": "future-planning",
    "priority": 2,
    "evidenceIds": [
      "Q16",
      "Q18"
    ],
    "conditions": [
      [
        "Q16",
        "DETAILED_PLAN"
      ],
      [
        "Q18",
        [
          1,
          2
        ]
      ]
    ],
    "description": "공동 목표의 준비는 구체적으로 정하고 싶어 합니다. 진행 상황을 정기적으로 점검하고 싶다는 문장에는 동의 정도가 낮았습니다.",
    "question": "계획을 다시 살펴보고 싶어지는 때는 언제인가요?",
    "topic": "futurePlanning"
  }
] as const satisfies readonly Rule[];
const COMBINATIONS=[
  {
    "id": "X1",
    "conditions": [
      [
        4,
        "high"
      ],
      [
        5,
        "high"
      ]
    ],
    "title": "각자의 시간과 함께 준비하고 싶은 미래",
    "description": "각자의 활동 시간을 확보하는 선호와 미래를 미리 준비하는 선호가 함께 나타났습니다.",
    "coordination": "개인 활동 시간과 공동 계획 시간을 어떻게 구분할지 확인해 보세요.",
    "question": "개인 활동 시간과 공동 계획 시간을 어떻게 나누면 좋을까요?",
    "topic": "jointPlanTime"
  },
  {
    "id": "X2",
    "conditions": [
      [
        3,
        "low"
      ],
      [
        2,
        "high"
      ]
    ],
    "title": "둘의 생활 기준과 가족 교류의 범위",
    "description": "생활 기준을 함께 조율하려는 선호는 높고, 가족 교류 영역의 선호는 낮은 쪽으로 나타났습니다. 두 영역을 구분해 이야기해 보세요.",
    "coordination": "가족 일정과 부부 생활 기준의 경계를 함께 확인해 보세요.",
    "question": "가족 일정과 부부의 생활 기준이 만날 때 어떤 범위까지 함께 정할까요?",
    "topic": "familyBoundary"
  },
  {
    "id": "X3",
    "conditions": [
      [
        0,
        "low"
      ],
      [
        1,
        "high"
      ]
    ],
    "title": "감정 공유와 갈등 대화를 구분해 보는 관계 선호",
    "description": "감정 공유 영역의 선호는 낮고, 의견 차이를 대화로 다루는 영역의 선호는 높은 쪽으로 나타났습니다.",
    "coordination": "개인 감정 정리 시간과 갈등을 논의할 시점을 구분해 보세요.",
    "question": "감정을 정리할 시간과 의견 차이를 이야기할 시점은 어떻게 정할까요?",
    "topic": "conflictTiming"
  },
  {
    "id": "X4",
    "conditions": [
      [
        4,
        "low"
      ],
      [
        5,
        "low"
      ]
    ],
    "title": "함께하는 시간과 미리 정할 계획의 범위",
    "description": "함께하는 여가를 선호하는 쪽의 응답입니다. 미래를 미리 준비하는 영역의 점수는 낮은 편으로 나타났습니다.",
    "coordination": "공동 여가와 별개로 꼭 사전에 합의할 항목을 확인해 보세요.",
    "question": "함께 보내는 시간과 별개로 어떤 일은 미리 합의해 두면 좋을까요?",
    "topic": "futurePlanning"
  }
] as const satisfies readonly CombinationRule[];
const BASIC=[
  [
    "감정 공유의 범위와 시점을 살펴보는 나의 선호",
    "감정을 나누는 방식을 함께 살펴보는 관계 선호",
    "감정을 직접 나누는 관계",
    "감정 공유의 범위와 시점을 스스로 정리하는 쪽의 응답입니다.",
    "감정 공유 영역의 합산 점수는 중간 범위입니다. 기쁜 일과 힘든 일에 대한 답변을 나누어 살펴보세요.",
    "기쁨이나 힘든 마음을 상대와 직접 나누는 쪽의 응답입니다.",
    "기쁜 일과 힘든 일은 각각 언제, 어떻게 나누는 것이 편한가요?",
    "emotionTiming",
    "감정 공유의 시점과 원하는 도움을 확인해 보세요."
  ],
  [
    "대화의 시작과 표현 방식을 살펴보는 관계 선호",
    "상황별 대화 방식을 살펴볼 관계",
    "의견 차이를 대화로 다루는 관계",
    "대화 시작·화해 대화·의견 표현을 합산한 점수는 낮은 편입니다. 각 상황에서 어떤 방식이 편한지는 개별 답변을 함께 살펴보세요.",
    "대화 시작, 회복 대화, 중요한 의견 표현의 응답을 함께 살펴보세요.",
    "의견 차이와 다툼을 명시적인 대화로 다루는 쪽의 응답입니다.",
    "생각할 시간이 필요할 때 다시 대화할 시점은 어떻게 정할까요?",
    "conflictTiming",
    "의견을 꺼내는 방식과 대화를 시작할 시점을 함께 이야기해 보세요."
  ],
  [
    "생활에서 각자 관리할 범위를 두고 싶은 관계 선호",
    "함께 정할 생활의 범위를 살펴보는 관계 선호",
    "생활 기준을 함께 조율하는 관계",
    "최소한의 합의 후 각자 관리할 범위를 두는 쪽의 응답입니다.",
    "재정, 가사, 생활 기준에서 함께 정할 범위가 다를 수 있습니다.",
    "공동 예산과 생활 기준, 가사 분담을 함께 조율하는 쪽의 응답입니다.",
    "함께 정할 생활 기준과 각자 관리할 범위는 무엇인가요?",
    "sharedBoundaries",
    "공동 기준과 각자 관리할 범위를 확인해 보세요."
  ],
  [
    "가족과의 연락·만남의 범위를 살펴보는 관계 선호",
    "가족 교류 방식을 살펴볼 관계",
    "가족과 일상적인 교류를 선호하는 관계",
    "가족과의 연락·만남·만남 제안을 합산한 점수는 낮은 편입니다. 가족에 대한 애정의 크기를 뜻하지 않습니다.",
    "방문과 연락, 만남을 제안하는 방식의 응답을 함께 살펴보세요.",
    "가족과 연락하고 만나며 교류를 이어가는 쪽의 응답입니다.",
    "방문·연락·가족 일정은 각각 어느 정도가 편한가요?",
    "familyContact",
    "방문과 연락, 가족 일정에 대한 각자의 선호를 확인해 보세요."
  ],
  [
    "함께하는 활동을 선호하는 관계",
    "각자의 시간과 함께하는 시간을 살펴보는 관계 선호",
    "개인 시간과 독립 활동을 선호하는 관계",
    "함께 쉬거나 공동 여가를 중심으로 구성하는 쪽의 응답입니다.",
    "자신의 휴식과 배우자의 활동에 대한 선호를 구분해 살펴보세요.",
    "자신과 배우자의 개인 활동 시간을 확보하는 쪽의 응답입니다.",
    "개인 활동과 함께하는 시간을 어떻게 나눌까요?",
    "autonomyTime",
    "개인 활동과 함께할 시간의 배분을 확인해 보세요."
  ],
  [
    "상황에 따른 결정을 선호하는 관계",
    "무엇을 언제 함께 정할지 살펴보는 관계 선호",
    "공동의 미래를 구체적으로 준비하는 관계",
    "목표의 세부 사항이나 점검 방식을 상황에 맞춰 정하는 쪽의 응답입니다.",
    "목표 계획, 사전 생활 조건 논의, 정기 점검의 응답을 함께 살펴보세요.",
    "공동 목표와 생활 조건을 미리 논의하고 준비하는 쪽의 응답입니다.",
    "미리 정할 계획과 상황을 보며 결정할 일을 어떻게 구분할까요?",
    "futurePlanning",
    "미리 합의할 항목과 상황에 맞춰 정할 일을 확인해 보세요."
  ]
] as const;
const LIMITATION='이 결과는 18개 질문에 대한 응답을 바탕으로 연애·결혼 관계에서 선호하는 방식을 살펴보는 참고 자료입니다. 전문적인 심리 진단이나 과학적으로 검증된 궁합 판정이 아니며, 실제 ComMatch 회원 추천 점수에도 반영되지 않습니다. 사람의 성향은 상황과 경험에 따라 달라질 수 있습니다.';

export function analyzeMatchTest(scoringResult:SuccessfulScoringResult):MatchTestAnalysis {
 const scores=MATCH_TEST_DOMAINS.map(d=>scoringResult.domainScores.find(s=>s.domainId===d.id)!);
 const evidence:Evidence[]=scores.flatMap(s=>s.adjustedScores.map(e=>{
  const q=MATCH_TEST_QUESTIONS.find(q=>q.id===e.questionId)!;
  const answer=e.answer;
  const label=q.kind==='scenario'&&answer.kind==='scenario'?q.options.find(o=>o.code===answer.optionId)?.label: answer.kind==='agreement'?LIKERT_OPTIONS.find(o=>o.value===answer.value)?.label:undefined;
  return {...e,prompt:q.prompt,label:label??''};
 }));
 const byId=new Map(evidence.map(e=>[e.questionId,e]));
 const strong=scores.filter(s=>Math.abs(s.rawScore-9)>=3);
 const maxDistance=Math.max(0,...strong.map(s=>Math.abs(s.rawScore-9)));
 const leaders=strong.filter(s=>Math.abs(s.rawScore-9)===maxDistance).map(s=>s.domainId);
 const combinations:CombinationResult[]=(COMBINATIONS as readonly CombinationRule[])
  .filter(c=>c.conditions.every(([i,direction])=>direction==='high'?scores[i].rawScore>=12:scores[i].rawScore<=6))
  .sort((a,b)=>{
   const rank=(c:CombinationRule)=>c.conditions.map(([i])=>Math.abs(scores[i].rawScore-9));
   const x=rank(a),y=rank(b);
   return Math.min(...y)-Math.min(...x)||y.reduce((a,b)=>a+b,0)-x.reduce((a,b)=>a+b,0)||a.id.localeCompare(b.id);
  }).map(c=>({id:c.id,title:c.title,description:c.description,coordination:c.coordination,question:c.question,topic:c.topic,domainIds:c.conditions.map(([i])=>scores[i].domainId)}));
 const combination=combinations[0]??null;
 // Three or more equally prominent directions must not be reduced to one pair.
 const uniformStrong=leaders.length>2;
 const highlightedDomainIds=uniformStrong?leaders:combination?.domainIds??leaders;
 const order=(id:DomainId)=>MATCH_TEST_DOMAINS.findIndex(d=>d.id===id);
 const patterns:PatternResult[]=(RULES as readonly Rule[]).filter(rule=>rule.conditions.every(([id,values])=>{
  const answer=byId.get(id)!.answer;
  const value=answer.kind==='scenario'?answer.optionId:answer.value;
  const allowed:readonly (string|number)[]=typeof values==='string'?[values]:values;
  return allowed.includes(value);
 })).map(rule=>({id:rule.id,domainId:rule.domainId,priority:rule.priority,description:rule.description,question:rule.question,topic:rule.topic,evidence:rule.evidenceIds.map(id=>byId.get(id)!)}))
 .sort((a,b)=>a.priority-b.priority||Number(highlightedDomainIds.includes(b.domainId))-Number(highlightedDomainIds.includes(a.domainId))||order(a.domainId)-order(b.domainId)||a.id.localeCompare(b.id));
 const domainResults:DomainAnalysis[]=scores.map((s,i)=>{
  const b=BASIC[i],n=s.band==='low'?0:s.band==='middle'?1:2;
  return {...s,title:b[n],description:b[n+3],conversationQuestion:b[6],evidence:evidence.filter(e=>s.adjustedScores.some(a=>a.questionId===e.questionId))};
 });
 const allMiddle=evidence.every(e=>e.score===3);
 const title=allMiddle?'상황별로 살펴보는 나의 관계 선호':uniformStrong?'여러 영역에서 선호가 뚜렷하게 나타난 관계':combination?.title??(leaders.length===1?domainResults.find(d=>d.domainId===leaders[0])!.title:leaders.length>1?'응답에서 함께 두드러진 관계 선호':'상황별 선호를 함께 살펴볼 관계 가치관');
 const selected=patterns.slice(0,2);
 const preferences:{description:string;evidence:readonly Evidence[]}[]=selected.map(p=>({description:p.description,evidence:p.evidence}));
 for(const id of highlightedDomainIds){
  if(preferences.length>=2)break;
  if(selected.some(p=>p.domainId===id))continue;
  const d=domainResults.find(d=>d.domainId===id)!;preferences.push({description:d.description,evidence:d.evidence});
 }
 const coordination:string[]=[];
 if(combination)coordination.push(combination.coordination);
 const preferredOrder=[...new Set([...selected.map(p=>p.domainId),...highlightedDomainIds,...MATCH_TEST_DOMAINS.map(d=>d.id)])];
 for(const id of preferredOrder){if(coordination.length>=2)break;const text=BASIC[order(id)][8];if(!coordination.includes(text))coordination.push(text);}
 const questions:string[]=[],topics=new Set<string>();
 const addQuestion=(text:string,topic:string)=>{if(questions.length<3&&!topics.has(topic)&&!questions.includes(text)){topics.add(topic);questions.push(text);}};
 for(const p of selected)addQuestion(p.question,p.topic);
 if(combination)addQuestion(combination.question,combination.topic);
 for(const id of preferredOrder){const b=BASIC[order(id)];addQuestion(b[6],b[7]);}
 const summary=[combination?.description,...selected.map(p=>p.description)].filter((text):text is string=>Boolean(text)).slice(0,2).join(' ')||
 (allMiddle?'중간 응답이 이어져 한 방향의 선호를 단정하지 않았습니다. 구체적인 상황을 상대와 함께 이야기해 보세요.':preferences.map(p=>p.description).slice(0,2).join(' ')||'합산 점수와 문항별 응답을 함께 살펴보며 상황별 선호를 확인해 보세요.');
 return {title,summary,domainResults,patterns,preferences,coordination,questions,combination,highlightedDomainIds,limitation:LIMITATION};
}
