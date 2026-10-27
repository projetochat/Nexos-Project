export function avatarInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/gu)?.join("") ?? "")
    .filter(Boolean);
  const initials =
    words.length === 1
      ? [...words[0]].slice(0, 2).join("")
      : words
          .slice(0, 2)
          .map((word) => [...word][0])
          .join("");
  return initials.toLocaleUpperCase("pt-BR") || "?";
}
