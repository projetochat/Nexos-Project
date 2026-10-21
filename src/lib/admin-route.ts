export function isCurrentAdminNavRoute(pathname: string, destination: string) {
  const normalize = (value: string) => value.replace(/\/+$/, "") || "/";
  return normalize(pathname) === normalize(destination);
}
