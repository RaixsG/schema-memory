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

El repositorio incluye un script automatizado (`scripts/release.mjs`) para sincronizar la versión de todos los paquetes del monorepo (`package.json`, `packages/*`, `apps/*`), generar el commit `chore(release): vX.Y.Z`, crear el tag anotado y pushear todo a la rama `main`:

```bash
# Simular cambios sin modificar archivos ni hacer git push (dry-run)
pnpm release patch --dry-run

# Incrementar versión de parche (ej. 0.1.2 -> 0.1.3), commitear, taggear y pushear a main
pnpm release patch

# Incrementar versión menor o mayor
pnpm release minor
pnpm release major

# Especificar una versión exacta
pnpm release 0.2.0

# Crear commit y tag localmente sin hacer git push
pnpm release patch --no-push
```

> [!NOTE]
> Al pushear el tag `v*` a `origin`, el workflow de CI/CD (`.github/workflows/release.yml`) se dispara automáticamente para compilar los paquetes, generar los binarios standalone (`dist-bin/`) y publicar el paquete CLI en npm y en GitHub Releases.

---

## 8. Convenciones de Código

- **TypeScript Estricto**: `strict: true`, módulos ESM nativos (`"type": "module"`).
- **Commits**: Seguir el estándar [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).

