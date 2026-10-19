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
6. **Compresión Gzip & Caché HTTP ETag**:
   El servidor Hono descomprime automáticamente peticiones con `Content-Encoding: gzip` y comprime respuestas salientes. El endpoint de esquema implementa cabeceras `ETag` calculadas a partir del fingerprint del proyecto, respondiendo con `304 Not Modified` ante peticiones condicionales `If-None-Match`.
7. **Caché en Memoria LRU & Reducción de Tokens**:
   El parseo y validación de AST DBML está acelerado por una caché LRU indexada por hash criptográfico del contenido. Los agentes pueden solicitar esquemas filtrados por tabla (`filterSchemaByTables`) para minimizar tokens consumidos.

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
        Tools12["12 Herramientas + 3 Prompts<br/>get_schema, draft_adr, check_drift..."]
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
- **`src/dbml.ts` & `src/serialize.ts`**: Conversión bidireccional entre texto DBML y AST normalizado con serialización consistente de tablas, campos, llaves foráneas y notas. Incluye **caché LRU** de AST (`MAX_SCHEMA_CACHE = 64`) y la función `filterSchemaByTables` para podar esquemas y ahorrar tokens en prompts de IA.
- **`src/compression.ts`**: Utilidades de compresión (`gzipBuffer`, `gunzipBuffer`, `isGzipPayload`) sobre `node:zlib` para optimizar payloads de red.
- **`src/diff.ts`**: Compara dos esquemas determinando tablas añadidas/eliminadas, columnas alteradas o renombradas y relaciones intervenidas.
- **`src/registry.ts` & `src/config.ts`**: Gestión de catálogo global de proyectos (`~/.schema-memory/projects.json`) y configuraciones locales con invalidación inteligente basada en `mtimeMs` y tamaño de archivo.
- **`src/scaffold.ts`**: Inicializa nuevos proyectos (`planAddProject` / `applyAddProject`), inyectando de forma idempotente las reglas de guardrail en el `AGENTS.md` del repositorio cliente.
- **`src/pending.ts` & `src/adr.ts`**: Manejo de cambios en borrador (`.schema-memory/pending/change.json`), verificación rápida de estado (`getPendingStatus`, `countAdrsStatus`) y generación de ADRs en Markdown con frontmatter YAML.
- **`src/confirm.ts`**: Ejecuta la transacción atómica: sincroniza `schema.dbml`, crea `adr/000X-[slug].md`, borra borradores y devuelve el payload `engramSummary`.
- **`src/hash.ts`**: Normalización determinista de DBML y cálculo del `computeProjectFingerprint` para invalidación de cachés ETag.
- **`src/drift.ts`**: Compara el esquema canónico DBML contra modelos del repositorio cliente para advertir desincronizaciones.

### 3.2 `@schema-memory/mcp` (`packages/mcp/`)
Servidor bajo el estándar Model Context Protocol:
- Comunicación mediante entrada y salida estándar (`stdio`).
- Resolución automática de proyecto por CWD del proceso, flag explícito `--project`, o fallback de proyecto único registrado.
- Expone las 12 herramientas MCP optimizadas para ahorro de tokens de contexto (soporte de filtrado por tablas en `get_schema`, exclusión de `rawMarkdown` por defecto en `get_adr` y serialización JSON compacta).

