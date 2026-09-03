import { RubroPickerGroup } from '../../../shared/components/rubro-picker/rubro-picker.component';
import { BudgetItemActivity, BudgetMonthlyDistribution } from '../models/project.model';

/** Info de rubro resuelta desde getBudgetWizard — componente técnico + actividades amarradas,
 * más sus distribuciones mensuales para calcular el presupuestado del mes elegido. Mismo shape
 * que RubroInfo en egresos-list.component.ts (duplicado aquí a propósito para no crear un
 * acoplamiento circular entre el componente y este util — son estructuralmente compatibles). */
export interface RubroPickerRubroInfo {
  id: string;
  concept: string;
  technicalComponentName: string;
  monthlyDistributions: BudgetMonthlyDistribution[];
  activities?: BudgetItemActivity[];
}

/** Agrupa los rubros por componente técnico y calcula presupuestado/ejecutado del mes indicado
 * (monthKey en formato "YYYY-MM", o null si aún no hay una fecha elegida — en ese caso el
 * presupuestado/ejecutado del mes queda en 0, igual que el comportamiento previo del formulario
 * individual). Extraído de egresos-list.component.ts para reutilizarse también en la vista
 * previa de "Importar auxiliares", donde cada fila tiene su propia fecha y por lo tanto su
 * propio mes de referencia. */
export function buildRubroPickerGroups(
  rubroInfos: RubroPickerRubroInfo[],
  executionsMonthlySummary: Record<string, Record<string, number>>,
  monthKey: string | null,
): RubroPickerGroup[] {
  const byComponent = new Map<string, RubroPickerGroup>();

  for (const info of rubroInfos) {
    const key = info.technicalComponentName;
    if (!byComponent.has(key)) byComponent.set(key, { technicalComponentName: key, items: [] });

    const dist = monthKey
      ? info.monthlyDistributions.find(d => `${d.year}-${String(d.month).padStart(2, '0')}` === monthKey)
      : undefined;
    const presupuestadoMes = (dist?.counterpart_amount ?? 0) + (dist?.ally_amount ?? 0);
    const ejecutadoMes = monthKey ? (executionsMonthlySummary[info.id]?.[monthKey] ?? 0) : 0;

    byComponent.get(key)!.items.push({ budgetItemId: info.id, concept: info.concept, presupuestadoMes, ejecutadoMes });
  }
  return [...byComponent.values()];
}
