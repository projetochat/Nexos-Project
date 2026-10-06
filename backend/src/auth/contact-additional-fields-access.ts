import type { AuthenticatedUser } from "./auth.types";
import { sanitizeContactCustomFieldValueForOutput } from "../crm/contact-custom-field-html";

export const CONTACT_ADDITIONAL_FIELDS_READ_PERMISSION = "contacts.additional_fields.read" as const;

export function canReadContactAdditionalFields(
  current: Pick<AuthenticatedUser, "roleKey" | "permissions">,
) {
  return (
    current.roleKey === "tenant_admin" ||
    current.permissions?.includes(CONTACT_ADDITIONAL_FIELDS_READ_PERMISSION) === true
  );
}

type ContactAdditionalFieldSource = {
  tenantId: string;
  fieldId: string;
  value: string | null;
  field: {
    tenantId: string;
    label: string;
    variableKey: string;
    type: string;
    mask: string | null;
    archivedAt?: Date | string | null;
  };
};

export function projectContactAdditionalFields(
  ownerTenantId: string,
  values: ContactAdditionalFieldSource[],
  current: Pick<AuthenticatedUser, "roleKey" | "permissions">,
  options?: { serializeType?: (type: string) => string },
) {
  if (!canReadContactAdditionalFields(current)) {
    return {};
  }

  const allowedValues = values.filter(
    (item) =>
      item.tenantId === ownerTenantId &&
      item.field.tenantId === ownerTenantId &&
      item.field.archivedAt == null,
  );
  const customFieldValues = allowedValues.map((item) => ({
    fieldId: item.fieldId,
    label: item.field.label,
    variableKey: item.field.variableKey,
    type: options?.serializeType?.(item.field.type) ?? item.field.type,
    mask: item.field.mask,
    value: sanitizeContactCustomFieldValueForOutput(item.field, item.value),
  }));

  return {
    customFields: Object.fromEntries(customFieldValues.map((item) => [item.fieldId, item.value])),
    customFieldValues,
  };
}
