# Guía de Contribución y Desarrollo Local

¡Gracias por tu interés en colaborar con **`schema-memory`**! Este documento contiene todo lo necesario para configurar tu entorno local, ejecutar pruebas y compilar el proyecto.

---

## 1. Requisitos Previos

- **Node.js**: v20.5+ (recomendado Node.js 22 LTS).
- **Bun**: v1.1+ (requerido para la compilación de binarios standalone con `bun build --compile`).
- **pnpm**: v9.15.9 (`corepack enable` o `npm i -g pnpm@9.15.9`).
- **Git**.

---

## 2. Configuración Inicial del Repositorio

```bash
# 1. Clonar el repositorio
git clone https://github.com/RaixsG/schema-memory.git
cd schema-memory

# 2. Instalar dependencias en el monorepo
pnpm install

# 3. Compilar todos los paquetes
pnpm build
```

---

## 3. Flujos de Trabajo de Desarrollo

### 3.1 Modo Desarrollo con Hot-Reload (Recomendado)
Para iterar tanto en la UI web como en la API backend:
```bash
pnpm dev
```
Este comando ejecuta concurrentemente:
1. Servidor Hono en `http://127.0.0.1:4317`.
2. Servidor Vite en `http://localhost:5173` con recarga ultrarrápida y proxy inverso configurado hacia la API.

### 3.2 Modo Aplicación Completa (Build Embebido)
Para verificar la experiencia idéntica a producción con los activos de la UI empaquetados dentro de la API:
```bash
pnpm ui
```

### 3.3 Enlazar el CLI Localmente
Para probar los comandos globales `sm` y `schema-memory` en tu terminal usando el build de tu repositorio:
```bash
pnpm link-cli
```
Esto crea los symlinks correspondientes en `~/.local/bin/` (o shims `.cmd`/`.ps1` en Windows).

---

## 4. Ejecución de Pruebas

El monorepo utiliza **Vitest** con una suite centralizada de pruebas unitarias e integración:

```bash
# Ejecutar toda la suite de pruebas
pnpm test

# Ejecutar pruebas en un paquete específico
pnpm --filter @schema-memory/core test
pnpm --filter @schema-memory/mcp test
pnpm --filter @schema-memory/server test
pnpm --filter schema-memory test
```

---

## 5. Compilación de Binarios Standalone

`schema-memory` puede compilarse en ejecutables binarios autónomos sin necesidad de tener Node.js instalado en la máquina destino:

```bash
# Compilar binarios multiplataforma en dist-bin/
pnpm build:binaries
```
Esto genera ejecutables para:
- macOS Apple Silicon (`arm64`) y macOS Intel (`x64`)
- Linux (`x64`)
- Windows (`x64`)

---

## 6. Empaquetado y Publicación en npm

El paquete publicado en el registro de npm corresponde a `packages/cli` bajo el nombre **`schema-memory`**:

```bash
# Empaquetar el tarball de distribución (.tgz)
pnpm pack:cli
```

Durante el build de `packages/cli`:
1. `apps/web` compila su bundle estático en `dist/web`.
2. El archivo raíz `README.md` y `LICENSE` se sincronizan automáticamente en `packages/cli/`.
3. `tsup` genera el binario ejecutable final en `packages/cli/dist/index.js`.

---

## 7. Convenciones de Código

- **TypeScript Estricto**: `strict: true`, módulos ESM nativos (`"type": "module"`).
- **Commits**: Seguir el estándar [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
