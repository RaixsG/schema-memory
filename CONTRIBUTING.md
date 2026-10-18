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

### 3.2 Modo Aplicación Completa (Build Embebido y Daemon)
Para verificar la experiencia idéntica a producción con los activos de la UI empaquetados dentro de la API:
```bash
# Inicia el daemon en background (auto-compila si detecta cambios en código fuente)
pnpm ui

# Inspeccionar estado o detener el servidor
pnpm status
pnpm stop
pnpm restart
```

> [!TIP]
> **Auto-Build Inteligente**: Los scripts de desarrollo (`pnpm ui`, `pnpm start`, `pnpm doctor`, `pnpm status`, `pnpm sm`) incorporan el guardián `scripts/ensure-build.mjs`. Si detecta modificaciones recientes en los paquetes fuente, recompila automáticamente en ~300ms antes de ejecutar el comando. En ejecuciones posteriores sin cambios, el chequeo toma menos de 15ms.

### 3.3 Enlazar el CLI Localmente
Para probar los comandos globales `sm` y `schema-memory` en tu terminal usando el build de tu repositorio:
```bash
pnpm link-cli
```
Esto crea los symlinks correspondientes en `~/.local/bin/` (o shims `.cmd`/`.ps1`/`sh` con resolución nativa cross-drive en Windows).

> [!NOTE]
> **Subcomandos de pnpm**: Para ejecutar comandos del CLI desde el monorepo con `pnpm`, antepón siempre `sm` (ej. `pnpm sm setup` o `pnpm sm doctor`), ya que `pnpm setup` sin `sm` es un comando reservado interno del gestor de paquetes pnpm para configurar el PATH.


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

## 5. Compilación de Binarios Standalone (Release Automatizado)

`schema-memory` se compila automáticamente en ejecutables autónomos durante el pipeline de release de GitHub Actions (`release.yml`), sin requerir Node.js en la máquina del usuario final.

Si deseas probar la compilación de binarios en tu máquina local (requiere tener Bun instalado):
```bash
# 1. Asegurar el build del monorepo
pnpm build

# 2. Compilar binarios multiplataforma en dist-bin/
pnpm build:binaries
```
Esto genera ejecutables empaquetados en `.tar.gz` para:
- macOS Apple Silicon (`arm64`) y macOS Intel (`x64`)
- Linux (`x64`)
- Windows (`x64`)

> [!NOTE]
> En el desarrollo cotidiano local no es necesario generar estos binarios; el flujo de trabajo estándar utiliza `pnpm dev` o `pnpm ui`.


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
3. `tsup` genera el binario ejecutable final en `packages/cli/dist/index.js` empaquetando todas las dependencias (`noExternal: [/(.*)/]`), garantizando un bundle 100% autocontenido y sin dependencias externas de runtime.

---

## 7. Versionado y Publicación de Releases

El repositorio utiliza un flujo de releases **automatizado impulsado por tags de Git** (`.github/workflows/release.yml`). Para publicar una nueva versión, basta con crear y pushear el tag correspondiente:

```bash
# 1. Crear el tag con la versión deseada
git tag v0.1.4

# 2. Pushear el tag a origin
git push origin v0.1.4
```

O alternativamente, crear la release directamente desde la interfaz web de GitHub (**Releases** -> **Draft a new release** -> **Choose a tag: v0.1.4** -> **Publish release**).

### ¿Qué hace el workflow automáticamente?
1. Extrae la versión del tag (`v0.1.4` -> `0.1.4`).
2. Sincroniza todos los `package.json` del monorepo (`package.json`, `packages/*`, `apps/*`) y `pnpm-lock.yaml` mediante `scripts/sync-version.mjs`.
3. Ejecuta `pnpm build` y corre la suite completa de tests (`pnpm test`).
4. Empaqueta el CLI autocontenido (`packages/cli/schema-memory-0.1.4.tgz`).
5. Publica en **npm** (`schema-memory@0.1.4`) con protección idempotente (evita errores 403 si la versión ya existe).
6. Crea la **GitHub Release** con changelog autogenerado y el `.tgz` adjunto.
7. Comitea la sincronización de versión de vuelta a la rama `main` con `[skip ci]`.

> [!TIP]
> Si deseas sincronizar la versión localmente sin crear tag ni pushear, puedes usar:
> ```bash
> pnpm version:sync 0.1.4
> ```

---

## 8. Convenciones de Código

- **TypeScript Estricto**: `strict: true`, módulos ESM nativos (`"type": "module"`).
- **Commits**: Seguir el estándar [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).

