import * as React from "react";
import { toast } from "sonner";

export const requiredFieldClassName = (invalid: boolean) =>
  invalid ? "!border-destructive focus:!border-destructive focus-within:!border-destructive" : "";

export function showRequiredFieldsToast(fields: readonly string[]) {
  const pendingFields = [...new Set(fields.map((field) => field.trim()).filter(Boolean))];
  if (!pendingFields.length) return;

  toast.error("Preencha os campos obrigatórios:", {
    description: (
      <ul className="m-0 list-disc space-y-0.5 pl-5 text-left">
        {pendingFields.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
    ),
    classNames: {
      content: "!items-start !text-left",
      title: "!text-left",
      description: "!text-left",
    },
    position: "top-right",
  });
}
