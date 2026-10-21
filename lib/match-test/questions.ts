import type { DomainId, LikertValue, MatchTestQuestion } from './types';

export const MATCH_TEST_DOMAINS = [
  { id: 'emotional-openness', label: '감정 공유 개방성' },
  { id: 'conflict-resolution', label: '갈등 대화와 공동 해결' },
  { id: 'shared-life-coordination', label: '공동생활 조율 선호' },
  { id: 'family-interaction', label: '가족 교류 선호' },
  { id: 'personal-autonomy', label: '개인 시간과 자율성' },
  { id: 'future-planning', label: '미래 계획의 구체성' },
] as const satisfies readonly { id: DomainId; label: string }[];

export const MATCH_TEST_QUESTIONS = [
  {
    id: 'Q01',
    domainId: 'emotional-openness',
    prompt: '기쁜 일이나 고마운 일이 생기면 연인에게 말로 표현하는 편입니다.',
    reverseScored: false,
  },
  {
    id: 'Q02',
    domainId: 'emotional-openness',
    prompt: '마음이 힘들 때 연인에게 내 감정을 솔직하게 이야기하고 싶습니다.',
    reverseScored: false,
  },
  {
    id: 'Q03',
    domainId: 'emotional-openness',
    prompt: '연인에게 느끼는 감정을 말로 표현하기보다 혼자 간직하는 편입니다.',
    reverseScored: true,
  },
  {
    id: 'Q04',
    domainId: 'conflict-resolution',
    prompt: '연인과 의견이 다를 때 내 생각을 직접 이야기하고 싶습니다.',
    reverseScored: false,
  },
  {
    id: 'Q05',
    domainId: 'conflict-resolution',
    prompt: '다툰 뒤에는 서로 어떤 점이 속상했는지 이야기하는 시간을 갖고 싶습니다.',
    reverseScored: false,
  },
  {
    id: 'Q06',
    domainId: 'conflict-resolution',
    prompt: '다툰 일은 다시 이야기해 풀기보다 각자 생각을 정리하며 넘어가는 편이 좋습니다.',
    reverseScored: true,
  },
  {
    id: 'Q07',
    domainId: 'shared-life-coordination',
    prompt: '결혼 후 가계 지출은 배우자와 함께 계획하고 싶습니다.',
    reverseScored: false,
  },
  {
    id: 'Q08',
    domainId: 'shared-life-coordination',
    prompt: '집안일의 역할은 각자의 상황에 맞게 배우자와 조정하는 편이 좋습니다.',
    reverseScored: false,
  },
  {
    id: 'Q09',
    domainId: 'shared-life-coordination',
    prompt: '함께 사는 생활의 기준은 서로 상의하기보다 각자의 방식을 유지하는 편이 좋습니다.',
    reverseScored: true,
  },
  {
    id: 'Q10',
    domainId: 'family-interaction',
    prompt: '결혼 후에도 서로의 가족과 정기적으로 시간을 보내고 싶습니다.',
    reverseScored: false,
  },
  {
    id: 'Q11',
    domainId: 'family-interaction',
    prompt: '결혼 후에도 서로의 가족과 안부나 일상을 자주 나누고 싶습니다.',
    reverseScored: false,
  },
  {
    id: 'Q12',
    domainId: 'family-interaction',
    prompt: '결혼 후에는 서로의 가족과 자주 교류하기보다 필요한 때를 중심으로 만나고 싶습니다.',
    reverseScored: true,
  },
  {
    id: 'Q13',
    domainId: 'personal-autonomy',
    prompt: '결혼 후에도 혼자만의 시간을 정기적으로 갖고 싶습니다.',
    reverseScored: false,
  },
  {
    id: 'Q14',
    domainId: 'personal-autonomy',
    prompt: '배우자와 취미가 달라도 각자 원하는 활동을 즐기고 싶습니다.',
    reverseScored: false,
  },
  {
    id: 'Q15',
    domainId: 'personal-autonomy',
    prompt: '쉬는 날에는 각자의 일정보다 배우자와 함께 보내는 시간을 우선하고 싶습니다.',
    reverseScored: true,
  },
  {
    id: 'Q16',
    domainId: 'future-planning',
    prompt: '결혼생활의 중요한 목표는 배우자와 미리 방향을 정해 두고 싶습니다.',
    reverseScored: false,
  },
  {
    id: 'Q17',
    domainId: 'future-planning',
    prompt: '미래의 변화를 예상해 필요한 준비를 미리 해 두는 편입니다.',
    reverseScored: false,
  },
  {
    id: 'Q18',
    domainId: 'future-planning',
    prompt: '장기 계획을 구체적으로 세우기보다 현재 상황에 맞춰 결정하는 편입니다.',
    reverseScored: true,
  },
] as const satisfies readonly MatchTestQuestion[];

export const LIKERT_OPTIONS = [
  { value: 1, label: '전혀 그렇지 않다' },
  { value: 2, label: '그렇지 않은 편이다' },
  { value: 3, label: '보통이다' },
  { value: 4, label: '그런 편이다' },
  { value: 5, label: '매우 그렇다' },
] as const satisfies readonly { value: LikertValue; label: string }[];
