# Protocolo MCP e Integración con Agentes de Inteligencia Artificial

Este documento describe la integración de **`schema-memory`** con asistentes y agentes de IA (Google Antigravity, OpenCode, Claude Code, Cursor) a través del **Model Context Protocol (MCP)**.

---

## 1. Servidor MCP y Transporte

El servidor MCP está implementado en `@schema-memory/mcp` utilizando el SDK oficial `@modelcontextprotocol/sdk`.

- **Transporte**: Entrada y salida estándar (`stdio`).
- **Comando de inicio**:
  - Directo / Zero-Install: `npx -y schema-memory mcp` (o `bunx schema-memory mcp`).
  - Global: `sm mcp`.
- **Resolución de proyecto**:
  1. Parámetro explícito `--project <id|path>` en el tool call.
  2. Detección automática por directorio de trabajo actual (`process.cwd()`).
  3. Proyecto único si solo hay un proyecto registrado en `~/.schema-memory/projects.json`.

---

## 2. Las 12 Herramientas MCP Disponibles

| Herramienta | Parámetros principales | Descripción |
| :--- | :--- | :--- |
| `list_projects` | — | Lista todos los proyectos registrados localmente con conteo rápido de cambios pendientes y ADRs. |
| `get_schema` | `project?: string, format?: "dbml" \| "summary" \| "both", tables?: string[]` | Devuelve el DBML canónico. El parámetro `tables` permite aislar un subgrafo específico y sus relaciones conexas (`includeConnected: true`) para reducir el consumo de tokens de contexto. |
| `get_pending_changes` | `project?: string` | Retorna el diff estructural pendiente generado desde la Web UI o propuesto por la IA. |
| `propose_change` | `project?: string, schema: string, reason?: string` | Permite al agente proponer un cambio estructural desde el chat sin escribir directamente en archivos del cliente. |
| `draft_adr` | `project?: string, title: string, context: string, decision: string, consequences: string, alternatives?: string[]` | Redacta o actualiza el borrador de ADR en `.schema-memory/pending/adr-draft.json`. |
| `confirm_change` | `project?: string, userConfirmed: boolean` | **Transacción atómica**: Aplica el cambio a `schema.dbml`, crea el archivo `adr/000X-[slug].md` y devuelve `engramSummary`. Falla si `userConfirmed != true` o si el cambio está desactualizado (`STALE_CHANGE`). |
| `discard_change` | `project?: string` | Cancela el cambio pendiente y limpia la carpeta `.schema-memory/pending/`. |
| `get_decisions` | `project?: string, table?: string, column?: string, status?: "propuesto" \| "confirmado" \| "reconstruido", limit?: number` | Consulta el histórico de ADRs del proyecto con filtros granulares por entidad o estado. |
| `get_adr` | `project?: string, id: string, includeRawMarkdown?: boolean` | Lee los campos estructurados de un ADR específico. `includeRawMarkdown` es `false` por defecto para ahorrar tokens. |
| `confirm_adr` | `project?: string, id: string` | Promueve un ADR existente de estado `reconstruido` a `confirmado` tras revisión humana. |
| `import_schema` | `project?: string, dbml: string, dialect?: string, adrs?: Array<{ title, context, decision, consequences, alternatives }>` | Inicializa o sobrescribe el esquema DBML inicial y genera ADRs iniciales concurrentemente. |
| `check_drift` | `project?: string, candidateDbml: string` | Compara un DBML candidato extraído de código/migraciones contra el `schema.dbml` canónico para certificar paridad. |

---

## 3. Protocolo de Pair Programming y Debate Guiado

