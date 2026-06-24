import { Directive, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Formatea inputs de dinero con separador de miles es-CO (punto) mientras se escribe.
 * Funciona como ControlValueAccessor (formControlName / ngModel) y también de forma
 * manual con [appMoneyMask]="valor" + (appMoneyMaskChange)="...".
 */
@Directive({
  selector: 'input[appMoneyMask]',
  standalone: true,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => MoneyMaskDirective),
    multi: true,
  }],
})
export class MoneyMaskDirective implements ControlValueAccessor, OnChanges {
  @Input('appMoneyMaskValue') manualValue: number | null = null;
  @Output('appMoneyMaskValueChange') manualValueChange = new EventEmitter<number | null>();

  private onChange: (v: number | null) => void = () => {};
  private onTouched: () => void = () => {};
  private cvaActive = false;

  constructor(private el: ElementRef<HTMLInputElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['manualValue'] && !this.cvaActive) this.render(this.manualValue);
  }

  writeValue(value: number | null): void {
    this.cvaActive = true;
    this.render(value);
  }

  registerOnChange(fn: (v: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.el.nativeElement.disabled = isDisabled; }

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Solo dígitos y una coma decimal; "." lo pone el formateo automático (miles).
    let raw = input.value.replace(/[^0-9,]/g, '');
    const hasComma = raw.includes(',');
    let [intPart, decPart] = raw.split(',');
    if (hasComma) decPart = (decPart ?? '').slice(0, 2);

    const formattedInt = intPart ? Number(intPart).toLocaleString('es-CO') : '';
    input.value = hasComma ? `${formattedInt},${decPart}` : formattedInt;

    const numeric = intPart || decPart
      ? Number(`${intPart || '0'}.${decPart || '0'}`)
      : null;
    this.onChange(numeric);
    this.manualValueChange.emit(numeric);
  }

  @HostListener('blur')
  onBlur(): void { this.onTouched(); }

  private render(value: number | null): void {
    this.el.nativeElement.value = value !== null && value !== undefined
      ? Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 })
      : '';
  }
}
