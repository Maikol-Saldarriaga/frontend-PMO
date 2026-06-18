import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { from, Observable } from 'rxjs';
import { concatMap, toArray, catchError } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import { ProjectService } from '../../../../services/project.service';
import {
  Beneficiary, BeneficiaryRequest, BeneficiaryDocumentType, BeneficiaryGender, BeneficiaryZoneType,
} from '../../../../models/project.model';

interface ImportRowResult {
  row: number;
  identification: string;
  status: 'created' | 'updated' | 'error';
  message?: string;
}

interface BeneficiaryForm {
  first_name:             string;
  middle_name:            string;
  first_surname:          string;
  second_surname:         string;
  type_identification:    BeneficiaryDocumentType | '';
  identification_number:  string;
  birthdate:              string;
  gender:                 BeneficiaryGender | '';
  ethnic_affiliation:     string;
  is_lgbtiq:              boolean;
  is_head_of_household:   boolean;
  is_victim:              boolean;
  profession:             string;
  type_zone:              BeneficiaryZoneType | '';
  entity:                 string;
  job_title:              string;
  phone:                  string;
  email:                  string;
  department:             string;
  municipality:           string;
  sidewalk:               string;
}

const emptyForm = (): BeneficiaryForm => ({
  first_name: '', middle_name: '', first_surname: '', second_surname: '',
  type_identification: '', identification_number: '', birthdate: '', gender: '',
  ethnic_affiliation: '', is_lgbtiq: false, is_head_of_household: false, is_victim: false,
  profession: '', type_zone: '', entity: '', job_title: '', phone: '', email: '',
  department: '', municipality: '', sidewalk: '',
});

