import type { ReactNode } from 'react';
import {
  parseNoticeBody,
  type NoticeColor,
  type NoticeContentNode,
  type NoticeFont,
  type NoticeSize,
} from '@/lib/support/notice-content';

const FONT_CLASS_NAMES: Record<NoticeFont, string> = {
  default: 'font-[Arial,Helvetica,sans-serif]',
  sans: 'font-sans',
  serif: 'font-serif',
};

const SIZE_CLASS_NAMES: Record<NoticeSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-2xl',
};

const COLOR_CLASS_NAMES: Record<NoticeColor, string> = {
  default: 'text-inherit',
  dark: 'text-gray-800',
  brand: 'text-green-600',
  red: 'text-red-600',
  blue: 'text-blue-600',
  orange: 'text-orange-600',
  green: 'text-emerald-700',
};

const renderNodes = (nodes: NoticeContentNode[], path = 'notice'): ReactNode[] => nodes.map((node, index) => {
  const key = `${path}-${index}`;
  if (node.type === 'text') return node.text;

  const children = renderNodes(node.children, key);
  if (node.type === 'bold') return <strong key={key}>{children}</strong>;
  if (node.type === 'font') return <span key={key} className={FONT_CLASS_NAMES[node.value]}>{children}</span>;
  if (node.type === 'size') return <span key={key} className={SIZE_CLASS_NAMES[node.value]}>{children}</span>;
  return <span key={key} className={COLOR_CLASS_NAMES[node.value]}>{children}</span>;
});

export default function NoticeBody({
  body,
  className = '',
}: {
  body: string;
  className?: string;
}) {
  const parsed = parseNoticeBody(body);
  const content = parsed.format === 'rich' ? renderNodes(parsed.nodes) : parsed.text;

  return (
    <div className={`whitespace-pre-wrap break-words ${className}`.trim()}>
      {content}
    </div>
  );
}
