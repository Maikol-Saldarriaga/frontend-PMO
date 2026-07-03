import { Component, Input, OnInit, signal, WritableSignal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { SocrataGeoService, LocationResult } from '../../../../../../core/services/socrata-geo.service';
import { ContractService } from '../../../../services/contract.service';
import { ContractLocation, ContractLocationItem } from '../../../../models/contract.model';

interface RowSearch {
  term:     string;
  results:  LocationResult[];
  loading:  boolean;
  open:     boolean;
  selected: LocationResult | null;
}

const emptySearch = (): RowSearch => ({
  term: '', results: [], loading: false, open: false, selected: null,
});

@Component({
  selector: 'app-tab-ubicaciones',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './tab-ubicaciones.component.html',
})
export class TabUbicacionesComponent implements OnInit {
  @Input() projectId!: string;

  private fb  = inject(FormBuilder);
  private geo = inject(SocrataGeoService);
  private contractSvc = inject(ContractService);

  loading     = signal(true);
  error       = signal<string | null>(null);
  saving      = signal(false);
  saveError   = signal<string | null>(null);
  saveSuccess = signal(false);

  searches: WritableSignal<RowSearch[]> = signal([]);
  private timers: Record<number, ReturnType<typeof setTimeout>> = {};

  form = this.fb.group({ locations: this.fb.array<FormGroup>([]) });
  get locationsArray(): FormArray { return this.form.get('locations') as FormArray; }

  ngOnInit(): void {
    this.contractSvc.getLocations(this.projectId).subscribe({
      next: saved => {
        if (saved?.length) {
          saved.forEach(loc => this.addRow(loc));
        } else {
          this.addRow();
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar las ubicaciones del proyecto.');
        this.loading.set(false);
      },
    });
  }

  private newRow(loc?: Partial<ContractLocationItem>): FormGroup {
    return this.fb.group({
      country:      [loc?.country      ?? 'Colombia', Validators.required],
      department:   [loc?.department   ?? ''],
      municipality: [loc?.municipality ?? '', Validators.required],
      sidewalk:     [loc?.sidewalk     ?? ''],
      details:      [loc?.details      ?? ''],
    });
  }

  addRow(loc?: Partial<ContractLocationItem>): void {
    this.locationsArray.push(this.newRow(loc));
    const s = emptySearch();
    if (loc?.municipality) {
      const label = loc.sidewalk ? loc.sidewalk : loc.municipality;
      s.term = label ?? '';
      s.selected = {
        type:        loc.sidewalk ? 'vereda' : 'municipio',
        name:        label ?? '',
        municipality: loc.municipality ?? '',
        department:  loc.department ?? '',
        cod:         '',
      };
    }
    this.searches.update(arr => [...arr, s]);
  }

  removeRow(i: number): void {
    this.locationsArray.removeAt(i);
    this.searches.update(arr => arr.filter((_, idx) => idx !== i));
  }

  onSearchInput(i: number, event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.patchSearch(i, { term, open: true, selected: null });
    this.locationsArray.at(i).get('municipality')?.setValue('', { emitEvent: false });
    this.locationsArray.at(i).get('department')?.setValue('', { emitEvent: false });
    this.locationsArray.at(i).get('sidewalk')?.setValue('', { emitEvent: false });
    clearTimeout(this.timers[i]);
    if (term.length < 2) { this.patchSearch(i, { results: [], loading: false }); return; }
    this.patchSearch(i, { loading: true });
    this.timers[i] = setTimeout(() => {
      this.geo.searchAll(term).subscribe({
        next: r => this.patchSearch(i, { results: r, loading: false, open: true }),
        error: () => this.patchSearch(i, { results: [], loading: false }),
      });
    }, 350);
  }

  selectResult(i: number, r: LocationResult): void {
    const row = this.locationsArray.at(i);
    row.get('municipality')?.setValue(r.municipality);
    row.get('department')?.setValue(r.department);
    row.get('sidewalk')?.setValue(r.type === 'vereda' ? r.name : '');
    this.patchSearch(i, { selected: r, term: r.name, open: false, results: [] });
  }

  clearSelection(i: number): void {
    const row = this.locationsArray.at(i);
    row.get('municipality')?.setValue('');
    row.get('department')?.setValue('');
    row.get('sidewalk')?.setValue('');
    this.patchSearch(i, emptySearch());
  }

  closeDropdown(i: number): void { setTimeout(() => this.patchSearch(i, { open: false }), 200); }

  private patchSearch(i: number, patch: Partial<RowSearch>): void {
    this.searches.update(arr => arr.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }

  getSearch(i: number): RowSearch { return this.searches()[i] ?? emptySearch(); }

  isInvalid(group: FormGroup, field: string): boolean {
    const ctrl = group.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  private buildPayload(): ContractLocation[] {
    return this.locationsArray.controls.map(c => {
      const v = c.getRawValue();
      return { country: v.country, department: v.department, municipality: v.municipality, sidewalk: v.sidewalk || null, details: v.details || null };
    });
  }

  save(): void {
    this.form.markAllAsTouched();
    this.saveSuccess.set(false);
    if (this.form.invalid) {
      this.saveError.set('Selecciona un municipio o vereda en todas las ubicaciones.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.contractSvc.updateLocations(this.projectId, { locations: this.buildPayload() }).subscribe({
      next: () => { this.saving.set(false); this.saveSuccess.set(true); },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'No se pudieron guardar las ubicaciones.');
      },
    });
  }
}
