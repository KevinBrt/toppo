import { memo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** What a remark plugin reaches of the parser: the syntax extensions micromark reads. */
interface ParserData {
  data(): { micromarkExtensions?: { disable?: { null?: string[] } }[] };
}

/**
 * Turns footnotes (`[^1]`) off. Looking for one, the parser reads back over the whole paragraph at
 * every `]`: a description of tens of thousands of them would freeze the tab of whoever opens it.
 * No issue needs footnotes; `[^1]` stays as written.
 */
function remarkWithoutFootnotes(this: ParserData): undefined {
  const data = this.data();
  data.micromarkExtensions ??= [];
  data.micromarkExtensions.push({
    disable: { null: ['gfmFootnoteDefinition', 'gfmFootnoteCall', 'gfmPotentialFootnoteCall'] },
  });
  return undefined;
}

const REMARK_PLUGINS = [remarkGfm, remarkWithoutFootnotes];

/**
 * How each element looks. Links open apart and tell search engines nothing; images are shown as
 * links, never loaded: the CSP refuses other origins, and an image could track who reads.
 */
const COMPONENTS: Components = {
  p: ({ node: _node, ...props }) => <p className="mb-3 leading-relaxed last:mb-0" {...props} />,
  a: ({ node: _node, ...props }) => (
    <a
      className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
      target="_blank"
      rel="noopener noreferrer nofollow"
      {...props}
    />
  ),
  img: ({ src, alt }) => (
    <a
      href={typeof src === 'string' ? src : undefined}
      className="font-medium text-primary underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer nofollow"
    >
      {alt || src}
    </a>
  ),
  ul: ({ node: _node, ...props }) => <ul className="mb-3 list-disc pl-5 last:mb-0" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="mb-3 list-decimal pl-5 last:mb-0" {...props} />,
  li: ({ node: _node, ...props }) => <li className="mb-1" {...props} />,
  h1: ({ node: _node, ...props }) => <h3 className="mb-2 text-base font-semibold" {...props} />,
  h2: ({ node: _node, ...props }) => <h3 className="mb-2 text-base font-semibold" {...props} />,
  h3: ({ node: _node, ...props }) => <h4 className="mb-2 font-semibold" {...props} />,
  h4: ({ node: _node, ...props }) => <h4 className="mb-2 font-semibold" {...props} />,
  h5: ({ node: _node, ...props }) => <h4 className="mb-2 font-semibold" {...props} />,
  h6: ({ node: _node, ...props }) => <h4 className="mb-2 font-semibold" {...props} />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className="mb-3 border-l-2 border-border pl-3 text-muted-foreground" {...props} />
  ),
  code: ({ node: _node, ...props }) => (
    <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.9em]" {...props} />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="mb-3 overflow-x-auto rounded-md bg-surface-muted p-3 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-left" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th className="border border-border px-2 py-1 font-semibold" {...props} />
  ),
  td: ({ node: _node, ...props }) => <td className="border border-border px-2 py-1" {...props} />,
};

/**
 * Markdown written by people, as React elements: never an HTML string. Raw HTML in it is
 * dropped, and links with unsafe protocols lose their target (`react-markdown` defaults). Parsed
 * again only when the text changes, not each time the page around it renders.
 */
export const MarkdownText = memo(function MarkdownText({ children }: { children: string }) {
  return (
    <div className="min-w-0 text-sm break-words text-foreground">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS} skipHtml>
        {children}
      </Markdown>
    </div>
  );
});
