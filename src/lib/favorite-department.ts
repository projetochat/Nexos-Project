export type DepartmentScopeOption = {
  id: string;
  connectionIds: string[];
  favoriteConnectionIds?: string[];
};

export function departmentsForConnection<T extends DepartmentScopeOption>(
  departments: readonly T[],
  connectionId: string | null | undefined,
) {
  if (!connectionId) return [];
  return departments.filter((department) => department.connectionIds.includes(connectionId));
}

export function favoriteDepartmentForConnection<T extends DepartmentScopeOption>(
  departments: readonly T[],
  connectionId: string | null | undefined,
) {
  if (!connectionId) return null;
  return (
    departmentsForConnection(departments, connectionId).find((department) =>
      department.favoriteConnectionIds?.includes(connectionId),
    ) ?? null
  );
}
