import { Component, computed, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { ConfirmDialogService } from './confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [NgClass],
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent {
  private dialog = inject(ConfirmDialogService);

  state = this.dialog.state;

  iconClasses = computed(() => {
    switch (this.state().variant) {
      case 'danger':
        return { wrap: 'bg-danger/10 text-danger', btn: 'bg-danger hover:bg-red-600 focus:ring-red-200' };
      case 'warning':
        return { wrap: 'bg-warning/10 text-warning', btn: 'bg-warning hover:bg-amber-600 focus:ring-amber-200' };
      default:
        return { wrap: 'bg-accent-100 text-accent-600', btn: 'bg-accent-600 hover:bg-accent-700 focus:ring-accent-300' };
    }
  });

  onCancel(): void {
    this.dialog.resolve(false);
  }

  onConfirm(): void {
    this.dialog.resolve(true);
  }
}
