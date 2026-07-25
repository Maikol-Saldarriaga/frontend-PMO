import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { ProjectSignatureInfo, ProjectSignatureRequest } from '../../../../models/project.model';

interface SignatureForm {
  name:     string;
  position: string;
  date:     string;
}

const emptyForm = (): SignatureForm => ({ name: '', position: '', date: '' });

@Component({
  selector: 'app-tab-firmas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-firmas.component.html',
})
export class TabFirmasComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ProjectService) {}

  loading = signal(true);
  saving  = signal(false);
  error   = signal<string | null>(null);
  saveMsg = signal<string | null>(null);

  prepared = emptyForm();
  approved = emptyForm();

  preparedImageUrl = signal<string | null>(null);
  approvedImageUrl = signal<string | null>(null);
  preparedUploading = signal(false);
  approvedUploading = signal(false);

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getSignature(this.projectId).subscribe({
      next: sig => { this.applySignature(sig); this.loading.set(false); },
      // 404 = todavía no se ha guardado ninguna firma para este proyecto — estado vacío normal.
      error: () => { this.loading.set(false); },
    });
  }

  private applySignature(sig: ProjectSignatureInfo): void {
    this.prepared = {
      name: sig.prepared_by_name ?? '',
      position: sig.prepared_by_position ?? '',
      date: sig.prepared_date ? sig.prepared_date.slice(0, 10) : '',
    };
    this.approved = {
      name: sig.approved_by_name ?? '',
      position: sig.approved_by_position ?? '',
      date: sig.approved_date ? sig.approved_date.slice(0, 10) : '',
    };
    this.preparedImageUrl.set(sig.signature_prepared_url);
    this.approvedImageUrl.set(sig.approved_signature_url);
  }

  save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.saveMsg.set(null);
    const payload: ProjectSignatureRequest = {
      prepared_by_name:     this.prepared.name.trim() || null,
      prepared_by_position: this.prepared.position.trim() || null,
      prepared_date:        this.prepared.date ? `${this.prepared.date}T00:00:00Z` : null,
      approved_by_name:     this.approved.name.trim() || null,
      approved_by_position: this.approved.position.trim() || null,
      approved_date:        this.approved.date ? `${this.approved.date}T00:00:00Z` : null,
    };
    this.svc.saveSignature(this.projectId, payload).subscribe({
      next: sig => {
        this.applySignature(sig);
        this.saving.set(false);
        this.saveMsg.set('Firmas guardadas correctamente.');
        setTimeout(() => this.saveMsg.set(null), 4000);
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar las firmas.');
      },
    });
  }

  onImageSelected(kind: 'prepared' | 'approved', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const uploading = kind === 'prepared' ? this.preparedUploading : this.approvedUploading;
    uploading.set(true);
    this.error.set(null);

    const fd = new FormData();
    fd.append('file', file);
    this.svc.uploadSignatureImage(this.projectId, kind, fd).subscribe({
      next: sig => {
        this.applySignature(sig);
        uploading.set(false);
        input.value = '';
      },
      error: err => {
        uploading.set(false);
        input.value = '';
        this.error.set(err?.error?.error ?? err?.error?.message ?? 'Error al subir la imagen de la firma.');
      },
    });
  }
}
