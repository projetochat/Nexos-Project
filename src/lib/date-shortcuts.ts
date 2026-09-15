export function todayDateValue(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function todayValueForInput(type: string | undefined, currentValue: string) {
  const date = todayDateValue();
  if (type !== "datetime-local") return date;
  const time = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(?::\d{2})?)$/.exec(currentValue)?.[1] ?? "T00:00";
  return `${date}${time}`;
}

export function shouldFillTodayFromShortcut(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}) {
  return (
    !event.isComposing &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key.toLowerCase() === "h"
  );
}

export function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}