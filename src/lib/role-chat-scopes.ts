export type RoleChatScope = {
  connectionId: string;
  departmentIds: string[];
  favoriteDepartmentId: string | null;
};

export type RoleScopeConnectionCatalog = {
  id: string;
  departments: Array<{ id: string }>;
};

export function reconcileRoleChatScopes(
  scopes: readonly RoleChatScope[],
  connections: readonly RoleScopeConnectionCatalog[],
): RoleChatScope[] {
  const departmentsByConnection = new Map(
    connections.map((connection) => [
      connection.id,
      new Set(connection.departments.map((department) => department.id)),
    ]),
  );
  const reconciled = new Map<string, RoleChatScope>();

  for (const scope of scopes) {
    const allowedDepartments = departmentsByConnection.get(scope.connectionId);
    if (!allowedDepartments) continue;
    const current = reconciled.get(scope.connectionId);
    const departmentIds = [
      ...new Set([
        ...(current?.departmentIds ?? []),
        ...scope.departmentIds.filter((departmentId) => allowedDepartments.has(departmentId)),
      ]),
    ];
    if (departmentIds.length === 0) continue;
    const requestedFavorite = current?.favoriteDepartmentId ?? scope.favoriteDepartmentId;
    reconciled.set(scope.connectionId, {
      connectionId: scope.connectionId,
      departmentIds,
      favoriteDepartmentId:
        requestedFavorite && departmentIds.includes(requestedFavorite) ? requestedFavorite : null,
    });
  }

  return [...reconciled.values()];
}
