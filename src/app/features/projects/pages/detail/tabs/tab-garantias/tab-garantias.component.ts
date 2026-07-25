import { Component, Input, OnInit, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { Guarantee, GuaranteeRequest, GuaranteeType, GUARANTEE_TYPES } from '../../../../models/project.model';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';

interface GuaranteeRow {
  id?:         string;
  type:        GuaranteeType;
  description: string;
  percentage:  number | null;
  duration:    number | null;
  editing:     boolean;
  saving:      boolean;
  error:       string | null;
}

const EMPTY = (): GuaranteeRow => ({
  type: 'cumplimiento_de_contrato', description: '', percentage: null, duration: null,
  editing: true, saving: false, error: null,
});

@Component({
  selector: 'app-tab-garantias',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-garantias.component.html',
})
export class TabGarantiasComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ProjectService, private confirmDialog: ConfirmDialogService) {}

  readonly guaranteeTypes = GUARANTEE_TYPES;

  rows: WritableSignal<GuaranteeRow[]> = signal([]);
  loading = signal(true);
  error   = signal<string | null>(null);
  adding  = signal(false);
  newRow: GuaranteeRow = EMPTY();

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getGuarantees(this.projectId).subscribe({
      next: (list: Guarantee[]) => {
        this.rows.set(list.map(g => this.toRow(g)));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar las garantías.');
        this.loading.set(false);
      },
    });
  }

  private toRow(g: Guarantee): GuaranteeRow {
    return {
      id: g.id, type: g.type, description: g.description ?? '',
      percentage: g.percentage, duration: g.duration,
      editing: false, saving: false, error: null,
    };
  }

  typeLabel(type: GuaranteeType): string {
    return this.guaranteeTypes.find(t => t.value === type)?.label ?? type;
  }

  startAdd(): void {
    this.newRow = EMPTY();
    this.adding.set(true);
  }

  cancelAdd(): void { this.adding.set(false); }

  saveAdd(): void {
    if (this.newRow.saving) return;
    this.newRow.saving = true;
    this.newRow.error = null;
    const payload: GuaranteeRequest = {
      type: this.newRow.type,
      description: this.newRow.description.trim() || null,
      percentage: this.newRow.percentage,
      duration: this.newRow.duration,
    };
    this.svc.createGuarantee(this.projectId, payload).subscribe({
      next: g => {
        this.rows.update(r => [...r, this.toRow(g)]);
        this.adding.set(false);
      },
      error: err => {
        this.newRow.saving = false;
        this.newRow.error = err?.error?.error ?? err?.error?.message ?? 'Error al crear la garantía.';
      },
    });
  }

  startEdit(row: GuaranteeRow): void { row.editing = true; row.error = null; }

  /** Descarta cambios sin guardar recargando la lista completa desde el servidor —
   * el dataset es pequeño (unas pocas garantías por proyecto), así que no vale la pena
   * llevar un snapshot local de "antes de editar" fila por fila. */
  cancelEdit(): void { this.load(); }

  saveEdit(row: GuaranteeRow): void {
    if (!row.id || row.saving) return;
    row.saving = true;
    row.error = null;
    const payload: GuaranteeRequest = {
      type: row.type,
      description: row.description.trim() || null,
      percentage: row.percentage,
      duration: row.duration,
    };
    this.svc.updateGuarantee(this.projectId, row.id, payload).subscribe({
      next: g => {
        this.rows.update(rows => rows.map(r => r.id === g.id ? this.toRow(g) : r));
      },
      error: err => {
        row.saving = false;
        row.error = err?.error?.error ?? err?.error?.message ?? 'Error al actualizar la garantía.';
      },
    });
  }

  async deleteRow(row: GuaranteeRow): Promise<void> {
    if (!row.id) return;
    if (!(await this.confirmDialog.confirm({ message: `¿Eliminar la garantía "${this.typeLabel(row.type)}"?` }))) return;
    this.svc.deleteGuarantee(this.projectId, row.id).subscribe({
      next: () => this.rows.update(rows => rows.filter(r => r.id !== row.id)),
      error: () => this.error.set('Error al eliminar la garantía.'),
    });
  }

  trackByRow(_: number, r: GuaranteeRow) { return r.id ?? _; }
}
