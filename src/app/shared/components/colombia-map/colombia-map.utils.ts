/** Mayúsculas, sin tildes, sin puntuación, espacios colapsados — para casar nombres de depto sin importar el formato del backend. */
export function normalizeDeptName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Casa un nombre normalizado de backend contra las keys del croquis (match exacto o por inclusión, para Bogotá D.C. / San Andrés y similares). */
export function matchDeptKey(normalizedName: string, keys: string[]): string | undefined {
  if (keys.includes(normalizedName)) return normalizedName;
  return keys.find(k => k.includes(normalizedName) || normalizedName.includes(k));
}
