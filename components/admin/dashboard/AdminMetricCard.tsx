import Link from 'next/link';

export type AdminMetric = {
  label: string;
  count: string | number;
  href?: string;
  ariaLabel?: string;
  countHref?: string;
  countAriaLabel?: string;
};

export default function AdminMetricCard({
  label,
  count,
  href,
  ariaLabel,
  countHref,
  countAriaLabel,
}: AdminMetric) {
  const content = (
    <>
      <p className="text-sm font-semibold text-gray-600">{label}</p>
      {countHref && !href ? (
        <Link
          href={countHref}
          aria-label={countAriaLabel}
          className="mt-2 inline-flex rounded-md text-2xl font-black text-green-700 underline decoration-green-200 decoration-2 underline-offset-4 transition hover:text-green-800 hover:decoration-green-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        >
          {count}
        </Link>
      ) : (
        <p className="mt-2 text-2xl font-black text-gray-900">{count}</p>
      )}
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
