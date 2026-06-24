import { Component, Input, Output, EventEmitter, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { SocrataGeoService, SocrataDept, SocrataMunicipio, SocrataVereda } from '../../../../../../core/services/socrata-geo.service';
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
  private geo = inject(SocrataGeoService);

  departments     = signal<SocrataDept[]>([]);
  municipiosMap   = signal<Record<number, SocrataMunicipio[]>>({});
  veredasMap      = signal<Record<number, SocrataVereda[]>>({});
  loadingVeredasMap = signal<Record<number, boolean>>({});
  loadingDepts    = signal(true);

  private deptCodes: Record<number, string> = {};
  private mpioCodes: Record<number, string> = {};

  form = this.fb.group({
    locations: this.fb.array<FormGroup>([]),
  });

  get locationsArray(): FormArray { return this.form.get('locations') as FormArray; }

  ngOnInit(): void {
    this.geo.getDepartamentos().subscribe({
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

    // Pre-load municipios and veredas for saved rows
    if (loc?.department) {
      const dept = this.departments().find(d => d.nom_dpto === loc.department);
      if (dept) {
        this.deptCodes[idx] = dept.cod_dpto;
        this.geo.getMunicipios(dept.cod_dpto).subscribe(mpios => {
          this.municipiosMap.update(m => ({ ...m, [idx]: mpios }));
          if (loc.municipality) {
            const mpio = mpios.find(m => m.nom_mpio === loc.municipality);
            if (mpio) {
              this.mpioCodes[idx] = mpio.cod_mpio;
              this.loadVeredas(mpio.cod_mpio, idx);
            }
          }
        });
      }
    }

    row.get('department')?.valueChanges.subscribe(deptName => {
      const dept = this.departments().find(d => d.nom_dpto === deptName);
      row.get('municipality')?.setValue('');
      row.get('sidewalk')?.setValue('');
      this.municipiosMap.update(m => ({ ...m, [idx]: [] }));
      this.veredasMap.update(v => ({ ...v, [idx]: [] }));
      if (dept) {
        this.deptCodes[idx] = dept.cod_dpto;
        this.geo.getMunicipios(dept.cod_dpto).subscribe(mpios => {
          this.municipiosMap.update(m => ({ ...m, [idx]: mpios }));
        });
      }
    });

    row.get('municipality')?.valueChanges.subscribe(mpioName => {
      row.get('sidewalk')?.setValue('');
      this.veredasMap.update(v => ({ ...v, [idx]: [] }));
      const mpios = this.municipiosMap()[idx] ?? [];
      const mpio = mpios.find(m => m.nom_mpio === mpioName);
      if (mpio) {
        this.mpioCodes[idx] = mpio.cod_mpio;
        this.loadVeredas(mpio.cod_mpio, idx);
      }
    });
  }

  removeRow(index: number): void {
    this.locationsArray.removeAt(index);
    this.dataChange.emit(this.buildPayload());
  }

  private loadVeredas(codMpio: string, rowIndex: number): void {
    this.loadingVeredasMap.update(m => ({ ...m, [rowIndex]: true }));
    this.geo.getVeredas(codMpio).subscribe({
      next: veredas => {
        this.veredasMap.update(v => ({ ...v, [rowIndex]: veredas }));
        this.loadingVeredasMap.update(m => ({ ...m, [rowIndex]: false }));
      },
      error: () => this.loadingVeredasMap.update(m => ({ ...m, [rowIndex]: false })),
    });
  }

  getMunicipios(rowIndex: number): SocrataMunicipio[] { return this.municipiosMap()[rowIndex] ?? []; }
  getVeredas(rowIndex: number): SocrataVereda[]       { return this.veredasMap()[rowIndex]    ?? []; }
  isLoadingVeredas(rowIndex: number): boolean         { return this.loadingVeredasMap()[rowIndex] ?? false; }

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
        const g = grp as FormGroup;
        if (g.get('department')?.invalid)   missing.push(`Ubicación ${i + 1}: Departamento`);
        if (g.get('municipality')?.invalid) missing.push(`Ubicación ${i + 1}: Municipio`);
      });
      this.validationError.emit(missing);
      return;
    }
    this.submitted.emit(this.buildPayload());
  }
}
