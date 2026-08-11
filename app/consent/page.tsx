import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CircleAlert } from 'lucide-react';
import ConsentForm from './ConsentForm';
import {
  ADULT_CONFIRMATION_PRESENTATION,
  CONSENT_POLICIES,
  type ActiveConsentType,
} from '@/lib/consent/policy';
import {
  assessConsentAccess,
  getConsentCompletionDestinationForUser,
  getCurrentConsentStatus,
} from '@/lib/consent/server';
import { getCurrentMemberAccess } from '@/lib/member/access';

export const metadata: Metadata = {
  title: '필수 동의 | ComMatch',
};

const ConsentUnavailable = () => (
  <div className="bg-gray-50 px-4 py-16 sm:px-6">
    <section className="mx-auto max-w-xl rounded-3xl border border-amber-100 bg-white p-8 text-center shadow-xl shadow-gray-200/50">
      <CircleAlert className="mx-auto h-12 w-12 text-amber-600" aria-hidden="true" />
      <h1 className="mt-5 text-2xl font-black text-gray-900">동의 상태를 확인하지 못했습니다</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        잠시 후 페이지를 새로고침해 주세요. 문제가 계속되면 다시 로그인해 주세요.
      </p>
    </section>
  </div>
);

export default async function ConsentPage() {
  const memberLookup = await getCurrentMemberAccess();
  if (memberLookup.kind === 'anonymous') redirect('/login');
  if (memberLookup.kind === 'error' || !memberLookup.access.isAllowed) {
    redirect('/account-suspended');
  }

  const consentLookup = await getCurrentConsentStatus();
  if (consentLookup.kind === 'anonymous') redirect('/login');
  if (consentLookup.kind === 'error') return <ConsentUnavailable />;

  const assessment = assessConsentAccess(
    consentLookup.user.createdAt,
    consentLookup.latestByType,
  );
  if (assessment.hasInvalidConfiguration) return <ConsentUnavailable />;

  if (assessment.canAccess) {
    const destination = await getConsentCompletionDestinationForUser(consentLookup.user.id);
    if (!destination) return <ConsentUnavailable />;
    redirect(destination);
  }

  const completedTypes = assessment.requirements
    .filter(({ satisfaction }) => satisfaction.satisfied)
    .map(({ type }) => type);

  const documentVersions = Object.fromEntries(
    assessment.requirements.map(({ type }) => {
      const document = CONSENT_POLICIES[type].document;
      return [type, document.status === 'configured' ? document.currentVersion : ''];
    }),
  ) as Record<ActiveConsentType, string>;

  return (
    <ConsentForm
      completedTypes={completedTypes}
      documentVersions={documentVersions}
      adultConfirmationLabel={ADULT_CONFIRMATION_PRESENTATION.approvedLabel}
    />
  );
}