### 3.3 `@schema-memory/server` (`packages/server/`)
Servidor HTTP local montado sobre **Hono**:
- Escucha de forma predeterminada en `127.0.0.1:4317` (puerto configurable mediante el flag `-p / --port`).
- **Seguridad**: Middleware de verificación estricta de `Host` y `Origin` anti DNS-rebinding (solo admite invocaciones locales).
- **Manejo de Gzip**: Middleware `gunzipRequestMiddleware` para descompresión transparente de cuerpos de petición entrantes (`Content-Encoding: gzip`) y compresión automática de respuestas salientes (excluyendo streams SSE `/events`).
- **Caché Condicional ETag**: Endpoint `/api/projects/:id/schema` calcula ETags y responde `304 Not Modified` cuando el fingerprint no ha variado.
- **`fs-browser.ts`**: API para navegar unidades y carpetas del disco local dentro del modal de agregar proyecto en la UI web (sondeo dinámico de unidades Windows `A:\` a `Z:\` y montajes POSIX `/Volumes`, `/mnt`, `/media` sin caché estático para reflejar unidades insertadas o montadas al vuelo).
- **Modo Producción & Caché de Activos**: Sirve los activos precompilados de `apps/web/dist` con encabezados `Cache-Control: public, max-age=31536000, immutable` en `/assets/*`.

### 3.4 `@schema-memory/cli` (`packages/cli/`)
Punto de entrada empaquetado para distribución en npm:
- **Empaquetado Autocontenido (Zero External Fetch & Zero Runtime External Dependencies)**: Durante el build, los activos estáticos compilados de `apps/web/dist` se copian dentro de `packages/cli/dist/web/`. `tsup` empaqueta todas las dependencias (`noExternal: [/(.*)/]`), garantizando un bundle único 100% autocontenido y sin dependencias externas de runtime.
- **Capa Modular de Adaptadores de Plataforma (`src/platform/`)**:
  - Contrato unificado `PlatformAdapter` (`types.ts`) consumido mediante la factoría `getPlatform()`.
  - `WindowsPlatformAdapter`: Shims nativos `.cmd`, `.ps1` y `sh` con soporte cross-drive (rutas absolutas al cruzar discos `E:\` vs `C:\`), detección y reparación automática de shims corruptos, terminación de árbol de procesos mediante `taskkill /pid ... /T /F`, apertura segura de URLs con sanitización de `&` (`cmd.exe /c start "" "${url}"`) y separación de PATH por `;`.
  - `BasePosixPlatformAdapter` (`DarwinPlatformAdapter` y `LinuxPlatformAdapter`): Creación de symlinks con permisos ejecutables `0o755`, terminación limpia vía `SIGTERM`, comandos de navegador según el SO (`open` en macOS, `xdg-open` en Linux) y sugerencias de configuración para `~/.zshrc` o `~/.bashrc`.
- **Gestión de Daemon en Segundo Plano (`daemon.ts`)**:
  - Permite ejecutar la UI desvinculada de la terminal en segundo plano (`sm` / `sm start`, `sm stop`, `sm restart`, `sm status`), persistiendo metadatos en `~/.schema-memory/ui.json` (`{ pid, port, url, startedAt }`).
  - Flag `--foreground` para ejecución bloqueante en contenedores o desarrollo.
  - Sonda de salud HTTP contra `/healthz` y fallback automático de puertos (reintenta puertos 4317 a 4327 en caso de `EADDRINUSE`).
- **Auto-Build Inteligente (`scripts/ensure-build.mjs`)**:
  - Guardián en scripts de desarrollo (`pnpm ui`, `pnpm start`, `pnpm doctor`, etc.) que compara el `mtime` de los paquetes fuente contra `packages/cli/dist/index.js` y auto-compila en ~300ms solo cuando detecta cambios.
- **Setup selectivo por target y perfil (`src/commands/setup.ts` + `setup-config.ts`)**:
  - Targets independientes: `opencode`, `antigravity` (App/IDE), `antigravity-cli` y `agents`.
  - Perfiles `minimal`, `recommended` y `strict` que resuelven qué componentes escribe cada target.
  - Wizard interactivo con detección de agentes instalados; flags `--target`, `--profile`, `--print`, `--yes` y `--refresh-projects` para automatización.
  - Aislamiento de escrituras: un target nunca modifica rutas de otro. El plugin de Antigravity se genera con el manifest oficial (`$schema`, `name`, `description`) y la CLI se importa con `agy plugin install`.
- **Detección interactiva de primera ejecución** para ofrecer `sm setup` si los agentes no están configurados.

### 3.5 `apps/web` (`apps/web/`)
Single Page Application reactiva:
- **`SchemaCanvas.tsx`**: Lienzo visual basado en `@xyflow/react` v12 con zoom, pan, modo bloqueo (`Lock`/`Unlock`), centrado animado (`fitView`), hover de tablas/relaciones y auto-layout Dagre (horizontal/vertical) que persiste en `layout.json`.
- **`SchemaEdge.tsx`**: Arista flotante que se conecta al lado más cercano de cada tabla, con badges de cardinalidad (`1`/`N`/`M`), etiqueta `tabla.columna → tabla.columna` al hacer hover/seleccionar, separación de aristas paralelas y loop para self-references.
- **`TableNode.tsx`**: Nodo visual con handles de conexión (visibles al hacer hover), badges PK/FK/UQ y notas.
- **`lib/relationships.ts`**: Normalización de dirección FK/referenciada, etiquetas, cardinalidades y mantenimiento de refs al renombrar/eliminar columnas.
- **`lib/layout.ts`**: Cálculo de posiciones con Dagre para el auto-layout.
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
| **Backend REST** | `hono`, `@hono/node-server`, `hono/compress` | Servidor ultraligero local con protección anti DNS-rebinding y compresión HTTP |
| **Compresión & Caching** | `node:zlib`, ETags, LRU AST cache | Optimización de ancho de banda y latencia en transferencias pesadas de esquema |
| **Frontend Web** | React 19, `@xyflow/react` v12, Zustand, Vite 6 | Canvas visual interactivo y gestión reactiva de estado |
| **CLI** | `commander` | CLI binario `schema-memory` / `sm` |
| **Testing** | `vitest` | Pruebas unitarias e integración en todos los paquetes |
