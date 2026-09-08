export const NOTICE_RICH_PREFIX = 'commatch-rich-v1\n';
export const NOTICE_BODY_MAX_LENGTH = 10000;
export const NOTICE_MAX_NESTING_DEPTH = 12;

export const NOTICE_FONTS = ['default', 'sans', 'serif'] as const;
export const NOTICE_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
export const NOTICE_COLORS = ['default', 'dark', 'brand', 'red', 'blue', 'orange', 'green'] as const;

export type NoticeFont = (typeof NOTICE_FONTS)[number];
export type NoticeSize = (typeof NOTICE_SIZES)[number];
export type NoticeColor = (typeof NOTICE_COLORS)[number];

export type NoticeContentNode =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: NoticeContentNode[] }
  | { type: 'font'; value: NoticeFont; children: NoticeContentNode[] }
  | { type: 'size'; value: NoticeSize; children: NoticeContentNode[] }
  | { type: 'color'; value: NoticeColor; children: NoticeContentNode[] };

export type ParsedNoticeBody =
  | { format: 'plain'; text: string; valid: boolean }
  | { format: 'rich'; nodes: NoticeContentNode[]; valid: true };

type ContainerNode = Exclude<NoticeContentNode, { type: 'text' }>;

export type NoticeFormatCommand =
  | { type: 'bold' }
  | { type: 'font'; value: NoticeFont }
  | { type: 'size'; value: NoticeSize }
  | { type: 'color'; value: NoticeColor };

export type NoticeSelectionState = {
  source: string;
  isRich: boolean;
  selectionStart: number;
  selectionEnd: number;
};

const RICH_VERSION_PATTERN = /^commatch-rich-[^\r\n]*\r?\n/;
const RESERVED_CHARACTERS = new Set(['\\', '[', ']']);

const isAllowedValue = <T extends string>(values: readonly T[], value: string): value is T => (
  values.includes(value as T)
);

const appendText = (nodes: NoticeContentNode[], text: string) => {
  if (!text) return;
  const previous = nodes.at(-1);
  if (previous?.type === 'text') {
    previous.text += text;
    return;
  }
  nodes.push({ type: 'text', text });
};

const getContainer = (token: string): ContainerNode | null => {
  if (token === 'b') return { type: 'bold', children: [] };

  const separatorIndex = token.indexOf('=');
  if (separatorIndex < 1) return null;
  const name = token.slice(0, separatorIndex);
  const value = token.slice(separatorIndex + 1);

  if (name === 'font' && isAllowedValue(NOTICE_FONTS, value)) {
    return { type: 'font', value, children: [] };
  }
  if (name === 'size' && isAllowedValue(NOTICE_SIZES, value)) {
    return { type: 'size', value, children: [] };
  }
  if (name === 'color' && isAllowedValue(NOTICE_COLORS, value)) {
    return { type: 'color', value, children: [] };
  }
  return null;
};

const getClosingName = (node: ContainerNode): string => (
  node.type === 'bold' ? 'b' : node.type
);

const parseRichSource = (source: string): NoticeContentNode[] | null => {
  const root: NoticeContentNode[] = [];
  const stack: Array<{ node: ContainerNode; parent: NoticeContentNode[] }> = [];
  let current = root;
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (character === '\\') {
      const escaped = source[index + 1];
      if (!escaped || !RESERVED_CHARACTERS.has(escaped)) return null;
      appendText(current, escaped);
      index += 2;
      continue;
    }

    if (character === ']') return null;

    if (character !== '[') {
      const nextReservedIndex = source.slice(index).search(/[\\[\]]/);
      const end = nextReservedIndex < 0 ? source.length : index + nextReservedIndex;
      appendText(current, source.slice(index, end));
      index = end;
      continue;
    }

    const closeBracketIndex = source.indexOf(']', index + 1);
    if (closeBracketIndex < 0) return null;
    const token = source.slice(index + 1, closeBracketIndex);

    if (token.startsWith('/')) {
      const closingName = token.slice(1);
      const active = stack.at(-1);
      if (!active || getClosingName(active.node) !== closingName) return null;
      stack.pop();
      current = active.parent;
      index = closeBracketIndex + 1;
      continue;
    }

    const container = getContainer(token);
    if (!container || stack.length >= NOTICE_MAX_NESTING_DEPTH) return null;
    current.push(container);
    stack.push({ node: container, parent: current });
    current = container.children;
    index = closeBracketIndex + 1;
  }

  return stack.length === 0 ? root : null;
};

