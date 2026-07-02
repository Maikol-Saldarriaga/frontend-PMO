# Guía de migración para Frontend — Purga de esquema (julio 2026)

Este documento cubre **todos** los cambios de la purga/reestructuración de base de datos que afectan al backend y, por lo tanto, a los contratos de la API. Está pensado para que el equipo de frontend pueda actualizar el consumo de la API sin sorpresas.

> Base URL sin cambios: `/api/v1`. Autenticación sin cambios (Bearer JWT).

---

## 0. Resumen ejecutivo

| # | Cambio | Impacto en frontend |
|---|---|---|
| 1 | `technical-executions` (antes "ejecución técnica") eliminado por completo | Quitar toda pantalla/llamada relacionada. Las 4 rutas ahora devuelven 404. |
| 2 | `/components` → `/technical-components` | Cambiar base path en todas las llamadas de componentes. |
| 3 | `/budgets` → `/budget-components` | Cambiar base path en las llamadas de presupuesto por componente. |
| 4 | Presupuesto por actividad eliminado (`budget` en actividades) | Quitar el campo `budget` de los formularios de actividad/acto. |
| 5 | `budget_items` ya no se vincula a componente/actividad — se vincula a `budget_component_id` | Cambiar `component_id` + `activity_id` por `budget_component_id` en creación/edición de ítems de presupuesto. |
| 6 | Endpoint `PUT /activities/:activityid/budget` eliminado | Quitar el flujo "presupuesto por actividad" del wizard de alcance. |
| 7 | `GET /budget/wizard` y `GET /monthly-wizard` cambian de forma (agrupado por componente, no por actividad) | Reescribir el componente de wizard de presupuesto. |
| 8 | Todo lo de "scope/snapshot" en JSON pasa a "activity/checkpoint" | Renombrar campos y rutas de seguimiento/entregables. |
| 9 | `GET /budget/wizard` ahora incluye `budget` (tope) por componente | Ya no hace falta cruzar con `GET /technical-components` para mostrarlo en el wizard. |

---

## 1. Rutas ELIMINADAS

Estas rutas ya no existen (devuelven 404). Hay que quitar toda referencia a ellas:

```
POST   /api/v1/projects/:id/technical-executions
GET    /api/v1/projects/:id/technical-executions
PUT    /api/v1/projects/:id/technical-executions/:teid
DELETE /api/v1/projects/:id/technical-executions/:teid

PUT    /api/v1/projects/:id/activities/:activityid/budget
```

La segunda (`.../activities/:activityid/budget`) era el endpoint para poner presupuesto directamente sobre una actividad ("acto"). Ya no se maneja presupuesto a ese nivel — ver sección 5.

---

## 2. Rutas RENOMBRADAS (mismo comportamiento, distinto path)

