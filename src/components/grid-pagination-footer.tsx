import type React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Select } from "@/components/ui-kit";

type GridPaginationFooterProps = {
  visible: React.ReactNode;
  total: React.ReactNode;
  page: number;
  totalPages: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  suffix?: string;
  ariaLabelPrefix: string;
};

export function GridPaginationFooter({
  visible,
  total,
  page,
  totalPages,
  pageSize,
  onPage,
  onPageSize,
  pageSizeOptions = [10, 25, 50],
  suffix,
  ariaLabelPrefix,
}: GridPaginationFooterProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 leading-tight sm:leading-normal">
          <span className="block sm:inline">Mostrando</span>
          <span className="block sm:inline">
            {" "}
            {visible} de {total}
            {suffix ? ` ${suffix}` : ""}
          </span>
        </span>
        <div className="w-16 shrink-0">
          <Select
            value={String(pageSize)}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="!h-6 !min-h-6 !w-full !rounded-md !px-2 !py-0 !pr-6 !text-xs"
            aria-label={`Itens por página de ${ariaLabelPrefix}`}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="!h-7 !min-h-7 !w-7 !p-0"
          aria-label={`Página anterior de ${ariaLabelPrefix}`}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="font-mono">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="!h-7 !min-h-7 !w-7 !p-0"
          aria-label={`Próxima página de ${ariaLabelPrefix}`}
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
