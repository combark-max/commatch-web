import 'server-only';

export const CONSENT_EVENT_TYPES = [
  'terms',
  'privacy',
  'adult_confirmation',
  'sensitive_profile',
] as const;

export type ConsentEventType = (typeof CONSENT_EVENT_TYPES)[number];

export const ACTIVE_CONSENT_TYPES = [
  'terms',
  'privacy',
  'adult_confirmation',
] as const satisfies readonly ConsentEventType[];

export type ActiveConsentType = (typeof ACTIVE_CONSENT_TYPES)[number];

export type ConsentSource =
  | 'email_verification'
  | 'profile_create'
  | 'profile_edit'
  | 'settings';

export type ConsentDocumentPolicy =
  | {
      status: 'unconfigured';
      currentVersion: null;
    }
  | {
      status: 'configured';
      currentVersion: string;
    };

export type ConsentEnforcementPolicy =
  | {
      status: 'unconfigured';
      startsAt: null;
    }
  | {
      status: 'disabled';
      startsAt: null;
    }
  | {
      status: 'scheduled';
      startsAt: string;
    };

export type ConsentPolicy = {
  type: ActiveConsentType;
  required: boolean;
  source: ConsentSource;
  document: ConsentDocumentPolicy;
  enforcement: ConsentEnforcementPolicy;
};

export type ConsentPolicyMap = {
  readonly [Type in ActiveConsentType]: ConsentPolicy & { type: Type };
};

export type AdultConfirmationPresentationPolicy =
  | {
      status: 'unconfigured';
      minimumAge: null;
      approvedLabel: null;
    }
  | {
      status: 'configured';
      minimumAge: number;
      approvedLabel: string;
    };

const unconfiguredDocument = (): ConsentDocumentPolicy => ({
  status: 'unconfigured',
  currentVersion: null,
});

const disabledEnforcement = (): ConsentEnforcementPolicy => ({
  status: 'disabled',
  startsAt: null,
});

// Legal documents, versions, and rollout dates have not been approved yet.
// Keeping both layers explicit prevents this foundation from enabling a gate.
export const CONSENT_POLICIES = {
  terms: {
    type: 'terms',
    required: true,
    source: 'email_verification',
    document: unconfiguredDocument(),
    enforcement: disabledEnforcement(),
  },
  privacy: {
    type: 'privacy',
    required: true,
    source: 'email_verification',
    document: unconfiguredDocument(),
    enforcement: disabledEnforcement(),
  },
  adult_confirmation: {
    type: 'adult_confirmation',
    required: true,
    source: 'email_verification',
    document: unconfiguredDocument(),
    enforcement: disabledEnforcement(),
  },
} as const satisfies ConsentPolicyMap;

// The existing signup copy is not an approved policy value. A minimum age and
// its display text must be configured together before adult consent is enabled.
export const ADULT_CONFIRMATION_PRESENTATION = {
  status: 'unconfigured',
  minimumAge: null,
  approvedLabel: null,
} as const satisfies AdultConfirmationPresentationPolicy;
