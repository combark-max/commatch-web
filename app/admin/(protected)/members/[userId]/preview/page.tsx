import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Cigarette,
  Crown,
  GraduationCap,
  Heart,
  Palette,
  Quote,
  Ruler,
  User,
  Wine,
} from 'lucide-react';
import AdminMemberProfileImages from '@/components/admin/AdminMemberProfileImages';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  isAdminMemberUuid,
  parseAdminMemberDetail,
  type AdminMemberDetail,
} from '@/lib/admin/members';
import { normalizeProfileImagePath } from '@/lib/profile-image';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type PreviewError = 'invalid_uuid' | 'not_found' | 'admin_target' | 'forbidden' | 'rpc' | 'parse' | 'unavailable';

const getErrorMessage = (error: PreviewError): string => {
  if (error === 'invalid_uuid') return '올바르지 않은 회원 UUID입니다.';
  if (error === 'not_found') return '회원 정보를 찾을 수 없습니다.';
  if (error === 'admin_target') return '관리자 계정은 일반 회원 화면 미리보기 대상이 아닙니다.';
  if (error === 'forbidden') return '회원 프로필을 미리 볼 권한이 없습니다.';
  if (error === 'parse') return '회원 상세 응답 형식을 확인하지 못했습니다.';
  if (error === 'unavailable') return '현재 공개 상태인 회원 프로필이 없습니다.';
  return '회원 프로필을 불러오지 못했습니다.';
};

function ErrorPanel({ error }: { error: PreviewError }) {
  return (
    <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
        <div>
          <p className="font-semibold">{getErrorMessage(error)}</p>
          <Link href="/admin/members" className="mt-3 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4">
            <ArrowLeft size={16} aria-hidden="true" /> 회원 목록으로 돌아가기
          </Link>
        </div>
      </div>
    </section>
  );
}

