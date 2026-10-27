import { hydrateTicketImages } from "../lib/ticket-image-dom";
import * as React from "react";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Copy,
  Expand,
  Italic,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Redo2,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { Modal } from "./modal";
import { Button } from "./ui-kit";
import {
  insertTicketEditorHtml,
  normalizeTicketEditorHtml,
  ticketEditorClipboardHtml,
  writeTicketEditorHtml,
} from "../lib/ticket-editor-dom";

export function RichTextEditor({
  value,
  onChange,
  expanded = false,
  invalid = false,
  resizable = false,
  imageActions = false,
}: {
  value: string;
  onChange: (value: string) => void;
  expanded?: boolean;
  invalid?: boolean;
  resizable?: boolean;
  imageActions?: boolean;
}) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const selectionRef = React.useRef<Range | null>(null);
  const selectedImageRef = React.useRef<HTMLImageElement | null>(null);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [imageSelected, setImageSelected] = React.useState(false);
  const [fontName, setFontName] = React.useState("Arial");
  const [fontSize, setFontSize] = React.useState("3");
  const [fontColor, setFontColor] = React.useState("#111827");
  const [alignment, setAlignment] = React.useState("justifyLeft");

  React.useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      if (document.activeElement !== editor) writeTicketEditorHtml(editor, value);
      return hydrateTicketImages(editor);
    }
  }, [value]);

  const clearSelectedImage = React.useCallback(() => {
    selectedImageRef.current?.classList.remove("ticket-editor-selected-image");
    selectedImageRef.current = null;
    setImageSelected(false);
  }, []);

  const sync = () => {
    clearSelectedImage();
    const editor = editorRef.current;
    const safeHtml = normalizeTicketEditorHtml(editor);
    onChange(safeHtml);
  };
  const selectImage = (image: HTMLImageElement) => {
    clearSelectedImage();
    selectedImageRef.current = image;
    image.classList.add("ticket-editor-selected-image");
    setImageSelected(true);
    const range = document.createRange();
    range.selectNode(image);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    selectionRef.current = range.cloneRange();
  };
  const copySelectedImage = async () => {
    const image = selectedImageRef.current;
    const editor = editorRef.current;
    if (!image || !editor?.contains(image)) return;
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        const response = await fetch(image.currentSrc || image.src);
        const blob = await normalizeClipboardImage(await response.blob());
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      } else {
        const range = document.createRange();
        range.selectNode(image);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        if (!document.execCommand("copy")) throw new Error("COPY_NOT_SUPPORTED");
      }
      toast.success("Imagem copiada.");
    } catch {
      toast.error("Não foi possível copiar a imagem.");
    }
  };
  const removeSelectedImage = () => {
    const image = selectedImageRef.current;
    if (!image) return;
    image.remove();
    clearSelectedImage();
    sync();
  };
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
    <div
      aria-invalid={invalid}
      className={`overflow-hidden rounded-lg border bg-surface-1 focus-within:border-primary ${invalid ? "border-destructive focus-within:border-destructive" : "border-border"}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border bg-card px-2 py-1.5">
        <div className="flex max-w-full flex-wrap items-center gap-0.5 rounded-xl bg-surface-2 px-2 py-1 shadow-sm">
          {tool("Desfazer", "undo", <Undo2 className="h-4 w-4" />)}
          {tool("Refazer", "redo", <Redo2 className="h-4 w-4" />)}
          <EditorDivider />
          <label
            title="Tipo da fonte"
            className="relative inline-flex h-8 w-32 items-center rounded-md px-2 text-xs transition hover:bg-card"
          >
            <select
              className="w-full appearance-none bg-transparent pr-5 text-xs outline-none"
              value={fontName}
              onMouseDown={saveSelection}
              onChange={(event) => {
                setFontName(event.target.value);
                run("fontName", event.target.value);
              }}
              aria-label="Tipo da fonte"
            >
              <option value="Arial">Sans Serif</option>
              <option value="Times New Roman">Serif</option>
              <option value="Courier New">Largura fixa</option>
              <option value="Arial Black">Largo</option>
              <option value="Arial Narrow">Estreito</option>
              <option value="Comic Sans MS">Comic Sans MS</option>
              <option value="Garamond">Garamond</option>
              <option value="Georgia">Georgia</option>
              <option value="Tahoma">Tahoma</option>
              <option value="Trebuchet MS">Trebuchet MS</option>
              <option value="Verdana">Verdana</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </label>
          <EditorDivider />
          <label
            className="relative inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-foreground transition hover:bg-card"
            title="Tamanho da fonte"
          >
            <Type className="h-4 w-4" />
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 outline-none"
              value={fontSize}
              onMouseDown={saveSelection}
              onChange={(event) => {
                setFontSize(event.target.value);
                run("fontSize", event.target.value);
              }}
              aria-label="Tamanho da fonte"
            >
              <option value="2">Pequeno</option>
              <option value="3">Normal</option>
              <option value="5">Grande</option>
              <option value="7">Enorme</option>
            </select>
          </label>
          <EditorDivider />
          {tool("Negrito", "bold", <Bold className="h-4 w-4" />)}
          {tool("Itálico", "italic", <Italic className="h-4 w-4" />)}
          {tool("Sublinhado", "underline", <Underline className="h-4 w-4" />)}
          {tool("Riscado", "strikeThrough", <Strikethrough className="h-4 w-4" />)}
          <label
            className="relative inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs transition hover:bg-card"
            title="Cor do texto"
          >
            <span className="font-semibold">A</span>
            <span className="h-1 w-4 rounded-sm" style={{ backgroundColor: fontColor }} />
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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
          <label
            className="relative inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs transition hover:bg-card"
            title="Alinhamento"
          >
            {alignmentIcon}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 outline-none"
              value={alignment}
              onMouseDown={saveSelection}
              onChange={(event) => {
                setAlignment(event.target.value);
                run(event.target.value);
              }}
              aria-label="Alinhamento"
            >
              <option value="justifyLeft">Esquerda</option>
              <option value="justifyCenter">Centro</option>
              <option value="justifyRight">Direita</option>
              <option value="justifyFull">Justificado</option>
            </select>
          </label>
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
      <div className="relative">
        {imageActions && imageSelected && (
          <div
            role="toolbar"
            aria-label="Ações da imagem selecionada"
            className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-surface-1 p-1 shadow-md"
          >
            <button
              type="button"
              title="Copiar imagem"
              aria-label="Copiar imagem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void copySelectedImage()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-foreground transition hover:bg-surface-2"
            >
              <Copy className="h-4 w-4" />
              Copiar
            </button>
            <button
              type="button"
              title="Remover imagem"
              aria-label="Remover imagem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={removeSelectedImage}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-destructive transition hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Remover
            </button>
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Descricao do chamado"
          aria-multiline="true"
          onPaste={(event) => {
            event.preventDefault();
            saveSelection();
            const editor = event.currentTarget;
            const range = selectionRef.current?.cloneRange() ?? null;
            void ticketEditorClipboardHtml(event.clipboardData)
              .then((html) => {
                insertTicketEditorHtml(editor, html, range);
                saveSelection();
                sync();
              })
              .catch((error) =>
                toast.error(
                  error instanceof Error ? error.message : "Não foi possível colar o conteúdo.",
                ),
              );
          }}
          onDrop={(event) => event.preventDefault()}
          onClick={(event) => {
            const target = event.target;
            if (imageActions && target instanceof HTMLImageElement) selectImage(target);
            else clearSelectedImage();
          }}
          onKeyDown={(event) => {
            if (
              imageActions &&
              imageSelected &&
              (event.key === "Delete" || event.key === "Backspace")
            ) {
              event.preventDefault();
              removeSelectedImage();
              return;
            }
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            const key = event.key.toLowerCase();
            const command =
              key === "z" && event.shiftKey
                ? "redo"
                : key === "z"
                  ? "undo"
                  : key === "y"
                    ? "redo"
                    : null;
            if (!command) return;
            event.preventDefault();
            document.execCommand(command);
            saveSelection();
            sync();
          }}
          onBlur={saveSelection}
          onInput={() => {
            saveSelection();
            sync();
          }}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          data-placeholder="Descreva os detalhes do chamado..."
          className={`w-full overflow-y-auto px-3 py-2 text-sm outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_.ticket-editor-selected-image]:outline [&_.ticket-editor-selected-image]:outline-2 [&_.ticket-editor-selected-image]:outline-offset-2 [&_.ticket-editor-selected-image]:outline-primary [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 ${expanded ? "h-[62vh]" : "h-44"} ${resizable ? "ai-prompt-scroll min-h-44 max-h-[60vh] resize-y" : ""}`}
        />
      </div>
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
          <RichTextEditor
            value={value}
            onChange={onChange}
            expanded
            resizable={resizable}
            imageActions={imageActions}
          />
        </Modal>
      )}
    </>
  );
}

function EditorDivider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

async function normalizeClipboardImage(blob: Blob) {
  if (blob.type === "image/png") return blob;
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível decodificar a imagem."));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Conversão de imagem indisponível.");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (converted) =>
          converted
            ? resolve(converted)
            : reject(new Error("Não foi possível converter a imagem.")),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
