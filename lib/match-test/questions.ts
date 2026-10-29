import type { DomainId, MatchTestQuestion, LikertValue } from './types';

export const MATCH_TEST_DOMAINS = [
  {
    "id": "emotional-openness",
    "label": "감정 표현과 소통"
  },
  {
    "id": "conflict-resolution",
    "label": "갈등과 화해"
  },
  {
    "id": "shared-life-coordination",
    "label": "결혼생활 조율"
  },
  {
    "id": "family-interaction",
    "label": "가족 교류"
  },
  {
    "id": "personal-autonomy",
    "label": "개인 시간과 자율성"
  },
  {
    "id": "future-planning",
    "label": "미래 계획"
  }
] as const satisfies readonly {id:DomainId;label:string}[];

export const MATCH_TEST_QUESTIONS = [
  {
    "id": "Q01",
    "domainId": "emotional-openness",
    "kind": "scenario",
    "prompt": "기쁜 소식이 생겼고 상대도 연락을 받을 수 있는 상황입니다. 나는 보통 어떻게 나누고 싶나요?",
    "options": [
      {
        "code": "SHARE_NOW",
        "label": "바로 연락해 기쁜 마음을 말로 나누고 싶다",
        "score": 5
      },
      {
        "code": "KEEP_PRIVATE",
        "label": "바로 알리기보다 혼자 기쁨을 느끼고 간직하고 싶다",
        "score": 1
      },
      {
        "code": "SHARE_LATER",
        "label": "당장 연락하기보다 나중에 함께 이야기할 때 나누고 싶다",
        "score": 3
      }
    ]
  },
  {
    "id": "Q02",
    "domainId": "emotional-openness",
    "kind": "agreement",
    "prompt": "마음이 힘들 때 연인에게 내 감정을 솔직하게 이야기하고 싶습니다."
  },
  {
    "id": "Q03",
    "domainId": "emotional-openness",
    "kind": "scenario",
    "prompt": "힘든 일이 생겼고 상대가 이야기를 들어줄 수 있습니다. 내 마음을 다루는 방식으로 가장 편한 것은 무엇인가요?",
    "options": [
      {
        "code": "PROCESS_THEN_SHARE",
        "label": "혼자 생각을 정리한 뒤 상대와 이야기한다",
        "score": 3
      },
      {
        "code": "TALK_TO_PROCESS",
        "label": "먼저 상대에게 이야기하면서 마음을 정리한다",
        "score": 5
      },
      {
        "code": "PROCESS_PRIVATELY",
        "label": "상대와 이야기하기보다 우선 스스로 감정을 정리하고 싶다",
        "score": 1
      }
    ]
  },
  {
    "id": "Q04",
    "domainId": "conflict-resolution",
    "kind": "scenario",
    "prompt": "데이트 방법처럼 가벼운 의견 차이가 생겼을 때, 서로의 이유를 확인하는 대화를 나는 어떻게 시작하는 편이 편한가요?",
    "options": [
      {
        "code": "RESPOND_TO_DISCUSSION",
        "label": "상대가 대화를 꺼내면 내 생각을 함께 나눈다",
        "score": 3
      },
      {
        "code": "PAUSE_FIRST",
        "label": "대화를 시작하기 전에 각자 생각할 시간을 두고 싶다",
        "score": 1
      },
      {
        "code": "INITIATE_DISCUSSION",
        "label": "내가 먼저 서로의 이유를 이야기해 보자고 제안한다",
        "score": 5
      }
    ]
  },
  {
    "id": "Q05",
    "domainId": "conflict-resolution",
    "kind": "agreement",
    "prompt": "다툰 뒤에는 서로 무엇이 속상했는지 다시 이야기하며 관계를 풀고 싶습니다."
  },
  {
    "id": "Q06",
    "domainId": "conflict-resolution",
    "kind": "agreement",
    "prompt": "관계에서 중요하게 느끼는 문제라면, 상대와 의견이 달라도 내 생각을 말하고 싶습니다."
  },
  {
    "id": "Q07",
    "domainId": "shared-life-coordination",
    "kind": "scenario",
    "prompt": "결혼 후 두 사람이 충분히 상의해 재정을 관리한다면, 어떤 관리 범위가 가장 편할 것 같나요?",
    "options": [
      {
        "code": "SEPARATE_FINANCES",
        "label": "공통 지출의 분담만 정하고 나머지는 각자 관리한다",
        "score": 1
      },
      {
        "code": "JOINT_FINANCES",
        "label": "수입과 지출의 큰 범위를 공동 예산으로 관리한다",
        "score": 5
      },
      {
        "code": "SHARED_AND_PERSONAL",
        "label": "공동생활 예산은 함께 관리하고 개인 예산은 따로 둔다",
        "score": 3
      }
    ]
  },
  {
    "id": "Q08",
    "domainId": "shared-life-coordination",
    "kind": "agreement",
    "prompt": "일이나 건강 상태가 달라지면, 집안일의 분담을 배우자와 다시 상의해 조정하고 싶습니다."
  },
  {
    "id": "Q09",
    "domainId": "shared-life-coordination",
    "kind": "scenario",
    "prompt": "함께 살면서 정리·청소 같은 생활 방식이 다르다면, 어느 범위까지 함께 기준을 정하고 싶나요?",
    "options": [
      {
        "code": "COMMON_SPACE_RULES",
        "label": "공용 공간의 기준을 정하고 개인 공간은 각자 방식에 맡긴다",
        "score": 3
      },
      {
        "code": "MINIMUM_SHARED_RULES",
        "label": "필요한 최소 약속을 제외하면 각자 방식을 유지한다",
        "score": 1
      },
      {
        "code": "BROAD_SHARED_RULES",
        "label": "생활 전반의 기준을 함께 정하고 필요할 때 조정한다",
        "score": 5
      }
    ]
  },
  {
    "id": "Q10",
    "domainId": "family-interaction",
    "kind": "scenario",
    "prompt": "이동 거리와 일정에 무리가 없고 두 사람도 동의한다면, 결혼 후 양가 가족을 직접 만나는 빈도로 무엇이 편한가요?",
    "options": [
      {
        "code": "OCCASION_BASED_VISITS",
        "label": "주요 행사나 필요한 일이 있을 때 중심으로 만난다",
        "score": 1
      },
      {
        "code": "MONTHLY_VISITS",
        "label": "각 가족과 한 달에 한 번 정도 정기적으로 만난다",
        "score": 5
      },
      {
        "code": "OCCASIONAL_VISITS",
        "label": "각 가족과 몇 달에 한 번 정도 만난다",
        "score": 3
      }
    ]
  },
  {
    "id": "Q11",
    "domainId": "family-interaction",
    "kind": "agreement",
    "prompt": "특별한 용건이 없어도 서로의 가족과 안부나 일상을 자주 나누고 싶습니다."
  },
  {
    "id": "Q12",
    "domainId": "family-interaction",
    "kind": "agreement",
    "prompt": "가족과 다음에 만날 기회를 만들기 위해, 내가 먼저 연락하거나 만남을 제안하고 싶습니다."
  },
  {
    "id": "Q13",
    "domainId": "personal-autonomy",
    "kind": "scenario",
    "prompt": "함께 꼭 해야 할 일이 없는 휴일에 충분히 쉬고 싶습니다. 나에게 가장 편한 시간 배분은 무엇인가요?",
    "options": [
      {
        "code": "SPLIT_REST_TIME",
        "label": "혼자 쉬는 시간과 함께하는 시간을 나누고 싶다",
        "score": 3
      },
      {
        "code": "PERSONAL_REST",
        "label": "휴일의 상당 부분을 혼자 쉬거나 개인 활동에 쓰고 싶다",
        "score": 5
      },
      {
        "code": "SHARED_REST",
        "label": "휴일의 상당 부분을 배우자와 함께 보내고 싶다",
        "score": 1
      }
    ]
  },
  {
    "id": "Q14",
    "domainId": "personal-autonomy",
    "kind": "agreement",
    "prompt": "부부의 여가 일정을 정할 때, 각자의 개인 활동 시간을 별도의 일정으로 남겨두고 싶습니다."
  },
  {
    "id": "Q15",
    "domainId": "personal-autonomy",
    "kind": "scenario",
    "prompt": "배우자가 나와 다른 취미를 즐기고 싶어 합니다. 두 사람이 합의할 여가 구성으로 무엇이 가장 편한가요?",
    "options": [
      {
        "code": "MAINLY_SHARED_LEISURE",
        "label": "개인 취미 시간은 짧게 두고 함께하는 여가를 중심으로 구성한다",
        "score": 1
      },
      {
        "code": "REGULAR_INDEPENDENT_LEISURE",
        "label": "서로의 독립적인 취미 시간을 정기적으로 확보한다",
        "score": 5
      },
      {
        "code": "FLEXIBLE_LEISURE",
        "label": "주마다 상황을 보며 개인 취미와 함께하는 시간을 조정한다",
        "score": 3
      }
    ]
  },
  {
    "id": "Q16",
    "domainId": "future-planning",
    "kind": "scenario",
    "prompt": "결혼 후 몇 년 안에 이루고 싶은 공동 목표가 생겼습니다. 어떤 준비 방식이 편한가요?",
    "options": [
      {
        "code": "DETAILED_PLAN",
        "label": "목표와 시기, 필요한 준비를 구체적으로 정한다",
        "score": 5
      },
      {
        "code": "BROAD_DIRECTION",
        "label": "큰 방향은 정하되 세부 내용은 나중에 결정한다",
        "score": 3
      },
      {
        "code": "DECIDE_AS_NEEDED",
        "label": "미리 정하기보다 실제 상황이 되었을 때 결정한다",
        "score": 1
      }
    ]
  },
  {
    "id": "Q17",
    "domainId": "future-planning",
    "kind": "agreement",
    "prompt": "결혼 전에 주거 예산이나 생활비 분담처럼 중요한 생활 조건을 구체적으로 상의해 두고 싶습니다."
  },
  {
    "id": "Q18",
    "domainId": "future-planning",
    "kind": "agreement",
    "prompt": "결혼 후에도 공동 목표의 진행 상황을 일정한 주기로 함께 점검하고 조정하고 싶습니다."
  }
] as const satisfies readonly MatchTestQuestion[];

export const LIKERT_OPTIONS = [
  {
    "value": 1,
    "label": "전혀 그렇지 않다"
  },
  {
    "value": 2,
    "label": "그렇지 않은 편이다"
  },
  {
    "value": 3,
    "label": "보통이다"
  },
  {
    "value": 4,
    "label": "그런 편이다"
  },
  {
    "value": 5,
    "label": "매우 그렇다"
  }
] as const satisfies readonly {value:LikertValue;label:string}[];
