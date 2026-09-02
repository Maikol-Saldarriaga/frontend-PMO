import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { COLOMBIA_DEPT_SHAPES, COLOMBIA_VIEWBOX } from './colombia-dept-shapes';
import { DeptImpact } from './colombia-map.types';
import { normalizeDeptName, matchDeptKey } from './colombia-map.utils';

interface RenderDept {
  key: string;
  label: string;
  d: string;
  count: number;
  fill: string;
}

const DEPT_KEYS = COLOMBIA_DEPT_SHAPES.map(s => s.key);
const EMPTY_FILL = '#E5E7EB';
const SCALE_FILL = ['#BAE6FD', '#7DD3FC', '#38BDF8', '#0EA5E9', '#0284C7', '#075985'];

@Component({
  selector: 'app-colombia-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './colombia-map.component.html',
})
export class ColombiaMapComponent {
  @Input() set impacts(value: DeptImpact[] | null | undefined) {
    this._impacts.set(value ?? []);
  }

  private _impacts = signal<DeptImpact[]>([]);
  hovered = signal<string | null>(null);

  readonly viewBox = COLOMBIA_VIEWBOX;

  private countsByKey = computed(() => {
    const map = new Map<string, number>();
    for (const impact of this._impacts()) {
      if (!impact.department) continue;
      const norm = normalizeDeptName(impact.department);
      const key = matchDeptKey(norm, DEPT_KEYS);
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + impact.count);
    }
    return map;
  });

  readonly maxCount = computed(() => Math.max(0, ...this.countsByKey().values()));

  readonly depts = computed<RenderDept[]>(() => {
    const counts = this.countsByKey();
    const max = this.maxCount();
    return COLOMBIA_DEPT_SHAPES.map(shape => {
      const count = counts.get(shape.key) ?? 0;
      return { key: shape.key, label: shape.label, d: shape.d, count, fill: this.fillFor(count, max) };
    });
  });

  readonly rankedDepts = computed<RenderDept[]>(() =>
    this.depts().filter(d => d.count > 0).sort((a, b) => b.count - a.count)
  );

  readonly hasImpacts = computed(() => this.rankedDepts().length > 0);

  private fillFor(count: number, max: number): string {
    if (count <= 0 || max <= 0) return EMPTY_FILL;
    const ratio = count / max;
    const idx = Math.min(SCALE_FILL.length - 1, Math.floor(ratio * (SCALE_FILL.length - 1) + 0.0001));
    return SCALE_FILL[idx];
  }

  onEnter(key: string): void { this.hovered.set(key); }
  onLeave(): void { this.hovered.set(null); }

  hoveredDept(): RenderDept | undefined {
    const key = this.hovered();
    return key ? this.depts().find(d => d.key === key) : undefined;
  }
}
