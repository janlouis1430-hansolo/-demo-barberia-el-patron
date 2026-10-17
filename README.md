# Demo: Chatbot de Barbería El Patrón ✂️

Demo funcional de un asistente virtual estilo WhatsApp para una barbería ficticia
(**Barbería El Patrón**, Bayamón, Puerto Rico). Sirve para mostrarle a dueños de
negocios locales cómo se vería y se sentiría un chatbot atendiendo a sus clientes.

## Qué incluye

- **Chat estilo WhatsApp** (diseñado para verse bien en el teléfono): encabezado del
  negocio, burbujas de mensajes, indicador de "escribiendo", sugerencias rápidas y
  saludo inicial del asistente.
- **Backend en Node.js + Express** con un solo endpoint `POST /api/chat` que llama a
  la API de Anthropic (Claude) con el prompt del sistema y el historial de la
  conversación.
- **Base de conocimiento de ejemplo**: servicios, precios, horarios, ubicación,
  formas de pago y preguntas frecuentes de la barbería ficticia.
- **Manejo elegante de errores**: si falta la clave de API, el chat muestra un aviso
  claro en español en vez de romperse.

## Cómo correrlo

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Configura tu clave de API de Anthropic (la consigues en
   https://console.anthropic.com) y arranca el servidor:

   ```bash
   ANTHROPIC_API_KEY=tu_clave_aqui npm start
   ```

   Opcional: puedes elegir el modelo con `ANTHROPIC_MODEL`
   (por defecto: `claude-sonnet-4-5`).

3. Abre http://localhost:3000 en tu navegador.

## Cómo mostrárselo a un cliente desde tu teléfono

**Opción A — Mismo Wi-Fi (la más simple):**
1. Asegúrate de que tu teléfono y la computadora estén en la misma red Wi-Fi.
2. Averigua la IP local de la computadora (en la terminal: `hostname -I` en Linux
   o `ipconfig` en Windows; busca algo como `192.168.1.25`).
3. En el navegador del teléfono abre `http://192.168.1.25:3000`
   (reemplaza con tu IP).

**Opción B — Túnel público (si el cliente no está cerca):**
Usa una herramienta como [ngrok](https://ngrok.com) o `cloudflared`:

```bash
npx ngrok http 3000
```

Te dará una URL pública (ej. `https://xxxx.ngrok.io`) que puedes abrir en
cualquier teléfono o enviarle al cliente por WhatsApp.

## Nota de costos

Cada conversación con el bot consume tokens de la API de Anthropic. Con el modelo
por defecto, **una conversación típica de 6–10 mensajes cuesta unos pocos
centavos de dólar**. Para las demos de venta el costo es insignificante; en
producción con muchos clientes se monitorea el uso por negocio.

## Estructura

```
demo-barberia/
├── server.js        # Backend Express + llamada a la API de Anthropic
├── package.json
├── public/
│   ├── index.html   # Estructura del chat
│   ├── styles.css   # Estilos estilo WhatsApp (mobile-first)
│   └── app.js       # Lógica del chat: mensajes, sugerencias, errores
└── README.md
```

> Nota: "Barbería El Patrón" es un negocio ficticio creado solo para esta demo.
> Los precios, horarios y datos de contacto no son reales.
