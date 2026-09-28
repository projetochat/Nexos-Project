export type PermissionTreeGroup = {
  title: string;
  items: ReadonlyArray<{ id: string }>;
};

export type PermissionSelectionResult = {
  permissionIds: string[];
  blockedReason?: string;
};

const unique = (ids: readonly string[]) => Array.from(new Set(ids));

function groupParentId(group: PermissionTreeGroup) {
  return group.items[0]?.id;
}

function blockedByAuthority(group: PermissionTreeGroup) {
  return `Você não pode alterar todas as permissões de ${group.title}.`;
}

function blockedByProtectedChild(group: PermissionTreeGroup) {
  return `Não é possível desativar Ver em ${group.title}, pois o perfil possui uma permissão que você não pode remover.`;
}

export function togglePermissionInTree({
  selectedIds,
  permissionId,
  checked,
  group,
  grantablePermissionIds,
}: {
  selectedIds: readonly string[];
  permissionId: string;
  checked: boolean;
  group: PermissionTreeGroup;
  grantablePermissionIds: readonly string[];
}): PermissionSelectionResult {
  const selected = new Set(selectedIds);
  const grantable = new Set(grantablePermissionIds);
  const parentId = groupParentId(group);
  const childIds = group.items.slice(1).map((item) => item.id);

  if (!grantable.has(permissionId)) {
    return { permissionIds: [...selectedIds], blockedReason: blockedByAuthority(group) };
  }

  if (permissionId === parentId) {
    if (checked) selected.add(permissionId);
    else {
      const protectedSelectedChild = childIds.some(
        (childId) => selected.has(childId) && !grantable.has(childId),
      );
      if (protectedSelectedChild) {
        return { permissionIds: [...selectedIds], blockedReason: blockedByProtectedChild(group) };
      }
      selected.delete(permissionId);
      childIds.forEach((childId) => {
        if (grantable.has(childId)) selected.delete(childId);
      });
    }
    return { permissionIds: [...selected] };
  }

  if (checked && parentId && !selected.has(parentId)) {
    return {
      permissionIds: [...selectedIds],
      blockedReason: `Ative Ver em ${group.title} antes de liberar esta opção.`,
    };
  }

  if (checked) selected.add(permissionId);
  else selected.delete(permissionId);
  return { permissionIds: [...selected] };
}

export function togglePermissionGroupInTree({
  selectedIds,
  checked,
  group,
  grantablePermissionIds,
}: {
  selectedIds: readonly string[];
  checked: boolean;
  group: PermissionTreeGroup;
  grantablePermissionIds: readonly string[];
}): PermissionSelectionResult {
  const parentId = groupParentId(group);
  const selected = new Set(selectedIds);
  const grantable = new Set(grantablePermissionIds);
  const groupIds = group.items.map((item) => item.id);

  if (!parentId || (!selected.has(parentId) && !grantable.has(parentId))) {
    return { permissionIds: [...selectedIds], blockedReason: blockedByAuthority(group) };
  }

  if (!checked) {
    const protectedSelectedChild = groupIds
      .slice(1)
      .some((permissionId) => selected.has(permissionId) && !grantable.has(permissionId));
    if (grantable.has(parentId) && protectedSelectedChild) {
      return { permissionIds: [...selectedIds], blockedReason: blockedByProtectedChild(group) };
    }
    groupIds.forEach((permissionId) => {
      if (grantable.has(permissionId)) selected.delete(permissionId);
    });
    return { permissionIds: [...selected] };
  }

  if (!selected.has(parentId)) selected.add(parentId);
  groupIds.slice(1).forEach((permissionId) => {
    if (grantable.has(permissionId)) selected.add(permissionId);
  });
  return { permissionIds: [...selected] };
}

export function delegatedPermissionIds({
  selectedIds,
  originalIds,
  grantablePermissionIds,
}: {
  selectedIds: readonly string[];
  originalIds: readonly string[];
  grantablePermissionIds: readonly string[];
}) {
  const grantable = new Set(grantablePermissionIds);
  return unique([
    ...selectedIds.filter((permissionId) => grantable.has(permissionId)),
    ...originalIds.filter((permissionId) => !grantable.has(permissionId)),
  ]);
}

export function permissionDependencyIssue(
  selectedIds: readonly string[],
  groups: readonly PermissionTreeGroup[],
) {
  const selected = new Set(selectedIds);
  for (const group of groups) {
    const parentId = groupParentId(group);
    if (!parentId || selected.has(parentId)) continue;
    if (group.items.slice(1).some((item) => selected.has(item.id))) {
      return `Ative Ver em ${group.title} ou remova as opções dependentes antes de salvar.`;
    }
  }
  return undefined;
}
