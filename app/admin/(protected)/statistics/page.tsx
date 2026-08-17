import { AlertCircle } from 'lucide-react';
import AdminMetricCard, { type AdminMetric } from '@/components/admin/dashboard/AdminMetricCard';
import {
  parseAdminMemberStatistics,
  type AdminMemberStatistics,
  type AdminStatisticsEntry,
} from '@/lib/admin/member-statistics';
import {
  parseAdminServiceStatistics,
  type AdminServiceStatistics,
} from '@/lib/admin/service-statistics';
import { requireAdminAccess } from '@/lib/admin/access';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type DataResult<T> = { kind: 'success'; data: T } | { kind: 'forbidden' | 'error' };

const GENDER_LABELS: Record<string, string> = {
  male: '남성', female: '여성', other_or_unspecified: '미입력/기타',
};
const AGE_LABELS: Record<string, string> = {
  under_20: '20대 미만', '20s': '20대', '30s': '30대', '40s': '40대',
  '50s': '50대', '60_plus': '60대 이상', unspecified: '미입력',
};
const MARRIAGE_LABELS: Record<string, string> = {
  first_marriage: '초혼', remarriage: '재혼', unspecified: '미입력',
};

const errorKind = (error: { code?: string } | null): 'forbidden' | 'error' => (
  error?.code === '42501' ? 'forbidden' : 'error'
);

async function loadServiceStatistics(): Promise<DataResult<AdminServiceStatistics>> {
  try {
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc('get_admin_service_statistics');
    if (error) return { kind: errorKind(error) };
    return { kind: 'success', data: parseAdminServiceStatistics(data) };
  } catch {
    return { kind: 'error' };
  }
}

async function loadMemberStatistics(): Promise<DataResult<AdminMemberStatistics>> {
  try {
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc('get_admin_member_statistics');
    if (error) return { kind: errorKind(error) };
    return { kind: 'success', data: parseAdminMemberStatistics(data) };
  } catch {
    return { kind: 'error' };
  }
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-red-800">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
        <p className="font-semibold">{message}</p>
      </div>
    </div>
  );
}

function DistributionChart({
  title,
  description,
  entries,
  total,
  labels,
  className = '',
}: {
  title: string;
  description: string;
  entries: AdminStatisticsEntry[];
  total: number;
  labels?: Record<string, string>;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 ${className}`}>
      <h2 className="text-xl font-black text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <ul className="mt-6 space-y-5">
        {entries.map((entry) => {
          const percentage = total === 0 ? 0 : entry.count / total * 100;
          const label = labels?.[entry.category] ?? entry.category;
          return (
            <li key={entry.category}>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0 break-words font-semibold text-gray-700">{label}</span>
                <span className="shrink-0 font-bold tabular-nums text-gray-900">
                  {entry.count.toLocaleString('ko-KR')}명
                  <span className="ml-2 font-medium text-gray-500">{percentage.toFixed(1)}%</span>
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-green-600"
                  style={{ width: `${Math.min(100, percentage)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function AdminStatisticsPage() {
  await requireAdminAccess('admin_dashboard_view');
  const [serviceResult, memberResult] = await Promise.all([
    loadServiceStatistics(),
    loadMemberStatistics(),
  ]);

  const serviceCards: (AdminMetric & { id: string })[] = serviceResult.kind === 'success' ? [
    { id: 'matches', label: '전체 매칭', count: serviceResult.data.totalMatchCount },
    { id: 'active-matches', label: '진행 중 매칭', count: serviceResult.data.activeMatchCount },
    { id: 'ended-matches', label: '종료 매칭', count: serviceResult.data.endedMatchCount },
    { id: 'messages', label: '전체 메시지', count: serviceResult.data.totalMessageCount },
    { id: 'members', label: '최근 7일 신규 회원', count: serviceResult.data.newMemberLast7DaysCount },
    { id: 'reports', label: '최근 7일 신고', count: serviceResult.data.reportLast7DaysCount },
  ] : [];

  const memberSummaryCards: AdminMetric[] = memberResult.kind === 'success' ? [
    { label: '전체 회원', count: memberResult.data.totalMembers },
    { label: '남성', count: memberResult.data.gender.find((entry) => entry.category === 'male')!.count },
    { label: '여성', count: memberResult.data.gender.find((entry) => entry.category === 'female')!.count },
    { label: '성별 미입력/기타', count: memberResult.data.gender.find((entry) => entry.category === 'other_or_unspecified')!.count },
  ] : [];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-bold text-green-700">관리자 통계</p>
        <h1 className="mt-2 text-3xl font-black text-gray-900">서비스 통계</h1>
        <p className="mt-3 text-gray-600">서비스와 회원 현황을 한눈에 확인하는 관리자 전용 통계 화면입니다.</p>
      </header>

      <section aria-labelledby="service-summary-heading" className="space-y-4">
        <div>
          <h2 id="service-summary-heading" className="text-xl font-black text-gray-900">서비스 요약</h2>
          <p className="mt-1 text-sm text-gray-500">현재 보관 중인 매칭·메시지와 최근 7일 집계입니다.</p>
        </div>
        {serviceResult.kind === 'success' ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {serviceCards.map(({ id, ...card }) => (
              <div key={id} id={id} className="scroll-mt-28"><AdminMetricCard {...card} /></div>
            ))}
          </div>
        ) : (
          <ErrorBox message={serviceResult.kind === 'forbidden' ? '서비스 통계 조회 권한이 없습니다.' : '서비스 통계를 불러오지 못했습니다.'} />
        )}
      </section>

      <section aria-labelledby="member-summary-heading" className="space-y-4">
        <div>
          <h2 id="member-summary-heading" className="text-xl font-black text-gray-900">회원 현황</h2>
          <p className="mt-1 text-sm text-gray-500">관리자 계정을 제외한 Auth 회원을 기준으로 하며, 프로필 미생성·숨김·정지 회원도 포함합니다.</p>
        </div>
        {memberResult.kind === 'success' ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {memberSummaryCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}
            </div>
            {memberResult.data.totalMembers === 0 ? (
              <p className="rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center text-sm font-semibold text-gray-500">집계할 회원이 없습니다.</p>
            ) : null}
            <div className="grid gap-5 lg:grid-cols-2">
              <DistributionChart title="성별 분포" description="남성·여성과 미입력 또는 기타 값을 구분합니다." entries={memberResult.data.gender} total={memberResult.data.totalMembers} labels={GENDER_LABELS} />
              <DistributionChart title="연령대별 분포" description="오늘 날짜의 만 나이를 생년월일로 계산합니다." entries={memberResult.data.ageGroups} total={memberResult.data.totalMembers} labels={AGE_LABELS} />
              <DistributionChart title="초혼/재혼 분포" description="프로필의 결혼 이력 계약에 따라 초혼·재혼을 구분합니다." entries={memberResult.data.marriageHistory} total={memberResult.data.totalMembers} labels={MARRIAGE_LABELS} />
              <DistributionChart title="지역별 분포" description="저장된 지역 전체를 회원 수 내림차순으로 표시합니다." entries={memberResult.data.regions} total={memberResult.data.totalMembers} className="lg:col-span-2" />
            </div>
          </>
        ) : (
          <ErrorBox message={memberResult.kind === 'forbidden' ? '회원 통계 조회 권한이 없습니다.' : '회원 통계를 불러오지 못했습니다.'} />
        )}
      </section>
    </div>
  );
}
