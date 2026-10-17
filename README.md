# schema-memory

> **Memoria canónica de esquemas de base de datos, flujo de Architecture Decision Records (ADRs) y compañero de pair programming para desarrolladores freelance que trabajan con asistentes de IA.**

[![npm](https://img.shields.io/npm/v/schema-memory.svg)](https://www.npmjs.com/package/schema-memory)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D20.5-green.svg)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.1-f472b6.svg)](https://bun.sh/)
[![pnpm](https://img.shields.io/badge/pnpm-9.x-orange.svg)](https://pnpm.io/)
[![Zero Docker](https://img.shields.io/badge/Docker-0%20(Not%20Required)-success.svg)](#stack-tecnol%C3%B3gico)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 1. Contexto y Motivación: ¿Por qué existe `schema-memory`?

Como desarrollador freelance o full-stack, el ritmo de trabajo con herramientas de Inteligencia Artificial (Antigravity, Claude Code, Cursor, Copilot) es vertiginoso. Delegar tareas permite construir sistemas a gran velocidad, pero introduce un problema crítico:

> **El problema del ritmo acelerado:** Cuanto más rápido avanzas delegando en la IA, **menos interiorizas cada decisión técnica**. Se pierde el rastro de *por qué* una tabla se diseñó de cierta forma, qué alternativas se descartaron, cómo estaba implementada antes y por qué se decidió cambiarla.

Además, cuando necesitas entender cómo funcionan los datos en un sistema:
1. Diseñas un diagrama de BD en una herramienta externa (drawDB, ChartDB, DrawSQL, etc.).
2. Modificas algo en la herramienta visual.
3. Tienes que **volver a explicarle manualmente a la IA** todo el diagrama y el contexto para que pueda actualizar el código o generar migraciones.
4. Si intentas registrar estas decisiones a mano en herramientas como **Notion** o **Engram**, el proceso se vuelve manual, repetitivo y propenso a desincronizarse del código fuente.

### La Solución de `schema-memory`

`schema-memory` resuelve este problema creando un puente directo entre el modelado visual, el repositorio del cliente y tu agente de IA:

1. **Esquema canónico neutral en cada repositorio:** El esquema canónico vive dentro de la carpeta `.schema-memory/schema.dbml` de cada proyecto de cliente en formato **DBML neutral**.
2. **Debate obligatorio de diseño con la IA:** Cuando realizas cambios en el diagrama (o cuando la IA propone un cambio), no se aplican de inmediato al código. Se genera un cambio pendiente y la IA inicia un **debate guiado** contigo: *"¿Por qué separamos esta tabla? ¿Qué trade-offs evaluamos? ¿Qué alternativas descartamos?"*.
3. **ADRs inmutables versionados en Git:** Cada confirmación genera un archivo Markdown inmutable en `.schema-memory/adr/000X-[slug].md` con metadatos de las tablas afectadas.
4. **Memoria persistente en Engram:** La herramienta genera automáticamente un `engramSummary` para que la IA lo guarde en tu sistema de memoria a largo plazo (Engram / Notion).
5. **Cero Docker, 100% ligero:** Corre nativo sobre Node.js y pnpm como una aplicación local y un servidor MCP global multi-proyecto.

---

## 2. Stack Tecnológico

`schema-memory` fue diseñado con el principio de mínima fricción y máxima ligereza:

| Capa | Tecnologías | Propósito |
| :--- | :--- | :--- |
| **Runtime & Gestor** | Node.js 22, pnpm workspaces | Monorepo modular de alto rendimiento |
| **Lenguaje** | TypeScript (Strict mode, ESM nativo) | Seguridad de tipos de extremo a extremo |
| **Modelado DBML** | `@dbml/core`, `zod` | AST DBML, validación, diffing y serializador determinista |
| **Servidor MCP** | `@modelcontextprotocol/sdk` (v1.x) | 12 tools sobre stdio para integración con agentes de IA |
| **Backend REST** | `hono`, `@hono/node-server` | API local (`127.0.0.1:4317`) con protección anti DNS-rebinding |
| **Frontend Web** | React 19, `@xyflow/react` (v12), Zustand, Vite 6 | Canvas interactivo, inspector lateral y drawers deslizantes |
| **CLI** | `commander` | Binario `schema-memory` (`ui`, `add`, `remove`, `status`, `setup`) |
| **Tests** | `vitest` | Pruebas unitarias e integración en todos los paquetes |

> [!NOTE]
> **Sin contenedores Docker**: `schema-memory` no levanta contenedores, bases de datos externas ni servicios pesados en segundo plano. Corre directamente con `node`.

---

## 3. Estructura del Proyecto: ¿Qué es cada carpeta y qué hace?

El monorepo está organizado en paquetes desacoplados dentro de `packages/` y aplicaciones en `apps/`:

```
schema-memory/
├── package.json               # Configuración raíz del monorepo y scripts
├── pnpm-workspace.yaml        # Definición de workspaces (packages/*, apps/*)
├── tsconfig.base.json         # Configuración base compartida de TypeScript
├── vitest.workspace.ts        # Suite centralizada de tests con Vitest
│
├── packages/
│   ├── core/                  # El núcleo de lógica de negocio (Agnóstico a UI/MCP)
│   ├── mcp/                   # Servidor MCP stdio para agentes de IA
│   ├── server/                # API REST local Hono + Servidor estático de la Web
│   └── cli/                   # Ejecutable de línea de comandos `schema-memory`
│
├── apps/
│   └── web/                   # Aplicación frontend SPA (React 19 + React Flow)
│
├── plugin/                    # Manifiesto y skill del plugin de Antigravity
├── scripts/                   # Scripts utilitarios (ej: dev runner)
└── fixtures/                  # Esquemas DBML y repositorios de prueba (Prisma, Django)
```

### Detalle de Paquetes (`packages/`):

#### 1. `@schema-memory/core` (`packages/core/`)
Es la biblioteca central compartida que no depende de interfaces ni servidores:
- **`src/model.ts`**: Define los esquemas Zod normalizados (`SchemaModel`, `Table`, `Column`, `Ref`, `Enum`, `ProjectConfig`, `PendingChange`, `AdrDraft`). Aísla a todo el sistema de cambios internos en `@dbml/core`.
- **`src/dbml.ts` & `src/serialize.ts`**: Parsea código DBML a modelos normalizados y genera código DBML formateado de manera determinista.
- **`src/diff.ts`**: Motor de diferencias estructurales. Compara dos esquemas e identifica tablas añadidas/eliminadas, columnas modificadas, relaciones creadas y entidades afectadas.
- **`src/registry.ts`**: Gestiona el registro global de proyectos (`~/.schema-memory/projects.json`).
- **`src/scaffold.ts`**: Vincula proyectos nuevos (`planAddProject` / `applyAddProject`), inyectando de forma idempotente las reglas en el `AGENTS.md` del repositorio cliente.
- **`src/pending.ts` & `src/adr.ts`**: Maneja el ciclo de vida de cambios en borrador (`pending/change.json`) y la escritura/lectura de ADRs en Markdown con frontmatter YAML.
- **`src/confirm.ts`**: Ejecuta la transacción atómica de confirmación: actualiza el DBML canónico, genera el ADR final, limpia pendientes y devuelve el `engramSummary`.
- **`src/drift.ts`**: Detecta desincronizaciones entre el DBML canónico y los modelos del repositorio cliente.

#### 2. `@schema-memory/mcp` (`packages/mcp/`)
Implementa el servidor bajo el **Model Context Protocol (MCP)** de Anthropic/Google:
- Se comunica a través de entrada/salida estándar (`stdio`).
- Resuelve automáticamente el proyecto activo por CWD, parámetro `--project`, o proyecto único registrado.
- Expone las 12 herramientas que los agentes de IA (Antigravity, Claude Code, etc.) utilizan para inspeccionar el esquema, proponer cambios y registrar decisiones.

#### 3. `@schema-memory/server` (`packages/server/`)
Servidor HTTP ultraligero montado sobre **Hono**:
- Escucha de forma predeterminada en `127.0.0.1:4317`.
- **Seguridad**: Middleware que valida cabeceras `Host` y `Origin` para evitar ataques de *DNS rebinding* desde páginas web maliciosas.
- **Explorador seguro (`fs-browser.ts`)**: Permite al asistente de la UI navegar carpetas locales para vincular proyectos sin escapar del sistema de archivos permitido.
- **Servidor SPA**: En producción o modo standalone, sirve directamente los archivos compilados de `apps/web/dist`.

#### 4. `@schema-memory/cli` (`packages/cli/`)
Punto de entrada de línea de comandos basado en **Commander**:
- Comandos disponibles: `ui`, `add`, `remove`, `status`, `mcp`, `setup`.

---

### Detalle de Aplicaciones (`apps/`):

#### `apps/web/`
Aplicación web moderna tipo SPA (Single Page Application):
- **`src/components/SchemaCanvas.tsx`**: Lienzo interactivo basado en `@xyflow/react` v12. Cuenta con zoom suave, centrado animado (`fitView`), modo pantalla completa real (Fullscreen API nativa), y modo de bloqueo contra ediciones accidentales (`Lock`/`Unlock`).
- **`src/components/TableNode.tsx`**: Nodo visual de tabla con puntos de anclaje (handles) de alto contraste, iconos de clave primaria (`Key`), badges de unicidad (`UQ`) y notas emergentes.
- **`src/components/Inspector.tsx`**: Panel lateral derecho para inspeccionar o crear tablas, modificar tipos de datos y añadir columnas.
- **`src/components/PendingDrawer.tsx`**: Cajón deslizable que detalla las diferencias del cambio pendiente y ofrece una caja con 1-clic para copiar el prompt de debate a tu agente.
- **`src/components/DecisionsDrawer.tsx`**: Timeline cronológico de todos los ADRs del proyecto, con filtros por tabla y badges de estado (`confirmado` vs `reconstruido`).
- **`src/components/AddProjectModal.tsx`**: Asistente interactivo en 4 pasos para vincular nuevos proyectos con previsualización dry-run.

---

## 4. Guía de Inicio Rápido

### Requisitos Previos
- **Node.js** v20.5+ (recomendado v22) o **Bun** v1.1+.
- Gestor/ejecutor de paquetes: **npm / npx**, **bun / bunx**, o **pnpm**.

### Opción A: Ejecución Directa con `npx` o `bunx` (Sin instalar / Recomendado por npm)

Siguiendo la [recomendación oficial de npm](https://docs.npmjs.com/downloading-and-installing-packages-globally) y [Bun](https://bun.com/docs/pm/bunx), puedes ejecutar `schema-memory` directamente sin instalar paquetes globales:

```bash
# Con npm (npx)
npx schema-memory

# Con Bun (bunx)
bunx schema-memory

# Con pnpm
pnpm dlx schema-memory
```

- **Primera ejecución**: si aún no configuraste tus agentes, te ofrecerá ejecutar `setup` automáticamente y registrará el servidor MCP usando `npx -y schema-memory mcp` o `bunx schema-memory mcp` (inmune a limpiezas de caché).
- **Configurar agentes directamente**: `npx schema-memory setup` o `bunx schema-memory setup`.
- **Diagnóstico**: `npx schema-memory doctor` o `bunx schema-memory doctor`.

### Opción B: Instalar el CLI global `sm` (`npm` o `bun`)

Si prefieres tener el comando corto **`sm`** disponible al instante en tu terminal en **macOS, Linux y Windows**:

```bash
# 1. Instalar globalmente con npm, Bun o pnpm
npm i -g schema-memory
# o con Bun:
bun add -g schema-memory
# o con pnpm:
pnpm add -g schema-memory

# 2. Configurar tus agentes (OpenCode, Antigravity y skills) — idempotente
sm setup

# 3. Abrir la interfaz web local
sm
```

> [!TIP]
> **Nota sobre `npm i schema-memory` vs `npx` / `-g`**: El comando `npm i schema-memory` (sin `-g`) que muestra por defecto la barra lateral de `npmjs.com` instala el paquete solo dentro de la carpeta `./node_modules` de un proyecto. Como `schema-memory` es una herramienta CLI y servidor MCP multi-proyecto, úsalo siempre con **`npx schema-memory` / `bunx schema-memory`** o instálalo globalmente con **`npm i -g schema-memory` / `bun add -g schema-memory`**.

> [!NOTE]
> **Windows**: el explorador de carpetas de la UI puede navegar por todas tus unidades (`C:`, `D:`, `E:`, …), el registro MCP funciona automáticamente y no se requieren permisos de administrador ni Developer Mode.

### Opción C: Desde el repositorio (desarrollo)

```bash
# 1. Clonar el repositorio y situarse en la carpeta
cd schema-memory

# 2. Instalar dependencias
pnpm install

# 3. Compilar todos los paquetes del monorepo
pnpm build
```

---

### Modos de Ejecución (desde el repositorio)

Tienes dos opciones según lo que necesites:

#### Modo App Completa (Uso Diario / Recomendado)
Un solo comando levanta el servidor backend y abre automáticamente la interfaz web en **`http://127.0.0.1:4317`**:
```bash
pnpm ui
# (o `sm` / `npx schema-memory` / `bunx schema-memory`)
```

#### Modo Desarrollo con Hot-Reload
Si deseas modificar el código de la UI web o los estilos en tiempo real:
```bash
pnpm dev
```
Este comando orquesta concurrentemente:
1. El backend Hono en `http://127.0.0.1:4317`.
2. El servidor de desarrollo Vite en `http://localhost:5173` con recarga ultrarrápida y proxy automático a la API.

---

## 5. Comandos CLI (`npx` / `bunx`, `sm` global y `pnpm`)

### 5.1 Opciones de Instalación Global o Ejecución Directa
```bash
# Ejecución directa sin instalar:
npx schema-memory          # npm
bunx schema-memory         # Bun
pnpm dlx schema-memory     # pnpm

# O instalación global del comando corto `sm`:
npm i -g schema-memory     # npm
bun add -g schema-memory   # Bun (alias: bun i -g schema-memory)
pnpm add -g schema-memory  # pnpm
```
La instalación global registra los comandos `sm` y `schema-memory` en el PATH en **macOS, Linux y Windows** (shims `.cmd`/`.ps1` nativos en Windows).

Si trabajas desde este repositorio y quieres enlazar el build local:
```bash
pnpm link-cli
```
Esto crea/enlaza `sm` y `schema-memory` en `~/.local/bin/` (symlink en Unix, shims `.cmd`/`.ps1` en Windows).

### 5.2 Tabla de Comandos Equivalentes

| Acción | Sin instalar (`npx` / `bunx`) | Con `sm` global (`-g`) | Desde este repo (`pnpm`) |
| :--- | :--- | :--- | :--- |
| **Abrir la interfaz web** | `npx schema-memory` / `bunx schema-memory` | `sm` *(o `sm ui`)* | `pnpm ui` *(o `pnpm start`)* |
| **Vincular carpeta actual** | `npx schema-memory init` / `bunx schema-memory init` | `sm init` | — |
| **Vincular proyecto por ruta** | `npx schema-memory add /ruta` | `sm add /ruta` | `pnpm sm add /ruta` |
| **Ver proyectos y estado** | `npx schema-memory ls` / `bunx schema-memory ls` | `sm ls` *(o `sm status`)* | `pnpm status` *(o `pnpm sm ls`)* |
| **Desvincular proyecto** | `npx schema-memory rm <id>` | `sm rm` o `sm rm <id>` | `pnpm sm rm <id>` |
| **Configuración Global Multi-Agente** | `npx schema-memory setup` / `bunx schema-memory setup` | `sm setup` | `pnpm sm setup` |
| **Diagnóstico de salud (`doctor`)** | `npx schema-memory doctor` / `bunx schema-memory doctor` | `sm doctor` | `pnpm sm doctor` |
| **Configurar solo OpenCode** | `npx schema-memory setup --target opencode` | `sm setup --target opencode` | `pnpm sm setup --target opencode` |
| **Configurar solo Antigravity** | `npx schema-memory setup --target antigravity` | `sm setup --target antigravity` | `pnpm sm setup --target antigravity` |
| **Previsualizar configuración** | `npx schema-memory setup --print` | `sm setup --print` | `pnpm sm setup --print` |
| **Ayuda de comandos** | `npx schema-memory --help` | `sm --help` | `pnpm sm --help` |

> [!NOTE]
> Nota sobre `pnpm`: los comandos `pnpm setup` y `pnpm doctor` (sin `sm` ni `run`) son subcomandos internos del propio gestor `pnpm`. Usa siempre **`sm setup` / `sm doctor`**, **`npx schema-memory setup`**, **`bunx schema-memory setup`** o **`pnpm sm setup`**.

### 5.3 ¿Qué instala `setup` (`sm setup` / `npx schema-memory setup` / `bunx schema-memory setup`)?
`schema-memory` es **100% agnóstico de agente**. Al ejecutar `setup` (por defecto `--target all`), configura de manera no destructiva (haciendo *merge* sin borrar tu configuración previa):
1. **Estándar Abierto Global (`~/.agents/skills/schema-memory/SKILL.md`)**: Leído automáticamente por **OpenCode** y agentes compatibles con el estándar Agent Skills.
2. **OpenCode Nativo (`~/.config/opencode/`)**:
   - Inyecta el servidor MCP `schema-memory` dentro de `~/.config/opencode/opencode.json` con el **formato nativo de OpenCode V2** (`mcp.servers.schema-memory`), usando `npx -y schema-memory mcp` / `bunx schema-memory mcp` (si se ejecutó con `npx`/`bunx`) o la ruta directa del binario global.
   - Añade el bloque delimitado en `~/.config/opencode/AGENTS.md` y el skill en `~/.config/opencode/skills/schema-memory/SKILL.md`.
3. **Antigravity Directo + Plugin (`~/.gemini/config/`)**:
   - Registra `schema-memory-mcp` directamente en `~/.gemini/config/mcp_config.json` y la regla global en `~/.gemini/config/GEMINI.md` (activo sin necesidad de habilitar plugins manualmente), además del paquete en `~/.gemini/config/plugins/schema-memory/`.
4. **CLI Global**: si se instaló globalmente o desde el repo, verifica/enlaza `sm` en el PATH; si se ejecutó vía `npx`/`bunx`, mantiene el flujo zero-install sin crear enlaces rotos a cachés temporales.
5. **Actualización de Guardrails en Proyectos Registrados**: Refresca el bloque `AGENTS.md` de tus proyectos registrados con reglas de aislamiento estricto para que el agente nunca inspeccione el código fuente de `schema-memory`.

---

## 6. Flujo de Trabajo con la Inteligencia Artificial (OpenCode / Antigravity / Claude Code)

```mermaid
flowchart TD
    A["Dev modela o edita tablas en Web UI"] --> B["Borrador guardado en .schema-memory/pending/change.json"]
    B --> C["Dev copia prompt desde UI al chat de su Agente (OpenCode / Antigravity)"]
    C --> D["IA invoca get_pending_changes()"]
    D --> E["IA inicia debate guiado de diseño técnico"]
    E --> F["IA formula draft_adr() con trade-offs y alternativas"]
    F --> G["Dev revisa borrador en chat y aprueba"]
    G --> H["IA llama confirm_change(userConfirmed=true)"]
    H --> I["Transacción atómica: actualiza schema.dbml + crea adr/000X.md"]
    I --> J["IA guarda engramSummary en Engram"]
    J --> K["IA aplica cambios en modelos y migraciones del código"]
```

### Las 12 Herramientas MCP Disponibles para la IA:

| Herramienta | Descripción |
| :--- | :--- |
| `list_projects` | Lista todos los proyectos registrados en `~/.schema-memory/`. |
| `get_schema` | Retorna el DBML canónico actual del proyecto. |
| `get_pending_changes` | Retorna las diferencias estructurales pendientes de confirmación. |
| `propose_change` | Permite a la IA proponer una modificación de esquema desde el chat. |
| `draft_adr` | Redacta o actualiza el borrador de decisión técnica. |
| `confirm_change` | Transacción atómica que aplica el cambio (exige `userConfirmed: true`). |
| `discard_change` | Descarta un cambio pendiente si se decide no avanzar. |
| `get_decisions` | Consulta el historial de ADRs filtrado por tabla o columna. |
| `get_adr` | Lee el contenido íntegro de un ADR específico por ID. |
| `confirm_adr` | Confirma un ADR en borrador existente. |
| `import_schema` | Importa un esquema inicial en DBML desde archivo o texto. |
| `check_drift` | Compara el DBML canónico contra los modelos ORM en el repositorio. |

---

## 7. Estructura Interna en Cada Repositorio Cliente

Al vincular un repositorio de cliente con `schema-memory add`, se crean los siguientes archivos:

```
mi-proyecto-cliente/
├── .schema-memory/
│   ├── config.json             # Identificador, stack detectado y dialecto
│   ├── schema.dbml             # Fuente de verdad canónica del esquema (DBML)
│   ├── layout.json             # Posiciones (x, y) de las tablas en el canvas
│   ├── adr/                    # Registro inmutable de Architecture Decision Records
│   │   ├── 0001-inicio.md      # ADR con status: reconstruido
│   │   └── 0002-cupones.md     # ADR con status: confirmado
│   ├── pending/                # Carpeta ignorada en Git (cambios en borrador)
│   │   ├── change.json         # Modificaciones visuales en curso
│   │   └── adr-draft.json      # Borrador del debate con la IA
│   └── .gitignore              # Ignora pending/
│
└── AGENTS.md                   # Bloque delimitado con instrucciones para cualquier IA
```

---

## 8. Verificación y Tests

El monorepo cuenta con una suite completa de pruebas unitarias y de integración que cubren parsing DBML, diffing, scaffolding, transacciones atómicas, servidor REST y protocolo MCP:

```bash
# Correr todas las pruebas con Vitest
pnpm test

# Correr solo pruebas de MCP
pnpm --filter @schema-memory/mcp test

# Correr solo pruebas del servidor HTTP
pnpm --filter @schema-memory/server test
```
