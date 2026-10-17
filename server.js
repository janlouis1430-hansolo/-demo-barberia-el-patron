const express = require('express');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

const PROVIDER =
  (process.env.GROQ_API_KEY ? 'groq' : '') ||
  (process.env.ANTHROPIC_API_KEY ? 'anthropic' : '') ||
  'groq-vault'; // usa la key guardada en la bóveda (conector custom.groq)
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

const SYSTEM_PROMPT = `Eres el asistente virtual de Barbería El Patrón en Bayamón, Puerto Rico. Atiendes a clientes por WhatsApp e Instagram.

PERSONALIDAD
- Cercano, amable y natural, como un buen barbero boricua. Nada robótico.
- Mensajes cortos (máximo 3 o 4 líneas). Máximo 1 o 2 emojis por mensaje.
- Escribe como en WhatsApp, pero sin groserías ni jerga exagerada.
- Si el cliente escribe en inglés, responde en inglés.

REGLAS DE ORO
1. Responde SOLO con la información de la BASE DE CONOCIMIENTO.
2. Si no sabes algo, NUNCA inventes. Di: "Déjame confirmarlo con el equipo y te escribo enseguida" y activa el aviso al dueño.
3. Nunca inventes precios, horarios, promociones ni disponibilidad.
4. Al inicio de la conversación, di que eres el asistente virtual.

TU OBJETIVO
Ayudar y, cuando haya interés, llevar al cliente a reservar una cita.

PARA TOMAR UNA CITA pide, de uno en uno: nombre, servicio, día y hora preferida. Revisa disponibilidad y confirma repitiendo todos los datos. Termina con: "Listo, quedó agendado ✅".

PASA A UN HUMANO cuando:
- El cliente está molesto o presenta una queja.
- Pregunta por pagos, reembolsos o cancelaciones especiales.
- Pide algo fuera de la base de conocimiento.
- Lo pide directamente.
En esos casos di: "Voy a pasarle tu mensaje al dueño para que te atienda personalmente. Te contesta lo antes posible 🙏"

NO HAGAS
- No des consejos médicos ni de salud.
- No hables de política, religión ni temas ajenos al negocio.
- No compartas datos de otros clientes.

BASE DE CONOCIMIENTO
NEGOCIO: Barbería El Patrón
UBICACIÓN: Ave. Principal 123, Bayamón, PR. Al lado de la farmacia.
PARKING: Sí, frente al local.
HORARIO: Lun-Vie 9am-7pm | Sáb 8am-5pm | Dom cerrado
TELÉFONO: (787) 555-0142
SERVICIOS Y PRECIOS
- Corte clásico: $15 (30 min)
- Corte + barba: $22 (45 min)
- Afeitado con toalla caliente: $12 (20 min)
- Corte de niño (hasta 12 años): $12 (30 min)
- Diseño / líneas: +$5
PAGOS: efectivo, tarjeta, ATH Móvil
CITAS: se recomienda cita previa; también atienden sin cita según disponibilidad
CANCELACIONES: avisar con al menos 2 horas de anticipación
BARBEROS: Carlos (clásicos), Miguel (diseños)
PREGUNTAS FRECUENTES
- ¿Atienden sin cita? → Sí, pero con cita no esperas.
- ¿Aceptan ATH Móvil? → Sí.
- ¿Cortan cabello rizado/afro? → Sí, Carlos es especialista.
- ¿Hay promociones? → Esta semana: corte + barba $20 (antes $22).
LO QUE EL BOT NO DEBE HACER
- No dar descuentos que no estén aquí.
- No confirmar citas fuera del horario.
`;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Llama al helper Python que usa la key de Groq guardada en la bóveda.
// La key viaja como surrogate que authd reemplaza solo en la petición aprobada.
function callGroqVault(system, messages) {
  return new Promise((resolve, reject) => {
    const helper = path.join(
      process.env.HOME, 'workspace', 'custom-connectors', 'custom.groq', 'bin', 'groq-chat.py'
    );
    const child = spawn('python3', [helper], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error('groq helper exit ' + code + ': ' + err.slice(0, 200)));
      try {
        const parsed = JSON.parse(out);
        if (parsed && parsed.ok) resolve(parsed.reply);
        else reject(new Error((parsed && parsed.error) || 'groq helper error'));
      } catch (e) { reject(new Error('respuesta inválida del helper groq')); }
    });
    child.stdin.write(JSON.stringify({ model: GROQ_MODEL, system, messages, max_tokens: 300 }));
    child.stdin.end();
  });
}

