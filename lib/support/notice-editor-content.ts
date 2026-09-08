import {
  NOTICE_COLORS,
  NOTICE_FONTS,
  NOTICE_SIZES,
  parseNoticeBody,
  serializeRichNotice,
  validateNoticeBody,
  type NoticeColor,
  type NoticeContentNode,
  type NoticeFont,
  type NoticeSize,
} from '@/lib/support/notice-content';

export type NoticeEditorMark = {
  type: 'bold' | 'noticeFont' | 'noticeSize' | 'noticeColor';
  attrs?: { value: NoticeFont | NoticeSize | NoticeColor };
};

export type NoticeEditorNode = {
  type: 'doc' | 'paragraph' | 'text' | 'hardBreak';
  content?: NoticeEditorNode[];
  marks?: NoticeEditorMark[];
  text?: string;
};

export type NoticeEditorDocument = NoticeEditorNode & { type: 'doc' };

type ActiveMarks = {
  bold?: true;
  font?: NoticeFont;
  size?: NoticeSize;
  color?: NoticeColor;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]): boolean => (
  Object.keys(value).every((key) => keys.includes(key))
);

const isAllowedValue = <T extends string>(values: readonly T[], value: unknown): value is T => (
  typeof value === 'string' && values.includes(value as T)
);

const marksToEditorMarks = (marks: ActiveMarks): NoticeEditorMark[] => {
  const editorMarks: NoticeEditorMark[] = [];
  if (marks.bold) editorMarks.push({ type: 'bold' });
  if (marks.font) editorMarks.push({ type: 'noticeFont', attrs: { value: marks.font } });
  if (marks.size) editorMarks.push({ type: 'noticeSize', attrs: { value: marks.size } });
  if (marks.color) editorMarks.push({ type: 'noticeColor', attrs: { value: marks.color } });
  return editorMarks;
};

const appendEditorText = (line: NoticeEditorNode[], text: string, marks: ActiveMarks) => {
  if (!text) return;
  const editorMarks = marksToEditorMarks(marks);
  line.push({
    type: 'text',
    text,
    ...(editorMarks.length > 0 ? { marks: editorMarks } : {}),
  });
};

const appendAstToLines = (
  nodes: NoticeContentNode[],
  lines: NoticeEditorNode[][],
  marks: ActiveMarks,
) => {
  for (const node of nodes) {
    if (node.type === 'text') {
      const parts = node.text.split('\n');
      parts.forEach((part, index) => {
        appendEditorText(lines.at(-1)!, part, marks);
        if (index < parts.length - 1) lines.push([]);
      });
      continue;
    }

    if (node.type === 'bold') {
      appendAstToLines(node.children, lines, { ...marks, bold: true });
    } else if (node.type === 'font') {
      appendAstToLines(node.children, lines, { ...marks, font: node.value });
    } else if (node.type === 'size') {
      appendAstToLines(node.children, lines, { ...marks, size: node.value });
    } else {
      appendAstToLines(node.children, lines, { ...marks, color: node.value });
    }
  }
};

const plainTextToDocument = (text: string): NoticeEditorDocument => ({
  type: 'doc',
  content: text.split('\n').map((line) => ({
    type: 'paragraph',
    ...(line ? { content: [{ type: 'text', text: line }] } : {}),
  })),
});

export const noticeBodyToEditorDocument = (body: string): {
  sourceFormat: 'plain' | 'rich';
  valid: boolean;
  document: NoticeEditorDocument;
} => {
  const parsed = parseNoticeBody(body);
  if (parsed.format === 'plain') {
    return {
      sourceFormat: 'plain',
      valid: parsed.valid,
      document: plainTextToDocument(parsed.text),
    };
  }

  const lines: NoticeEditorNode[][] = [[]];
  appendAstToLines(parsed.nodes, lines, {});
  return {
    sourceFormat: 'rich',
    valid: true,
    document: {
      type: 'doc',
      content: lines.map((content) => ({
        type: 'paragraph',
        ...(content.length > 0 ? { content } : {}),
      })),
    },
  };
};

