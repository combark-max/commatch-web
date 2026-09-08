import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

const noticeContent = await import('./notice-content.ts').catch(() => ({}));

const {
  NOTICE_RICH_PREFIX,
  applyNoticeFormatting,
  escapeNoticeText,
  getNoticeEditorState,
  insertNoticeEmoji,
  parseNoticeBody,
  serializeRichNotice,
  validateNoticeBody,
} = noticeContent;

const projectRoot = resolve(import.meta.dirname, '../..');

const loadTsxModule = (relativePath, requireOverrides) => {
  try {
    const filename = resolve(projectRoot, relativePath);
    const source = readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;
    const loadedModule = { exports: {} };
    const context = vm.createContext({
      console,
      exports: loadedModule.exports,
      module: loadedModule,
      require: (specifier) => {
        if (specifier in requireOverrides) return requireOverrides[specifier];
        throw new Error(`Unexpected require: ${specifier}`);
      },
    });
    const wrapper = new vm.Script(`(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`, {
      filename,
    }).runInContext(context);
    wrapper(loadedModule.exports, context.require, loadedModule, filename, dirname(filename));
    return loadedModule.exports;
  } catch {
    return {};
  }
};

const flattenElements = (value, elements = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => flattenElements(item, elements));
    return elements;
  }
  if (!value || typeof value !== 'object') return elements;
  if ('type' in value && 'props' in value) {
    if (typeof value.type === 'function') {
      flattenElements(value.type(value.props), elements);
      return elements;
    }
    elements.push(value);
    flattenElements(value.props.children, elements);
  }
  return elements;
};

const collectText = (value) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join('');
  if (!value || typeof value !== 'object') return '';
  return collectText(value.props?.children);
};

test('plain notices remain plain text with their line breaks intact', () => {
  assert.equal(typeof parseNoticeBody, 'function');
  assert.deepEqual(parseNoticeBody('첫째 줄\n둘째 줄'), {
    format: 'plain',
    text: '첫째 줄\n둘째 줄',
    valid: true,
  });
});

test('rich notices round-trip bold, all fonts, all sizes, colors, emoji, and nesting', () => {
  assert.equal(typeof parseNoticeBody, 'function');
  assert.equal(typeof serializeRichNotice, 'function');
  assert.equal(NOTICE_RICH_PREFIX, 'commatch-rich-v1\n');

  const source = [
    '[b]굵게[/b]',
    '[font=default]기본[/font][font=sans]고딕[/font][font=serif]명조[/font]',
    '[size=sm]14[/size][size=md]16[/size][size=lg]20[/size][size=xl]24[/size]',
    '[color=default]기본[/color][color=dark]진한 회색[/color]',
    '[color=brand]포인트[/color][color=red]빨강[/color][color=blue]파랑[/color]',
    '[color=orange]주황[/color][color=green]초록[/color]',
    '[b][font=serif][size=lg][color=brand]중첩 📢 ❤️ 👍🏽[/color][/size][/font][/b]',
  ].join('\n');
  const body = `${NOTICE_RICH_PREFIX}${source}`;
  const parsed = parseNoticeBody(body);

  assert.equal(parsed.format, 'rich');
  assert.equal(parsed.valid, true);
  assert.equal(serializeRichNotice(parsed.nodes), body);
  assert.deepEqual(validateNoticeBody(body), { ok: true, body });
});

test('CRLF rich transport input parses all formatting and validates to canonical LF', () => {
  const source = '[b][font=serif][size=lg][color=red]테스트[/color][/size][/font][/b]';
  const crlfBody = `commatch-rich-v1\r\n${source}`;
  const canonicalBody = `commatch-rich-v1\n${source}`;
  const parsed = parseNoticeBody(crlfBody);

  assert.equal(parsed.format, 'rich');
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.nodes, [{
    type: 'bold',
    children: [{
      type: 'font',
      value: 'serif',
      children: [{
        type: 'size',
        value: 'lg',
        children: [{
          type: 'color',
          value: 'red',
          children: [{ type: 'text', text: '테스트' }],
        }],
      }],
    }],
  }]);
  assert.equal(serializeRichNotice(parsed.nodes), canonicalBody);
  assert.deepEqual(validateNoticeBody(crlfBody), { ok: true, body: canonicalBody });
});

