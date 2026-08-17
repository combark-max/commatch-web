export default function AdminStatisticsLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="서비스 통계를 불러오는 중">
      <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl bg-gray-200" />
        <div className="h-80 animate-pulse rounded-2xl bg-gray-200" />
      </div>
      <div className="h-96 animate-pulse rounded-2xl bg-gray-200" />
    </div>
  );
}
