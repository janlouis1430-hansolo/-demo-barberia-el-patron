(function () {
  'use strict';

  var messagesEl = document.getElementById('messages');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('message-input');
  var sendBtn = document.getElementById('send-btn');
  var chipsEl = document.getElementById('chips');

  var history = [];
  var waiting = false;

  var GREETING = '¡Hola! 👋 Soy el asistente virtual de Barbería El Patrón. ¿En qué te puedo ayudar hoy?';

  function scrollDown() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(text, kind) {
    var div = document.createElement('div');
    div.className = 'msg ' + kind;
    div.textContent = text;
    messagesEl.appendChild(div);
    scrollDown();
    return div;
  }

  function showTyping() {
    var div = document.createElement('div');
    div.className = 'msg bot';
    div.id = 'typing-indicator';
    div.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    messagesEl.appendChild(div);
    scrollDown();
  }

  function hideTyping() {
    var t = document.getElementById('typing-indicator');
    if (t) t.remove();
  }

  function showSystemNotice(text) {
    addMessage('⚠️ ' + text, 'system');
  }

  async function sendToBackend() {
    try {
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      });

      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }

      if (!res.ok) {
        if (res.status === 503 && data && data.error === 'missing_api_key') {
          showSystemNotice(
            'Demo sin clave de API: para que el asistente responda con inteligencia artificial, ' +
            'hay que configurar la variable ANTHROPIC_API_KEY en el servidor y reiniciarlo. ' +
            'Sin la clave, el chat no puede generar respuestas.'
          );
        } else if (data && data.message) {
          showSystemNotice(data.message);
        } else {
          showSystemNotice('Ocurrió un error inesperado. Intenta de nuevo.');
        }
        // Quitar el último mensaje del usuario del historial para no contaminarlo
        history.pop();
        return;
      }

      var reply = data && typeof data.reply === 'string' ? data.reply.trim() : '';
      if (!reply) {
        showSystemNotice('El asistente no devolvió respuesta. Intenta de nuevo.');
        history.pop();
        return;
      }

      history.push({ role: 'assistant', content: reply });
      addMessage(reply, 'bot');
    } catch (err) {
      showSystemNotice('No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
      history.pop();
    }
  }

  function sendUserMessage(text) {
    text = (text || '').trim();
    if (!text || waiting) return;

    addMessage(text, 'user');
    history.push({ role: 'user', content: text });
    input.value = '';

    waiting = true;
    sendBtn.disabled = true;
    showTyping();

    // Pequeña pausa para que el indicador se vea natural
    setTimeout(function () {
      sendToBackend().finally(function () {
        hideTyping();
        waiting = false;
        sendBtn.disabled = false;
        input.focus();
      });
    }, 600);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    sendUserMessage(input.value);
  });

  chipsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (btn && btn.dataset.text) {
      sendUserMessage(btn.dataset.text);
    }
  });

  // Saludo inicial del bot
  addMessage(GREETING, 'bot');
  history.push({ role: 'assistant', content: GREETING });
  input.focus();
})();