| Antes | Ahora |
|---|---|
| `GET /projects/:id/components` | `GET /projects/:id/technical-components` |
| `POST /projects/:id/components` | `POST /projects/:id/technical-components` |
| `GET /projects/:id/components/acts` | `GET /projects/:id/technical-components/acts` |
| `POST /projects/:id/components/batch` | `POST /projects/:id/technical-components/batch` |
| `GET /projects/:id/components/:cid` | `GET /projects/:id/technical-components/:cid` |
| `PUT /projects/:id/components/:cid` | `PUT /projects/:id/technical-components/:cid` |
| `DELETE /projects/:id/components/:cid` | `DELETE /projects/:id/technical-components/:cid` |
| `GET /projects/:id/components/:cid/acts` | `GET /projects/:id/technical-components/:cid/acts` |
| `PUT /projects/:id/components/:cid/activities/batch` | `PUT /projects/:id/technical-components/:cid/activities/batch` |
| `POST /projects/:id/components/:cid/activities` | `POST /projects/:id/technical-components/:cid/activities` |
| `PUT /projects/:id/components/:cid/activities/:sid` | `PUT /projects/:id/technical-components/:cid/activities/:sid` |
| `DELETE /projects/:id/components/:cid/activities/:sid` | `DELETE /projects/:id/technical-components/:cid/activities/:sid` |
| `POST /projects/:id/budgets` | `POST /projects/:id/budget-components` |
| `POST /projects/:id/budgets/bulk` | `POST /projects/:id/budget-components/bulk` |
| `GET /projects/:id/budgets` | `GET /projects/:id/budget-components` |
| `PUT /projects/:id/budgets/:bid` | `PUT /projects/:id/budget-components/:bid` |
| `DELETE /projects/:id/budgets/:bid` | `DELETE /projects/:id/budget-components/:bid` |
| `POST /projects/:id/scopes` | `POST /projects/:id/activities` |
| `GET /projects/:id/scopes` | `GET /projects/:id/activities` |
| `PUT /projects/:id/scopes/:scopeid` | `PUT /projects/:id/activities/:activityid` |
| `DELETE /projects/:id/scopes/:scopeid` | `DELETE /projects/:id/activities/:activityid` |
| `PUT /projects/:id/components/:cid/scopes/batch` | `PUT /projects/:id/technical-components/:cid/activities/batch` |
| `POST /projects/:id/components/:cid/scopes` | `POST /projects/:id/technical-components/:cid/activities` |
| `PUT /projects/:id/components/:cid/scopes/:sid` | `PUT /projects/:id/technical-components/:cid/activities/:sid` |
| `DELETE /projects/:id/components/:cid/scopes/:sid` | `DELETE /projects/:id/technical-components/:cid/activities/:sid` |
| `POST /projects/:id/scopes/:scopeid/verifications` | `POST /projects/:id/activities/:activityid/verifications` |
| `GET /projects/:id/scopes/:scopeid/verifications` | `GET /projects/:id/activities/:activityid/verifications` |
| `PUT /projects/:id/scopes/:scopeid/verifications/:vid` | `PUT /projects/:id/activities/:activityid/verifications/:vid` |
| `DELETE /projects/:id/scopes/:scopeid/verifications/:vid` | `DELETE /projects/:id/activities/:activityid/verifications/:vid` |
| `POST /projects/:id/scopes/:scopeid/verifications/:vid/items` | `POST /projects/:id/activities/:activityid/verifications/:vid/items` |
| `GET /projects/:id/scopes/:scopeid/verifications/:vid/items` | `GET /projects/:id/activities/:activityid/verifications/:vid/items` |
| `DELETE /projects/:id/scopes/:scopeid/verifications/:vid/items/:viid` | `DELETE /projects/:id/activities/:activityid/verifications/:vid/items/:viid` |
| `PUT /projects/:id/scopes/:scopeid/snapshot` | `PUT /projects/:id/activities/:activityid/checkpoint` |
| `GET /projects/:id/scopes/:scopeid/snapshots` | `GET /projects/:id/activities/:activityid/checkpoints` |
| `GET /projects/:id/snapshots` | `GET /projects/:id/checkpoints` |
| `PUT /projects/:id/scopes/:scopeid/snapshots/:sid/delivery` | `PUT /projects/:id/activities/:activityid/checkpoints/:sid/delivery` |
| `GET /projects/:id/scopes/:scopeid/snapshots/:sid/delivery` | `GET /projects/:id/activities/:activityid/checkpoints/:sid/delivery` |
| `DELETE /projects/:id/scopes/:scopeid/snapshots/:sid/delivery` | `DELETE /projects/:id/activities/:activityid/checkpoints/:sid/delivery` |
| `POST /projects/:id/scopes/:scopeid/snapshots/:sid/delivery/verifications` | `POST /projects/:id/activities/:activityid/checkpoints/:sid/delivery/verifications` |
| `DELETE /projects/:id/scopes/:scopeid/snapshots/:sid/delivery/verifications/:vid` | `DELETE /projects/:id/activities/:activityid/checkpoints/:sid/delivery/verifications/:vid` |

> **Importante:** el path param también cambió de nombre donde aplica: `:scopeid` → `:activityid`. Si el frontend arma las URLs a mano (no por nombre de param), esto no importa; si usa el nombre del param en algún router propio, hay que actualizarlo.

---

## 3. Rutas SIN cambios de path (para referencia rápida — pero revisa igual sección 4/5, algunos payloads sí cambiaron)

```
GET                   /projects/:id/gantt                    (payload cambia, ver sección 4)
POST/GET/PUT/DELETE  /projects/:id/indicators[...]
POST/GET/PUT/DELETE  /projects/:id/indicators/:iid/verifications[...]
POST/GET/PUT/DELETE  /projects/:id/schedules[...]
POST/GET/PUT/DELETE  /projects/:id/schedules/:schid/activities[...]
POST/GET/PUT/DELETE  /projects/:id/extensions[...]
POST/GET/PUT/DELETE  /projects/:id/guarantees[...]
POST/GET/PUT/DELETE  /projects/:id/budget[...]           (ver payload nuevo, sección 5)
GET                   /projects/:id/budget/wizard          (ver forma nueva, sección 6)
GET                   /projects/:id/budget/execution
GET                   /projects/:id/budget/summary
GET                   /projects/:id/details
GET                   /projects/:id/monthly-wizard          (misma forma que budget/wizard)
PUT/GET               /projects/:id/signature
POST/GET/PUT/DELETE  /projects/:id/risks[...]
PUT/GET               /projects/:id/risks/:rid/tracking
POST/GET/PUT/DELETE  /projects/:id/changes[...]
```

