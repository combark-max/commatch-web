import { AlertCircle } from 'lucide-react';
import AdminMetricCard, { type AdminMetric } from '@/components/admin/dashboard/AdminMetricCard';
import {
  parseAdminMemberStatistics,
  type AdminMemberStatistics,
  type AdminStatisticsEntry,
} from '@/lib/admin/member-statistics';
import { requireAdminAccess } from '@/lib/admin/access';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type DataResult<T> = { kind: 'success'; data: T } | { kind: 'forbidden' | 'error' };

const GENDER_LABELS: Record<string, string> = {
  male: '남성', female: '여성', other_or_unspecified: '미입력/기타',
};
const MEMBERSHIP_TIER_LABELS: Record<string, string> = {
  general: '일반 회원', premium: 'Premium 회원',
};
const AGE_LABELS: Record<string, string> = {
  under_20: '20대 미만', '20s': '20대', '30s': '30대', '40s': '40대',
  '50s': '50대', '60_plus': '60대 이상', unspecified: '미입력',
};
const MARRIAGE_LABELS: Record<string, string> = {
  first_marriage: '초혼', remarriage: '재혼', unspecified: '미입력',
};

type ChartColor = {
  from: string;
  to: string;
};

const MEMBERSHIP_COLORS: ChartColor[] = [
  { from: '#34d399', to: '#047857' },
  { from: '#a78bfa', to: '#6d28d9' },
];
const GENDER_COLORS: ChartColor[] = [
  { from: '#38bdf8', to: '#0369a1' },
  { from: '#fb7185', to: '#be123c' },
  { from: '#94a3b8', to: '#475569' },
];
const MARRIAGE_COLORS: ChartColor[] = [
  { from: '#fbbf24', to: '#b45309' },
  { from: '#c084fc', to: '#7e22ce' },
  { from: '#a8a29e', to: '#57534e' },
];
const BAR_COLORS = [
  'from-emerald-300 via-emerald-500 to-emerald-700 shadow-emerald-200/80',
  'from-sky-300 via-sky-500 to-sky-700 shadow-sky-200/80',
  'from-violet-300 via-violet-500 to-violet-700 shadow-violet-200/80',
  'from-amber-300 via-amber-500 to-amber-700 shadow-amber-200/80',
  'from-rose-300 via-rose-500 to-rose-700 shadow-rose-200/80',
  'from-cyan-300 via-cyan-500 to-cyan-700 shadow-cyan-200/80',
];

const errorKind = (error: { code?: string } | null): 'forbidden' | 'error' => (
  error?.code === '42501' ? 'forbidden' : 'error'
);

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