const parseEditorMark = (value: unknown): { key: keyof ActiveMarks; value: true | NoticeFont | NoticeSize | NoticeColor } | null => {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  if (value.type === 'bold') {
    return hasOnlyKeys(value, ['type']) ? { key: 'bold', value: true } : null;
  }
  if (!hasOnlyKeys(value, ['type', 'attrs']) || !isRecord(value.attrs) || !hasOnlyKeys(value.attrs, ['value'])) {
    return null;
  }
  const markValue = value.attrs.value;
  if (value.type === 'noticeFont' && isAllowedValue(NOTICE_FONTS, markValue)) {
    return { key: 'font', value: markValue };
  }
  if (value.type === 'noticeSize' && isAllowedValue(NOTICE_SIZES, markValue)) {
    return { key: 'size', value: markValue };
  }
  if (value.type === 'noticeColor' && isAllowedValue(NOTICE_COLORS, markValue)) {
    return { key: 'color', value: markValue };
  }
  return null;
};

const wrapTextNode = (text: string, marks: ActiveMarks): NoticeContentNode => {
  let node: NoticeContentNode = { type: 'text', text };
  if (marks.color) node = { type: 'color', value: marks.color, children: [node] };
  if (marks.size) node = { type: 'size', value: marks.size, children: [node] };
  if (marks.font) node = { type: 'font', value: marks.font, children: [node] };
  if (marks.bold) node = { type: 'bold', children: [node] };
  return node;
};

const parseTextNode = (value: unknown): { node: NoticeContentNode; text: string; formatted: boolean } | null => {
  if (!isRecord(value) || value.type !== 'text' || !hasOnlyKeys(value, ['type', 'text', 'marks'])) return null;
  if (typeof value.text !== 'string' || value.text.length < 1) return null;
  if (value.marks !== undefined && !Array.isArray(value.marks)) return null;

  const activeMarks: ActiveMarks = {};
  for (const mark of value.marks ?? []) {
    const parsedMark = parseEditorMark(mark);
    if (!parsedMark || activeMarks[parsedMark.key] !== undefined) return null;
    if (parsedMark.key === 'bold') activeMarks.bold = true;
    if (parsedMark.key === 'font') activeMarks.font = parsedMark.value as NoticeFont;
    if (parsedMark.key === 'size') activeMarks.size = parsedMark.value as NoticeSize;
    if (parsedMark.key === 'color') activeMarks.color = parsedMark.value as NoticeColor;
  }

  return {
    node: wrapTextNode(value.text, activeMarks),
    text: value.text,
    formatted: Object.keys(activeMarks).length > 0,
  };
};

export const editorDocumentToNoticeBody = (value: unknown):
  | { ok: true; body: string; format: 'plain' | 'rich' }
  | { ok: false } => {
  if (!isRecord(value) || value.type !== 'doc' || !hasOnlyKeys(value, ['type', 'content'])) return { ok: false };
  if (!Array.isArray(value.content) || value.content.length < 1) return { ok: false };

  const ast: NoticeContentNode[] = [];
  const plainParts: string[] = [];
  let hasFormatting = false;

  for (const [paragraphIndex, paragraph] of value.content.entries()) {
    if (!isRecord(paragraph) || paragraph.type !== 'paragraph' || !hasOnlyKeys(paragraph, ['type', 'content'])) {
      return { ok: false };
    }
    if (paragraph.content !== undefined && !Array.isArray(paragraph.content)) return { ok: false };
    if (paragraphIndex > 0) {
      ast.push({ type: 'text', text: '\n' });
      plainParts.push('\n');
    }

    for (const child of paragraph.content ?? []) {
      if (isRecord(child) && child.type === 'hardBreak') {
        if (!hasOnlyKeys(child, ['type'])) return { ok: false };
        ast.push({ type: 'text', text: '\n' });
        plainParts.push('\n');
        continue;
      }

      const parsedText = parseTextNode(child);
      if (!parsedText) return { ok: false };
      ast.push(parsedText.node);
      plainParts.push(parsedText.text);
      hasFormatting ||= parsedText.formatted;
    }
  }

  const body = hasFormatting ? serializeRichNotice(ast) : plainParts.join('');
  const validation = validateNoticeBody(body);
  if (!validation.ok) return { ok: false };
  return {
    ok: true,
    body: validation.body,
    format: hasFormatting ? 'rich' : 'plain',
  };
};
