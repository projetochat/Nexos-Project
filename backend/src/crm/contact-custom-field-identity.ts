import {
  canonicalContactFieldVariableKey,
  NATIVE_CONTACT_FIELD_NAMES,
  NATIVE_RESERVED_VARIABLE_KEYS,
  normalizeCanonicalContactFieldName,
} from "./contact-custom-field-catalog";

export {
  NATIVE_CONTACT_FIELD_NAMES,
  NATIVE_MESSAGE_VARIABLE_KEYS,
  NATIVE_RESERVED_VARIABLE_KEYS,
} from "./contact-custom-field-catalog";

const NATIVE_KEY_SET = new Set<string>(NATIVE_RESERVED_VARIABLE_KEYS);
const NATIVE_NAME_SET = new Set<string>(NATIVE_CONTACT_FIELD_NAMES);

export function normalizeContactCustomFieldName(value: string) {
  return normalizeCanonicalContactFieldName(value);
}

export function contactCustomFieldVariableKey(value: string) {
  return canonicalContactFieldVariableKey(value);
}

export function isNativeMessageVariableKey(value: string) {
  return NATIVE_KEY_SET.has(value);
}

export function isNativeContactFieldName(value: string) {
  return NATIVE_NAME_SET.has(normalizeContactCustomFieldName(value));
}