---

## 4. Campos renombrados en las respuestas JSON ("scope/snapshot" → "activity/checkpoint")

Este es un cambio nuevo de esta purga (antes las rutas y los campos JSON decían literalmente "scope"/"snapshot"). Revisa cualquier componente que lea estos campos:

| Antes | Ahora | Dónde aparece |
|---|---|---|
| `id_scope` / `scope_id` | `id_activity` / `activity_id` | Verificaciones, checkpoints, Gantt |
| `id_snapshot` / `snapshot_id` | `id_checkpoint` / `checkpoint_id` | Verificaciones, respuestas de checkpoint |
| `scope_name` | `activity_name` | Listado de entregables (`GET /checkpoints`) |
| `counts_by_scope` | `counts_by_activity` | Respuesta de `GET /checkpoints` (mapa de conteos) |
| `snapshots` (array) | `checkpoints` (array) | `GET /gantt` (dentro de cada actividad) |

`GET /projects/:id/gantt` — el array `Snapshots` de cada actividad ahora se llama `checkpoints`, y el campo que identificaba la actividad pasa de columna interna `ScopeID` a `ActivityID` (el JSON sigue exponiéndolo como `"id"` en el objeto de actividad, eso no cambió):

```json
// ANTES
{
  "timeline": [...],
  "components": [
    {
      "id": "uuid", "name": "Infraestructura",
      "activities": [
        { "id": "uuid", "act": 1, "description": "...", "progress": 40, "snapshots": [ { "start_date": "...", "end_date": "...", "planned_pct": 10, "actual_pct": null, "notes": null } ] }
      ]
    }
  ]
}

// AHORA
{
  "timeline": [...],
  "components": [
    {
      "id": "uuid", "name": "Infraestructura",
      "activities": [
        { "id": "uuid", "act": 1, "description": "...", "progress": 40, "checkpoints": [ { "start_date": "...", "end_date": "...", "planned_pct": 10, "actual_pct": null, "notes": null } ] }
      ]
    }
  ]
}
```

El mismo cambio (`checkpoints` en vez de `snapshots`) aplica al bloque `gantt_summary` de `GET /projects/:id/details`.

Ejemplo de respuesta de `GET /projects/:id/activities/:activityid/checkpoints` (estructura `ActivityCheckpointsView`):

```json
{
  "id_activity": "uuid",
  "start_date": "2026-01-01",
  "end_date": "2026-06-30",
  "actual_start_date": null,
  "actual_end_date": null,
  "checkpoints": [
    {
      "id": "uuid",
      "id_company": "uuid",
      "id_activity": "uuid",
      "start_date": "2026-01-01",
      "end_date": "2026-01-31",
      "planned_pct": 10,
      "actual_pct": null,
      "notes": null
    }
  ]
}
```

Ejemplo de `GET /projects/:id/checkpoints` (lista de "entregables", estructura `ActivityCheckpointListItem`):

```json
[
  {
    "id_checkpoint": "uuid",
    "id_activity": "uuid",
    "act": 1,
    "activity_name": "Excavación",
    "description": "Excavación",
    "id_component": "uuid",
    "component_name": "Infraestructura",
    "is_completed": false,
    "start_date": "2026-01-01",
    "end_date": "2026-01-31",
    "planned_pct": 10,
    "actual_pct": null,
    "notes": null,
    "verifications_count": 0
  }
]
```

Ejemplo de `GET /projects/:id/activities/:activityid/checkpoints/:sid/delivery` (estructura `ActivityCheckpointDeliveryView`):

```json
{
  "id_checkpoint": "uuid",
  "id_activity": "uuid",
  "act": 1,
  "activity_name": "Excavación",
  "description": "Excavación",
  "objective": "...",
  "responsible": "...",
  "is_completed": false,
  "id_component": "uuid",
  "component_name": "Infraestructura",
  "id_contract_agreement": "uuid",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "planned_pct": 10,
  "actual_pct": 8,
  "notes": "...",
  "verifications": [
    { "id": "uuid", "activity_id": "uuid", "checkpoint_id": "uuid", "name": "foto.jpg", "file_name": "foto.jpg", "verification_url": "https://...", "state": true }
  ]
}
```

