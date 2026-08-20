"use client";

import type { ICommand } from "@uiw/react-md-editor";
import {
  Bold,
  CircleQuestionMark,
  Code,
  Columns2,
  Eye,
  Heading,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  MessageSquare,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
  Table,
} from "lucide-react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import {
  getProposalPreviewRehypePlugins,
  getProposalPreviewRemarkPlugins,
} from "@/lib/create-proposal-form-utils";

// Client-only: the editor touches `window`/`document` at import, which would
// break the static export build.
const MDEditor = dynamic(
  () => import("@uiw/react-md-editor").then((m) => m.default),
  {
    ssr: false,
    loading: () => <div className="h-[280px] rounded-md glass-subtle" />,
  }
);

// Lazy-built once on the client to keep the MDEditor module off the SSR path.
// Replaces the default SVG icons on both the main toolbar and the right-side
// (edit/live/preview/fullscreen) toolbar with lucide equivalents so the editor
// matches the rest of the app's icon set.
const iconClass = "h-4 w-4";

function withIcon(cmd: ICommand, icon: React.ReactElement): ICommand {
  return { ...cmd, icon };
}

async function loadCommands(): Promise<ICommand[]> {
  const { commands, group } = await import("@uiw/react-md-editor");
  return [
    withIcon(commands.bold, <Bold className={iconClass} />),
    withIcon(commands.italic, <Italic className={iconClass} />),
    withIcon(commands.strikethrough, <Strikethrough className={iconClass} />),
    withIcon(commands.hr, <Minus className={iconClass} />),
    group(
      [
        commands.title1,
        commands.title2,
        commands.title3,
        commands.title4,
        commands.title5,
        commands.title6,
      ],
      {
        name: "title",
        groupName: "title",
        buttonProps: { "aria-label": "Insert title", title: "Insert title" },
        icon: <Heading className={iconClass} />,
      }
    ),
    commands.divider,
    withIcon(commands.link, <Link2 className={iconClass} />),
    withIcon(commands.quote, <Quote className={iconClass} />),
    withIcon(commands.code, <Code className={iconClass} />),
    withIcon(commands.codeBlock, <SquareCode className={iconClass} />),
    withIcon(commands.comment, <MessageSquare className={iconClass} />),
    withIcon(commands.image, <ImageIcon className={iconClass} />),
    withIcon(commands.table, <Table className={iconClass} />),
    commands.divider,
    withIcon(commands.unorderedListCommand, <List className={iconClass} />),
    withIcon(
      commands.orderedListCommand,
      <ListOrdered className={iconClass} />
    ),
    withIcon(commands.checkedListCommand, <ListChecks className={iconClass} />),
    commands.divider,
    withIcon(commands.help, <CircleQuestionMark className={iconClass} />),
  ];
}

async function loadExtraCommands(): Promise<ICommand[]> {
  const { commands } = await import("@uiw/react-md-editor");
  return [
    withIcon(commands.codeLive, <Columns2 className={iconClass} />),
    withIcon(commands.codePreview, <Eye className={iconClass} />),
    commands.divider,
    withIcon(commands.fullscreen, <Maximize2 className={iconClass} />),
  ];
}

// Stable across renders, so MDEditor isn't handed a new previewOptions identity
// on every keystroke.
const REMARK_PLUGINS = getProposalPreviewRemarkPlugins();
const REHYPE_PLUGINS = getProposalPreviewRehypePlugins();

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: number;
  disabled?: boolean;
  onBlur?: () => void;
}

/**
 * The app's shared markdown editor: `@uiw/react-md-editor` loaded client-side,
 * with lucide toolbar icons and the same sanitising preview pipeline the
 * proposal and delegate-statement surfaces use.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  height = 600,
  disabled,
  onBlur,
}: MarkdownEditorProps) {
  const { resolvedTheme } = useTheme();
  const [commands, setCommands] = useState<ICommand[]>();
  const [extraCommands, setExtraCommands] = useState<ICommand[]>();
  const [editorWrapper, setEditorWrapper] = useState<HTMLDivElement | null>(
    null
  );

  useEffect(() => {
    loadCommands().then(setCommands);
    loadExtraCommands().then(setExtraCommands);
  }, []);

  // MDEditor sets `title` on toolbar buttons, which triggers the slow native
  // tooltip. Copy it to `data-tooltip` (used by our CSS hover tooltip) and
  // strip `title` so the native one stays out of the way. A MutationObserver
  // covers future re-renders (mode toggles, commands list changes).
  useEffect(() => {
    if (!editorWrapper) return;
    const migrate = () => {
      editorWrapper
        .querySelectorAll<HTMLButtonElement>(
          ".w-md-editor-toolbar button[title]"
        )
        .forEach((btn) => {
          const title = btn.getAttribute("title");
          if (!title) return;
          btn.setAttribute("data-tooltip", title);
          btn.removeAttribute("title");
        });
    };
    migrate();
    const observer = new MutationObserver(migrate);
    observer.observe(editorWrapper, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["title"],
    });
    return () => observer.disconnect();
  }, [editorWrapper]);

  return (
    <div
      ref={setEditorWrapper}
      data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}
      className="rounded-md"
    >
      <MDEditor
        value={value}
        onChange={(next) => onChange(next ?? "")}
        preview="live"
        height={height}
        commands={commands}
        extraCommands={extraCommands}
        previewOptions={{
          remarkPlugins: REMARK_PLUGINS,
          rehypePlugins: REHYPE_PLUGINS,
        }}
        textareaProps={{
          placeholder,
          disabled,
          onBlur,
        }}
      />
    </div>
  );
}
