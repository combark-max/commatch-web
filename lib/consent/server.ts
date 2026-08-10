import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  CONSENT_POLICIES,
  CONSENT_TYPES,
  type ConsentPolicy,
  type ConsentPolicyMap,
  type ConsentType,
} from '@/lib/consent/policy';

export type ConsentAction = 'accepted' | 'withdrawn';

export type LatestConsentEvent = {
  consentType: ConsentType;
  latestAction: ConsentAction;
  documentVersion: string;
  createdAt: string;
};

export type LatestConsentByType = Partial<Record<ConsentType, LatestConsentEvent>>;

export type ConsentSatisfaction =
  | { status: 'satisfied'; satisfied: true }
  | {
      status:
        | 'policy_unconfigured'
        | 'missing'
        | 'type_mismatch'
        | 'withdrawn'
        | 'version_mismatch';
      satisfied: false;
    };

export type ConsentRolloutDecision =
  | { status: 'disabled'; applies: false }
  | { status: 'not_started_for_user'; applies: false }
  | { status: 'applies'; applies: true }
  | {
      status: 'policy_unconfigured' | 'invalid_policy' | 'invalid_user_created_at';
      applies: false;
    };

export type ConsentRequirementAssessment = {
  type: ConsentType;
  required: boolean;
  rollout: ConsentRolloutDecision;
  satisfaction: ConsentSatisfaction;
};

export type ConsentAccessAssessment = {
  canAccess: boolean;
  hasInvalidConfiguration: boolean;
  requirements: ConsentRequirementAssessment[];
  blockingTypes: ConsentType[];
};

export type CurrentConsentLookup =
  | { kind: 'anonymous' }
  | { kind: 'error'; reason: 'auth' | 'rpc' | 'invalid_response' }
  | {
      kind: 'valid';
      user: { id: string; createdAt: string };
      latestByType: LatestConsentByType;
    };

export type ConsentCompletionDestination = '/dashboard' | '/profile/create';

const DOCUMENT_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;
const TIMESTAMP_WITH_TIME_ZONE_PATTERN = (
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/
);

type ParsedTimestamp = {
  epochMilliseconds: number;
  microsecondRemainder: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isConsentType = (value: unknown): value is ConsentType => (
  typeof value === 'string' && (CONSENT_TYPES as readonly string[]).includes(value)
);

const isConsentAction = (value: unknown): value is ConsentAction => (
  value === 'accepted' || value === 'withdrawn'
);

const parseTimestamp = (value: unknown): ParsedTimestamp | null => {
  if (typeof value !== 'string') return null;

  const match = TIMESTAMP_WITH_TIME_ZONE_PATTERN.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, fraction = ''] = match;
  const numericParts = [year, month, day, hour, minute, second].map(Number);
  const [numericYear, numericMonth, numericDay, numericHour, numericMinute, numericSecond] = numericParts;
  const daysInMonth = new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate();
  if (
    numericMonth < 1
    || numericMonth > 12
    || numericDay < 1
    || numericDay > daysInMonth
    || numericHour > 23
    || numericMinute > 59
    || numericSecond > 59
  ) {
    return null;
  }

  const epochMilliseconds = Date.parse(value);
  if (Number.isNaN(epochMilliseconds)) return null;

  const microseconds = fraction.padEnd(6, '0');
  return {
    epochMilliseconds,
    microsecondRemainder: Number(microseconds.slice(3)),
  };
};

const isValidTimestamp = (value: unknown): value is string => parseTimestamp(value) !== null;

const isValidDocumentVersion = (value: unknown): value is string => (
  typeof value === 'string' && DOCUMENT_VERSION_PATTERN.test(value)
);

export function parseConsentStatusRpcResponse(value: unknown): LatestConsentByType | null {
  if (!Array.isArray(value) || value.length > CONSENT_TYPES.length) return null;

  const latestByType: LatestConsentByType = {};

  for (const row of value) {
    if (
      !isRecord(row)
      || !isConsentType(row.consent_type)
      || !isConsentAction(row.latest_action)
      || !isValidDocumentVersion(row.document_version)
      || !isValidTimestamp(row.created_at)
      || latestByType[row.consent_type] !== undefined
    ) {
      return null;
    }

    latestByType[row.consent_type] = {
      consentType: row.consent_type,
      latestAction: row.latest_action,
      documentVersion: row.document_version,
      createdAt: row.created_at,
    };
  }

  return latestByType;
}

