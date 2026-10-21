export function listOptionsFromText(value: string) {
  const options = value.split(/\r?\n/);
  return options.length ? options : [""];
}
