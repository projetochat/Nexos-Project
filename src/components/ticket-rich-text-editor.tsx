import * as React from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Expand,
  Italic,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Redo2,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { Modal } from "./modal";
import { Button } from "./ui-kit";
import {
  writeTicketEditorHtml,
  readTicketEditorHtml,
  pasteTicketEditorText,
} from "../lib/ticket-editor-dom";

export function RichTextEditor({
  value,
  onChange,
  expanded = false,
}: {
  value: string;
  onChange: (value: string) => void;
  expanded?: boolean;
}) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const selectionRef = React.useRef<Range | null>(null);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [fontName, setFontName] = React.useState("Arial");
  const [fontSize, setFontSize] = React.useState("3");
  const [fontColor, setFontColor] = React.useState("#111827");
  const [alignment, setAlignment] = React.useState("justifyLeft");

  React.useEffect(() => {
    const editor = editorRef.current;
    if (editor && document.activeElement !== editor) writeTicketEditorHtml(editor, value);
  }, [value]);

  const sync = () => onChange(readTicketEditorHtml(editorRef.current));
  const saveSelection = () => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection?.rangeCount || !editor) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) selectionRef.current = range.cloneRange();
  };
  const run = (command: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (selection && selectionRef.current) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
    if (command === "insertUnorderedList" && !editor.textContent?.trim()) {
      writeTicketEditorHtml(editor, "<ul><li><br></li></ul>");
    } else {
      document.execCommand(command, false, commandValue);
    }
    saveSelection();
    sync();
  };
  const alignmentIcon =
    alignment === "justifyCenter" ? (
      <AlignCenter className="h-4 w-4" />
    ) : alignment === "justifyRight" ? (
      <AlignRight className="h-4 w-4" />
    ) : alignment === "justifyFull" ? (
      <AlignJustify className="h-4 w-4" />
    ) : (
      <AlignLeft className="h-4 w-4" />
    );
  const tool = (title: string, command: string, icon: React.ReactNode) => (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => run(command)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-card hover:text-foreground"
    >
      {icon}
    </button>
  );
  const editor = (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-1 focus-within:border-primary">
      <div className="border-b border-border bg-card px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-0.5 rounded-xl bg-surface-2 px-2 py-1 shadow-sm">
          {tool("Desfazer", "undo", <Undo2 className="h-4 w-4" />)}
          {tool("Refazer", "redo", <Redo2 className="h-4 w-4" />)}
          <EditorDivider />
          <select
            title="Tipo da fonte"
            value={fontName}
            onMouseDown={saveSelection}
            onChange={(event) => {
              setFontName(event.target.value);
              run("fontName", event.target.value);
            }}
            className="h-8 max-w-28 rounded-md bg-transparent px-2 text-xs outline-none hover:bg-card"
          >
            <option value="Arial">Sans Serif</option>
            <option value="Times New Roman">Serif</option>
            <option value="Courier New">Largura fixa</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
          </select>
          <select
            title="Tamanho da fonte"
            value={fontSize}
            onMouseDown={saveSelection}
            onChange={(event) => {
              setFontSize(event.target.value);
              run("fontSize", event.target.value);
            }}
            className="h-8 w-11 rounded-md bg-transparent px-1 text-xs outline-none hover:bg-card"
          >
            <option value="2">P</option>
            <option value="3">M</option>
            <option value="5">G</option>
            <option value="7">EG</option>
          </select>
          <span className="inline-flex h-8 w-6 items-center justify-center text-muted-foreground">
            <Type className="h-4 w-4" />
          </span>
          <EditorDivider />
          {tool("Negrito", "bold", <Bold className="h-4 w-4" />)}
          {tool("Itálico", "italic", <Italic className="h-4 w-4" />)}
          {tool("Sublinhado", "underline", <Underline className="h-4 w-4" />)}
          {tool("Riscado", "strikeThrough", <Strikethrough className="h-4 w-4" />)}
          <label
            className="relative inline-flex h-8 w-9 items-center justify-center"
            title="Cor do texto"
          >
            <span className="border-b-2 font-semibold" style={{ borderColor: fontColor }}>
              A
            </span>
            <input
              type="color"
              value={fontColor}
              onMouseDown={saveSelection}
              onChange={(event) => {
                setFontColor(event.target.value);
                run("foreColor", event.target.value);
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <EditorDivider />
          <select
            title="Alinhamento"
            value={alignment}
            onMouseDown={saveSelection}
            onChange={(event) => {
              setAlignment(event.target.value);
              run(event.target.value);
            }}
            className="h-8 w-9 rounded-md bg-transparent text-xs outline-none hover:bg-card"
          >
            <option value="justifyLeft">E</option>
            <option value="justifyCenter">C</option>
            <option value="justifyRight">D</option>
            <option value="justifyFull">J</option>
          </select>
          <span className="-ml-9 pointer-events-none inline-flex h-8 w-8 items-center justify-center text-muted-foreground">
            {alignmentIcon}
            <ChevronDown className="h-3 w-3" />
          </span>
          {tool("Lista numerada", "insertOrderedList", <ListOrdered className="h-4 w-4" />)}
          {tool("Marcadores", "insertUnorderedList", <List className="h-4 w-4" />)}
          {tool("Diminuir recuo", "outdent", <ListIndentDecrease className="h-4 w-4" />)}
          {tool("Aumentar recuo", "indent", <ListIndentIncrease className="h-4 w-4" />)}
          {!expanded && (
            <button
              type="button"
              title="Maximizar"
              onClick={() => setFullscreen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-card hover:text-foreground"
            >
              <Expand className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Descricao do chamado"
        aria-multiline="true"
        onPaste={(event) => {
          event.preventDefault();
          pasteTicketEditorText(event.currentTarget, event.clipboardData.getData("text/plain"));
          saveSelection();
          sync();
        }}
        onDrop={(event) => event.preventDefault()}
        onBlur={saveSelection}
        onInput={() => {
          saveSelection();
          sync();
        }}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        data-placeholder="Descreva os detalhes do chamado..."
        className={`w-full overflow-y-auto px-3 py-2 text-sm outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 ${expanded ? "h-[62vh]" : "h-44"}`}
      />
    </div>
  );
  return (
    <>
      {editor}
      {!expanded && (
        <Modal
          open={fullscreen}
          onClose={() => setFullscreen(false)}
          title="Editar Texto HTML"
          size="xl"
          footer={
            <Button variant="primary" size="sm" onClick={() => setFullscreen(false)}>
              Concluir
            </Button>
          }
        >
          <RichTextEditor value={value} onChange={onChange} expanded />
        </Modal>
      )}
    </>
  );
}

function EditorDivider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}
