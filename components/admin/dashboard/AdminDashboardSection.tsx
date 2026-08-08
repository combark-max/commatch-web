import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

type AdminDashboardSectionProps = {
  headingId: string;
  title: string;
  description: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: ReactNode;
};

export default function AdminDashboardSection({
  headingId,
  title,
  description,
  viewAllHref,
  viewAllLabel,
  children,
}: AdminDashboardSectionProps) {
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id={headingId} className="text-xl font-black text-gray-900">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
        </div>
        {viewAllHref && viewAllLabel ? (
          <Link
            href={viewAllHref}
            aria-label={viewAllLabel}
            className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-bold text-green-700 underline-offset-4 hover:text-green-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
          >
            {viewAllLabel}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}