test('rich text escapes reserved markup characters canonically', () => {
  assert.equal(typeof escapeNoticeText, 'function');
  assert.equal(escapeNoticeText(String.raw`안내 [필독] \ 확인`), String.raw`안내 \[필독\] \\ 확인`);

  const body = `${NOTICE_RICH_PREFIX}[b]${escapeNoticeText('[중요]')}[/b]`;
  const parsed = parseNoticeBody(body);
  assert.equal(parsed.format, 'rich');
  assert.equal(parsed.nodes[0].children[0].text, '[중요]');
  assert.equal(serializeRichNotice(parsed.nodes), body);
});

test('invalid rich payloads fail closed as plain text and are rejected for saving', () => {
  assert.equal(typeof parseNoticeBody, 'function');
  assert.equal(typeof validateNoticeBody, 'function');

  const invalidPayloads = [
    `${NOTICE_RICH_PREFIX}[b]닫힘 오류[/font]`,
    `${NOTICE_RICH_PREFIX}[unknown]알 수 없음[/unknown]`,
    `${NOTICE_RICH_PREFIX}[font=display]허용되지 않은 글꼴[/font]`,
    `${NOTICE_RICH_PREFIX}[size=huge]허용되지 않은 크기[/size]`,
    `${NOTICE_RICH_PREFIX}[color=#00ff00]허용되지 않은 색[/color]`,
    `commatch-rich-v2\n[b]지원하지 않는 버전[/b]`,
    `commatch-rich-v2\r\n[b]지원하지 않는 CRLF 버전[/b]`,
    `commatch-rich-vl\r\n[b]오타난 버전[/b]`,
    `commatch-rich-v1[b]줄바꿈 없는 prefix[/b]`,
    `commatch-rich-v1\r[b]CR-only prefix[/b]`,
  ];

  for (const body of invalidPayloads) {
    assert.deepEqual(parseNoticeBody(body), {
      format: 'plain',
      text: body,
      valid: false,
    });
    assert.deepEqual(validateNoticeBody(body), { ok: false });
  }
});

test('excessive nesting and non-canonical rich payloads are rejected', () => {
  const tooDeep = `${NOTICE_RICH_PREFIX}${'[b]'.repeat(13)}깊음${'[/b]'.repeat(13)}`;
  const unescapedBracket = `${NOTICE_RICH_PREFIX}[b]안내 [필독][/b]`;

  assert.deepEqual(validateNoticeBody(tooDeep), { ok: false });
  assert.deepEqual(validateNoticeBody(unescapedBracket), { ok: false });
});

test('body validation preserves the existing 10,000 character limit', () => {
  assert.deepEqual(validateNoticeBody('가'.repeat(10000)), {
    ok: true,
    body: '가'.repeat(10000),
  });
  assert.deepEqual(validateNoticeBody('가'.repeat(10001)), { ok: false });
  assert.deepEqual(validateNoticeBody(''), { ok: false });
  assert.deepEqual(validateNoticeBody('   '), { ok: false });
});

test('HTML-like and executable-looking strings remain text nodes', () => {
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'onclick="alert(1)"',
    'javascript:alert(1)',
    'style="position:fixed"',
    'class="hidden"',
  ];

  for (const payload of payloads) {
    const body = `${NOTICE_RICH_PREFIX}[b]${payload}[/b]`;
    const parsed = parseNoticeBody(body);
    assert.equal(parsed.format, 'rich');
    assert.equal(parsed.nodes[0].children[0].text, payload);
    assert.equal(serializeRichNotice(parsed.nodes), body);
  }
});