Para evitar que los agentes apliquen cambios silenciosos o arbitrarios en bases de datos de producción, `schema-memory` impone un flujo de debate obligatorio:

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Desarrollador
    participant UI as Web Canvas
    participant MCP as Servidor MCP
    participant Agent as Agente IA (Antigravity/OpenCode/Claude)
    participant FS as Repositorio (.schema-memory/)

    Dev->>UI: Modifica tablas o columnas en el canvas
    UI->>FS: Guarda borrador en pending/change.json
    Dev->>Agent: Envía prompt con cambios desde el botón de la UI
    Agent->>MCP: get_pending_changes()
    MCP-->>Agent: Diff estructural (tablas añadidas, columnas modificadas)
    Agent->>Dev: Inicia debate guiado: "¿Por qué separamos esta tabla? ¿Qué trade-offs evaluamos?"
    Dev->>Agent: Responde con contexto de negocio
    Agent->>MCP: draft_adr(title, context, decision, consequences, alternatives)
    MCP-->>Agent: Borrador registrado en pending/adr-draft.json
    Agent->>Dev: Presenta borrador final del ADR y pide aprobación explícita
    Dev->>Agent: "Aprobado, confirma el cambio"
    Agent->>MCP: confirm_change(userConfirmed=true)
    Note over MCP,FS: Valida baseHash (evita colisiones STALE_CHANGE)
    MCP->>FS: Transacción atómica: actualiza schema.dbml + crea adr/000X.md
    MCP-->>Agent: Retorna confirmación + engramSummary
    Agent->>Dev: Muestra resumen y sincroniza modelos de código / migraciones
```

---

## 4. Configuración por Entorno de Agente

El comando `sm setup` (o `npx schema-memory setup`) configura automáticamente los diferentes entornos sin destruir configuraciones existentes:

### 4.1 OpenCode (`~/.config/opencode/`)
- Inyecta el servidor en `~/.config/opencode/opencode.json` con el formato nativo V2:
  ```json
  {
    "mcp": {
      "servers": {
        "schema-memory": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "schema-memory", "mcp"]
        }
      }
    }
  }
  ```
- Agrega el bloque de reglas en `~/.config/opencode/AGENTS.md`.
- Instala el skill en `~/.config/opencode/skills/schema-memory/SKILL.md`.

### 4.2 Google Antigravity (`~/.gemini/config/`)
- Registra el servidor en `~/.gemini/config/mcp_config.json` bajo `schema-memory-mcp`.
- Añade la regla global en `~/.gemini/config/GEMINI.md`.
- Instala el paquete de plugin en `~/.gemini/config/plugins/schema-memory/`.

### 4.3 Claude Code
Registra el servidor directamente desde tu terminal:
```bash
claude mcp add schema-memory -- npx -y schema-memory mcp
```

### 4.4 Cursor
Añade la siguiente entrada en `~/.cursor/mcp.json` (o en Cursor Settings → MCP):
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

### 4.5 Estándar Abierto Agent Skills (`~/.agents/`)
- Publica el skill universal en `~/.agents/skills/schema-memory/SKILL.md`, compatible con herramientas que implementan la especificación abierta de habilidades para agentes.

---

## 5. Regla de Aislamiento Estricto (Guardrail)

En los proyectos cliente registrados se inyecta la siguiente directiva en `AGENTS.md`:

> **Aislamiento Estricto**: Interactúa con `schema-memory` ÚNICAMENTE a través de sus herramientas MCP (`schema-memory` / `schema-memory-mcp`). NUNCA busques ni leas el código fuente del repositorio de `schema-memory`. Si las herramientas MCP no están cargadas en la sesión actual, detén la ejecución y solicita al usuario ejecutar `sm setup`.

### ¿Por qué existe esta regla?
Cuando un desarrollador trabaja en un proyecto de cliente que utiliza `schema-memory`, el agente debe interactuar con el esquema a través del protocolo oficial y no intentar inferir o ejecutar scripts del código fuente interno del motor, garantizando la inmutabilidad de los ADRs y la integridad del archivo DBML canónico.

---

## 6. Optimización de Tokens de Contexto para Modelos LLM

Para esquemas grandes de bases de datos (docenas o cientos de tablas), `schema-memory` incorpora mecanismos para no saturar la ventana de contexto del agente:

1. **Filtrado por Tablas en `get_schema`**:
   Permite pasar un array de tablas `tables: ["orders", "payments"]`. El servidor no solo filtra esas tablas sino que incluye automáticamente sus relaciones y tipos enum asociados (`includeConnected: true`), aislando el subgrafo exacto de trabajo.
2. **ADRs Estructurados sin Volcado Markdown**:
   La herramienta `get_adr` devuelve por defecto los campos estructurados (`title`, `context`, `decision`, `consequences`, `alternatives`, `diffText`), omitiendo `rawMarkdown` salvo que se especifique `includeRawMarkdown: true`.
3. **Serialización JSON Minificada**:
   Los recursos y respuestas MCP serializan payloads JSON de manera compacta para minimizar el consumo de tokens en prompts.
