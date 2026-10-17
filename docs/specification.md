# Especificación del Repositorio Cliente (`.schema-memory/`)

Este documento detalla el contrato de archivos, estructuras y reglas que `schema-memory` gestiona dentro de cada proyecto cliente vinculado.

---

## 1. Estructura de Directorios en el Repositorio Cliente

Al vincular un repositorio con `sm add [ruta]` (o `npx schema-memory init`), se crea la siguiente estructura en la raíz del proyecto:

```
mi-proyecto/
├── .schema-memory/
│   ├── config.json             # Metadatos del proyecto y dialecto
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
Define la identidad y configuración técnica del proyecto:
```json
{
  "id": "mi-proyecto",
  "name": "Mi Proyecto",
  "dialect": "postgres",
  "detectedStack": "prisma",
  "createdAt": "2026-10-17T12:00:00.000Z",
  "version": "1.0.0"
}
```

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
Cada confirmación atómica de esquema genera un nuevo ADR numerado y secuencial. El archivo incluye metadatos en formato frontmatter YAML:

```markdown
---
id: "0002"
title: "Separación de pagos y facturación"
status: "confirmado"
date: "2026-10-17"
tables:
  - payments
  - invoices
authors:
  - Dev Pair & AI
---

# 0002. Separación de pagos y facturación

## Contexto
El crecimiento del módulo transaccional requiere desacoplar el procesamiento inmediato de pagos de la generación fiscal de facturas.

## Decisión
Se crea la tabla `invoices` separada de `payments`, vinculadas por `payment_id` opcional.

## Consecuencias
- **Positivas**: Reducción de locks en la tabla principal de transacciones.
- **Negativas**: Mayor complejidad en consultas de liquidación mensual.

## Alternativas Descartadas
- Mantener campos `invoice_*` dentro de la tabla `payments`.
```

### 2.5 Espacio de Borradores (`pending/`)
Carpeta temporal ignorada por Git mediante `.schema-memory/.gitignore`:
- **`change.json`**: Contiene la diferencia entre el canvas visual y `schema.dbml`.
- **`adr-draft.json`**: Contiene las respuestas y justificaciones formuladas durante el debate guiado con la IA antes de la aprobación final.

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

La herramienta `check_drift` compara la estructura del `schema.dbml` canónico contra los archivos del repositorio:
- Esquemas de **Prisma** (`prisma/schema.prisma`).
- Modelos de **Django** (`models.py`).
- Esquemas de **Drizzle** o migraciones SQL.

Si se detectan columnas o tablas en código que no pasaron por el flujo de diseño y debate de `schema-memory`, el sistema notifica la desincronización para que la IA o el desarrollador concilien el esquema antes de avanzar.
