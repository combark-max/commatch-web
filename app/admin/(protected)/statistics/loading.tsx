export default function AdminStatisticsLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="회원 통계를 불러오는 중">
      <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl bg-gray-200" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-96 animate-pulse rounded-2xl bg-gray-200" />
        ))}
        <div className="h-96 animate-pulse rounded-2xl bg-gray-200 lg:col-span-2" />
      </div>
    </div>
  );
}
