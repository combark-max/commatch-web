'use server';

import { redirect } from 'next/navigation';
import {
  ACTIVE_CONSENT_TYPES,
  CONSENT_POLICIES,
  type ActiveConsentType,
} from '@/lib/consent/policy';
import {
  assessConsentAccess,
  getConsentCompletionDestinationForUser,
  getCurrentConsentStatus,
} from '@/lib/consent/server';
import { getCurrentMemberAccess } from '@/lib/member/access';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export type ConsentActionState = {
  status: 'idle' | 'error';
  message: string | null;
  completedTypes: ActiveConsentType[];
};

const UUID_PATTERN = (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
);

const getCompletedTypes = (
  assessment: ReturnType<typeof assessConsentAccess>,
): ActiveConsentType[] => assessment.requirements
  .filter(({ satisfaction }) => satisfaction.satisfied)
  .map(({ type }) => type);

const readCurrentAssessment = async () => {
  const lookup = await getCurrentConsentStatus();
  if (lookup.kind !== 'valid') return null;

  return {
    lookup,
    assessment: assessConsentAccess(lookup.user.createdAt, lookup.latestByType),
  };
};

export async function submitRequiredConsents(
  _previousState: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const memberLookup = await getCurrentMemberAccess();
  if (memberLookup.kind === 'anonymous') redirect('/login');
  if (memberLookup.kind === 'valid' && !memberLookup.access.isAllowed) {
    redirect('/account-suspended');
  }
  if (memberLookup.kind === 'error') {
    return {
      status: 'error',
      message: '회원 이용 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      completedTypes: [],
    };
  }

  const current = await readCurrentAssessment();
  if (!current) {
    return {
      status: 'error',
      message: '동의 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      completedTypes: [],
    };
  }

  const completedTypes = getCompletedTypes(current.assessment);
  if (current.assessment.hasInvalidConfiguration) {
    return {
      status: 'error',
      message: '필수 동의 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      completedTypes,
    };
  }

  const missingTypes = current.assessment.requirements
    .filter(({ required, rollout, satisfaction }) => (
      required && rollout.applies && !satisfaction.satisfied
    ))
    .map(({ type }) => type);

  for (const type of missingTypes) {
    if (formData.get(`consent_${type}`) !== 'on') {
      return {
        status: 'error',
        message: '필수 항목을 모두 확인하고 동의해 주세요.',
        completedTypes,
      };
    }
  }

  const requestIds = new Map<ActiveConsentType, string>();
  for (const type of missingTypes) {
    const requestId = formData.get(`request_id_${type}`);
    if (typeof requestId !== 'string' || !UUID_PATTERN.test(requestId)) {
      return {
        status: 'error',
        message: '동의 요청을 준비하지 못했습니다. 페이지를 새로고침해 주세요.',
        completedTypes,
      };
    }
    requestIds.set(type, requestId);
  }

  if (new Set(requestIds.values()).size !== requestIds.size) {
    return {
      status: 'error',
      message: '동의 요청을 준비하지 못했습니다. 페이지를 새로고침해 주세요.',
      completedTypes,
    };
  }

  const supabase = await createServerSupabaseClient();
  for (const type of ACTIVE_CONSENT_TYPES) {
    if (!missingTypes.includes(type)) continue;

    const policy = CONSENT_POLICIES[type];
    if (policy.document.status !== 'configured') {
      return {
        status: 'error',
        message: '필수 동의 문서 설정을 확인하지 못했습니다.',
        completedTypes,
      };
    }

    const { error } = await supabase.rpc('record_my_consent_event', {
      p_consent_type: type,
      p_action: 'accepted',
      p_document_version: policy.document.currentVersion,
      p_source: policy.source,
      p_request_id: requestIds.get(type),
    });

    if (error) {
      console.error('Required consent recording failed', {
        consentType: type,
        code: error.code ?? null,
      });
      const refreshed = await readCurrentAssessment();
      return {
        status: 'error',
        message: '일부 동의를 저장하지 못했습니다. 완료된 항목은 유지되며 다시 시도할 수 있습니다.',
        completedTypes: refreshed ? getCompletedTypes(refreshed.assessment) : completedTypes,
      };
    }
  }

  const refreshed = await readCurrentAssessment();
  if (!refreshed || !refreshed.assessment.canAccess) {
    return {
      status: 'error',
      message: '동의 상태 확인이 완료되지 않았습니다. 다시 시도해 주세요.',
      completedTypes: refreshed ? getCompletedTypes(refreshed.assessment) : completedTypes,
    };
  }

  const destination = await getConsentCompletionDestinationForUser(refreshed.lookup.user.id);
  if (!destination) {
    return {
      status: 'error',
      message: '다음 화면을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      completedTypes: getCompletedTypes(refreshed.assessment),
    };
  }

  redirect(destination);
}
