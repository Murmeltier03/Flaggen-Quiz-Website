export function normalizeName(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

export function cleanDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}
