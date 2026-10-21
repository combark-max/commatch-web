import type {
  DomainId,
  MatchTestScoringResult,
  ScoreBand,
} from './types';

type SuccessfulScoringResult = Extract<MatchTestScoringResult, { readonly ok: true }>;

type BandContent = {
  readonly title: string;
  readonly description: string;
};

type DomainContent = Readonly<Record<ScoreBand, BandContent>> & {
  readonly mixedDescription: string;
  readonly conversationQuestion: string;
};

export type DomainAnalysis = {
  readonly domainId: DomainId;
  readonly rawScore: number;
  readonly displayScore: number;
  readonly band: ScoreBand;
  readonly title: string;
  readonly description: string;
  readonly mixedDescription?: string;
  readonly conversationQuestion: string;
};

export type MatchTestAnalysis = {
  readonly domainResults: readonly DomainAnalysis[];
  readonly highestDomainIds: readonly DomainId[];
  readonly lowestDomainIds: readonly DomainId[];
  readonly hasSimilarScores: boolean;
  readonly summary: string;
  readonly limitation: string;
};

const RESULT_CONTENT = {
  'emotional-openness': {
    low: {
      title: '조용히 마음을 나누는 편',
      description: '자신의 감정을 바로 말로 표현하기보다는 마음속에서 정리하고, 편안한 순간에 천천히 이야기하는 방식을 선호합니다. 말의 빈도가 애정의 크기를 의미하지는 않습니다.',
    },
    middle: {
      title: '상황에 맞춰 감정을 나누는 편',
      description: '상대와 상황에 따라 감정을 표현하는 방식을 조절합니다. 때로는 적극적으로 이야기하고, 때로는 혼자 정리하는 시간이 더 편안할 수 있습니다.',
    },
    high: {
      title: '마음을 말로 나누는 편',
      description: '기쁨이나 고민을 연인과 말로 나누는 것을 중요하게 생각합니다. 감정을 솔직하게 표현하고 함께 공감하는 관계에서 친밀감을 느끼는 경향이 있습니다.',
    },
    mixedDescription: '감정을 나누는 방식이 상황이나 감정의 종류에 따라 다르게 나타났습니다. 말로 표현하기 편안한 순간과 혼자 정리하고 싶은 순간을 구분해 보세요.',
    conversationQuestion: '기분이 좋거나 힘들 때, 상대방이 어떤 방식으로 마음을 표현해 주면 가장 편안한가요?',
  },
  'conflict-resolution': {
    low: {
      title: '각자의 생각을 정리하는 편',
      description: '의견 충돌이 생기면 각자 생각을 정리하는 시간을 중요하게 여기는 방향의 응답입니다. 갈등을 다시 이야기할지, 언제 이야기할지는 상대와 미리 조율하면 좋습니다.',
    },
    middle: {
      title: '상황에 따라 대화 방식을 조절하는 편',
      description: '의견 차이의 성격과 상황에 따라 직접 대화하거나 시간을 두고 정리하는 방식 사이에서 균형을 찾는 편입니다.',
    },
    high: {
      title: '대화로 함께 풀어가는 편',
      description: '의견이 다를 때 서로의 생각을 직접 나누고, 갈등 이후에도 이야기를 통해 관계를 회복하는 방식을 선호합니다.',
    },
    mixedDescription: '의견 차이가 생겼을 때 자신의 생각을 표현하는 방식과 갈등 이후 관계를 정리하는 방식에 차이가 나타났습니다.',
    conversationQuestion: '의견이 다를 때 바로 이야기하는 것이 좋을까요, 아니면 시간을 두고 다시 이야기하는 것이 좋을까요?',
  },
  'shared-life-coordination': {
    low: {
      title: '각자의 방식을 존중하는 편',
      description: '함께 생활하더라도 각자의 담당 영역과 생활 방식을 자율적으로 유지하는 관계를 선호합니다. 함께 정할 사항의 범위에 대해서는 서로 합의하는 것이 중요할 수 있습니다.',
    },
    middle: {
      title: '필요할 때 함께 조율하는 편',
      description: '공동으로 결정해야 할 일과 각자 판단해도 되는 일을 상황에 따라 구분하려는 경향이 있습니다.',
    },
    high: {
      title: '함께 계획하고 결정하는 편',
      description: '가계 지출, 가사 역할, 공동생활 기준 등을 배우자와 충분히 상의하며 결정하는 생활 방식을 선호합니다.',
    },
    mixedDescription: '재정, 집안일, 생활 기준에 따라 공동 결정과 개인의 자율성을 중요하게 생각하는 정도가 달랐습니다.',
    conversationQuestion: '결혼 후 가계 관리나 집안일은 어떤 방식으로 함께 결정하고 싶으신가요?',
  },
  'family-interaction': {
    low: {
      title: '필요할 때 교류하는 편',
      description: '가족과의 관계에서도 각자의 생활과 거리를 존중하고, 필요한 때를 중심으로 교류하는 방식을 선호합니다. 가족에 대한 애정이나 책임감이 부족하다는 뜻은 아닙니다.',
    },
    middle: {
      title: '상황에 맞게 교류하는 편',
      description: '서로의 가족과 관계를 유지하되, 생활 여건이나 개인적인 상황에 따라 교류 빈도를 조절하는 방식을 선호합니다.',
    },
    high: {
      title: '일상을 함께 나누는 편',
      description: '결혼 후에도 서로의 가족과 안부를 나누거나 함께 시간을 보내는 등 비교적 정기적인 교류를 선호합니다.',
    },
    mixedDescription: '가족과 시간을 보내는 것, 안부를 나누는 것, 교류 빈도에 관한 생각이 모두 같지는 않았습니다.',
    conversationQuestion: '결혼 후 서로의 가족과 어느 정도 자주 만나거나 연락하는 것이 편안할까요?',
  },
  'personal-autonomy': {
    low: {
      title: '함께하는 시간을 중시하는 편',
      description: '쉬는 날이나 여가 시간에 배우자와 함께하는 활동을 비교적 중요하게 생각합니다. 함께 보내는 시간이 관계의 만족감과 연결될 수 있습니다.',
    },
    middle: {
      title: '함께함과 개인 시간을 조율하는 편',
      description: '배우자와 시간을 보내는 것과 각자의 취미·일정을 존중하는 것 사이에서 상황에 맞는 균형을 선호합니다.',
    },
    high: {
      title: '개인의 시간도 소중히 여기는 편',
      description: '가까운 관계에서도 혼자만의 시간과 각자의 취미를 유지하는 것이 중요하다고 생각합니다. 이는 상대에 대한 관심이나 헌신의 부족을 의미하지 않습니다.',
    },
    mixedDescription: '혼자만의 시간, 취미생활, 주말 일정에 대해 서로 다른 선호가 나타났습니다.',
    conversationQuestion: '주말에는 둘이 함께하는 시간과 각자의 취미생활을 어떻게 나누고 싶으신가요?',
  },
  'future-planning': {
    low: {
      title: '상황에 맞춰 유연하게 결정하는 편',
      description: '미래의 모든 일을 미리 정하기보다는 실제 상황에 맞춰 방향을 결정하는 생활 방식을 선호합니다. 계획이 부족하거나 책임감이 낮다는 의미는 아닙니다.',
    },
    middle: {
      title: '계획과 유연성을 함께 고려하는 편',
      description: '중요한 목표는 미리 생각해 두면서도, 생활에 변화가 생기면 계획을 조정할 수 있는 방식을 선호합니다.',
    },
    high: {
      title: '미래를 구체적으로 준비하는 편',
      description: '장기적인 목표와 필요한 준비를 미리 생각하고 계획하는 것을 중요하게 여깁니다. 배우자와 미래의 방향을 공유하는 관계를 선호할 수 있습니다.',
    },
    mixedDescription: '장기 목표, 사전 준비, 상황에 따른 결정에서 계획을 중요하게 생각하는 정도가 다르게 나타났습니다.',
    conversationQuestion: '결혼 후 5년을 생각했을 때 미리 함께 계획하고 싶은 것은 무엇인가요?',
  },
} as const satisfies Readonly<Record<DomainId, DomainContent>>;