const getProfileImageUrl = (storedValue: string): string | null => {
  const path = normalizeProfileImagePath(storedValue.trim());
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !baseUrl) return null;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl}/storage/v1/object/public/profile_images/${encodedPath}`;
};

const getProfileImageUrls = (member: AdminMemberDetail): string[] => {
  const storedValues = [member.profileImage, ...(member.profileImages ?? [])];
  const urls = storedValues.flatMap((value) => {
    if (typeof value !== 'string' || value.trim() === '') return [];
    const url = getProfileImageUrl(value);
    return url ? [url] : [];
  });
  return [...new Set(urls)];
};

const getAge = (birthDate: string | null): number | null => {
  if (!birthDate) return null;
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const todayParts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).formatToParts(new Date());
  const currentPart = (type: Intl.DateTimeFormatPartTypes) => Number(
    todayParts.find((part) => part.type === type)?.value,
  );
  const currentYear = currentPart('year');
  const currentMonth = currentPart('month');
  const currentDay = currentPart('day');
  return currentYear - birthYear - (
    currentMonth < birthMonth || currentMonth === birthMonth && currentDay < birthDay ? 1 : 0
  );
};

const getMarriageHistoryLabel = (value: string | null): string => {
  if (value === 'first_marriage') return '초혼';
  if (value === 'remarriage') return '재혼';
  return '정보 미입력';
};

const getVisibleProfileValue = (value: string | null): string => {
  const normalizedValue = value?.trim() ?? '';
  return normalizedValue && !['미입력', '선택하지 않음', '공개하지 않음'].includes(normalizedValue)
    ? normalizedValue
    : '';
};

function ProfileFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="rounded-xl bg-green-50 p-2 text-green-600">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-400">{label}</p>
        <p className="mt-1 break-words text-sm font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

export default async function AdminMemberPreviewPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdminAccess('member_restrictions_view');
  const { userId } = await params;
  if (!isAdminMemberUuid(userId)) return <ErrorPanel error="invalid_uuid" />;

  const supabase = await createServerSupabaseClient();
  const { data, error: rpcError } = await supabase.rpc('get_admin_member_detail', {
    p_target_user_id: userId,
  });
  if (rpcError) {
    const error: PreviewError = rpcError.code === 'P0002'
      ? 'not_found'
      : rpcError.code === '22023'
        ? 'admin_target'
        : rpcError.code === '42501'
          ? 'forbidden'
          : 'rpc';
    return <ErrorPanel error={error} />;
  }

  const member = parseAdminMemberDetail(data);
  if (!member || member.memberUserId.toLowerCase() !== userId.toLowerCase()) {
    return <ErrorPanel error="parse" />;
  }
  if (!member.profileExists || member.profileVisibility !== 'visible') {
    return <ErrorPanel error="unavailable" />;
  }

  const imageUrls = getProfileImageUrls(member);
  const age = getAge(member.birthDate);
  const introduction = member.introduction?.trim() || '';
  const smoking = getVisibleProfileValue(member.smoking);
  const marriageValues = getVisibleProfileValue(member.marriageValues);

  return (
    <div className="space-y-6">
      <Link href={`/admin/members/${userId}`} className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-gray-900">
        <ArrowLeft size={17} aria-hidden="true" /> 회원 상세로 돌아가기
      </Link>

      <header className="rounded-3xl border border-green-100 bg-green-50 p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-green-700">관리자 읽기 전용 미리보기</p>
        <h1 className="mt-2 text-2xl font-black text-gray-900">일반 회원 화면</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          일반 회원에게 공개되는 프로필 정보만 표시합니다. 이 화면에서는 회원 정보를 변경할 수 없습니다.
        </p>
      </header>

      <article className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
        <section className="p-6 sm:p-8" aria-labelledby="preview-images-heading">
          <h2 id="preview-images-heading" className="text-xl font-bold text-gray-900">프로필 사진</h2>
          <AdminMemberProfileImages imageUrls={imageUrls} memberLabel={member.nickname ?? '회원'} />
        </section>

        <div className="space-y-10 border-t border-gray-100 p-6 sm:p-10 md:p-12">
          <section aria-labelledby="preview-basic-heading">
            <div className="border-b border-gray-100 pb-8">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="preview-basic-heading" className="text-3xl font-black text-gray-900 sm:text-4xl">
                  {member.nickname || '익명'}
                </h2>
                {member.premiumIsAvailable ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
                    <Crown size={14} aria-hidden="true" /> Premium
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-base font-semibold text-green-600 sm:text-lg">
                <span>{age === null ? '나이 정보 미입력' : `만 ${age}세`}</span>
                <span className="h-1 w-1 rounded-full bg-gray-300" />
                <span>{member.region || '지역 정보 미입력'}</span>
                <span className="h-1 w-1 rounded-full bg-gray-300" />
                <span>{member.job || '직업 정보 미입력'}</span>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ProfileFact icon={<User size={18} />} label="성별" value={member.gender || '정보 미입력'} />
              <ProfileFact icon={<Ruler size={18} />} label="키" value={member.height ? `${member.height}cm` : '정보 미입력'} />
              <ProfileFact icon={<GraduationCap size={18} />} label="학력" value={member.education || '정보 미입력'} />
              <ProfileFact icon={<Heart size={18} />} label="결혼 이력" value={getMarriageHistoryLabel(member.marriageHistory)} />
            </div>
          </section>

          <section aria-labelledby="preview-introduction-heading">
            <h2 id="preview-introduction-heading" className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <Quote className="text-green-600" size={22} /> 자기소개
            </h2>
            <div className="mt-4 rounded-[1.75rem] bg-gray-50 p-6 sm:p-8">
              <p className="whitespace-pre-wrap break-words text-base leading-8 text-gray-700">
                {introduction || '아직 자기소개를 작성하지 않았습니다.'}
              </p>
            </div>
          </section>

          <section aria-labelledby="preview-lifestyle-heading">
            <h2 id="preview-lifestyle-heading" className="text-xl font-bold text-gray-900">생활 스타일</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ProfileFact icon={<Palette size={18} />} label="취미" value={member.hobby || '정보 미입력'} />
              <ProfileFact icon={<Wine size={18} />} label="음주 여부" value={member.drinking || '정보 미입력'} />
              <ProfileFact icon={<Cigarette size={18} />} label="흡연 여부" value={smoking || '정보 없음'} />
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-gray-200 bg-gray-50 p-6 sm:p-8" aria-labelledby="preview-marriage-values-heading">
            <h2 id="preview-marriage-values-heading" className="text-xl font-bold text-gray-700">결혼 가치관</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">
              {marriageValues || '등록된 결혼 가치관 정보가 없습니다.'}
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