test('NoticeBody renders plain text with the existing line-break behavior', () => {
  const noticeBodyModule = loadTsxModule('components/notices/NoticeBody.tsx', {
    'react/jsx-runtime': jsxRuntime,
    '@/lib/support/notice-content': noticeContent,
  });
  assert.equal(typeof noticeBodyModule.default, 'function');

  const tree = noticeBodyModule.default({ body: '첫째 줄\n둘째 줄' });
  assert.equal(tree.type, 'div');
  assert.match(tree.props.className, /whitespace-pre-wrap/);
  assert.equal(collectText(tree), '첫째 줄\n둘째 줄');
});

test('NoticeBody maps rich tokens only to approved React elements and fixed classes', () => {
  const noticeBodyModule = loadTsxModule('components/notices/NoticeBody.tsx', {
    'react/jsx-runtime': jsxRuntime,
    '@/lib/support/notice-content': noticeContent,
  });
  assert.equal(typeof noticeBodyModule.default, 'function');

  const body = `${NOTICE_RICH_PREFIX}[b]굵게[/b]`
    + '[font=default]기본[/font][font=sans]고딕[/font][font=serif]명조[/font]'
    + '[size=sm]14[/size][size=md]16[/size][size=lg]20[/size][size=xl]24[/size]'
    + '[color=default]기본[/color][color=dark]진한 회색[/color][color=brand]포인트[/color]'
    + '[color=red]빨강[/color][color=blue]파랑[/color][color=orange]주황[/color][color=green]초록[/color]';
  const tree = noticeBodyModule.default({ body });
  const elements = flattenElements(tree);

  assert.ok(elements.every(({ type }) => ['div', 'strong', 'span'].includes(type)));
  assert.ok(elements.some(({ props }) => props.className === 'font-[Arial,Helvetica,sans-serif]'));
  assert.ok(elements.some(({ props }) => props.className === 'font-sans'));
  assert.ok(elements.some(({ props }) => props.className === 'font-serif'));
  assert.ok(elements.some(({ props }) => props.className === 'text-sm'));
  assert.ok(elements.some(({ props }) => props.className === 'text-base'));
  assert.ok(elements.some(({ props }) => props.className === 'text-xl'));
  assert.ok(elements.some(({ props }) => props.className === 'text-2xl'));
  assert.ok(elements.some(({ props }) => props.className === 'text-inherit'));
  assert.ok(elements.some(({ props }) => props.className === 'text-gray-800'));
  assert.ok(elements.some(({ props }) => props.className === 'text-green-600'));
  assert.ok(elements.some(({ props }) => props.className === 'text-red-600'));
  assert.ok(elements.some(({ props }) => props.className === 'text-blue-600'));
  assert.ok(elements.some(({ props }) => props.className === 'text-orange-600'));
  assert.ok(elements.some(({ props }) => props.className === 'text-emerald-700'));
});

test('NoticeBody fail-closes invalid markup and never creates attacker-controlled elements', () => {
  const noticeBodyModule = loadTsxModule('components/notices/NoticeBody.tsx', {
    'react/jsx-runtime': jsxRuntime,
    '@/lib/support/notice-content': noticeContent,
  });
  assert.equal(typeof noticeBodyModule.default, 'function');

  const body = `${NOTICE_RICH_PREFIX}[script]<img onerror=alert(1)>[/script]`;
  const tree = noticeBodyModule.default({ body });
  const elements = flattenElements(tree);

  assert.deepEqual(elements.map(({ type }) => type), ['div']);
  assert.equal(collectText(tree), body);
  assert.equal('dangerouslySetInnerHTML' in tree.props, false);

  const validButHostileBody = `${NOTICE_RICH_PREFIX}[b]<script>alert(1)</script><img onerror=alert(1)>[/b]`;
  const validTree = noticeBodyModule.default({ body: validButHostileBody });
  const validElements = flattenElements(validTree);
  assert.deepEqual(validElements.map(({ type }) => type), ['div', 'strong']);
  assert.equal(collectText(validTree), '<script>alert(1)</script><img onerror=alert(1)>');
});

