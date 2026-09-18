// The customer-facing reference is independent of the provider's immutable instance key.
export function connectionReference(connection: {
  id: string;
  tenantId: string;
  ownerPhoneNormalized?: string | null;
}) {
  const phone = connection.ownerPhoneNormalized?.replace(/\D/g, "");
  return [connection.tenantId.slice(0, 8), phone, connection.id.slice(0, 8)]
    .filter(Boolean)
    .join("-");
}
