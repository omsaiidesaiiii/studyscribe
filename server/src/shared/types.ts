// Types shared by the API/PDF renderer and the React web app.
//
// This module is dependency-free on purpose (no zod, no node built-ins) so
// the Vite bundle can import it without pulling server-only code into the
// browser. The zod schema in schemas/notes.schema.ts mirrors these types and
// asserts parity at compile time.

export type NotesLanguage = "english" | "hindi" | "hinglish";

export const NOTES_LANGUAGES: readonly NotesLanguage[] = ["english", "hindi", "hinglish"];

export type DiagramNode = {
  label: string;
  fill?: string;
  stroke?: string;
};

export type HeadingBlock = {
  type: "heading";
  number?: string;
  text: string;
};

export type SectionHeadBlock = {
  type: "sectionhead";
  text: string;
};

export type ParagraphBlock = {
  type: "paragraph";
  html: string;
};

export type BulletsBlock = {
  type: "bullets";
  items: string[];
};

export type StickyNoteBlock = {
  type: "stickynote";
  variant?: "yellow" | "pink" | "green";
  badge?: string;
  html: string;
};

export type TableBlock = {
  type: "table";
  headers: string[];
  rows: string[][];
};

export type CodeBoxBlock = {
  type: "codebox";
  code: string;
};

export type FlowDiagramBlock = {
  type: "diagram";
  kind: "flow";
  title?: string;
  nodes: DiagramNode[];
};

export type DecisionDiagramBlock = {
  type: "diagram";
  kind: "decision";
  title?: string;
  root: DiagramNode;
  left: DiagramNode & { sub?: string };
  right: DiagramNode & { sub?: string };
};

export type DiagramBlock = FlowDiagramBlock | DecisionDiagramBlock;

export type NoteBlock =
  | HeadingBlock
  | SectionHeadBlock
  | ParagraphBlock
  | BulletsBlock
  | StickyNoteBlock
  | TableBlock
  | CodeBoxBlock
  | DiagramBlock;

export type Doodle = {
  top: number;
  text: string;
};

export type NotesPage = {
  topic: string;
  doodles?: Doodle[];
  blocks: NoteBlock[];
};

export type NotesData = {
  title: string;
  subject: string;
  pages: NotesPage[];
};

export type GenerationStatus = "pending" | "processing" | "done" | "failed";

export const LANGUAGE_LABELS: Record<NotesLanguage, string> = {
  english: "English",
  hindi: "हिन्दी",
  hinglish: "Hinglish",
};
