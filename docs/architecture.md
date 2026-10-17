# Arquitectura de Sistemas y Estructura Interna

Este documento detalla el diseño de sistemas, principios arquitectónicos y estructura interna del monorepo de **`schema-memory`**.

---

## 1. Principios de Diseño

1. **Aislamiento del Núcleo (`core` agnóstico)**:
   Toda la lógica de dominio (modelos, parseo DBML, cálculo de diferencias, ADRs y registro) reside en `@schema-memory/core`, sin dependencias de Node.js runtime específicos, HTTP ni React.
2. **Zero Docker**:
   Ejecución nativa directa sobre Node.js (>=20.5) y Bun (>=1.1). Sin contenedores, bases de datos externas ni daemon pesado en background.
3. **Seguridad Local Anti DNS-Rebinding**:
   El servidor backend Hono valida estrictamente los encabezados `Host` (`127.0.0.1`, `localhost`) y `Origin` para bloquear invocaciones no autorizadas desde navegadores externos.
4. **AST DBML Determinista y Normalizado**:
   Se utiliza `@dbml/core` para el parseo inicial, pero el modelo interno se normaliza mediante esquemas de **Zod**. La serialización a DBML es determinista para garantizar diffs limpios en Git.
5. **Transacciones Atómicas de Esquema**:
   La confirmación de un cambio actualiza el archivo canónico `schema.dbml`, genera el ADR en Markdown inmutable y limpia los borradores en una sola operación atómica con rollback en caso de error.

---

## 2. Diagrama de Arquitectura

```mermaid
flowchart TD
    subgraph UI["Capa Visual (apps/web)"]
        Canvas["React 19 + @xyflow/react<br/>SchemaCanvas & TableNode"]
        Inspector["Inspector lateral<br/>Edición de columnas y tipos"]
        Drawers["PendingDrawer & DecisionsDrawer"]
    end

    subgraph Server["Capa de Transporte & API (packages/server)"]
        Hono["Servidor Hono (127.0.0.1:4317)<br/>Middleware DNS-Rebinding"]
        FsBrowser["Explorador seguro de carpetas<br/>(fs-browser.ts)"]
        StaticServe["Servidor de activos SPA"]
    end

    subgraph Agents["Capa de Agentes IA (packages/mcp)"]
        StdioMCP["Servidor MCP (stdio)<br/>@modelcontextprotocol/sdk"]
        Tools12["12 Herramientas MCP<br/>get_schema, draft_adr, confirm_change..."]
    end

    subgraph CLI["Capa de Comandos (packages/cli)"]
        Commander["CLI Binario ('sm' / 'schema-memory')<br/>ui, add, rm, status, setup, doctor"]
        SetupEngine["Orquestador Idempotente de Setup"]
    end

    subgraph Core["Núcleo de Negocio (packages/core)"]
        Model["model.ts (Zod AST normalizado)"]
        Dbml["dbml.ts & serialize.ts"]
        Diff["diff.ts (Motor de diferencias estructurales)"]
        Registry["registry.ts (~/.schema-memory/projects.json)"]
        Scaffold["scaffold.ts & drift.ts"]
        ADR["pending.ts & adr.ts & confirm.ts"]
    end

    Canvas --> Hono
    Inspector --> Hono
    Drawers --> Hono
    Hono --> Core
    FsBrowser --> Core
    StdioMCP --> Tools12
    Tools12 --> Core
    Commander --> Core
    Commander --> StdioMCP
    Commander --> Hono
```

---

## 3. Desglose de Paquetes (`packages/` y `apps/`)

