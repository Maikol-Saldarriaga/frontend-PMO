import { Injectable, signal } from '@angular/core';

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
}

interface ConfirmDialogState extends Required<ConfirmDialogOptions> {
  open: boolean;
}

const DEFAULT_STATE: ConfirmDialogState = {
  open: false,
  title: 'Confirmar acción',
  message: '',
  confirmText: 'Confirmar',
  cancelText: 'Cancelar',
  variant: 'danger',
};

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly state = signal<ConfirmDialogState>(DEFAULT_STATE);

  private resolver: ((value: boolean) => void) | null = null;

  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    this.state.set({
      open: true,
      title: options.title ?? DEFAULT_STATE.title,
      message: options.message,
      confirmText: options.confirmText ?? DEFAULT_STATE.confirmText,
      cancelText: options.cancelText ?? DEFAULT_STATE.cancelText,
      variant: options.variant ?? DEFAULT_STATE.variant,
    });

    return new Promise<boolean>(resolve => {
      this.resolver = resolve;
    });
  }

  resolve(result: boolean): void {
    this.state.update(s => ({ ...s, open: false }));
    this.resolver?.(result);
    this.resolver = null;
  }
}