function DonutChart({
  title,
  description,
  entries,
  total,
  labels,
  colors,
  chartId,
}: {
  title: string;
  description: string;
  entries: AdminStatisticsEntry[];
  total: number;
  labels?: Record<string, string>;
  colors: ChartColor[];
  chartId: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-black text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <div className="mt-6 grid items-center gap-6 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div className="mx-auto aspect-square w-full max-w-[220px]">
          <svg
            viewBox="0 0 120 120"
            role="img"
            aria-labelledby={`${chartId}-title ${chartId}-description`}
            className="h-full w-full overflow-visible"
          >
            <title id={`${chartId}-title`}>{title}</title>
            <desc id={`${chartId}-description`}>{description} 전체 회원 {total.toLocaleString('ko-KR')}명</desc>
            <defs>
              <filter id={`${chartId}-shadow`} x="-25%" y="-25%" width="150%" height="150%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#0f172a" floodOpacity="0.18" />
              </filter>
              {entries.map((entry, index) => {
                const color = colors[index % colors.length];
                return (
                  <linearGradient key={entry.category} id={`${chartId}-gradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={color.from} />
                    <stop offset="100%" stopColor={color.to} />
                  </linearGradient>
                );
              })}
            </defs>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#e5e7eb" strokeWidth="18" filter={`url(#${chartId}-shadow)`} />
            {entries.map((entry, index) => {
              const percentage = total === 0 ? 0 : entry.count / total * 100;
              const precedingCount = entries
                .slice(0, index)
                .reduce((sum, precedingEntry) => sum + precedingEntry.count, 0);
              const dashOffset = total === 0 ? 0 : -(precedingCount / total * 100);
              const label = labels?.[entry.category] ?? entry.category;
              return percentage > 0 ? (
                <circle
                  key={entry.category}
                  cx="60"
                  cy="60"
                  r="44"
                  fill="none"
                  stroke={`url(#${chartId}-gradient-${index})`}
                  strokeWidth="18"
                  pathLength="100"
                  strokeDasharray={`${percentage} ${100 - percentage}`}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 60 60)"
                  className="transition duration-200 hover:opacity-80"
                >
                  <title>{`${label}: ${entry.count.toLocaleString('ko-KR')}명 (${percentage.toFixed(1)}%)`}</title>
                </circle>
              ) : null;
            })}
            <circle cx="60" cy="60" r="32" fill="#ffffff" opacity="0.98" />
            <text x="60" y="56" textAnchor="middle" className="fill-gray-500 text-[7px] font-semibold">전체 회원</text>
            <text x="60" y="68" textAnchor="middle" className="fill-gray-900 text-[12px] font-black tabular-nums">
              {total.toLocaleString('ko-KR')}명
            </text>
          </svg>
        </div>
        <ul className="space-y-3">
          {entries.map((entry, index) => {
            const percentage = total === 0 ? 0 : entry.count / total * 100;
            const label = labels?.[entry.category] ?? entry.category;
            const color = colors[index % colors.length];
            return (
              <li key={entry.category} className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 transition hover:border-gray-200 hover:bg-white hover:shadow-sm">
                <div className="flex items-center gap-3">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full shadow-sm"
                    style={{ backgroundImage: `linear-gradient(135deg, ${color.from}, ${color.to})` }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold text-gray-700">{label}</span>
                  <span className="shrink-0 text-right text-sm font-black tabular-nums text-gray-900">
                    {entry.count.toLocaleString('ko-KR')}명
                    <span className="ml-2 font-semibold text-gray-500">{percentage.toFixed(1)}%</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function BarDistributionChart({
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
  const highestCount = entries.reduce((highest, entry) => Math.max(highest, entry.count), 0);

  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <h2 className="text-xl font-black text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <ul className="mt-6 space-y-2">
        {entries.map((entry, index) => {
          const percentage = total === 0 ? 0 : entry.count / total * 100;
          const label = labels?.[entry.category] ?? entry.category;
          const isHighest = highestCount > 0 && entry.count === highestCount;
          return (
            <li key={entry.category} className="group rounded-xl px-3 py-3 transition hover:bg-gray-50 sm:px-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                <span className="min-w-0 break-words font-semibold text-gray-700 transition group-hover:text-gray-950">
                  {label}
                  {isHighest ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">최다</span> : null}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-gray-900">
                  {entry.count.toLocaleString('ko-KR')}명
                  <span className="ml-2 font-medium text-gray-500">{percentage.toFixed(1)}%</span>
                </span>
              </div>
              <div className="mt-2.5 h-3 overflow-hidden rounded-full bg-gray-100 shadow-inner" aria-hidden="true">
                <div
                  className={`h-full rounded-full bg-gradient-to-b shadow-sm transition-[width,filter] duration-300 group-hover:brightness-105 ${BAR_COLORS[index % BAR_COLORS.length]}`}
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
  const memberResult = await loadMemberStatistics();

  const memberSummaryCards: AdminMetric[] = memberResult.kind === 'success' ? [
    {
      label: '전체 회원',
      count: memberResult.data.totalMembers,
      countHref: '/admin/members',
      countAriaLabel: `전체 회원 ${memberResult.data.totalMembers.toLocaleString('ko-KR')}명 목록 보기`,
    },
    { label: '일반 회원', count: memberResult.data.membershipTiers.find((entry) => entry.category === 'general')!.count },
    {
      label: 'Premium 회원',
      count: memberResult.data.membershipTiers.find((entry) => entry.category === 'premium')!.count,
      countHref: '/admin/premium?status=available',
      countAriaLabel: `현재 이용 가능한 Premium 회원 ${memberResult.data.membershipTiers.find((entry) => entry.category === 'premium')!.count.toLocaleString('ko-KR')}명 목록 보기`,
    },
    { label: '남성', count: memberResult.data.gender.find((entry) => entry.category === 'male')!.count },
    { label: '여성', count: memberResult.data.gender.find((entry) => entry.category === 'female')!.count },
  ] : [];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-bold text-green-700">관리자 통계</p>
        <h1 className="mt-2 text-3xl font-black text-gray-900">회원 통계</h1>
        <p className="mt-3 text-gray-600">회원 현황과 주요 분포를 한눈에 확인하는 관리자 전용 통계 화면입니다.</p>
      </header>

      <section aria-labelledby="member-summary-heading" className="space-y-4">
        <div>
          <h2 id="member-summary-heading" className="text-xl font-black text-gray-900">회원 현황</h2>
          <p className="mt-1 text-sm text-gray-500">관리자 계정을 제외한 Auth 회원을 기준으로 하며, 프로필 미생성·숨김·정지 회원도 포함합니다.</p>
        </div>
        {memberResult.kind === 'success' ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {memberSummaryCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}
            </div>
            {memberResult.data.totalMembers === 0 ? (
              <p className="rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center text-sm font-semibold text-gray-500">집계할 회원이 없습니다.</p>
            ) : null}
            <div className="grid gap-5 lg:grid-cols-2">
              <DonutChart title="회원 등급 분포" description="현재 시각에 실제 이용 가능한 Premium 멤버십을 기준으로 구분합니다." entries={memberResult.data.membershipTiers} total={memberResult.data.totalMembers} labels={MEMBERSHIP_TIER_LABELS} colors={MEMBERSHIP_COLORS} chartId="membership-tier-chart" />
              <DonutChart title="성별 분포" description="남성과 여성을 구분합니다." entries={memberResult.data.gender.filter((entry) => entry.category === 'male' || entry.category === 'female')} total={memberResult.data.totalMembers} labels={GENDER_LABELS} colors={GENDER_COLORS} chartId="gender-chart" />
              <BarDistributionChart title="연령대별 분포" description="오늘 날짜의 만 나이를 생년월일로 계산합니다." entries={memberResult.data.ageGroups} total={memberResult.data.totalMembers} labels={AGE_LABELS} />
              <DonutChart title="초혼/재혼 분포" description="프로필의 결혼 이력 계약에 따라 초혼·재혼을 구분합니다." entries={memberResult.data.marriageHistory} total={memberResult.data.totalMembers} labels={MARRIAGE_LABELS} colors={MARRIAGE_COLORS} chartId="marriage-history-chart" />
              <BarDistributionChart title="지역별 분포" description="저장된 지역 전체를 회원 수 내림차순으로 표시합니다." entries={memberResult.data.regions} total={memberResult.data.totalMembers} className="lg:col-span-2" />
            </div>
          </>
        ) : (
          <ErrorBox message={memberResult.kind === 'forbidden' ? '회원 통계 조회 권한이 없습니다.' : '회원 통계를 불러오지 못했습니다.'} />
        )}
      </section>
    </div>
  );
}