test('formatting wraps a selected plain-text range and switches it to rich mode', () => {
  assert.equal(typeof applyNoticeFormatting, 'function');
  assert.deepEqual(applyNoticeFormatting({
    source: '공지 [필독] 안내',
    isRich: false,
    selectionStart: 3,
    selectionEnd: 7,
  }, { type: 'bold' }), {
    source: String.raw`공지 [b]\[필독\][/b] 안내`,
    isRich: true,
    selectionStart: 6,
    selectionEnd: 12,
  });
});

test('formatting an empty selection places the cursor between matching tokens', () => {
  assert.deepEqual(applyNoticeFormatting({
    source: '공지',
    isRich: false,
    selectionStart: 2,
    selectionEnd: 2,
  }, { type: 'color', value: 'red' }), {
    source: '공지[color=red][/color]',
    isRich: true,
    selectionStart: 13,
    selectionEnd: 13,
  });
});

test('emoji insertion preserves a selected range and does not force rich format', () => {
  assert.equal(typeof insertNoticeEmoji, 'function');
  assert.deepEqual(insertNoticeEmoji({
    source: '중요 안내',
    isRich: false,
    selectionStart: 0,
    selectionEnd: 2,
  }, '📢'), {
    source: '중요📢 안내',
    isRich: false,
    selectionStart: 4,
    selectionEnd: 4,
  });
});

test('editing state keeps legacy plain notices plain unless formatting is applied', () => {
  assert.equal(typeof getNoticeEditorState, 'function');
  assert.deepEqual(getNoticeEditorState('기존 공지\n본문'), {
    source: '기존 공지\n본문',
    isRich: false,
  });
  assert.deepEqual(getNoticeEditorState(`${NOTICE_RICH_PREFIX}[b]새 공지[/b]`), {
    source: '[b]새 공지[/b]',
    isRich: true,
  });
});

test('editing state removes the complete CRLF rich prefix', () => {
  assert.deepEqual(getNoticeEditorState('commatch-rich-v1\r\n[b]CRLF 공지[/b]'), {
    source: '[b]CRLF 공지[/b]',
    isRich: true,
  });
});

test('admin notice actions reject invalid rich markup before calling the existing RPC', async () => {
  let rpcCalled = false;
  const actions = loadTsxModule('app/admin/(protected)/notices/actions.ts', {
    'next/cache': { revalidatePath: () => {} },
    'next/navigation': {
      redirect: (path) => {
        throw new Error(`REDIRECT:${path}`);
      },
    },
    '@/lib/admin/access': { requireAdminAccess: async () => {} },
    '@/lib/support/notice-content': noticeContent,
    '@/lib/support/notices': {
      isNoticeStatus: () => true,
      isUuid: () => true,
      parseNoticeMutationResult: () => '00000000-0000-4000-8000-000000000000',
    },
    '@/lib/supabase/server': {
      createServerSupabaseClient: async () => ({
        rpc: async () => {
          rpcCalled = true;
          return { data: [], error: null };
        },
      }),
    },
  });
  assert.equal(typeof actions.createAdminNoticeAction, 'function');

  const formData = new FormData();
  formData.set('title', '공지 제목');
  formData.set('body', `${NOTICE_RICH_PREFIX}[color=purple]위조 본문[/color]`);

  await assert.rejects(
    actions.createAdminNoticeAction(formData),
    /REDIRECT:\/admin\/notices\/new\?error=validation/,
  );
  assert.equal(rpcCalled, false);
});

