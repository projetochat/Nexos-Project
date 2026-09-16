import * as React from "react";
import { toast } from "sonner";
import { PhotoCropper } from "@/components/photo-cropper";

export function usePhotoCropper(
  onApply: (dataUrl: string) => void | Promise<void>,
  enabled = true,
) {
  const [source, setSource] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!enabled) setSource(null);
  }, [enabled]);
  React.useEffect(
    () => () => {
      if (source?.startsWith("blob:")) URL.revokeObjectURL(source);
    },
    [source],
  );
  const choose = (input?: File | string | null) => {
    if (!input) return;
    if (typeof input === "string") {
      setSource(input);
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/i.test(input.type)) {
      toast.error("Use uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (input.size > 10 * 1024 * 1024) {
      toast.error("A foto deve ter até 10 MB.");
      return;
    }
    setSource(URL.createObjectURL(input));
  };
  return {
    choose,
    dialog:
      enabled && source ? (
        <PhotoCropper
          key={source}
          source={source}
          onClose={() => setSource(null)}
          onApply={onApply}
        />
      ) : null,
  };
}
