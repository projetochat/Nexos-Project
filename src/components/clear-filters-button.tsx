import { FilterX } from "lucide-react";
import { Button } from "@/components/ui-kit";

type ClearFiltersButtonProps = {
  onClick: () => void;
  className?: string;
};

export function ClearFiltersButton({ onClick, className = "" }: ClearFiltersButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onClick}
      title="Limpar filtros"
      aria-label="Limpar filtros"
      className={`min-h-10 w-10 px-0 ${className}`.trim()}
    >
      <FilterX className="h-4 w-4" />
    </Button>
  );
}
