import { Component, Input, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { ColombiaApiService, ColombiaDepartment, ColombiaCity } from '../../../../../../core/services/colombia-api.service';
import { ContractService } from '../../../../services/contract.service';
import { ContractLocation, ContractLocationItem } from '../../../../models/contract.model';

@Component({
  selector: 'app-tab-ubicaciones',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './tab-ubicaciones.component.html',
})
export class TabUbicacionesComponent implements OnInit {
  @Input() projectId!: string;

  private fb  = inject(FormBuilder);
  private api = inject(ColombiaApiService);
  private contractSvc = inject(ContractService);

  loading       = signal(true);
  error         = signal<string | null>(null);
  departments   = signal<ColombiaDepartment[]>([]);
  citiesMap     = signal<Record<number, ColombiaCity[]>>({});

  saving      = signal(false);
  saveError   = signal<string | null>(null);
  saveSuccess = signal(false);

  form = this.fb.group({
    locations: this.fb.array<FormGroup>([]),
  });

  get locationsArray(): FormArray { return this.form.get('locations') as FormArray; }

  ngOnInit(): void {
    this.contractSvc.getLocations(this.projectId).subscribe({
      next: saved => {
        this.api.getDepartments().subscribe({
          next: depts => { this.departments.set(depts); this.initRows(saved ?? []); this.loading.set(false); },
          error: () => { this.initRows(saved ?? []); this.loading.set(false); },
        });
      },
      error: () => {
        this.error.set('No se pudieron cargar las ubicaciones del proyecto.');
        this.loading.set(false);
      },
    });
  }

  private initRows(saved: ContractLocationItem[]): void {
    if (saved.length) {
      saved.forEach(loc => this.addRow(loc));
    } else {
      this.addRow();
    }
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

  save(): void {
    this.form.markAllAsTouched();
    this.saveSuccess.set(false);
    if (this.form.invalid) {
      this.saveError.set('Completa departamento y municipio en todas las ubicaciones.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    this.contractSvc.updateLocations(this.projectId, { locations: this.buildPayload() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saveSuccess.set(true);
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'No se pudieron guardar las ubicaciones.');
      },
    });
  }
}
