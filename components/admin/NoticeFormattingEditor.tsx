'use client';

import { Mark, type Editor } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import { Fragment, Slice } from '@tiptap/pm/model';
import { EditorContent, useEditor } from '@tiptap/react';
import { useState } from 'react';
import NoticeBody from '@/components/notices/NoticeBody';
import {
  type NoticeColor,
  type NoticeFont,
  type NoticeSize,
} from '@/lib/support/notice-content';
import {
  editorDocumentToNoticeBody,
  noticeBodyToEditorDocument,
} from '@/lib/support/notice-editor-content';

const FONT_OPTIONS: Array<{ value: NoticeFont; label: string }> = [
  { value: 'default', label: '기본' },
  { value: 'sans', label: '고딕' },
  { value: 'serif', label: '명조' },
];

const SIZE_OPTIONS: Array<{ value: NoticeSize; label: string }> = [
  { value: 'sm', label: '14px' },
  { value: 'md', label: '16px' },
  { value: 'lg', label: '20px' },
  { value: 'xl', label: '24px' },
];

const COLOR_OPTIONS: Array<{ value: NoticeColor; label: string; className: string }> = [
  { value: 'default', label: '기본', className: 'border-gray-300 bg-white' },
  { value: 'dark', label: '진한 회색', className: 'border-gray-800 bg-gray-800' },
  { value: 'brand', label: 'ComMatch 포인트색', className: 'border-green-600 bg-green-600' },
  { value: 'red', label: '빨강', className: 'border-red-600 bg-red-600' },
  { value: 'blue', label: '파랑', className: 'border-blue-600 bg-blue-600' },
  { value: 'orange', label: '주황', className: 'border-orange-600 bg-orange-600' },
  { value: 'green', label: '초록', className: 'border-emerald-700 bg-emerald-700' },
];

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

const EMOJIS = ['📢', '🎉', '❤️', '😊', '👍', '✅', '⚠️', '📌', '🔔', '💡'] as const;

const NoticeFontMark = Mark.create({
  name: 'noticeFont',
  addAttributes() {
    return { value: { default: 'default' } };
  },
  renderHTML({ mark }) {
    const value = mark.attrs.value as NoticeFont;
    return ['span', { class: FONT_CLASS_NAMES[value] ?? FONT_CLASS_NAMES.default }, 0];
  },
});

const NoticeSizeMark = Mark.create({
  name: 'noticeSize',
  addAttributes() {
    return { value: { default: 'md' } };
  },
  renderHTML({ mark }) {
    const value = mark.attrs.value as NoticeSize;
    return ['span', { class: SIZE_CLASS_NAMES[value] ?? SIZE_CLASS_NAMES.md }, 0];
  },
});

const NoticeColorMark = Mark.create({
  name: 'noticeColor',
  addAttributes() {
    return { value: { default: 'default' } };
  },
  renderHTML({ mark }) {
    const value = mark.attrs.value as NoticeColor;
    return ['span', { class: COLOR_CLASS_NAMES[value] ?? COLOR_CLASS_NAMES.default }, 0];
  },
});

const applyMark = (
  editor: Editor | null,
  type: 'noticeFont' | 'noticeSize' | 'noticeColor',
  value: NoticeFont | NoticeSize | NoticeColor,
) => {
  editor?.chain().focus().setMark(type, { value }).run();
};

type NoticeFormattingEditorProps = {
  initialBody?: string;
};

export default function NoticeFormattingEditor({ initialBody = '' }: NoticeFormattingEditorProps) {
  const initialContent = noticeBodyToEditorDocument(initialBody);
  const [storedBody, setStoredBody] = useState(initialBody);
  const [serializationFailed, setSerializationFailed] = useState(false);
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Bold,
      NoticeFontMark,
      NoticeSizeMark,
      NoticeColorMark,
      UndoRedo,
    ],
    content: initialContent.document,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id: 'notice-body',
        'aria-label': '공지사항 본문',
        'aria-required': 'true',
        class: 'min-h-96 whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-8 outline-none',
      },
      handlePaste(view, event) {
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (!text) return true;

        const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
        const nodes = lines.flatMap((line, index) => [
          ...(index > 0 ? [view.state.schema.nodes.hardBreak.create()] : []),
          ...(line ? [view.state.schema.text(line)] : []),
        ]);
        const slice = new Slice(Fragment.fromArray(nodes), 0, 0);
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      },
    },
    onUpdate({ editor: updatedEditor }) {
      const serialized = editorDocumentToNoticeBody(updatedEditor.getJSON());
      if (!serialized.ok) {
        setSerializationFailed(true);
        setStoredBody('');
        return;
      }
      setSerializationFailed(false);
      setStoredBody(serialized.body);
    },
  });

  const insertEmoji = (emoji: string) => {
    if (!editor) return;
    const insertionPoint = editor.state.selection.to;
    editor.chain().focus().setTextSelection(insertionPoint).insertContent(emoji).run();
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name="body" value={storedBody} />

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4" aria-label="본문 서식 도구">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="notice-font">글꼴</label>
          <select
            id="notice-font"
            value=""
            onChange={(event) => applyMark(editor, 'noticeFont', event.currentTarget.value as NoticeFont)}
            className="min-h-11 max-w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700"
          >
            <option value="" disabled>글꼴</option>
            {FONT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>

          <label className="sr-only" htmlFor="notice-size">글자 크기</label>
          <select
            id="notice-size"
            value=""
            onChange={(event) => applyMark(editor, 'noticeSize', event.currentTarget.value as NoticeSize)}
            className="min-h-11 max-w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700"
          >
            <option value="" disabled>크기</option>
            {SIZE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>

          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-sm font-black hover:bg-gray-100 ${
              editor?.isActive('bold') ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-300 bg-white text-gray-800'
            }`}
            aria-label="선택한 글자를 굵게"
            aria-pressed={editor?.isActive('bold') ?? false}
            title="굵게"
          >
            B
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold text-gray-600">글자색</span>
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color.value}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyMark(editor, 'noticeColor', color.value)}
              className={`h-11 w-11 rounded-xl border-2 shadow-sm ${color.className}`}
              aria-label={`${color.label} 글자색 적용`}
              aria-pressed={editor?.isActive('noticeColor', { value: color.value }) ?? false}
              title={color.label}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-bold text-gray-600">이모지</span>
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertEmoji(emoji)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 bg-white text-xl hover:bg-gray-100"
              aria-label={`${emoji} 이모지 삽입`}
              title={`${emoji} 삽입`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div
        className="w-full rounded-xl border border-gray-300 bg-white text-gray-800 focus-within:border-green-600 focus-within:ring-2 focus-within:ring-green-500/20"
        aria-invalid={serializationFailed}
      >
        <EditorContent editor={editor} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <p>1자 이상 10,000자 이하로 입력해 주세요.</p>
        <p>{storedBody.length.toLocaleString('ko-KR')} / 10,000자</p>
      </div>
      {serializationFailed ? (
        <p role="alert" className="text-sm font-semibold text-red-600">
          지원하지 않는 서식이 포함되어 저장할 수 없습니다.
        </p>
      ) : null}

      <section aria-labelledby="notice-preview-heading" className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <h2 id="notice-preview-heading" className="text-sm font-black text-gray-900">미리보기</h2>
        <NoticeBody body={storedBody} className="mt-4 min-h-24 text-[15px] leading-8 text-gray-700" />
      </section>
    </div>
  );
}
