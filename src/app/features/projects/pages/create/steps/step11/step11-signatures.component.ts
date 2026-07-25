import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { ProjectSignatureInfo, ProjectSignatureRequest } from '../../../../models/project.model';
import { WizardSignature } from '../../../../models/contract.model';

interface SignatureForm {
  name:     string;
  position: string;
  date:     string;
}

const emptyForm = (): SignatureForm => ({ name: '', position: '', date: '' });

@Component({
  selector: 'app-step11-signatures',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './step11-signatures.component.html',
})
export class Step11SignaturesComponent {
  @Input() projectId = '';
  @Input() set savedData(val: WizardSignature | undefined | null) {
    if (!val) return;
    this.prepared = {
      name: val.prepared_by_name ?? '',
      position: val.prepared_by_position ?? '',
      date: val.prepared_date ? val.prepared_date.slice(0, 10) : '',
    };
    this.approved = {
      name: val.approved_by_name ?? '',
      position: val.approved_by_position ?? '',
      date: val.approved_date ? val.approved_date.slice(0, 10) : '',
    };
    this.preparedImageUrl.set(val.signature_prepared_url);
    this.approvedImageUrl.set(val.approved_signature_url);
  }

  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<void>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  constructor(private svc: ProjectService) {}

  error = signal<string | null>(null);
  saving = signal(false);

  prepared = emptyForm();
  approved = emptyForm();

  preparedImageUrl = signal<string | null>(null);
  approvedImageUrl = signal<string | null>(null);
  preparedUploading = signal(false);
  approvedUploading = signal(false);

  onImageSelected(kind: 'prepared' | 'approved', event: Event): void {
    if (!this.projectId) return;
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

  private applySignature(sig: ProjectSignatureInfo): void {
    this.preparedImageUrl.set(sig.signature_prepared_url);
    this.approvedImageUrl.set(sig.approved_signature_url);
  }

  onSubmit(): void {
    if (!this.projectId || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const payload: ProjectSignatureRequest = {
      prepared_by_name:     this.prepared.name.trim() || null,
      prepared_by_position: this.prepared.position.trim() || null,
      prepared_date:        this.prepared.date ? `${this.prepared.date}T00:00:00Z` : null,
      approved_by_name:     this.approved.name.trim() || null,
      approved_by_position: this.approved.position.trim() || null,
      approved_date:        this.approved.date ? `${this.approved.date}T00:00:00Z` : null,
    };
    this.svc.saveSignature(this.projectId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.submitted.emit();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar las firmas.');
      },
    });
  }
}
