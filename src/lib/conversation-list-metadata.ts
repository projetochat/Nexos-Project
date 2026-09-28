type ConversationListMetadata = {
  company?: string | null;
  department?: string | null;
  legacyDepartment?: string | null;
  profile?: string | null;
  legacyProfile?: string | null;
};

export function conversationListMetadataLabel({
  company,
  department,
  legacyDepartment,
  profile,
  legacyProfile,
}: ConversationListMetadata) {
  const firstFilled = (current?: string | null, legacy?: string | null) =>
    current?.trim() || legacy?.trim() || null;
  const labels = [
    company?.trim(),
    firstFilled(department, legacyDepartment),
    firstFilled(profile, legacyProfile),
  ].filter((value): value is string => Boolean(value));

  return labels.length > 0 ? labels.join(" - ") : null;
}
