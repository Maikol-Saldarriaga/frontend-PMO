export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

/** Tooltip propio para ApexCharts (no depende del CSS default de la librería,
 * que puede romperse y dejar el hover vacío/con un solo punto). Usar vía
 * `tooltip: { custom: (...) => buildTooltip(...) }` + clase global `.pmo-tooltip`
 * definida en styles.scss. */
export function buildTooltip(title: string, rows: TooltipRow[]): string {
  const rowsHtml = rows.map(r => `
    <div class="pmo-tooltip__row">
      ${r.color ? `<span class="pmo-tooltip__dot" style="background:${r.color}"></span>` : ''}
      <span class="pmo-tooltip__label">${escapeHtml(r.label)}</span>
      <span class="pmo-tooltip__value">${escapeHtml(r.value)}</span>
    </div>`).join('');
  return `<div class="pmo-tooltip"><div class="pmo-tooltip__title">${escapeHtml(title)}</div>${rowsHtml}</div>`;
}
