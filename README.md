# F18 · Editor de fotografías para Instagram

Editor de imágenes con marcos formales y modernos, ficha técnica y firma. El procesamiento se realiza localmente en el navegador: las fotografías no se envían a un servidor.

## Funciones

- Hasta cuatro fotografías editables, con carga múltiple, reordenación y lectura EXIF cuando está disponible.
- Siete marcos, incluido ancho completo y Prisma.
- Arrastrar, ampliar y girar la fotografía, sin dejar espacios vacíos en el marco.
- Formatos: 1080 × 1350, 1080 × 1440, 1080 × 1080, 1080 × 566 e historias 1080 × 1920.
- Tipografías y paletas, incluida una paleta automática basada en la imagen.
- Ficha técnica con apertura, obturación, ISO, focal, cámara y firma.
- Carruseles de dos a cuatro fotos con vista previa de la publicación.
- Recorte sin marco y feed 3×1: una fotografía dividida en tres publicaciones numeradas.
- Plantillas de historias con títulos, ficha técnica opcional y vista de zonas seguras.
- Exportación desde el original: máxima resolución útil, doble resolución o tamaño Instagram. PNG sin pérdida o JPEG con calidad 100 %. La resolución original y el recorte limitan el detalle disponible.
- Descarga conjunta en un único ZIP, sin alterar la calidad de las imágenes, además de descarga individual.
- Guardado automático local en IndexedDB y recuperación del proyecto en el mismo navegador y dispositivo, con protección contra sobrescrituras entre pestañas. No es una copia de seguridad externa.

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

## Publicar los archivos estáticos del sitio

El directorio `docs/` contiene el sitio compilado, con `index.html` en su raíz y sus recursos en `docs/assets/`.

- Para el hosting del dominio propio: descarga la carpeta `docs/` y sube **su contenido** (no la carpeta contenedora) a la raíz pública del dominio, junto con `index.html` y `assets/`.
- Para GitHub Pages: configura la fuente como rama `main`, carpeta `/docs`, en Settings → Pages.

La aplicación no necesita Node.js, API ni base de datos cuando se sirve como sitio estático. La edición y el procesamiento de fotografías ocurren en el navegador.

## Comprobaciones

```bash
pnpm --filter @workspace/instagram-photo-editor run typecheck
node --experimental-strip-types --test artifacts/instagram-photo-editor/src/lib/*.test.ts
```

## Estructura

- `artifacts/instagram-photo-editor`: aplicación React, TypeScript y Vite.
- `lib`: bibliotecas compartidas de la plantilla monorepo.
- `artifacts/api-server`: servidor base de la plantilla; no es necesario para editar ni exportar fotos.

Esta copia contiene el código actual, sin historial previo de Replit, conversaciones, fotografías cargadas ni credenciales. No publica automáticamente en Instagram: los archivos descargados se suben manualmente.
