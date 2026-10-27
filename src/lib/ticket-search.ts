export function validateTicketSearch(search: Record<string, unknown>) {
  return {
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
    ticketId: typeof search.ticketId === "string" ? search.ticketId : undefined,
    aiExecutionId: typeof search.aiExecutionId === "string" ? search.aiExecutionId : undefined,
  };
}

export type TicketSearch = ReturnType<typeof validateTicketSearch>;
