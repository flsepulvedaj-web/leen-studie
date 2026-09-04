# Backend de LEEN STUDIE (Cloudflare Worker)

Es una sola pieza: recibe las peticiones de la app, les pega el prompt con el
formato fijo y llama a la API de Anthropic. La API key nunca sale de acá.

## Desplegar (sin instalar nada)

1. Entrá a <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Create Worker**. Ponele el nombre `leen-studie`.
2. **Edit code**. Borrá todo lo que trae y pegá el contenido de
   [`worker.js`](./worker.js). **Deploy**.
3. **Settings → Variables and Secrets**, agregá:
   | Nombre | Tipo | Valor |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Secret | tu key de <https://console.anthropic.com> |
   | `ACCESS_CODE` | Text | una palabra o frase que vos inventes |
   | `MODEL` | Text (opcional) | `claude-sonnet-5` por defecto |
4. Volvé a **Edit code** y **Deploy** de nuevo (Cloudflare a veces no toma las
   variables hasta que hay un deploy nuevo).
5. Copiá la URL del worker (algo como
   `https://leen-studie.TU-USUARIO.workers.dev`).

## Conectar la app

En la app: **Ajustes → Servidor**
- Dirección del servidor: la URL del worker.
- Código de acceso: el mismo `ACCESS_CODE` que pusiste arriba.

## Costo

Un solo usuario, con `claude-sonnet-5`, gasta centavos de dólar al mes. Podés
poner un límite de gasto en la consola de Anthropic (Billing → Usage limits).

## Rutas

`POST /ficha`, `/simple`, `/ejercicio`, `/correccion`, `/repaso`. Todas esperan
JSON y devuelven JSON. Header obligatorio: `x-leen-key: <ACCESS_CODE>`.
