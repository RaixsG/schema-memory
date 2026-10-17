# Especificación del Repositorio Cliente (`.schema-memory/`)

Este documento detalla el contrato de archivos, estructuras y reglas que `schema-memory` gestiona dentro de cada proyecto cliente vinculado.

---

## 1. Estructura de Directorios en el Repositorio Cliente

Al vincular un repositorio con `sm add [ruta]` (o `sm init`), se crea la siguiente estructura en la raíz del proyecto:

```
mi-proyecto/
├── .schema-memory/
│   ├── config.json             # Metadatos del proyecto, dialecto y stack
│   ├── schema.dbml             # Fuente de verdad canónica (DBML neutral)
│   ├── layout.json             # Coordenadas visuales de las tablas en el canvas
│   ├── adr/                    # Architecture Decision Records inmutables
│   │   ├── 0001-inicio.md      # ADR inicial (status: reconstruido)
│   │   └── 0002-pagos.md       # Siguientes ADRs (status: confirmado)
│   ├── pending/                # Borradores en curso (ignorado en Git)
│   │   ├── change.json         # Diferencias visuales no confirmadas
│   │   └── adr-draft.json      # Borrador del debate con el agente
│   └── .gitignore              # Ignora la carpeta pending/
│
└── AGENTS.md                   # Bloque delimitado de guardrails para agentes de IA
```

---

## 2. Contrato de Archivos

### 2.1 `config.json`
Define la identidad y configuración técnica del proyecto (validado por el esquema Zod `ProjectConfig`):
```json
{
  "version": 1,
  "id": "mi-proyecto",
  "name": "Mi Proyecto",
  "dialect": "postgres",
  "stack": ["prisma"],
  "createdAgentsMd": true,
  "createdAt": "2026-10-17T12:00:00.000Z"
}
```

- **`version`**: Versión del esquema de configuración (entero literal `1`).
- **`id`**: Identificador kebab-case único del proyecto.
- **`dialect`**: Dialecto SQL (`postgres`, `mysql`, `sqlite`, `mssql`, `oracle`, `other`).
- **`stack`**: Array de tecnologías detectadas en el repositorio (`prisma`, `django`, `drizzle`, `sqlalchemy`, etc.).
- **`createdAgentsMd`**: Indica si el archivo `AGENTS.md` fue creado inicialmente por `schema-memory`.

### 2.2 `schema.dbml`
Fuente de verdad canónica del esquema de base de datos. Está escrito en **Database Markup Language (DBML)** neutral y desacoplado de ORMs o dialectos SQL específicos:
- Tablas y campos tipados.
- Restricciones (`pk`, `unique`, `not null`, `default`).
- Relaciones (`Ref: orders.user_id > users.id`).
- Índices y notas explicativas.

### 2.3 `layout.json`
Almacena las coordenadas visuales `(x, y)` calculadas o posicionadas manualmente en el canvas interactivo de React Flow:
```json
{
  "users": { "x": 100, "y": 80 },
  "orders": { "x": 420, "y": 140 }
}
```

### 2.4 Registro Inmutable de ADRs (`adr/000X-[slug].md`)
Cada confirmación atómica de esquema genera un nuevo ADR numerado y secuencial. El archivo incluye metadatos en formato frontmatter YAML normalizado (`AdrMetadata`), secciones de texto y diff estructural:

```markdown
---
id: "0002"
title: "Separación de pagos y facturación"
status: confirmado
date: 2026-10-17
affects: ["payments", "invoices"]
---

## Contexto
El crecimiento del módulo transaccional requiere desacoplar el procesamiento inmediato de pagos de la generación fiscal de facturas.

## Decisión
Se crea la tabla `invoices` separada de `payments`, vinculadas por `payment_id` opcional.

## Alternativas descartadas
- **Mantener campos invoice_* en payments**: Generaría contención y locks en transacciones concurrentes de alta frecuencia.

## Consecuencias
- Reducción de contención en la tabla de pagos.
- Requiere reconciliación asíncrona entre pagos y facturas.

## Diff DBML
```diff
+ Table invoices {
+   id int [pk]
+   payment_id int
+   amount decimal
+ }
```
```

### 2.5 Espacio de Borradores (`pending/`)
Carpeta temporal ignorada por Git mediante `.schema-memory/.gitignore`:
- **`change.json`**: Modificaciones no confirmadas (esquema `PendingChange`):
  ```json
  {
    "version": 1,
    "baseHash": "a1b2c3d4...",
    "proposedDbml": "Table ...",
    "source": "ui",
    "createdAt": "2026-10-17T12:00:00.000Z",
    "updatedAt": "2026-10-17T12:05:00.000Z"
  }
  ```
  - Si el `baseHash` no coincide con el hash del `schema.dbml` en disco, el cambio se marca automáticamente como **`stale`** para evitar sobreescrituras accidentales.
- **`adr-draft.json`**: Respuestas y alternativas formuladas durante el debate guiado con la IA antes de la aprobación final.

---

## 3. Bloque de Instrucciones en `AGENTS.md`

`schema-memory` inyecta de forma idempotente un bloque delimitado dentro del `AGENTS.md` del repositorio cliente:

```markdown
<!-- schema-memory:start -->
# schema-memory Global Rule
When working on a repository that contains .schema-memory/ or references schema-memory in AGENTS.md:
1. Call get_decisions and get_schema (passing project) before making or proposing any database schema change.
2. Never write schema changes directly to code without recording decisions via confirm_change(userConfirmed=true).
3. Strict Isolation: Interact with schema-memory ONLY via its MCP tools (schema-memory / schema-memory-mcp). NEVER search for or read the schema-memory source code repository. If the MCP tools are not loaded in your current session, stop immediately and ask the user to run sm setup (or pnpm sm setup) and reload the agent.
<!-- schema-memory:end -->
```

---

## 4. Detección de Desincronización (`check_drift`)

La herramienta MCP `check_drift(candidateDbml: string)` compara un DBML candidato derivado del código fuente contra el `schema.dbml` canónico.

### ¿Cómo opera el flujo de drift?
1. El **agente de IA** lee los modelos o esquemas del repositorio cliente (ej. `prisma/schema.prisma`, `models.py` en Django, o migraciones SQL) y genera el DBML candidato.
2. El agente invoca `check_drift({ candidateDbml })`.
3. `schema-memory` compara los ASTs de ambos esquemas:
   - Si no hay diferencias (`inSync: true`), certifica que el código refleja fielmente el diseño canónico.
   - Si detecta divergencias (`inSync: false`), lista los cambios estructurales (`changes`), entidades afectadas (`affected`) y sugiere llamar a `propose_change` para iniciar el debate arquitectónico obligatorio y documentar el cambio en un ADR.
