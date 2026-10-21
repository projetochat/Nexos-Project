import * as React from "react";
import { writeTicketEditorHtml } from "../lib/ticket-editor-dom";

export function TicketRichTextContent({ html, className }: { html: string; className?: string }) {
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const content = contentRef.current;
    if (content) writeTicketEditorHtml(content, html);
  }, [html]);

  return <div ref={contentRef} className={className} />;
}
