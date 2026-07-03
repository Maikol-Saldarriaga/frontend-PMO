import { Component, Input, OnInit, signal, WritableSignal, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { SocrataGeoService, LocationResult, SocrataDept, SocrataMunicipio } from '../../../../../../core/services/socrata-geo.service';
import { ContractService } from '../../../../services/contract.service';
import { ContractLocation, ContractLocationItem } from '../../../../models/contract.model';

interface DropdownRect {
  top:   number;
  left:  number;
  width: number;
}

interface RowSearch {
  term:     string;
  results:  LocationResult[];
  loading:  boolean;
  open:     boolean;
  selected: LocationResult | null;
  rect:     DropdownRect | null;
}

const emptySearch = (): RowSearch => ({
  term: '', results: [], loading: false, open: false, selected: null, rect: null,
});

/** Estado del alta manual (departamento → municipio → vereda) para ubicaciones que no aparecen en la búsqueda de la API. */
interface ManualState {
  active:           boolean;
  deptCod:          string;
  deptName:         string;
  mpioCod:          string;
  mpioName:         string;
  veredaName:       string;
  municipios:       SocrataMunicipio[];
  loadingMunicipios: boolean;
}

const emptyManual = (): ManualState => ({
  active: false, deptCod: '', deptName: '', mpioCod: '', mpioName: '', veredaName: '',
  municipios: [], loadingMunicipios: false,
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
  manuals:  WritableSignal<ManualState[]> = signal([]);
  allDepts: WritableSignal<SocrataDept[]> = signal([]);
  private timers: Record<number, ReturnType<typeof setTimeout>> = {};
  private inputRefs: Record<number, HTMLInputElement> = {};

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
    this.manuals.update(arr => [...arr, emptyManual()]);
  }

  removeRow(i: number): void {
    this.locationsArray.removeAt(i);
    this.searches.update(arr => arr.filter((_, idx) => idx !== i));
    this.manuals.update(arr => arr.filter((_, idx) => idx !== i));
  }

  /** Posiciona el dropdown con `position: fixed` anclado al input, así queda por encima de todo (no lo recorta la tarjeta ni la tabla). */
  private computeRect(el: HTMLElement): DropdownRect {
    const r = el.getBoundingClientRect();
    return { top: r.bottom + 6, left: r.left, width: Math.max(r.width, 280) };
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  repositionOpenDropdown(): void {
    const openIndex = this.searches().findIndex(s => s.open);
    if (openIndex < 0) return;
    const el = this.inputRefs[openIndex];
    if (el) this.patchSearch(openIndex, { rect: this.computeRect(el) });
  }

  onSearchInput(i: number, event: Event): void {
    const el = event.target as HTMLInputElement;
    this.inputRefs[i] = el;
    const term = el.value;
    this.patchSearch(i, { term, open: true, selected: null, rect: this.computeRect(el) });
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
    this.patchManual(i, emptyManual());
  }

  closeDropdown(i: number): void { setTimeout(() => this.patchSearch(i, { open: false }), 200); }

  private patchSearch(i: number, patch: Partial<RowSearch>): void {
    this.searches.update(arr => arr.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }

  getSearch(i: number): RowSearch { return this.searches()[i] ?? emptySearch(); }

  getManual(i: number): ManualState { return this.manuals()[i] ?? emptyManual(); }

  private patchManual(i: number, patch: Partial<ManualState>): void {
    this.manuals.update(arr => arr.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  }

  /** Solo se ofrece cuando la búsqueda en la API no encontró coincidencias: permite construir la ubicación eligiendo departamento → municipio → vereda. */
  startManualEntry(i: number): void {
    this.patchSearch(i, { open: false });
    this.patchManual(i, { ...emptyManual(), active: true });
    if (!this.allDepts().length) {
      this.geo.getDepartamentos().subscribe(depts => this.allDepts.set(depts));
    }
  }

  cancelManualEntry(i: number): void {
    this.patchManual(i, emptyManual());
  }

  onManualDeptChange(i: number, codDpto: string): void {
    const dept = this.allDepts().find(d => d.cod_dpto === codDpto);
    this.patchManual(i, {
      deptCod: codDpto, deptName: dept?.nom_dpto ?? '',
      mpioCod: '', mpioName: '', veredaName: '',
      municipios: [], loadingMunicipios: true,
    });
    this.locationsArray.at(i).get('department')?.setValue(dept?.nom_dpto ?? '');
    this.locationsArray.at(i).get('municipality')?.setValue('');
    this.locationsArray.at(i).get('sidewalk')?.setValue('');
    if (!codDpto) { this.patchManual(i, { loadingMunicipios: false }); return; }
    this.geo.getMunicipios(codDpto).subscribe({
      next: municipios => this.patchManual(i, { municipios, loadingMunicipios: false }),
      error: () => this.patchManual(i, { municipios: [], loadingMunicipios: false }),
    });
  }

  onManualMpioChange(i: number, codMpio: string): void {
    const mpio = this.getManual(i).municipios.find(m => m.cod_mpio === codMpio);
    this.patchManual(i, { mpioCod: codMpio, mpioName: mpio?.nom_mpio ?? '', veredaName: '' });
    this.locationsArray.at(i).get('municipality')?.setValue(mpio?.nom_mpio ?? '');
    this.locationsArray.at(i).get('sidewalk')?.setValue('');
  }

  /** La vereda no existe en la API en este flujo, por eso se escribe a mano en vez de elegirla de un listado. */
  onManualVeredaTextChange(i: number, value: string): void {
    this.patchManual(i, { veredaName: value });
    this.locationsArray.at(i).get('sidewalk')?.setValue(value || '');
  }

  /** El municipio/vereda ya quedaron guardados en el formulario por onManualMpioChange/onManualVeredaTextChange; aquí solo se confirma y se muestra como "seleccionado". */
  confirmManualEntry(i: number): void {
    const m = this.getManual(i);
    if (!m.mpioCod) return;
    const name = m.veredaName || m.mpioName;
    this.patchSearch(i, {
      selected: { type: m.veredaName ? 'vereda' : 'municipio', name, municipality: m.mpioName, department: m.deptName, cod: m.mpioCod },
      term: name, open: false, results: [],
    });
    this.patchManual(i, emptyManual());
  }

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
