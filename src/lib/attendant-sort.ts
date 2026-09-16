export function sortAtendentes<T extends { perfilKey: string; ativo: boolean; nome: string }>(
  atendentes: T[],
) {
  return [...atendentes].sort((a, b) => {
    const aIsAdministrator = a.perfilKey === "tenant_admin";
    const bIsAdministrator = b.perfilKey === "tenant_admin";
    if (aIsAdministrator !== bIsAdministrator) return aIsAdministrator ? -1 : 1;
    if (!aIsAdministrator && a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  });
}