// Llama al cerebro del bot y devuelve el texto de respuesta (lanza error si falla).
// La usan tanto el chat web (/api/chat) como el webhook de WhatsApp.
async function getAiReply(msgs) {
  if (PROVIDER === 'groq-vault') {
    // Llama a Groq con la key de la bóveda vía el helper Python (la key nunca sale del vault)
    return callGroqVault(SYSTEM_PROMPT, msgs);
  } else if (PROVIDER === 'groq') {
    // Groq usa el formato OpenAI (system prompt como primer mensaje)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 300,
        temperature: 0.7,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...msgs]
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error('Groq API error: ' + response.status + ' ' + errText.slice(0, 200));
    }

    const data = await response.json();
    const choice = Array.isArray(data.choices) ? data.choices[0] : null;
    return (choice && choice.message ? choice.message.content : '');
  } else {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        temperature: 0.7,
        system: SYSTEM_PROMPT,
        messages: msgs
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error('Anthropic API error: ' + response.status + ' ' + errText.slice(0, 200));
    }

    const data = await response.json();
    const textBlock = Array.isArray(data.content)
      ? data.content.find(b => b && b.type === 'text')
      : null;
    return (textBlock ? textBlock.text : '');
  }
}

app.post('/api/chat', async (req, res) => {
  if (!PROVIDER) {
    return res.status(503).json({
      error: 'missing_api_key',
      message: 'La demo necesita una clave de API configurada para responder con IA: GROQ_API_KEY (gratis) o ANTHROPIC_API_KEY. Sin la clave, el chat no puede funcionar.'
    });
  }

  const messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'El historial de mensajes es inválido o está vacío.'
    });
  }

  // Solo permitir roles válidos y contenido de texto simple
  const cleanMessages = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (cleanMessages.length === 0) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'El historial de mensajes es inválido o está vacío.'
    });
  }

  try {
    const text = await getAiReply(cleanMessages);
    return res.json({ reply: text });
  } catch (err) {
    console.error('Error llamando al proveedor de IA:', err.message);
    return res.status(502).json({
      error: 'ai_error',
      message: 'No se pudo conectar con el servicio de IA. Revisa tu conexión e intenta de nuevo.'
    });
  }
});

// --- Webhook de WhatsApp Cloud API ---
// Variables necesarias en el host público:
//   WHATSAPP_VERIFY_TOKEN    token que inventas tú (debe coincidir con el de Meta)
//   WHATSAPP_TOKEN           token de acceso de la app de Meta
//   WHATSAPP_PHONE_NUMBER_ID ID del número de teléfono de la app de Meta
const WA_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

// Verificación del webhook (la llama Meta al configurar)
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && WA_VERIFY_TOKEN && token === WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Recepción de mensajes de WhatsApp
app.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200); // responder rápido a Meta
  try {
    const entry = req.body && req.body.entry && req.body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;
    const msg = value && value.messages && value.messages[0];
    if (!msg || msg.type !== 'text' || !WA_TOKEN || !WA_PHONE_ID) return;
    const from = msg.from;
    const userText = msg.text.body.slice(0, 2000);
    const reply = await getAiReply([{ role: 'user', content: userText }]);
    if (!reply) return;
    await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + WA_TOKEN
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: from,
        type: 'text',
        text: { body: reply.slice(0, 4000), preview_url: false }
      })
    });
  } catch (err) {
    console.error('Error en webhook WhatsApp:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Demo Barbería El Patrón corriendo en http://localhost:${PORT}`);
  console.log(`Proveedor: ${PROVIDER || 'ninguno (falta API key)'}` +
    ((PROVIDER === 'groq' || PROVIDER === 'groq-vault') ? ` | Modelo: ${GROQ_MODEL}` :
     PROVIDER === 'anthropic' ? ` | Modelo: ${ANTHROPIC_MODEL}` : ''));
});
