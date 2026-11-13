const history = document.querySelector('#history');
const status = document.querySelector('#status');
const decisions = document.querySelector('#decisions');
const form = document.querySelector('#chat');
const input = document.querySelector('#message');
let sessionId;

function show(role, content) {
  const element = document.createElement('div');
  element.className = 'message';
  element.textContent = `${role}: ${content}`;
  history.append(element);
  history.scrollTop = history.scrollHeight;
}

async function post(message, decision) {
  status.textContent = 'Pensando...';
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message, decision }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo procesar la solicitud.');
    sessionId = data.sessionId;
    show('Analista', message);
    for (const call of data.toolCalls) {
      const element = document.createElement('pre');
      element.className = 'tool';
      element.textContent = `${call.name}\nArgumentos: ${JSON.stringify(call.arguments, null, 2)}\nResultado: ${JSON.stringify(call.result, null, 2)}`;
      history.append(element);
    }
    show('Agente', data.reply);
    await refreshDecisions();
  } catch (error) {
    show('Error', error instanceof Error ? error.message : 'Error inesperado.');
  } finally {
    status.textContent = '';
    for (const button of document.querySelectorAll('button')) button.disabled = false;
  }
}

async function refreshDecisions() {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) throw new Error('No se pudo consultar la sesión.');
  const data = await response.json();
  decisions.replaceChildren();
  for (const item of data.cases) {
    if (item.packageReady) {
      const downloads = document.createElement('div');
      const prefix = `/api/sessions/${encodeURIComponent(sessionId)}/cases/${encodeURIComponent(item.caso)}/files`;
      const response = await fetch(prefix);
      if (!response.ok) throw new Error('No se pudieron consultar los archivos del paquete.');
      const listing = await response.json();
      const title = document.createElement('p');
      title.textContent = `Archivos de ${item.caso}:`;
      downloads.append(title);
      for (const file of listing.files) {
        const link = document.createElement('a');
        link.textContent = file;
        link.href = `${prefix}/${encodeURIComponent(file)}`;
        downloads.append(link, document.createTextNode(' | '));
      }
      decisions.append(downloads);
    }
    for (const field of item.fields.filter(field => field.estado !== 'lleno')) {
      const box = document.createElement('div');
      box.className = 'decision';
      const label = document.createElement('p');
      label.textContent = `${item.caso}: ${field.etiqueta} — ${field.estado}${field.valor !== undefined ? ` — candidato: ${field.valor}` : ''}`;
      box.append(label);
      if (field.estado === 'requiere_confirmacion' && field.valor !== undefined) {
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.textContent = 'Confirmar candidato';
        confirm.addEventListener('click', () => post(`Confirmo ${field.etiqueta}.`, { caso: item.caso, id: field.id, confirm: true }));
        box.append(confirm);
      }
      const value = document.createElement('input');
      value.setAttribute('aria-label', `Corrección para ${field.etiqueta}`);
      value.placeholder = 'Ingresar valor manual';
      const correct = document.createElement('button');
      correct.type = 'button';
      correct.textContent = 'Guardar corrección';
      correct.addEventListener('click', () => {
        if (!value.value.trim()) { status.textContent = 'Ingrese un valor para la corrección.'; return; }
        post(`Corrijo ${field.etiqueta}.`, { caso: item.caso, id: field.id, value: value.value });
      });
      box.append(value, correct);
      decisions.append(box);
    }
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  post(message);
});
