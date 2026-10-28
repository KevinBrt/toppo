import { Markdown } from '@tiptap/markdown';
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import type { FieldControlProps } from '@toppo-tracker/ui';
import { BoldIcon, CodeIcon, ItalicIcon, LinkIcon, ListIcon, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { LinkDialog } from './link-dialog.tsx';

/** What the editor knows: what Markdown writes, nothing it could not keep (no underline). */
const EXTENSIONS = [
  StarterKit.configure({
    underline: false,
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
  }),
  Markdown,
];

type Mark = 'bold' | 'italic' | 'bulletList' | 'code' | 'link';

const BUTTONS: readonly {
  mark: Exclude<Mark, 'link'>;
  label: 'bold' | 'italic' | 'list' | 'code';
  icon: LucideIcon;
}[] = [
  { mark: 'bold', label: 'bold', icon: BoldIcon },
  { mark: 'italic', label: 'italic', icon: ItalicIcon },
  { mark: 'bulletList', label: 'list', icon: ListIcon },
  { mark: 'code', label: 'code', icon: CodeIcon },
];

function toggle(editor: Editor, mark: Exclude<Mark, 'link'>): void {
  const chain = editor.chain().focus();
  switch (mark) {
    case 'bold':
      chain.toggleBold().run();
      return;
    case 'italic':
      chain.toggleItalic().run();
      return;
    case 'bulletList':
      chain.toggleBulletList().run();
      return;
    case 'code':
      chain.toggleCode().run();
      return;
  }
}

/** How the text shows while it is written: as it will read, never as Markdown marks. */
const CONTENT_CLASS =
  'min-h-40 px-3 py-2 text-sm text-foreground outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1 [&_code]:font-mono [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_pre]:mb-3 [&_pre]:rounded-md [&_pre]:bg-surface-muted [&_pre]:p-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5';

/**
 * Writes Markdown the way it reads, as in Notion: bold shows bold, a list shows as a list. The
 * toolbar and the usual shortcuts (`**`, `- `, `#`) format; what is saved stays plain Markdown.
 */
export function MarkdownEditor({
  label,
  control,
  value,
  onChange,
}: {
  /** The field's name, read by screen readers: a `<label>` cannot name an editable region. */
  label: string;
  /** Its id and descriptions, from `Field`. */
  control: FieldControlProps;
  value: string;
  onChange: (markdown: string) => void;
}) {
  const { t } = useI18n();
  const [linking, setLinking] = useState(false);
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value,
    contentType: 'markdown',
    // The CSP refuses runtime <style> tags: the editor's rules ship in app.css.
    injectCSS: false,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        id: control.id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        'aria-invalid': String(control['aria-invalid']),
        ...(control['aria-describedby'] ? { 'aria-describedby': control['aria-describedby'] } : {}),
        class: CONTENT_CLASS,
      },
    },
    // The serializer ends a document with blank lines: they mean nothing, they are not kept.
    onUpdate: ({ editor: changed }) => onChange(changed.getMarkdown().trimEnd()),
  });
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      bulletList: current.isActive('bulletList'),
      code: current.isActive('code'),
      link: current.isActive('link'),
    }),
  });

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
      <div
        role="toolbar"
        aria-label={t('issues.toolbar.label')}
        aria-controls={control.id}
        className="flex gap-1 border-b border-border bg-surface-muted px-2 py-1"
      >
        {BUTTONS.map(({ mark, label: name, icon: Icon }) => (
          <ToolbarButton
            key={mark}
            label={t(`issues.toolbar.${name}`)}
            pressed={active[mark]}
            icon={Icon}
            onClick={() => toggle(editor, mark)}
          />
        ))}
        <ToolbarButton
          label={t('issues.toolbar.link')}
          pressed={active.link}
          icon={LinkIcon}
          onClick={() =>
            active.link ? editor.chain().focus().unsetLink().run() : setLinking(true)
          }
        />
      </div>
      <EditorContent editor={editor} />
      <LinkDialog
        open={linking}
        onOpenChange={setLinking}
        onLink={(href) => {
          const chain = editor.chain().focus();
          if (editor.state.selection.empty) {
            chain
              .insertContent({
                type: 'text',
                text: href,
                marks: [{ type: 'link', attrs: { href } }],
              })
              .run();
          } else {
            chain.extendMarkRange('link').setLink({ href }).run();
          }
        }}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  pressed,
  icon: Icon,
  onClick,
}: {
  label: string;
  pressed: boolean;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      // Keeps the selection in the text while the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-xs pointer-coarse:size-11"
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
