import { Download, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadText, fileBase, toHtml, toMarkdown } from "@/lib/v26/export-report";
import type { SavedAnalysis } from "@/lib/v26/types";

export function DownloadBar({ analysis }: { analysis: SavedAnalysis }) {
  const base = fileBase(analysis);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="default"
        onClick={() => downloadText(`${base}.md`, toMarkdown(analysis), "text/markdown;charset=utf-8")}
      >
        <Download className="size-4" />
        Pobierz Markdown
      </Button>
      <Button
        variant="outline"
        onClick={() => downloadText(`${base}.html`, toHtml(analysis), "text/html;charset=utf-8")}
      >
        <FileText className="size-4" />
        Pobierz HTML
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          const w = window.open("", "_blank");
          if (!w) return;
          w.document.write(toHtml(analysis));
          w.document.close();
          w.focus();
          w.print();
        }}
      >
        <Printer className="size-4" />
        Drukuj / PDF
      </Button>
    </div>
  );
}
