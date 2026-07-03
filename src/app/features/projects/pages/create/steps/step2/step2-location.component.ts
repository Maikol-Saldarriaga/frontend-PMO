import { Component, Input, Output, EventEmitter, OnInit, signal, WritableSignal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { SocrataGeoService, LocationResult } from '../../../../../../core/services/socrata-geo.service';
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
  selector: 'app-step2-location',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './step2-location.component.html',
})
export class Step2LocationComponent implements OnInit {
  @Input() savedLocations?: ContractLocationItem[];
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ContractLocation[]>();
  @Output() dataChange      = new EventEmitter<ContractLocation[]>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  private fb  = inject(FormBuilder);
  private geo = inject(SocrataGeoService);

  searches: WritableSignal<RowSearch[]> = signal([]);
  private timers: Record<number, ReturnType<typeof setTimeout>> = {};

  form = this.fb.group({ locations: this.fb.array<FormGroup>([]) });
  get locationsArray(): FormArray { return this.form.get('locations') as FormArray; }

  ngOnInit(): void {
    if (this.savedLocations?.length) {
      this.savedLocations.forEach(loc => this.addRow(loc));
    } else {
      this.addRow();
    }
    this.form.valueChanges.subscribe(() => this.dataChange.emit(this.buildPayload()));
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
      // Reconstruct a display label for saved data
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
    this.dataChange.emit(this.buildPayload());
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

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const missing: string[] = [];
      this.locationsArray.controls.forEach((grp, i) => {
        if ((grp as FormGroup).get('municipality')?.invalid)
          missing.push(`Ubicación ${i + 1}: Municipio`);
      });
      this.validationError.emit(missing);
      return;
    }
    this.submitted.emit(this.buildPayload());
  }
}
