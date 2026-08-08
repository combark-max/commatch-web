import Link from 'next/link';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';

type QueryValue = string | string[] | undefined;

const buildPageItems = (currentPage: number, totalPages: number): Array<number | 'ellipsis'> => {
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const values = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items: Array<number | 'ellipsis'> = [];
  values.forEach((page, index) => {
    if (index > 0 && page - values[index - 1] > 1) items.push('ellipsis');
    items.push(page);
  });
  return items;
};

export default function AdminPagination({
  pathname,
  pageParam,
  currentPage,
  totalPages,
  searchParams = {},
  ariaLabel,
}: {
  pathname: string;
  pageParam: string;
  currentPage: number;
  totalPages: number;
  searchParams?: Record<string, QueryValue>;
  ariaLabel: string;
}) {
  const normalizedTotal = Math.max(1, totalPages);
  const normalizedCurrent = Math.min(Math.max(1, currentPage), normalizedTotal);
  const hrefFor = (page: number) => {
    const query = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (key === pageParam || value === undefined) return;
      if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
      else query.set(key, value);
    });
    if (page > 1) query.set(pageParam, String(page));
    const value = query.toString();
    return value ? `${pathname}?${value}` : pathname;
  };
  const linkClass = 'inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-gray-300 bg-white px-2 text-sm font-bold text-gray-700 transition hover:border-green-300 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2';
  const disabledClass = 'inline-flex h-9 min-w-9 cursor-not-allowed items-center justify-center rounded-full border border-gray-200 bg-gray-100 px-2 text-gray-400';
  const edgeLink = (page: number, label: string, icon: React.ReactNode, disabled: boolean) => disabled ? (
    <span aria-disabled="true" aria-label={label} className={disabledClass}>{icon}</span>
  ) : (
    <Link href={hrefFor(page)} aria-label={label} className={linkClass}>{icon}</Link>
  );

  return (
    <nav aria-label={ariaLabel} className="flex max-w-full flex-wrap items-center justify-center gap-1.5">
      {edgeLink(1, '첫 페이지로 이동', <ChevronFirst size={17} aria-hidden="true" />, normalizedCurrent === 1)}
      {edgeLink(normalizedCurrent - 1, '이전 페이지로 이동', <ChevronLeft size={17} aria-hidden="true" />, normalizedCurrent === 1)}
      {buildPageItems(normalizedCurrent, normalizedTotal).map((item, index) => item === 'ellipsis' ? (
        <span key={`ellipsis-${index}`} aria-hidden="true" className="inline-flex h-9 min-w-5 items-center justify-center text-sm font-bold text-gray-400">…</span>
      ) : item === normalizedCurrent ? (
        <span key={item} aria-current="page" aria-label={`현재 ${item}페이지`} className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-green-600 px-2 text-sm font-black text-white">{item}</span>
      ) : (
        <Link key={item} href={hrefFor(item)} aria-label={`${item}페이지로 이동`} className={linkClass}>{item}</Link>
      ))}
      {edgeLink(normalizedCurrent + 1, '다음 페이지로 이동', <ChevronRight size={17} aria-hidden="true" />, normalizedCurrent === normalizedTotal)}
      {edgeLink(normalizedTotal, '마지막 페이지로 이동', <ChevronLast size={17} aria-hidden="true" />, normalizedCurrent === normalizedTotal)}
    </nav>
  );
}
