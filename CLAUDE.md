# PROJECT-PMO — Angular Frontend

## Stack
- Angular 19.2 · Standalone components · Signals · Reactive Forms · RxJS 7.8 · TypeScript 5.7
- Tailwind CSS + Flowbite · SCSS tokens · Poppins font
- Backend: `http://192.168.110.20:3000/api/v1`
- Colombia API externa: `https://api-colombia.com/api/v1` (departamentos/municipios)

## Estructura de carpetas clave
```
src/
├── core/                        # HTTP, auth, config globales
│   ├── api/
│   │   ├── endpoints.ts         # URL builder centralizado
│   │   ├── http-client.ts       # Wrapper de HttpClient
│   │   └── interceptors/        # auth.interceptor, error.interceptor
│   ├── auth/
│   │   ├── store/auth.store.ts  # Signal store (fuente de verdad de sesión)
│   │   ├── services/auth.service.ts
│   │   └── guards/auth.guard.ts
│   └── config/api.config.ts     # API_BASE_URL, API_URL
├── app/
│   ├── core/services/colombia-api.service.ts
│   ├── features/
│   │   ├── auth/pages/login/
│   │   ├── dashboard/pages/home/
│   │   ├── projects/
│   │   │   ├── models/project.model.ts   # 16 DTO interfaces + PROJECT_STEPS[]
│   │   │   ├── services/project.service.ts
│   │   │   └── pages/
│   │   │       ├── list/projects-list.component.ts
│   │   │       ├── create/project-create.component.ts  # Orquestador wizard
│   │   │       │   └── steps/
│   │   │       │       ├── step1/  step1-general-info.component.ts
│   │   │       │       └── step2/  step2-location.component.ts
│   │   │       └── detail/project-detail.component.ts
│   │   └── profile/
│   └── layouts/
│       ├── dashboard/   # Layout autenticado (sidebar + topbar)
│       └── welcome/
```

## Colores (tailwind.config.js)
| Token | Uso |
|---|---|
| `accent-*` | Cyan `#0EA5E9` — acciones, links, highlights |
| `primary-*` | Slate `#1E293B` — sidebar, headers |
| `success-*` | Emerald — estado Activo |
| `warning-*` | Amber — estado Registro |
| `danger-*`  | Red — estado Cancelado |
| `neutral-*` | Grays — fondos, bordes |

## API Endpoints implementados
| Método | Ruta | Uso |
|---|---|---|
| POST | `/auth/login` | Login |
| GET | `/auth/me` | Usuario actual |
| GET | `/projects?limit=20&cursor=0` | Listado paginado |
| GET | `/projects/:id` | Detalle |
| GET | `/projects/:id/wizard` | Estado completo del wizard (edición) — campos: `basic_information`, `locations`, `strategic_alignment`, `objectives`, `general_conditions`, `beneficiaries`, `actors`, `conditions`, `scopes`, `indicators`, `schedules`, `extensions`, `signature` |
| POST | `/projects/steps/1` | Crear proyecto (primera vez) |
| PUT | `/projects/:id/steps/1` | Actualizar step 1 |
| PUT | `/projects/:id/steps/2` | Actualizar step 2 (ubicaciones) |
| GET | `/users/:id` | Perfil |
| PUT | `/users/:id` | Actualizar perfil (FormData + imagen) |

## Wizard de 16 pasos
`PROJECT_STEPS` definido en `project.model.ts`. Solo Steps 1 y 2 implementados; el resto son TODO.

**Lógica POST vs PUT:** Step 1 hace POST si no existe `projectId`, PUT si ya existe. Steps 2–16 siempre PUT.

**Draft local:** clave `pmo_project_draft_<id>` en localStorage. Se borra al completar exitosamente.

**Carga desde servidor:** `GET /projects/:id/wizard` pre-llena todos los formularios al editar.

### Step 1 — Información General
- Campos: código, nombre, razón social, tipo (contrato/convenio), número contrato, toggle orden de trabajo (campo condicional), fechas inicio/fin, duración auto-calculada, objetivo, presupuesto, supervisor principal, supervisor cliente, toggle extensión (campos condicionales: número, fecha, antecedente)
- `duration_days` = diff en días entre `start_date` y `end_date`
- Fechas enviadas como `"YYYY-MM-DD"` sin zona horaria

### Step 2 — Ubicaciones
- `FormArray` de filas dinámicas: país fijo "Colombia", departamento, municipio, dirección, detalles
- Departamentos: cacheados con `shareReplay(1)` en `ColombiaApiService`
- Municipios: cargados por fila al cambiar departamento
- Envío: `PUT /projects/:id/steps/2` con array `locations`

## Patrones de código establecidos

### Signals (estado reactivo)
```typescript
// Signal store
private _token = signal<string | null>(null);
readonly token = this._token.asReadonly();
readonly isLoggedIn = computed(() => !!this._token());

// Estado de UI en componentes
projects = signal<Project[]>([]);
loading = signal(false);
activeFilterCount = computed(() => Object.values(this.filters()).filter(Boolean).length);
```

### Formularios reactivos con validadores condicionales
```typescript
this.form.get('has_worker_order')!.valueChanges.subscribe(val => {
  const ctrl = this.form.get('worker_order')!;
  val ? ctrl.setValidators([Validators.required]) : ctrl.clearValidators();
  ctrl.updateValueAndValidity();
});
```

### Búsqueda con debounce
```typescript
this.searchControl.valueChanges.pipe(
  debounceTime(400),
  distinctUntilChanged(),
  takeUntil(this.destroy$)
).subscribe(term => this.loadProjects({ name: term }));
```

### URLs de imágenes
```typescript
// El API devuelve localhost:9000; se reemplaza con la IP real del servidor
url.replace('localhost', '192.168.110.20')
```

## Reglas importantes
1. **Arrow functions prohibidas en templates Angular** — mover lógica a métodos del componente
2. **No duplicar POSTs** — verificar `existingId` antes de decidir POST vs PUT
3. **Fechas con zona horaria** — enviar `"YYYY-MM-DDTHH:mm:ssZ"` al backend (ej. `"2026-06-15T00:00:00Z"`). El input HTML devuelve `"YYYY-MM-DD"`, se convierte con template literal al armar el payload.
4. **shareReplay(1)** en llamadas HTTP reutilizadas entre filas/componentes
5. **Required<T>** en signals de filtros para tipado estricto sin redefinir interfaces
6. **Flowbite** se re-inicializa en cada cambio de ruta (en `AppComponent`)
7. **takeUntil(destroy$)** en todas las suscripciones RxJS de larga vida

## Navegación de proyectos
- Proyecto incompleto → `/projects/:id/edit?step=N` (N = siguiente paso pendiente)
- Proyecto completo → `/projects/:id`
- Estados: "Registro" = ámbar · "Activo" = verde · "Completado" = cyan · "Cancelado" = rojo

## Steps pendientes (3–16)
Definidos en `PROJECT_STEPS` en `project.model.ts`. El orquestador `project-create.component.ts` ya tiene la infraestructura lista (stepper, draft, carga del wizard). Para agregar un nuevo step: crear el componente en `steps/stepN/` y registrarlo en el switch del orquestador.
