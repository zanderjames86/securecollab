import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import type { OpenRoom } from "../lib/rooms";
import { personColor } from "../lib/share";

export interface EditorUser {
  id: string;
  name: string;
}

export function DocEditor({ room, user }: { room: OpenRoom; user: EditorUser }) {
  const color = useMemo(() => personColor(user.id), [user.id]);

  const editor = useEditor(
    {
      extensions: [
        // Undo/redo comes from the collaboration extension so it only undoes your own edits.
        StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true } }),
        TableKit.configure({ table: { resizable: false } }),
        Placeholder.configure({ placeholder: "Start writing…" }),
        Collaboration.configure({ document: room.doc, field: "content" }),
        CollaborationCaret.configure({
          provider: room.provider,
          user: { name: user.name, color, id: user.id },
        }),
      ],
      editorProps: {
        attributes: { class: "prose", spellcheck: "true", "aria-label": "Document text" },
      },
    },
    [room.doc, room.provider],
  );

  return (
    <div className="editor-shell">
      {editor && <Toolbar editor={editor} />}
      <div className="paper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
      inTable: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Tb label="Undo" onClick={() => c().undo().run()} disabled={!s.canUndo}>
        ↶
      </Tb>
      <Tb label="Redo" onClick={() => c().redo().run()} disabled={!s.canRedo}>
        ↷
      </Tb>
      <Sep />
      <Tb label="Heading 1" active={s.h1} onClick={() => c().toggleHeading({ level: 1 }).run()}>
        H1
      </Tb>
      <Tb label="Heading 2" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        H2
      </Tb>
      <Tb label="Heading 3" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        H3
      </Tb>
      <Sep />
      <Tb label="Bold" active={s.bold} onClick={() => c().toggleBold().run()}>
        <b>B</b>
      </Tb>
      <Tb label="Italic" active={s.italic} onClick={() => c().toggleItalic().run()}>
        <i>I</i>
      </Tb>
      <Tb label="Underline" active={s.underline} onClick={() => c().toggleUnderline().run()}>
        <u>U</u>
      </Tb>
      <Tb label="Strikethrough" active={s.strike} onClick={() => c().toggleStrike().run()}>
        <s>S</s>
      </Tb>
      <Sep />
      <Tb label="Bulleted list" active={s.bullet} onClick={() => c().toggleBulletList().run()}>
        •≡
      </Tb>
      <Tb label="Numbered list" active={s.ordered} onClick={() => c().toggleOrderedList().run()}>
        1≡
      </Tb>
      <Tb label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()}>
        ❝
      </Tb>
      <Tb label="Code block" active={s.code} onClick={() => c().toggleCodeBlock().run()}>
        {"</>"}
      </Tb>
      <Sep />
      {s.inTable ? (
        <>
          <Tb label="Add row below" onClick={() => c().addRowAfter().run()}>
            +Row
          </Tb>
          <Tb label="Add column right" onClick={() => c().addColumnAfter().run()}>
            +Col
          </Tb>
          <Tb label="Delete row" onClick={() => c().deleteRow().run()}>
            −Row
          </Tb>
          <Tb label="Delete column" onClick={() => c().deleteColumn().run()}>
            −Col
          </Tb>
          <Tb label="Delete table" onClick={() => c().deleteTable().run()}>
            ✕Tbl
          </Tb>
        </>
      ) : (
        <Tb label="Insert table" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          ⊞ Table
        </Tb>
      )}
    </div>
  );
}

function Tb({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tb${active ? " tb-on" : ""}`}
      aria-label={label}
      aria-pressed={active ?? undefined}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="tb-sep" aria-hidden="true" />;
}

/** People currently in the document, from encrypted presence. */
export function usePresence(room: OpenRoom | null): Array<{ id: string; name: string; color: string }> {
  const [people, setPeople] = useState<Array<{ id: string; name: string; color: string }>>([]);
  useEffect(() => {
    if (!room) return;
    const aw = room.provider.awareness;
    const update = () => {
      const seen = new Map<string, { id: string; name: string; color: string }>();
      for (const [clientId, state] of aw.getStates()) {
        if (clientId === room.doc.clientID) continue;
        const u = (state as { user?: { id?: string; name?: string; color?: string } }).user;
        if (u?.id && u.name) seen.set(u.id, { id: u.id, name: u.name, color: u.color ?? "#888" });
      }
      setPeople([...seen.values()]);
    };
    update();
    aw.on("change", update);
    return () => aw.off("change", update);
  }, [room]);
  return people;
}
