import { Component, Input, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { SocrataGeoService, SocrataDept, SocrataMunicipio, SocrataVereda } from '../../../../../../core/services/socrata-geo.service';
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
  private geo = inject(SocrataGeoService);
  private contractSvc = inject(ContractService);

  loading     = signal(true);
  error       = signal<string | null>(null);
  departments = signal<SocrataDept[]>([]);
  municipiosMap     = signal<Record<number, SocrataMunicipio[]>>({});
  veredasMap        = signal<Record<number, SocrataVereda[]>>({});
  loadingVeredasMap = signal<Record<number, boolean>>({});

  saving      = signal(false);
  saveError   = signal<string | null>(null);
  saveSuccess = signal(false);

  private deptCodes: Record<number, string> = {};
  private mpioCodes: Record<number, string> = {};

  form = this.fb.group({
    locations: this.fb.array<FormGroup>([]),
  });

  get locationsArray(): FormArray { return this.form.get('locations') as FormArray; }

  ngOnInit(): void {
    this.contractSvc.getLocations(this.projectId).subscribe({
      next: saved => {
        this.geo.getDepartamentos().subscribe({
          next: depts => {
            this.departments.set(depts);
            this.initRows(saved ?? []);
            this.loading.set(false);
          },
          error: () => {
            this.initRows(saved ?? []);
            this.loading.set(false);
          },
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
