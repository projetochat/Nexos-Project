import * as React from "react";

export function useDisclosure(initial = false) {
  const [open, setOpen] = React.useState(initial);
  return {
    open,
    show: () => setOpen(true),
    hide: () => setOpen(false),
    toggle: () => setOpen((value) => !value),
    set: setOpen,
  };
}
