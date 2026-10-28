export function sanitizeServiceHourDraft(value: string) {
  return value.replace(/[^\d:]/g, "").slice(0, 5);
}

export function formatServiceHourDraft(value: string) {
  if (!value) return "";
  if (/^\d{1,2}:\d{1,2}$/.test(value))
    return value
      .split(":")
      .map((part) => part.padStart(2, "0"))
      .join(":");
  if (!/^\d{1,4}$/.test(value)) return value;
  const digits = value.length <= 2 ? value.padStart(2, "0") + "00" : value.padStart(4, "0");
  return digits.slice(0, 2) + ":" + digits.slice(2);
}