@Component({
  selector: 'app-tab-beneficiarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-beneficiarios.component.html',
})
export class TabBeneficiariosComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ProjectService) {}

  readonly DOCUMENT_TYPES: { value: BeneficiaryDocumentType; label: string }[] = [
    { value: 'CC',  label: 'Cédula de ciudadanía' },
    { value: 'CE',  label: 'Cédula de extranjería' },
    { value: 'TI',  label: 'Tarjeta de identidad' },
    { value: 'PP',  label: 'Pasaporte' },
    { value: 'RC',  label: 'Registro civil' },
    { value: 'NIT', label: 'NIT' },
    { value: 'PEP', label: 'Permiso especial de permanencia' },
  ];

  readonly GENDER_OPTIONS: { value: BeneficiaryGender; label: string }[] = [
    { value: 'M', label: 'Masculino' },
    { value: 'F', label: 'Femenino' },
    { value: 'Otro', label: 'Otro' },
  ];

  readonly ZONE_OPTIONS: { value: BeneficiaryZoneType; label: string }[] = [
    { value: 'Urbana', label: 'Urbana' },
    { value: 'Rural', label: 'Rural' },
  ];

  beneficiaries = signal<Beneficiary[]>([]);
  loading       = signal(true);
  loadingMore   = signal(false);
  error         = signal<string | null>(null);
  nextCursor    = signal<string | null>(null);
  hasMore       = signal(false);

  search = signal('');
  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.beneficiaries();
    return this.beneficiaries().filter(b =>
      `${b.first_name} ${b.middle_name ?? ''} ${b.first_surname} ${b.second_surname ?? ''}`.toLowerCase().includes(q) ||
      b.identification_number.toLowerCase().includes(q)
    );
  });

  total = computed(() => this.beneficiaries().length);

  showForm        = signal(false);
  editingBenef     = signal<Beneficiary | null>(null);
  form: BeneficiaryForm = emptyForm();
  saving           = signal(false);
  saveError        = signal<string | null>(null);

  importing       = signal(false);
  importProgress  = signal<{ done: number; total: number } | null>(null);
  importResults   = signal<ImportRowResult[] | null>(null);
  importError     = signal<string | null>(null);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getBeneficiaries(this.projectId).subscribe({
      next: page => {
        this.beneficiaries.set(page.data ?? []);
        this.nextCursor.set(page.next_cursor);
        this.hasMore.set(page.has_more);
        this.loading.set(false);
      },
      error: () => { this.error.set('No se pudieron cargar los beneficiarios.'); this.loading.set(false); },
    });
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.svc.getBeneficiaries(this.projectId, cursor).subscribe({
      next: page => {
        this.beneficiaries.update(list => [...list, ...(page.data ?? [])]);
        this.nextCursor.set(page.next_cursor);
        this.hasMore.set(page.has_more);
        this.loadingMore.set(false);
      },
      error: () => { this.loadingMore.set(false); },
    });
  }

  openNewForm(): void {
    this.form = emptyForm();
    this.editingBenef.set(null);
    this.showForm.set(true);
    this.saveError.set(null);
  }

  openEditForm(b: Beneficiary): void {
    this.form = {
      first_name:            b.first_name,
      middle_name:           b.middle_name ?? '',
      first_surname:         b.first_surname,
      second_surname:        b.second_surname ?? '',
      type_identification:   b.type_identification,
      identification_number: b.identification_number,
      birthdate:             b.birthdate ? b.birthdate.substring(0, 10) : '',
      gender:                b.gender ?? '',
      ethnic_affiliation:    b.ethnic_affiliation ?? '',
      is_lgbtiq:             b.is_lgbtiq,
      is_head_of_household:  b.is_head_of_household,
      is_victim:             b.is_victim,
      profession:            b.profession ?? '',
      type_zone:             b.type_zone ?? '',
      entity:                b.entity ?? '',
      job_title:             b.job_title ?? '',
      phone:                 b.phone ?? '',
      email:                 b.email ?? '',
      department:            b.department ?? '',
      municipality:          b.municipality ?? '',
      sidewalk:              b.sidewalk ?? '',
    };
    this.editingBenef.set(b);
    this.showForm.set(true);
    this.saveError.set(null);
  }

  cancelForm(): void { this.showForm.set(false); this.editingBenef.set(null); this.saveError.set(null); }

  saveBeneficiary(): void {
    if (!this.form.first_name.trim())            { this.saveError.set('El primer nombre es obligatorio.'); return; }
    if (!this.form.first_surname.trim())          { this.saveError.set('El primer apellido es obligatorio.'); return; }
    if (!this.form.type_identification)           { this.saveError.set('Selecciona el tipo de identificación.'); return; }
    if (!this.form.identification_number.trim())  { this.saveError.set('El número de identificación es obligatorio.'); return; }

    const req: BeneficiaryRequest = {
      is_beneficiary:         true,
      first_name:             this.form.first_name.trim(),
      middle_name:            this.form.middle_name.trim() || null,
      first_surname:          this.form.first_surname.trim(),
      second_surname:         this.form.second_surname.trim() || null,
      type_identification:    this.form.type_identification,
      identification_number:  this.form.identification_number.trim(),
      birthdate:              this.form.birthdate ? `${this.form.birthdate}T00:00:00Z` : null,
      gender:                 this.form.gender || null,
      ethnic_affiliation:     this.form.ethnic_affiliation.trim() || null,
      is_lgbtiq:              this.form.is_lgbtiq,
      is_head_of_household:   this.form.is_head_of_household,
      is_victim:              this.form.is_victim,
      profession:             this.form.profession.trim() || null,
      type_zone:              this.form.type_zone || null,
      entity:                 this.form.entity.trim() || null,
      job_title:              this.form.job_title.trim() || null,
      phone:                  this.form.phone.trim() || null,
      email:                  this.form.email.trim() || null,
      department:             this.form.department.trim() || null,
      municipality:           this.form.municipality.trim() || null,
      sidewalk:               this.form.sidewalk.trim() || null,
    };

    this.saving.set(true);
    this.saveError.set(null);

    const editing = this.editingBenef();
    const request$ = editing
      ? this.svc.updateBeneficiary(this.projectId, editing.id, req)
      : this.svc.createBeneficiary(this.projectId, req);

    request$.subscribe({
      next: saved => {
        this.beneficiaries.update(list => {
          const idx = list.findIndex(b => b.id === saved.id);
          return idx >= 0 ? list.map((b, i) => i === idx ? saved : b) : [saved, ...list];
        });
        this.showForm.set(false);
        this.editingBenef.set(null);
        this.saving.set(false);
      },
      error: err => {
        this.saveError.set(err?.error?.message ?? 'Error al guardar el beneficiario.');
        this.saving.set(false);
      },
    });
  }

  deleteBeneficiary(b: Beneficiary): void {
    this.svc.deleteBeneficiary(this.projectId, b.id).subscribe({
      next: () => this.beneficiaries.update(list => list.filter(x => x.id !== b.id)),
      error: () => this.error.set('No se pudo eliminar el beneficiario.'),
    });
  }

  fullName(b: Beneficiary): string {
    return [b.first_name, b.middle_name, b.first_surname, b.second_surname].filter(Boolean).join(' ');
  }

  docTypeLabel(t: BeneficiaryDocumentType): string {
    return this.DOCUMENT_TYPES.find(o => o.value === t)?.label ?? t;
  }

  trackByBeneficiary(_: number, b: Beneficiary) { return b.id; }

  // ── Importar desde Excel ──────────────────────────────────────────────────

  onExcelSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.importError.set(null);
    this.importResults.set(null);
    this.importing.set(true);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result as ArrayBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, range: 5, defval: '' });
        const parsed = this.parseExcelRows(rows);
        if (parsed.length === 0) {
          this.importError.set('No se encontraron filas con datos a partir de B6.');
          this.importing.set(false);
          return;
        }
        this.runImport(parsed);
      } catch {
        this.importError.set('No se pudo leer el archivo. Verifica que sea un Excel válido.');
        this.importing.set(false);
      }
    };
    reader.onerror = () => {
      this.importError.set('No se pudo leer el archivo.');
      this.importing.set(false);
    };
    reader.readAsArrayBuffer(file);
  }

  private parseExcelRows(rows: unknown[][]): { rowNumber: number; req: BeneficiaryRequest }[] {
    const cell = (row: unknown[], i: number): string => String(row[i] ?? '').trim();
    const yesNo = (v: string): boolean => /^s/i.test(v.trim());

    const genderMap: Record<string, BeneficiaryGender> = { F: 'F', M: 'M', O: 'Otro' };
    const zoneMap: Record<string, BeneficiaryZoneType> = { R: 'Rural', U: 'Urbana' };

    const out: { rowNumber: number; req: BeneficiaryRequest }[] = [];

    rows.forEach((row, idx) => {
      const fullName    = cell(row, 1);  // B
      const fullSurname = cell(row, 2);  // C
      const identification = cell(row, 4); // E
      if (!fullName && !fullSurname && !identification) return;

      const [first_name, ...restName] = fullName.split(/\s+/).filter(Boolean);
      const [first_surname, ...restSurname] = fullSurname.split(/\s+/).filter(Boolean);

      const dia  = cell(row, 5);  // F
      const mes  = cell(row, 6);  // G
      const anio = cell(row, 7);  // H
      let birthdate: string | null = null;
      if (dia && mes && anio) {
        birthdate = `${anio.padStart(4, '0')}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T00:00:00Z`;
      }

      const sexoRaw = cell(row, 10).toUpperCase(); // K

      const req: BeneficiaryRequest = {
        is_beneficiary:        true,
        first_name:            first_name ?? '',
        middle_name:           restName.length ? restName.join(' ') : null,
        first_surname:         first_surname ?? '',
        second_surname:        restSurname.length ? restSurname.join(' ') : null,
        type_identification:   (cell(row, 3) as BeneficiaryDocumentType) || 'CC', // D
        identification_number: identification,
        birthdate,
        gender:                genderMap[sexoRaw] ?? null,
        ethnic_affiliation:    cell(row, 11) || null, // L
        is_lgbtiq:             yesNo(cell(row, 12)),  // M
        is_head_of_household:  yesNo(cell(row, 13)),  // N
        is_victim:             yesNo(cell(row, 14)),  // O
        profession:            cell(row, 15) || null, // P
        type_zone:             zoneMap[cell(row, 16).toUpperCase()] ?? null, // Q
        entity:                cell(row, 17) || null, // R
        job_title:             cell(row, 18) || null, // S
        phone:                 cell(row, 19) || null, // T
        email:                 cell(row, 20) || null, // U
        municipality:          cell(row, 21) || null, // V
        department:            cell(row, 22) || null, // W
        sidewalk:               cell(row, 23) || null, // X
      };

      out.push({ rowNumber: idx + 6, req });
    });

    return out;
  }

  private runImport(parsed: { rowNumber: number; req: BeneficiaryRequest }[]): void {
    this.importProgress.set({ done: 0, total: parsed.length });

    this.fetchAllBeneficiaries().subscribe({
      next: existing => {
        const byId = new Map(existing.map(b => [b.identification_number, b]));

        from(parsed).pipe(
          concatMap(({ rowNumber, req }) => {
            const match = byId.get(req.identification_number);
            const request$: Observable<Beneficiary> = match
              ? this.svc.updateBeneficiary(this.projectId, match.id, req)
              : this.svc.createBeneficiary(this.projectId, req);

            return request$.pipe(
              concatMap(saved => {
                this.beneficiaries.update(list => {
                  const idx = list.findIndex(b => b.id === saved.id);
                  return idx >= 0 ? list.map((b, i) => i === idx ? saved : b) : [saved, ...list];
                });
                byId.set(saved.identification_number, saved);
                this.importProgress.update(p => p ? { ...p, done: p.done + 1 } : p);
                const result: ImportRowResult = { row: rowNumber, identification: req.identification_number, status: match ? 'updated' : 'created' };
                return [result];
              }),
              catchError(err => {
                this.importProgress.update(p => p ? { ...p, done: p.done + 1 } : p);
                const result: ImportRowResult = {
                  row: rowNumber,
                  identification: req.identification_number,
                  status: 'error',
                  message: err?.error?.message ?? 'Error al guardar.',
                };
                return [result];
              }),
            );
          }),
          toArray(),
        ).subscribe({
          next: results => {
            this.importResults.set(results);
            this.importing.set(false);
            this.importProgress.set(null);
          },
          error: () => {
            this.importError.set('La importación se detuvo por un error inesperado.');
            this.importing.set(false);
            this.importProgress.set(null);
          },
        });
      },
      error: () => {
        this.importError.set('No se pudo verificar beneficiarios existentes antes de importar.');
        this.importing.set(false);
      },
    });
  }

  private fetchAllBeneficiaries(cursor: string | null = null, acc: Beneficiary[] = []): Observable<Beneficiary[]> {
    return new Observable<Beneficiary[]>(observer => {
      this.svc.getBeneficiaries(this.projectId, cursor, 200).subscribe({
        next: page => {
          const merged = [...acc, ...(page.data ?? [])];
          if (page.has_more && page.next_cursor) {
            this.fetchAllBeneficiaries(page.next_cursor, merged).subscribe(observer);
          } else {
            observer.next(merged);
            observer.complete();
          }
        },
        error: err => observer.error(err),
      });
    });
  }

  closeImportResults(): void { this.importResults.set(null); }
}
