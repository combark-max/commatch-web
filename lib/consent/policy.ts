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
      status: 'enabled';
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

const configuredDocument = (currentVersion: string): ConsentDocumentPolicy => ({
  status: 'configured',
  currentVersion,
});

const enabledEnforcement = (): ConsentEnforcementPolicy => ({
  status: 'enabled',
  startsAt: null,
});

export const CONSENT_POLICIES = {
  terms: {
    type: 'terms',
    required: true,
    source: 'email_verification',
    document: configuredDocument('terms-v1.0'),
    enforcement: enabledEnforcement(),
  },
  privacy: {
    type: 'privacy',
    required: true,
    source: 'email_verification',
    document: configuredDocument('privacy-v1.0'),
    enforcement: enabledEnforcement(),
  },
  adult_confirmation: {
    type: 'adult_confirmation',
    required: true,
    source: 'email_verification',
    document: configuredDocument('adult-confirmation-v1.0'),
    enforcement: enabledEnforcement(),
  },
} as const satisfies ConsentPolicyMap;

export const ADULT_CONFIRMATION_PRESENTATION = {
  status: 'configured',
  minimumAge: 19,
  approvedLabel: '[필수] 본인은 만 19세 이상임을 확인합니다.',
} as const satisfies AdultConfirmationPresentationPolicy;
