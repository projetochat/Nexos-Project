export function normalizeOptionLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

export function compareOptionLabels(a: string, b: string) {
  const normalizedA = normalizeOptionLabel(a);
  const normalizedB = normalizeOptionLabel(b);
  const normalizedCompare = normalizedA.localeCompare(normalizedB, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
  if (normalizedCompare !== 0) return normalizedCompare;
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function sortByOptionLabel<T>(items: T[], getLabel: (item: T) => string) {
  return [...items].sort((a, b) => compareOptionLabels(getLabel(a), getLabel(b)));
}