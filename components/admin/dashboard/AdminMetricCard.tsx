import Link from 'next/link';

export type AdminMetric = {
  label: string;
  count: string | number;
  href?: string;
  ariaLabel?: string;
};

export default function AdminMetricCard({
  label,
  count,
  href,
  ariaLabel,
}: AdminMetric) {
  const content = (
    <>
      <p className="text-sm font-semibold text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-black text-gray-900">{count}</p>
    </>
  );
  const className = 'min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-4';

  return href ? (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`${className} transition-colors hover:border-green-300 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2`}
    >
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}