export function evaluateCurrentConsent(
  policy: ConsentPolicy,
  event: LatestConsentEvent | undefined,
): ConsentSatisfaction {
  if (
    policy.document.status !== 'configured'
    || !isValidDocumentVersion(policy.document.currentVersion)
  ) {
    return { status: 'policy_unconfigured', satisfied: false };
  }

  if (!event) return { status: 'missing', satisfied: false };
  if (event.consentType !== policy.type) {
    return { status: 'type_mismatch', satisfied: false };
  }
  if (event.latestAction === 'withdrawn') {
    return { status: 'withdrawn', satisfied: false };
  }
  if (event.documentVersion !== policy.document.currentVersion) {
    return { status: 'version_mismatch', satisfied: false };
  }

  return { status: 'satisfied', satisfied: true };
}

export function evaluateConsentRollout(
  policy: ConsentPolicy,
  userCreatedAt: string,
): ConsentRolloutDecision {
  if (policy.enforcement.status === 'unconfigured') {
    return { status: 'policy_unconfigured', applies: false };
  }
  if (policy.enforcement.status === 'disabled') {
    return { status: 'disabled', applies: false };
  }
  const enforcementStart = parseTimestamp(policy.enforcement.startsAt);
  if (!enforcementStart) {
    return { status: 'invalid_policy', applies: false };
  }
  const userCreated = parseTimestamp(userCreatedAt);
  if (!userCreated) {
    return { status: 'invalid_user_created_at', applies: false };
  }

  if (
    userCreated.epochMilliseconds < enforcementStart.epochMilliseconds
    || (
      userCreated.epochMilliseconds === enforcementStart.epochMilliseconds
      && userCreated.microsecondRemainder < enforcementStart.microsecondRemainder
    )
  ) {
    return { status: 'not_started_for_user', applies: false };
  }

  return { status: 'applies', applies: true };
}

export function assessConsentAccess(
  userCreatedAt: string,
  latestByType: LatestConsentByType,
  policies: ConsentPolicyMap = CONSENT_POLICIES,
): ConsentAccessAssessment {
  const requirements = CONSENT_TYPES.map((type): ConsentRequirementAssessment => {
    const policy = policies[type];
    return {
      type,
      required: policy.required,
      rollout: evaluateConsentRollout(policy, userCreatedAt),
      satisfaction: evaluateCurrentConsent(policy, latestByType[type]),
    };
  });
  const hasInvalidConfiguration = requirements.some(({ required, rollout, satisfaction }) => (
    required && (
      rollout.status === 'policy_unconfigured'
      || rollout.status === 'invalid_policy'
      || (rollout.applies && satisfaction.status === 'policy_unconfigured')
    )
  ));
  const hasInvalidUserCreatedAt = requirements.some(({ required, rollout }) => (
    required && rollout.status === 'invalid_user_created_at'
  ));
  const blockingTypes = requirements
    .filter(({ required, rollout, satisfaction }) => (
      required && rollout.applies && !satisfaction.satisfied
    ))
    .map(({ type }) => type);

  return {
    canAccess: (
      !hasInvalidConfiguration
      && !hasInvalidUserCreatedAt
      && blockingTypes.length === 0
    ),
    hasInvalidConfiguration,
    requirements,
    blockingTypes,
  };
}

export function getConsentCompletionDestination(
  hasProfile: boolean,
): ConsentCompletionDestination {
  return hasProfile ? '/dashboard' : '/profile/create';
}

export async function getCurrentConsentStatus(): Promise<CurrentConsentLookup> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) return { kind: 'error', reason: 'auth' };
  if (!user) return { kind: 'anonymous' };
  if (!isValidTimestamp(user.created_at)) {
    return { kind: 'error', reason: 'auth' };
  }

  const { data, error } = await supabase.rpc('get_my_consent_status');
  if (error) return { kind: 'error', reason: 'rpc' };

  const latestByType = parseConsentStatusRpcResponse(data);
  if (!latestByType) return { kind: 'error', reason: 'invalid_response' };

  return {
    kind: 'valid',
    user: { id: user.id, createdAt: user.created_at },
    latestByType,
  };
}