export const escapeNoticeText = (text: string): string => (
  text.replace(/[\\[\]]/g, (character) => `\\${character}`)
);

const serializeNodes = (nodes: NoticeContentNode[]): string => nodes.map((node) => {
  if (node.type === 'text') return escapeNoticeText(node.text);

  const children = serializeNodes(node.children);
  if (node.type === 'bold') return `[b]${children}[/b]`;
  return `[${node.type}=${node.value}]${children}[/${node.type}]`;
}).join('');

export const serializeRichNotice = (nodes: NoticeContentNode[]): string => (
  `${NOTICE_RICH_PREFIX}${serializeNodes(nodes)}`
);

export const createRichNoticeBody = (source: string): string => `${NOTICE_RICH_PREFIX}${source}`;

export const parseNoticeBody = (body: string): ParsedNoticeBody => {
  if (!body.startsWith(NOTICE_RICH_PREFIX)) {
    return {
      format: 'plain',
      text: body,
      valid: !RICH_VERSION_PATTERN.test(body),
    };
  }

  const source = body.slice(NOTICE_RICH_PREFIX.length);
  const nodes = parseRichSource(source);
  if (!nodes || serializeNodes(nodes) !== source) {
    return { format: 'plain', text: body, valid: false };
  }
  return { format: 'rich', nodes, valid: true };
};

const getVisibleText = (nodes: NoticeContentNode[]): string => nodes.map((node) => (
  node.type === 'text' ? node.text : getVisibleText(node.children)
)).join('');

export const validateNoticeBody = (body: string): { ok: true; body: string } | { ok: false } => {
  if (body.length < 1 || body.length > NOTICE_BODY_MAX_LENGTH) return { ok: false };

  const parsed = parseNoticeBody(body);
  if (!parsed.valid) return { ok: false };
  if (parsed.format === 'plain') {
    return parsed.text.trim().length > 0 ? { ok: true, body } : { ok: false };
  }

  if (getVisibleText(parsed.nodes).trim().length < 1) return { ok: false };
  const canonicalBody = serializeRichNotice(parsed.nodes);
  return canonicalBody === body ? { ok: true, body: canonicalBody } : { ok: false };
};

export const getNoticeEditorState = (body: string): { source: string; isRich: boolean } => {
  const parsed = parseNoticeBody(body);
  if (parsed.format !== 'rich') return { source: body, isRich: false };
  return {
    source: body.slice(NOTICE_RICH_PREFIX.length),
    isRich: true,
  };
};

const getFormatTokens = (command: NoticeFormatCommand): { open: string; close: string } => {
  if (command.type === 'bold') return { open: '[b]', close: '[/b]' };
  return {
    open: `[${command.type}=${command.value}]`,
    close: `[/${command.type}]`,
  };
};

export const applyNoticeFormatting = (
  state: NoticeSelectionState,
  command: NoticeFormatCommand,
): NoticeSelectionState => {
  const start = Math.min(state.selectionStart, state.selectionEnd);
  const end = Math.max(state.selectionStart, state.selectionEnd);
  const before = state.source.slice(0, start);
  const selected = state.source.slice(start, end);
  const after = state.source.slice(end);
  const safeBefore = state.isRich ? before : escapeNoticeText(before);
  const safeSelected = state.isRich ? selected : escapeNoticeText(selected);
  const safeAfter = state.isRich ? after : escapeNoticeText(after);
  const { open, close } = getFormatTokens(command);
  const selectionStart = safeBefore.length + open.length;

  return {
    source: `${safeBefore}${open}${safeSelected}${close}${safeAfter}`,
    isRich: true,
    selectionStart,
    selectionEnd: selectionStart + safeSelected.length,
  };
};

export const insertNoticeEmoji = (
  state: NoticeSelectionState,
  emoji: string,
): NoticeSelectionState => {
  const insertAt = Math.max(state.selectionStart, state.selectionEnd);
  const nextCursor = insertAt + emoji.length;
  return {
    source: `${state.source.slice(0, insertAt)}${emoji}${state.source.slice(insertAt)}`,
    isRich: state.isRich,
    selectionStart: nextCursor,
    selectionEnd: nextCursor,
  };
};