test('admin notice update keeps plain bodies plain and passes canonical rich bodies unchanged', async () => {
  const noticeId = '00000000-0000-4000-8000-000000000000';
  const submittedBodies = [];
  const actions = loadTsxModule('app/admin/(protected)/notices/actions.ts', {
    'next/cache': { revalidatePath: () => {} },
    'next/navigation': {
      redirect: (path) => {
        throw new Error(`REDIRECT:${path}`);
      },
    },
    '@/lib/admin/access': { requireAdminAccess: async () => {} },
    '@/lib/support/notice-content': noticeContent,
    '@/lib/support/notices': {
      isNoticeStatus: () => true,
      isUuid: () => true,
      parseNoticeMutationResult: () => noticeId,
    },
    '@/lib/supabase/server': {
      createServerSupabaseClient: async () => ({
        rpc: async (_name, params) => {
          submittedBodies.push(params.p_body);
          return { data: [{ notice_id: noticeId }], error: null };
        },
      }),
    },
  });

  const bodies = [
    '기존 plain 공지\n둘째 줄',
    `${NOTICE_RICH_PREFIX}[b]rich 공지[/b]`,
  ];
  for (const body of bodies) {
    const formData = new FormData();
    formData.set('noticeId', noticeId);
    formData.set('expectedUpdatedAt', '2026-09-08T00:00:00.000Z');
    formData.set('title', '공지 제목');
    formData.set('body', body);
    await assert.rejects(
      actions.updateAdminNoticeAction(formData),
      new RegExp(`REDIRECT:/admin/notices/${noticeId}\\?result=updated`),
    );
  }

  assert.deepEqual(submittedBodies, bodies);
});

test('admin formatting editor exposes only a visual editing surface while keeping storage markup hidden', () => {
  const fakeEditor = {
    chain: () => ({
      focus() { return this; },
      insertContent() { return this; },
      setMark() { return this; },
      toggleBold() { return this; },
      unsetMark() { return this; },
      run() { return true; },
    }),
    getJSON: () => ({ type: 'doc', content: [{ type: 'paragraph' }] }),
    isActive: () => false,
    state: { selection: { to: 1 } },
  };
  const react = {
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
  };
  const editorModule = loadTsxModule('components/admin/NoticeFormattingEditor.tsx', {
    react,
    'react/jsx-runtime': jsxRuntime,
    '@tiptap/core': { Mark: { create: (config) => config } },
    '@tiptap/extension-bold': { __esModule: true, default: {} },
    '@tiptap/extension-document': { __esModule: true, default: {} },
    '@tiptap/extension-hard-break': { __esModule: true, default: {} },
    '@tiptap/extension-paragraph': { __esModule: true, default: {} },
    '@tiptap/extension-text': { __esModule: true, default: {} },
    '@tiptap/extensions': { UndoRedo: {} },
    '@tiptap/pm/model': { Fragment: {}, Slice: {} },
    '@tiptap/react': {
      EditorContent: () => jsxRuntime.jsx('div', { role: 'textbox' }),
      useEditor: () => fakeEditor,
    },
    '@/components/notices/NoticeBody': ({ body }) => jsxRuntime.jsx('div', { children: body }),
    '@/lib/support/notice-content': noticeContent,
    '@/lib/support/notice-editor-content': {
      editorDocumentToNoticeBody: () => ({ ok: true, body: '기존 본문', format: 'plain' }),
      noticeBodyToEditorDocument: () => ({
        sourceFormat: 'rich',
        valid: true,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
      }),
    },
  });
  assert.equal(typeof editorModule.default, 'function');

  const tree = editorModule.default({ initialBody: `${NOTICE_RICH_PREFIX}[b]중요[/b]` });
  const elements = flattenElements(tree);

  assert.equal(elements.some(({ type }) => type === 'textarea'), false);
  assert.ok(elements.some(({ type, props }) => type === 'div' && props.role === 'textbox'));
  assert.ok(elements.some(({ type, props }) => type === 'input' && props.type === 'hidden' && props.name === 'body'));
});
