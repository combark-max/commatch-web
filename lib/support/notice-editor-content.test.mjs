import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const noticeContent = await import('./notice-content.ts');
const projectRoot = resolve(import.meta.dirname, '../..');

const loadModule = (relativePath, requireOverrides) => {
  const filename = resolve(projectRoot, relativePath);
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
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
};

const adapter = loadModule('lib/support/notice-editor-content.ts', {
  '@/lib/support/notice-content': noticeContent,
});

const {
  editorDocumentToNoticeBody,
  noticeBodyToEditorDocument,
} = adapter;

const text = (value, marks) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});

const paragraph = (...content) => ({
  type: 'paragraph',
  ...(content.length > 0 ? { content } : {}),
});

const doc = (...content) => ({ type: 'doc', content });
const normalize = (value) => JSON.parse(JSON.stringify(value));

test('plain notice bodies become paragraph-based visual editor documents', () => {
  assert.equal(typeof noticeBodyToEditorDocument, 'function');
  assert.deepEqual(normalize(noticeBodyToEditorDocument('첫째 줄\n\n셋째 줄')), {
    sourceFormat: 'plain',
    valid: true,
    document: doc(
      paragraph(text('첫째 줄')),
      paragraph(),
      paragraph(text('셋째 줄')),
    ),
  });
});

test('rich notice bodies become visual text marks without exposing storage tokens', () => {
  const body = 'commatch-rich-v1\n[b][font=serif][size=xl][color=brand]중요 📌[/color][/size][/font][/b]';

  assert.deepEqual(normalize(noticeBodyToEditorDocument(body)), {
    sourceFormat: 'rich',
    valid: true,
    document: doc(paragraph(text('중요 📌', [
      { type: 'bold' },
      { type: 'noticeFont', attrs: { value: 'serif' } },
      { type: 'noticeSize', attrs: { value: 'xl' } },
      { type: 'noticeColor', attrs: { value: 'brand' } },
    ]))),
  });
});

test('unformatted editor documents serialize back to legacy plain text', () => {
  assert.equal(typeof editorDocumentToNoticeBody, 'function');
  assert.deepEqual(normalize(editorDocumentToNoticeBody(doc(
    paragraph(text('첫째 줄')),
    paragraph(),
    paragraph(text('셋째 줄 📢')),
  ))), {
    ok: true,
    body: '첫째 줄\n\n셋째 줄 📢',
    format: 'plain',
  });
});

test('editor marks serialize in canonical bold, font, size, color order', () => {
  const marksInNonCanonicalOrder = [
    { type: 'noticeColor', attrs: { value: 'red' } },
    { type: 'noticeSize', attrs: { value: 'lg' } },
    { type: 'bold' },
    { type: 'noticeFont', attrs: { value: 'sans' } },
  ];

  assert.deepEqual(normalize(editorDocumentToNoticeBody(doc(
    paragraph(text('중요', marksInNonCanonicalOrder)),
  ))), {
    ok: true,
    body: 'commatch-rich-v1\n[b][font=sans][size=lg][color=red]중요[/color][/size][/font][/b]',
    format: 'rich',
  });
});

test('all approved font, size, and color values round-trip through the adapter', () => {
  const fonts = ['default', 'sans', 'serif'];
  const sizes = ['sm', 'md', 'lg', 'xl'];
  const colors = ['default', 'dark', 'brand', 'red', 'blue', 'orange', 'green'];
  const content = [
    ...fonts.map((value) => text(value, [{ type: 'noticeFont', attrs: { value } }])),
    ...sizes.map((value) => text(value, [{ type: 'noticeSize', attrs: { value } }])),
    ...colors.map((value) => text(value, [{ type: 'noticeColor', attrs: { value } }])),
    text('❤️👍🏽'),
  ];
  const encoded = editorDocumentToNoticeBody(doc(paragraph(...content)));

  assert.equal(encoded.ok, true);
  assert.equal(encoded.format, 'rich');
  const decoded = noticeBodyToEditorDocument(encoded.body);
  assert.equal(decoded.valid, true);
  assert.equal(decoded.sourceFormat, 'rich');
  assert.equal(
    decoded.document.content[0].content.map((node) => node.text).join(''),
    `${fonts.join('')}${sizes.join('')}${colors.join('')}❤️👍🏽`,
  );
});

test('paragraphs and hard breaks preserve existing newline behavior', () => {
  assert.deepEqual(normalize(editorDocumentToNoticeBody(doc(
    paragraph(text('첫째'), { type: 'hardBreak' }, text('둘째')),
    paragraph(text('셋째')),
  ))), {
    ok: true,
    body: '첫째\n둘째\n셋째',
    format: 'plain',
  });
});

test('invalid mark values and unknown marks are rejected', () => {
  const invalidMarks = [
    { type: 'noticeFont', attrs: { value: 'display' } },
    { type: 'noticeSize', attrs: { value: 'huge' } },
    { type: 'noticeColor', attrs: { value: '#00ff00' } },
    { type: 'link', attrs: { href: 'javascript:alert(1)' } },
  ];

  for (const mark of invalidMarks) {
    assert.deepEqual(normalize(editorDocumentToNoticeBody(doc(
      paragraph(text('거부', [mark])),
    ))), { ok: false });
  }
});

test('arbitrary node and mark attributes are rejected', () => {
  const payloads = [
    { type: 'doc', attrs: { style: 'color:red' }, content: [paragraph(text('거부'))] },
    { type: 'doc', content: [{ type: 'paragraph', attrs: { class: 'hidden' }, content: [text('거부')] }] },
    doc(paragraph({ type: 'text', text: '거부', style: 'color:red' })),
    doc(paragraph(text('거부', [{ type: 'bold', attrs: { onclick: 'alert(1)' } }]))),
    doc({ type: 'heading', content: [text('거부')] }),
    doc(paragraph({ type: 'image', attrs: { src: 'javascript:alert(1)' } })),
  ];

  for (const payload of payloads) {
    assert.deepEqual(normalize(editorDocumentToNoticeBody(payload)), { ok: false });
  }
});

test('invalid rich storage payloads remain fail-closed plain editor text', () => {
  const body = 'commatch-rich-v1\n[color=purple]거부[/color]';
  const decoded = noticeBodyToEditorDocument(body);

  assert.equal(decoded.sourceFormat, 'plain');
  assert.equal(decoded.valid, false);
  assert.equal(
    decoded.document.content.map((node) => node.content?.map((child) => child.text).join('') ?? '').join('\n'),
    body,
  );
});