`GET /projects/:id/activities/:activityid/verifications` y similares ahora devuelven `activity_id` y `checkpoint_id` en vez de `scope_id`/`snapshot_id`:

```json
[
  { "id": "uuid", "activity_id": "uuid", "checkpoint_id": null, "name": "...", "file_name": "...", "verification_url": "...", "state": true }
]
```

---

## 5. Presupuesto: `budget_items` ya NO se vincula a componente ni a actividad

**Antes:** un `budget_item` (ítem de presupuesto) llevaba `component_id` y/o `scope_id` (actividad) opcionales.

**Ahora:** un `budget_item` lleva **solo** `budget_component_id`, que apunta a un `budget_component` (un sub-componente financiero con nombre, p. ej. "Materiales", bajo un `technical_component`). El presupuesto por actividad **desapareció por completo**. Ver sección 5.3 para el detalle completo de `budget_component`.

### 5.1 Request de creación/edición de un ítem de presupuesto

`POST /projects/:id/budget` y `PUT /projects/:id/budget/:bid`:

```json
// ANTES
{
  "component_id": "uuid",
  "activity_id": "uuid",
  "concept": "Materiales",
  "unit_measurement": "m2",
  "unit_value": 1000,
  "quantity": 10,
  "total_value": 10000,
  "counterpart_contribution": 10000,
  "ally_contribution": 0,
  "sort_order": 1,
  "monthly_distributions": []
}

// AHORA
{
  "budget_component_id": "uuid",
  "concept": "Materiales",
  "unit_measurement": "m2",
  "unit_value": 1000,
  "quantity": 10,
  "total_value": 10000,
  "counterpart_contribution": 10000,
  "ally_contribution": 0,
  "sort_order": 1,
  "monthly_distributions": []
}
```

`budget_component_id` es opcional (puede ser `null`) si el ítem queda sin asignar a ningún componente todavía, pero ya no acepta `component_id`/`activity_id` — esos campos se ignoran si se envían.

### 5.2 Respuesta de un ítem de presupuesto

```json
// ANTES
{
  "id": "uuid",
  "contract_agreement_id": "uuid",
  "component_id": "uuid",
  "activity_id": "uuid",
  "concept": "Materiales",
  ...
}

// AHORA
{
  "id": "uuid",
  "contract_agreement_id": "uuid",
  "budget_component_id": "uuid",
  "concept": "Materiales",
  ...
}
```

### 5.3 Bulk replace (`PUT /projects/:id/budget/bulk`)

```json
// ANTES
{
  "type": "propio",
  "items": [
    { "component_id": "uuid", "scope_id": "uuid", "concept": "...", ... }
  ]
}

// AHORA
{
  "items": [
    { "budget_component_id": "uuid", "concept": "...", ... }
  ]
}
```

El campo `type` a nivel raíz **desapareció** — ya no se auto-crea un `budget_component` agregando los ítems por tipo. Los `budget_components` ahora son sub-componentes financieros con nombre (p. ej. "Materiales", "Mano de obra") que agrupan `budget_items`, y se crean/editan aparte con las rutas dedicadas: `POST /projects/:id/budget-components`, `POST /projects/:id/budget-components/bulk`, `PUT /projects/:id/budget-components/:bid`, `DELETE /projects/:id/budget-components/:bid` (el path ya cambió antes, ver sección 2 — pero el **payload también cambió**, ver abajo).

**`BudgetComponent` — payload nuevo:** el cliente solo envía `component_id` (al crear) y `name`. `company_contribution`, `ally_contribution` y `total_contribution` **ya no se envían** — el backend los calcula y guarda automáticamente sumando los `budget_items` vinculados, cada vez que se crea, edita o borra uno (en una transacción, para que nunca queden desincronizados). El campo `type` desapareció por completo de esta tabla.

```json
// Request: POST /projects/:id/budget-components
{
  "component_id": "uuid",
  "name": "Materiales"
}

// Request: PUT /projects/:id/budget-components/:bid
{
  "name": "Materiales"
}

// Response (GET/POST/PUT) — los 3 totales son de solo lectura, calculados por el backend
{
  "id": "uuid",
  "contract_agreement_id": "uuid",
  "component_id": "uuid",
  "name": "Materiales",
  "company_contribution": 800,
  "ally_contribution": 200,
  "total_contribution": 1000
}
```

