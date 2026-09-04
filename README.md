# LEEN STUDIE

App de estudio (PWA) para una estudiante de primer año de Ingeniería Civil
Química. Toma una materia o un trozo de apunte y devuelve una **ficha de
estudio** con formato fijo: idea central, la fórmula, la misma idea en criollo,
un glosario de todos los términos técnicos, y el error más común. Después la hace
practicar con 3 ejercicios de dificultad creciente y le corrige mostrando dónde
se torció el razonamiento.

## Stack

- **PWA** con React + Vite + Tailwind v4, se instala en el celular y lee lo
  guardado sin conexión.
- **KaTeX** para las fórmulas.
- **IndexedDB** (Dexie) — todas las fichas viven en el dispositivo, no se suben.
- **Cloudflare Worker** (`worker/`) — genera el contenido con la API de Claude
  (`claude-sonnet-5`), guardando la API key fuera del teléfono.

## Correr en local

```bash
npm install
npm run dev
```

Para que genere fichas necesitás el worker andando (ver `worker/README.md`) y
pegar su URL en **Ajustes** dentro de la app, o dejarla en un `.env`
(`VITE_API_BASE=...`, ver `.env.example`).

## Publicar

1. Subí el repo a GitHub con el nombre **`leen-studie`** (si usás otro nombre,
   cambiá `BASE` en `vite.config.ts`).
2. En el repo: **Settings → Pages → Source: GitHub Actions**.
3. (Opcional) **Settings → Secrets and variables → Actions → Variables**, agregá
   `VITE_API_BASE` con la URL del worker.
4. Cada push a `main` publica solo. Queda en
   `https://TU-USUARIO.github.io/leen-studie/`.

## Backend

Ver [`worker/README.md`](./worker/README.md).
