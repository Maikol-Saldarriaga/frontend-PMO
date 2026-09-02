export interface DeptShape {
  /** Nombre de departamento normalizado (mayúsculas, sin tildes) — usar `normalizeDeptName()` para comparar. */
  key: string;
  /** Nombre para mostrar (title case). */
  label: string;
  /** Path SVG del contorno del departamento. */
  d: string;
}

export interface DeptImpact {
  /** Nombre de departamento tal como llega del backend (cualquier formato de mayúsculas/tildes). */
  department: string;
  /** Cantidad de ubicaciones del proyecto en ese departamento. */
  count: number;
}