Un `budget_component` recién creado (sin `budget_items` todavía) devuelve los 3 totales en `null`. Se van llenando automáticamente a medida que se crean/editan/borran `budget_items` con ese `budget_component_id`.

### 5.4 Actividades ya no tienen campo `budget`

En todos los payloads de actividad/acto (`POST/PUT /projects/:id/activities`, el wizard paso 8 `PUT /projects/:id/steps/8`, `POST/PUT .../technical-components/:cid/activities...`), el campo `budget` **se eliminó**. Ya no se envía en el request ni se recibe en la respuesta.

```json
// ANTES (ActivityResponse / ActInput)
{ "id": "uuid", "act": 1, "description": "...", "budget": 5000, ... }

// AHORA
{ "id": "uuid", "act": 1, "description": "...", ... }
```

`technical-components` (antes `components`) **sí conserva** su propio campo `budget` (el tope de presupuesto del componente) — eso no cambió:

```json
{ "id": "uuid", "name": "Infraestructura", "percentage": 40, "budget": 2000000 }
```

---

## 6. Wizard de presupuesto — cambia de forma (agrupado por componente, no por actividad)

`GET /projects/:id/budget/wizard` y `GET /projects/:id/monthly-wizard` (misma forma de respuesta en ambos).

**Antes**, el wizard listaba, por cada componente, sus actividades, y cada actividad tenía (o no) un `budget` asociado (1 ítem de presupuesto por actividad). "Completo" significaba que todas las actividades tenían su presupuesto cargado.

**Ahora**, el wizard lista, por cada componente técnico, sus `budget_components` (sub-componentes financieros con nombre, p. ej. "Materiales", "Mano de obra"), y cada uno trae la lista de `budget_items` que le pertenecen más sus 3 totales calculados por el backend. "Completo" significa que el componente tiene al menos un ítem de presupuesto cargado (ya no depende de actividades).

```json
// ANTES
{
  "components": [
    {
      "component_id": "uuid",
      "name": "Infraestructura",
      "percentage": 40,
      "progress": 65,
      "activities": [
        {
          "activity_id": "uuid",
          "act": 1,
          "description": "Excavación",
          "is_completed": false,
          "percentage": 50,
          "progress": 30,
          "budget": { "id": "uuid", "concept": "Materiales", "total_value": 10000, ... }
        }
      ],
      "is_complete": false
    }
  ],
  "is_complete": false,
  "total_activities": 5,
  "filled_activities": 3
}

// AHORA
{
  "components": [
    {
      "component_id": "uuid",
      "name": "Infraestructura",
      "percentage": 40,
      "budget": 2000000,
      "progress": 65,
      "budget_entries": [
        {
          "budget_component_id": "uuid",
          "name": "Materiales",
          "company_contribution": 10000,
          "ally_contribution": 0,
          "total_contribution": 10000,
          "items": [
            { "id": "uuid", "budget_component_id": "uuid", "concept": "Cemento", "total_value": 10000, "counterpart_contribution": 10000, "ally_contribution": 0, "sort_order": 1, "created_at": "...", "monthly_distributions": [] }
          ]
        }
      ],
      "is_complete": true
    }
  ],
  "is_complete": false,
  "total_components": 2,
  "filled_components": 1,
  "execution": { "summary": {...}, "time_series": [...], "details": [...] }
}
```

`company_contribution`/`ally_contribution`/`total_contribution` de cada `budget_entry` son calculados por el backend (suma de sus `items`) — no se editan directamente, solo se ven.

**Novedad:** cada componente en `components[]` ahora trae también su propio `budget` (el tope de presupuesto de `technical_components`, el mismo que ya devuelve `GET /technical-components`). Antes había que consultarlo aparte; ahora el wizard lo incluye directamente para no tener que cruzar dos respuestas al armar la pantalla.

**Acción para frontend:** el componente de "wizard de presupuesto" (barra de progreso, tarjetas por actividad con su input de presupuesto) hay que rediseñarlo para trabajar por componente + sub-componente financiero (`budget_entries`) en vez de por actividad. Ya no existe el endpoint `PUT /activities/:activityid/budget` para guardar el presupuesto de una actividad puntual — el flujo de captura ahora es: crear/editar `budget_components` (sub-componentes financieros con nombre, dentro de un `technical_component`) y, dentro de cada uno, agregar `budget_items` (conceptos de gasto) vía `POST/PUT /projects/:id/budget` con `budget_component_id`. Los totales se actualizan solos.

