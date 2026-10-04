import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * One Save button for a page made of several sections.
 *
 * The profile editor is the Basics form plus the Top 5 plus the gamer
 * tags, each of which used to carry its own Save button — three
 * buttons on one page, and the one at the bottom didn't save the one
 * at the top. Now every section reports two things to the page: am I
 * dirty, and here is how to save me. The page shows one button that
 * saves whatever is dirty, and can ask "save your changes?" on the way
 * out.
 *
 * Sections save independently and in parallel; one failing doesn't
 * roll the others back. The first error is what gets shown.
 */

export type Saver = () => Promise<string | null>;

type Section = { dirty: boolean; save: Saver };

type Editor = {
  report: (key: string, section: Section) => void;
  forget: (key: string) => void;
};

const EditorContext = createContext<Editor | null>(null);

/**
 * The page side. Wrap the sections in <EditorProvider editor={editor}>
 * and read `editor.dirty` / call `editor.saveAll()`.
 */
export function useEditor() {
  const sections = useRef(new Map<string, Section>());
  const [dirtyKeys, setDirtyKeys] = useState<string[]>([]);

  const recompute = useCallback(() => {
    const keys = [...sections.current.entries()].filter(([, s]) => s.dirty).map(([k]) => k);
    setDirtyKeys((prev) => (prev.join("|") === keys.join("|") ? prev : keys));
  }, []);

  const report = useCallback(
    (key: string, section: Section) => {
      sections.current.set(key, section);
      recompute();
    },
    [recompute],
  );

  const forget = useCallback(
    (key: string) => {
      sections.current.delete(key);
      recompute();
    },
    [recompute],
  );

  /** Saves every dirty section. Resolves to the first error, or null. */
  const saveAll = useCallback(async (): Promise<string | null> => {
    const pending = [...sections.current.values()].filter((s) => s.dirty).map((s) => s.save());
    const results = await Promise.all(pending);
    return results.find((r) => r !== null) ?? null;
  }, []);

  return { context: { report, forget }, dirty: dirtyKeys.length > 0, dirtyKeys, saveAll };
}

export function EditorProvider({ editor, children }: { editor: Editor; children: ReactNode }) {
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>;
}

/**
 * The section side. Call on every render with the current dirty state
 * and a save function; it keeps the page informed and cleans up on
 * unmount. Outside an EditorProvider it does nothing, so a section can
 * still carry its own button elsewhere.
 *
 * @returns whether a page-level editor is present (so the section can
 *   hide its own Save button).
 */
export function useEditorSection(key: string, dirty: boolean, save: Saver): boolean {
  const editor = useContext(EditorContext);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!editor) return;
    editor.report(key, { dirty, save: () => saveRef.current() });
  }, [editor, key, dirty]);

  useEffect(() => {
    if (!editor) return;
    return () => editor.forget(key);
  }, [editor, key]);

  return editor !== null;
}
