/** Normalize Express route params for Prisma (Express 5 types allow string[]). */
export function routeParam(value: string | string[] | undefined): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? (value[0] ?? "") : value;
}