---

## 7. Wizard paso 8 (alcance de proyecto) — sin cambio de estructura, solo pierde `budget`

`PUT /projects/:id/steps/8` y `GET /projects/:id/wizard` (bloque `step8`) mantienen la misma forma general (`ComponentWithActsResponse` con `acts: []`), solo se quitó el campo `budget` de cada acto (ver 5.4). El campo `budget` del **componente** (`ComponentWithActsInput.budget` / `ComponentWithActsResponse.budget`) sigue existiendo — es el tope de presupuesto del componente, no cambió.

```json
// Step8Request (PUT /projects/:id/steps/8) — item de la lista
{
  "id": "uuid",
  "component": "Infraestructura",
  "percentage": 40,
  "budget": 2000000,          // presupuesto del COMPONENTE, sigue existiendo
  "acts": [
    {
      "id": "uuid",
      "act": 1,
      "description": "Excavación",
      "start_date": "2026-01-01",
      "end_date": "2026-03-01",
      "start_plan": 1,
      "actual_start_date": null,
      "actual_end_date": null,
      "actual_start_plan": null,
      "responsible": "Juan",
      "objective": "...",
      "percentage": 50
      // "budget" YA NO VA AQUÍ
    }
  ]
}
```

---

## 8. Checklist de migración para frontend

- [ ] Cambiar todas las llamadas `/projects/:id/components...` → `/projects/:id/technical-components...`
- [ ] Cambiar todas las llamadas `/projects/:id/budgets...` → `/projects/:id/budget-components...`
- [ ] Quitar pantallas/llamadas de "Ejecución técnica" (`technical-executions`) — el feature ya no existe.
- [ ] Quitar el input de "presupuesto" de los formularios de actividad/acto (steps del wizard, CRUD de actividades sueltas).
- [ ] Quitar la llamada a `PUT /activities/:activityid/budget`.
- [ ] En creación/edición de `budget_items`: reemplazar `component_id` + `activity_id` por `budget_component_id`. Si no se conoce aún el `budget_component_id`, primero crear/obtener el `budget_component` correspondiente (`GET/POST /projects/:id/budget-components`).
- [ ] En `PUT /projects/:id/budget/bulk`: quitar `type` del body raíz; cada item usa `budget_component_id` en vez de `component_id`/`scope_id`.
- [ ] En formularios de `budget_component`: quitar `type` y los inputs de `company_contribution`/`ally_contribution`/`total_contribution` (ya no se envían, el backend los calcula solo). Solo se editan `component_id` (al crear) y `name`.
- [ ] Rediseñar el componente de "wizard de presupuesto" para consumir `components[].budget_entries[].items[]` en vez de `components[].activities[].budget`. Los contadores pasan de `total_activities`/`filled_activities` a `total_components`/`filled_components`.
- [ ] Renombrar en el código frontend cualquier referencia a `scope_id`/`snapshot_id`/`scope_name` por `activity_id`/`checkpoint_id`/`activity_name` en las respuestas de verificaciones, checkpoints y Gantt.
- [ ] Cambiar todas las llamadas `/projects/:id/scopes...` → `/projects/:id/activities...` (y sus anidadas bajo `/technical-components/:cid/scopes` → `.../activities`) — ver tabla completa en sección 2.
- [ ] Cambiar todas las llamadas `.../scopes/:scopeid/snapshot(s)...` → `.../activities/:activityid/checkpoint(s)...` — ver tabla completa en sección 2.
- [ ] Revisar cualquier hardcode de las rutas viejas (`/scopes`, `/snapshot`, `/snapshots`) — ya no existen, devuelven 404.

---

## 9. Lo que NO cambió (para tranquilidad)

- Autenticación, roles, y el resto de endpoints de wizard (steps 1–7, 9, 10) sin cambios de payload.
- `technical-components` conserva su propio campo `budget` (tope del componente).
- El **path** de `GET /projects/:id/gantt` no cambió (sigue siendo `/gantt`), pero su **payload sí** — ver sección 4.
- Rutas y payloads sin ningún cambio: afiliados, locations, condiciones, supports, indicadores, indicator-verifications, schedules, schedule-activities, extensions, guarantees, signature, risks, risk-tracking, changes, budget/execution, budget/summary.
