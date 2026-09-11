import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Cache-bust po każdym nowym backupie — telefon nie trzyma starej paczki. */
const BACKUP_TAG = "20260909-2328";

export function DownloadProgramButtons({ size = "lg" }: { size?: "default" | "lg" }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <Button size={size} asChild>
          <a href={`/exact-v26.rar?v=${BACKUP_TAG}`} download="V26 Liga.rar">
            <Download className="size-4" />
            Pobierz RAR
          </a>
        </Button>
        <Button size={size} variant="outline" asChild>
          <a href={`/exact-v26.zip?v=${BACKUP_TAG}`} download="V26 Liga.zip">
            <Download className="size-4" />
            Pobierz ZIP
          </a>
        </Button>
      </div>
      <p className="text-xs text-subtle">
        Plik w Pobranych: V26 Liga.rar / V26 Liga.zip. Backup 09.09 23:28. Selekcja 08.09. 1B
        wypięte. Silnik HOLD.
      </p>
    </div>
  );
}