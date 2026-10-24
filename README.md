# F18 · Editor de fotografías para Instagram

Editor de imágenes con marcos formales y modernos, ficha técnica y firma. El procesamiento se realiza localmente en el navegador: las fotografías no se envían a un servidor.

## Funciones

- Tres fotografías editables, con lectura EXIF cuando está disponible.
- Siete marcos, incluido ancho completo y Prisma.
- Arrastrar, ampliar y girar la fotografía, sin dejar espacios vacíos en el marco.
- Formatos: 1080 × 1350, 1080 × 1440, 1080 × 1080, 1080 × 566 e historias 1080 × 1920.
- Tipografías y paletas, incluida una paleta automática basada en la imagen.
- Ficha técnica con apertura, obturación, ISO, focal, cámara y firma.
- Exportación JPEG con calidad 100 % o PNG sin pérdida. La resolución original limita el detalle disponible.

## Ejecutar

Requisitos: Node.js 24 y pnpm 10.

```bash
pnpm install --frozen-lockfile
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/instagram-photo-editor run dev
```

Abrir http://localhost:5173. Las fuentes de Google requieren conexión; sin ella se usan fuentes alternativas.

## Compilar el editor

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/instagram-photo-editor run build
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/instagram-photo-editor run serve
```

Los archivos compilados se generan en `artifacts/instagram-photo-editor/dist/public`.

## Comprobaciones

```bash
pnpm --filter @workspace/instagram-photo-editor run typecheck
node --experimental-strip-types --test artifacts/instagram-photo-editor/src/lib/photo-renderer.test.ts
```

## Estructura

- `artifacts/instagram-photo-editor`: aplicación React, TypeScript y Vite.
- `lib`: bibliotecas compartidas de la plantilla monorepo.
- `artifacts/api-server`: servidor base de la plantilla; no es necesario para editar ni exportar fotos.

Esta copia contiene el código actual, sin historial previo de Replit, conversaciones, fotografías cargadas ni credenciales. No publica automáticamente en Instagram: los archivos descargados se suben manualmente.
