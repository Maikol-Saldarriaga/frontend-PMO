import { AfterViewInit, Directive, ElementRef, OnDestroy } from '@angular/core';

/** Mueve el elemento host directo a <body> al crearse — así los modales/paneles
 * `position: fixed` escapan de cualquier stacking context de ancestros (sidebar,
 * topbar, etc. con su propio z-index) que de otro modo los taparía sin importar
 * qué z-index se les ponga. Se restaura solo: al destruirse la vista (el @if
 * que la contiene pasa a false), Angular remueve el nodo de donde esté. */
@Directive({
  selector: '[appPortalToBody]',
  standalone: true,
})
export class PortalToBodyDirective implements AfterViewInit, OnDestroy {
  constructor(private el: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    document.body.appendChild(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.el.nativeElement.remove();
  }
}