const SIMILAR_SUMMARY = '여러 관계 방식에 대한 응답이 비교적 비슷하게 나타났습니다. 각 영역의 설명을 함께 살펴보며 자신에게 중요한 관계 방식을 생각해 보세요.';
const VARIED_SUMMARY = '관계 영역마다 선호하는 방식에 차이가 나타났습니다. 각 영역의 결과와 대화 질문을 함께 살펴보세요.';
const LIMITATION = '이 결과는 18개 질문에 대한 응답을 바탕으로 연애·결혼 관계에서 선호하는 방식을 살펴보는 참고 자료입니다. 전문적인 심리 진단이나 과학적으로 검증된 궁합 판정이 아니며, 실제 ComMatch 회원 추천 점수에도 반영되지 않습니다. 사람의 성향은 상황과 경험에 따라 달라질 수 있습니다.';

export const analyzeMatchTest = (scoringResult: SuccessfulScoringResult): MatchTestAnalysis => {
  const rawScores = scoringResult.domainScores.map(({ rawScore }) => rawScore);
  const highestRawScore = Math.max(...rawScores);
  const lowestRawScore = Math.min(...rawScores);
  const hasSimilarScores = highestRawScore - lowestRawScore <= 2;

  const domainResults = scoringResult.domainScores.map((score): DomainAnalysis => {
    const content = RESULT_CONTENT[score.domainId];
    const bandContent = content[score.band];
    const adjustedValues = score.adjustedScores.map(({ score: adjustedScore }) => adjustedScore);
    const hasMixedResponses = Math.max(...adjustedValues) - Math.min(...adjustedValues) >= 3;

    return {
      domainId: score.domainId,
      rawScore: score.rawScore,
      displayScore: score.displayScore,
      band: score.band,
      title: bandContent.title,
      description: bandContent.description,
      ...(hasMixedResponses ? { mixedDescription: content.mixedDescription } : {}),
      conversationQuestion: content.conversationQuestion,
    };
  });

  return {
    domainResults,
    highestDomainIds: scoringResult.domainScores
      .filter(({ rawScore }) => rawScore === highestRawScore)
      .map(({ domainId }) => domainId),
    lowestDomainIds: scoringResult.domainScores
      .filter(({ rawScore }) => rawScore === lowestRawScore)
      .map(({ domainId }) => domainId),
    hasSimilarScores,
    summary: hasSimilarScores ? SIMILAR_SUMMARY : VARIED_SUMMARY,
    limitation: LIMITATION,
  };
};
