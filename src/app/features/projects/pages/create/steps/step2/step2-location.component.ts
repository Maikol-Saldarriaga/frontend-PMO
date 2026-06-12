import { Component, Input, Output, EventEmitter, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { ColombiaApiService, ColombiaDepartment, ColombiaCity } from '../../../../../../core/services/colombia-api.service';
import { ContractLocation, ContractLocationItem } from '../../../../models/contract.model';

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
  private api = inject(ColombiaApiService);

  departments   = signal<ColombiaDepartment[]>([]);
  citiesMap     = signal<Record<number, ColombiaCity[]>>({});
  loadingDepts  = signal(true);

  form = this.fb.group({
    locations: this.fb.array<FormGroup>([]),
  });

  get locationsArray(): FormArray { return this.form.get('locations') as FormArray; }

  ngOnInit(): void {
    this.api.getDepartments().subscribe({
      next: depts => {
        this.departments.set(depts);
        this.loadingDepts.set(false);
        this.initRows();
      },
      error: () => {
        this.loadingDepts.set(false);
        this.initRows();
      },
    });
  }

  private initRows(): void {
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
      department:   [loc?.department   ?? '',          Validators.required],
      municipality: [loc?.municipality ?? '',          Validators.required],
      sidewalk:     [loc?.sidewalk     ?? ''],
      details:      [loc?.details      ?? ''],
    });
  }

  addRow(loc?: Partial<ContractLocationItem>): void {
    const row = this.newRow(loc);
    this.locationsArray.push(row);
    const idx = this.locationsArray.length - 1;

    // Pre-load cities if department already set
    if (loc?.department) {
      const dept = this.departments().find(d => d.name === loc.department);
      if (dept) this.loadCities(dept.id, idx);
    }

    row.get('department')?.valueChanges.subscribe(deptName => {
      const dept = this.departments().find(d => d.name === deptName);
      row.get('municipality')?.setValue('');
      if (dept) this.loadCities(dept.id, idx);
    });
  }

  removeRow(index: number): void {
    this.locationsArray.removeAt(index);
    this.dataChange.emit(this.buildPayload());
  }

  private loadCities(deptId: number, rowIndex: number): void {
    this.api.getCities(deptId).subscribe(cities => {
      this.citiesMap.update(m => ({ ...m, [rowIndex]: cities }));
    });
  }

  getCities(rowIndex: number): ColombiaCity[] {
    return this.citiesMap()[rowIndex] ?? [];
  }

  isInvalid(group: FormGroup, field: string): boolean {
    const ctrl = group.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  private buildPayload(): ContractLocation[] {
    return this.locationsArray.controls.map(c => {
      const v = c.getRawValue();
      return {
        country:      v.country,
        department:   v.department,
        municipality: v.municipality,
        sidewalk:     v.sidewalk || null,
        details:      v.details  || null,
      };
    });
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const missing: string[] = [];
      this.locationsArray.controls.forEach((grp, i) => {
        const g = grp as import('@angular/forms').FormGroup;
        if (g.get('department')?.invalid)   missing.push(`Ubicación ${i + 1}: Departamento`);
        if (g.get('municipality')?.invalid) missing.push(`Ubicación ${i + 1}: Municipio`);
      });
      this.validationError.emit(missing);
      return;
    }
    this.submitted.emit(this.buildPayload());
  }
}