### 3.1 `@schema-memory/core` (`packages/core/`)
La biblioteca central compartida:
- **`src/model.ts`**: Esquemas Zod normalizados (`SchemaModel`, `Table`, `Column`, `Ref`, `Enum`, `ProjectConfig`, `PendingChange`, `AdrDraft`). Aísla al sistema de fluctuaciones en el parser externo.
- **`src/dbml.ts` & `src/serialize.ts`**: Conversión bidireccional entre texto DBML y AST normalizado con serialización consistente de tablas, campos, llaves foráneas y notas.
- **`src/diff.ts`**: Compara dos esquemas determinando tablas añadidas/eliminadas, columnas alteradas o renombradas y relaciones intervenidas.
- **`src/registry.ts`**: Gestiona el catálogo global de proyectos en `~/.schema-memory/projects.json`.
- **`src/scaffold.ts`**: Inicializa nuevos proyectos (`planAddProject` / `applyAddProject`), inyectando de forma idempotente las reglas de guardrail en el `AGENTS.md` del repositorio cliente.
- **`src/pending.ts` & `src/adr.ts`**: Manejo de cambios en borrador (`.schema-memory/pending/change.json`) y generación de ADRs en Markdown con frontmatter YAML.
- **`src/confirm.ts`**: Ejecuta la transacción atómica: sincroniza `schema.dbml`, crea `adr/000X-[slug].md`, borra borradores y devuelve el payload `engramSummary`.
- **`src/drift.ts`**: Compara el esquema canónico DBML contra modelos del repositorio cliente para advertir desincronizaciones.

### 3.2 `@schema-memory/mcp` (`packages/mcp/`)
Servidor bajo el estándar Model Context Protocol:
- Comunicación mediante entrada y salida estándar (`stdio`).
- Resolución automática de proyecto por CWD del proceso, flag explícito `--project`, o fallback de proyecto único registrado.
- Expone las 12 herramientas MCP requeridas para el flujo de pair programming guiado.

### 3.3 `@schema-memory/server` (`packages/server/`)
Servidor HTTP local montado sobre **Hono**:
- Escucha en `127.0.0.1:4317`.
- **Seguridad**: Middleware de verificación estricta de `Host` y `Origin`.
- **`fs-browser.ts`**: API para navegar unidades y carpetas del disco local dentro del modal de agregar proyecto en la UI web (con soporte completo de unidades Windows `C:`, `D:`, etc.).
- **Modo Producción**: Sirve los activos precompilados de `apps/web/dist`.

### 3.4 `@schema-memory/cli` (`packages/cli/`)
Punto de entrada empaquetado para distribución en npm:
- Comandos: `ui` (por defecto), `add` (alias: `init`), `remove` (alias: `rm`), `status` (alias: `ls`), `mcp`, `setup` y `doctor`.
- Shims multiplataforma para macOS, Linux y Windows (`.cmd` y `.ps1` nativos sin Developer Mode ni permisos de administrador).
- Detección interactiva de primera ejecución para ofrecer `sm setup`.

### 3.5 `apps/web` (`apps/web/`)
Single Page Application reactiva:
- **`SchemaCanvas.tsx`**: Lienzo visual basado en `@xyflow/react` v12 con zoom, pan, modo bloqueo (`Lock`/`Unlock`) y centrado animado (`fitView`).
- **`TableNode.tsx`**: Nodo visual con handles de conexión, badges PK/FK/UQ y notas.
- **`Inspector.tsx`**: Panel lateral para edición de atributos de tablas y campos.
- **`PendingDrawer.tsx`**: Cajón de diferencias pendientes con botón para copiar el prompt de debate para el agente de IA.
- **`DecisionsDrawer.tsx`**: Línea de tiempo cronológica de ADRs con filtros por entidad.
- **`AddProjectModal.tsx`**: Asistente en 4 pasos con preview dry-run y explorador de rutas locales.

---

## 4. Matriz de Stack Tecnológico

| Capa | Tecnologías | Propósito |
| :--- | :--- | :--- |
| **Runtime & Gestor** | Node.js 22, Bun 1.1+, pnpm 9 | Entorno modular con workspaces y cero dependencias de Docker |
| **Lenguaje** | TypeScript 5.7 (ESM nativo, Strict) | Tipado estricto extremo a extremo |
| **Modelado DBML** | `@dbml/core`, `zod` | Parseo, validación y serializador determinista |
| **Protocolo Agentes** | `@modelcontextprotocol/sdk` (v1.x) | 12 tools stdio para Antigravity, OpenCode y Claude Code |
| **Backend REST** | `hono`, `@hono/node-server` | Servidor ultraligero local con protección anti DNS-rebinding |
| **Frontend Web** | React 19, `@xyflow/react` v12, Zustand, Vite 6 | Canvas visual interactivo y gestión reactiva de estado |
| **CLI** | `commander` | CLI binario `schema-memory` / `sm` |
| **Testing** | `vitest` | Pruebas unitarias e integración en todos los paquetes |
