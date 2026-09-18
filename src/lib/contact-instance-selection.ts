import type { ApiContact, ApiContactInstanceOption } from "./trixus-api";

export function resolveConnectedContactInstances(
  contact: Pick<ApiContact, "instanceIds" | "instancia">,
  instances: ApiContactInstanceOption[],
) {
  const byKey = new Map<string, ApiContactInstanceOption>();
  for (const instance of instances) {
    for (const key of [instance.id, instance.value, instance.externalReference, instance.name]) {
      if (key) byKey.set(key, instance);
    }
  }
  const values = [...(contact.instanceIds ?? []), contact.instancia].filter(
    (value): value is string => Boolean(value),
  );
  return Array.from(
    new Map(
      values
        .map((value) => byKey.get(value))
        .filter(
          (instance): instance is ApiContactInstanceOption =>
            instance?.status?.toUpperCase() === "CONNECTED",
        )
        .map((instance) => [instance.id, instance]),
    ).values(),
  );
}
