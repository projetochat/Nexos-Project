const count = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

export function agendaCapacityMessage(capacity?: {
  limit: number | null;
  active: number;
  available: number | null;
}) {
  if (!capacity) return null;
  if (capacity.limit === null)
    return `Sua empresa possui ${count(capacity.active)} contato(s) ativo(s), sem limite de contatos. Os contatos continuam disponíveis para seleção.`;
  const remaining =
    capacity.available === null
      ? "A capacidade restante não foi informada."
      : `Há ${count(capacity.available)} vaga(s) para novos contatos.`;
  return `Capacidade da empresa: ${count(capacity.active)} de ${count(capacity.limit)} contato(s) ativo(s). ${remaining} A importação pode ser parcial se o limite for atingido. Os contatos continuam disponíveis para seleção.`;
}

export function agendaImportFeedback(result: {
  total: number;
  imported: number;
  unchanged?: number;
  limitReached?: number;
  failed?: number;
}) {
  const quota = result.limitReached ?? 0;
  const failed = result.failed ?? 0;
  const unchanged = result.unchanged ?? 0;
  const partial = quota > 0 || failed > 0 || result.imported + unchanged < result.total;
  const details = [`${count(result.imported)} de ${count(result.total)} contato(s) importado(s).`];
  if (unchanged > 0)
    details.push(`${count(unchanged)} contato(s) já vinculado(s), sem alterações necessárias.`);
  if (quota > 0)
    details.push(
      `${count(quota)} contato(s) não importado(s) por atingir o limite de contatos da empresa.`,
    );
  if (failed > 0) details.push(`${count(failed)} contato(s) não importado(s) por outras falhas.`);
  if (partial && quota === 0 && failed === 0)
    details.push("O motivo dos contatos não importados não foi informado.");
  return {
    partial,
    title: partial ? "Importação parcial" : "Importação concluída",
    description: details.join(" "),
  };
}
