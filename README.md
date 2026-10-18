# schema-memory

> **Memoria canónica de esquemas de base de datos, flujo de Architecture Decision Records (ADRs) y compañero de pair programming para desarrolladores que trabajan con asistentes de IA.**

[![npm](https://img.shields.io/npm/v/schema-memory.svg)](https://www.npmjs.com/package/schema-memory)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D20.5-green.svg)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.1-f472b6.svg)](https://bun.sh/)
[![Zero Docker](https://img.shields.io/badge/Docker-0%20(Not%20Required)-success.svg)](#1-qu%C3%A9-es-schema-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 1. ¿Qué es `schema-memory`?

Al desarrollar sistemas a gran velocidad con asistentes de Inteligencia Artificial (Antigravity, OpenCode, Claude Code, Cursor), surge un problema crítico: **se pierde el rastro de por qué se toman decisiones sobre las bases de datos**. Las tablas se modifican sin registrar alternativas descartadas ni evaluar trade-offs, y volver a explicarle manualmente el contexto del esquema al agente resulta repetitivo y propenso a desincronizaciones.

`schema-memory` soluciona esto uniendo el modelado visual local con la memoria persistente del agente:

- 🎨 **Lienzo Visual Interactivo**: Diseña y edita tablas en un canvas local basado en **DBML canónico y neutral** (desacoplado de ORMs o SQL específicos).
- 🤖 **Debate Guiado con IA**: El agente no aplica cambios de base de datos a ciegas; antes de tocar código, inicia un debate arquitectónico obligatorio contigo en el chat.
- 📜 **ADRs Inmutables en Git**: Cada confirmación genera un Architecture Decision Record versionado en `.schema-memory/adr/` con las razones y alternativas técnicas.
- 🧠 **Memoria Persistente para el Agente**: Genera automáticamente un payload `engramSummary` en cada confirmación para que el asistente de IA guarde la decisión en su sistema de memoria a largo plazo (Engram, Notion, etc.).
- ⚡ **Zero Docker & Alto Rendimiento**: Corre como una aplicación nativa sobre Node.js o Bun con compresión Gzip transparente, caché ETag (`304 Not Modified`), caché LRU de esquemas y herramientas MCP optimizadas para ahorrar tokens.

---

## 2. Inicio Rápido (Quick Start)

> [!NOTE]
> **No instales con `npm i schema-memory` en proyectos**: La barra lateral de `npmjs.com` sugiere ese comando por defecto, pero instala el paquete solo en `node_modules` local. Usa siempre **`npx schema-memory`** (ejecución directa) o instálalo globalmente con **`npm i -g schema-memory`** para disponer del comando `sm`.

### Opción A: Ejecución Directa con `npx` o `bunx` (Recomendada / Zero-Install)

Ejecuta `schema-memory` directamente sin necesidad de instalar paquetes globales:

```bash
# Con npm
npx schema-memory

# Con Bun
bunx schema-memory

# Con pnpm
pnpm dlx schema-memory
```

- Inicia la aplicación web local y el servidor en `http://127.0.0.1:4317` (SPA precompilada 100% offline, sin dependencias externas).
- En la primera ejecución, si tus agentes de IA aún no están configurados, te ofrecerá ejecutar `setup` automáticamente de forma interactiva.

### Opción B: Instalar el CLI global `sm`

Para disponer del comando corto **`sm`** en tu terminal en **macOS, Linux y Windows** (con soporte nativo para proyectos en cualquier unidad de disco como `C:`, `D:`, `E:` sin requerir modo desarrollador ni permisos de administrador):

```bash
# 1. Instalar globalmente
npm i -g schema-memory
# o con Bun:
bun add -g schema-memory

# 2. Configurar agentes de IA (OpenCode, Antigravity y skills globales)
sm setup

# 3. Iniciar la interfaz web en segundo plano (daemon)
sm

# 4. Detener o reiniciar el servidor cuando lo desees
sm stop
sm restart
```

---

## 3. Flujo de Trabajo con IA en 4 Pasos

```mermaid
flowchart LR
    A["1. Modela en Web UI<br/>(http://127.0.0.1:4317)"] --> B["2. Copia prompt<br/>al chat del Agente"]
    B --> C["3. Debate técnico guiado<br/>& borrador de ADR"]
    C --> D["4. Aprobación & Transacción atómica<br/>(schema.dbml + adr/000X.md)"]
```

1. **Diseña en el Canvas**: Abre la UI local (`sm`), crea tablas, añade columnas o relaciones.
2. **Copia el Prompt al Agente**: Haz clic en el botón de la UI para transferir los cambios pendientes a tu asistente de IA (OpenCode, Antigravity, Claude Code, Cursor).
3. **Debate Guiado de Decisiones**: La IA analiza el diff con `get_pending_changes()` y debate contigo: *¿Por qué separamos esta tabla? ¿Qué trade-offs evaluamos? ¿Qué alternativas descartamos?*.
4. **Confirmación Atómica**: Al aprobar la decisión en el chat, la IA ejecuta `confirm_change(userConfirmed=true)`, actualizando el esquema canónico y generando el ADR inmutable en tu repositorio.

---

## 4. Referencia de Comandos CLI

| Comando | Alias | Descripción |
| :--- | :--- | :--- |
| `sm` | `sm ui`, `sm start` | Inicia la UI y API en segundo plano en `http://127.0.0.1:4317` (puerto configurable con `-p / --port`, flag `--foreground` para ejecución bloqueante). |
| `sm stop` | — | Detiene limpiamente el proceso del servidor UI en segundo plano. |
| `sm restart` | — | Reinicia la UI en segundo plano y reabre el navegador si es necesario. |
| `sm status` | `sm ls` | Muestra el estado del servidor UI (activo/PID o detenido), proyectos vinculados, cambios pendientes y ADRs. |
| `sm add [ruta]` | `sm init` | Vincula un proyecto a `schema-memory` (detecta automáticamente proyectos existentes clonados). |
| `sm remove [id]` | `sm rm` | Desvincula un proyecto de `schema-memory`. |
| `sm setup` | — | Configura de forma no destructiva los servidores MCP y skills (`--target all\|opencode\|antigravity`). |
| `sm doctor` | — | Diagnóstico de salud de registro MCP, binarios en el PATH, shims y estado de proyectos. |
| `sm mcp` | — | Inicia el servidor MCP sobre `stdio` para comunicación directa con agentes. |

---

## 5. Integración con Agentes de IA

`schema-memory` es agnóstico de agente e implementa el protocolo abierto **Model Context Protocol (MCP)**:

- **OpenCode**: Configuración automática con `sm setup` en `~/.config/opencode/opencode.json` (formato V2), skills y reglas en `AGENTS.md`.
- **Google Antigravity**: Registro automático con `sm setup` en `~/.gemini/config/mcp_config.json`, regla global en `GEMINI.md` y plugin oficial.
- **Claude Code**: Conexión directa mediante CLI:
  ```bash
  claude mcp add schema-memory -- npx -y schema-memory mcp
  ```
- **Cursor**: Añadir a `~/.cursor/mcp.json` (o Settings → MCP):
  ```json
  {
    "mcpServers": {
      "schema-memory": {
        "command": "npx",
        "args": ["-y", "schema-memory", "mcp"]
      }
    }
  }
  ```
- **Estándar Abierto Agent Skills**: Soporte nativo para la especificación universal en `~/.agents/skills/schema-memory/SKILL.md`.

---

## 6. Documentación Detallada

Para profundizar en el diseño interno, la especificación técnica o contribuir al código:

- 🏗️ **[Arquitectura de Sistemas y Estructura Interna](https://github.com/RaixsG/schema-memory/blob/main/docs/architecture.md)**: Diseño por capas, monorepo (`packages/core`, `server`, `mcp`, `cli`, `apps/web`), Zero Docker y seguridad local anti DNS-rebinding.
- 🔌 **[Protocolo MCP e Integración con Agentes IA](https://github.com/RaixsG/schema-memory/blob/main/docs/mcp.md)**: Referencia detallada de las 12 herramientas MCP, ciclo de debate guiado y directivas de aislamiento estricto.
- 📁 **[Especificación del Repositorio Cliente (`.schema-memory/`)](https://github.com/RaixsG/schema-memory/blob/main/docs/specification.md)**: Formato de `schema.dbml`, ADRs inmutables en Markdown, metadatos YAML y detección de drift.
- 🛠️ **[Guía de Contribución y Desarrollo Local](https://github.com/RaixsG/schema-memory/blob/main/CONTRIBUTING.md)**: Setup con `pnpm`, desarrollo con hot-reload (`pnpm dev`), suite de tests con Vitest y compilación de binarios standalone.

---

## Licencia

[MIT](LICENSE) © 2026 RaixsG
