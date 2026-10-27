// Legal: consultas al abogado del edificio y expedientes de cobro. Lo ven la
// administración, la junta y el abogado (los propietarios no). Todo queda por
// escrito, con fecha y autor.
import { sb, esc, usd, bs, fecha, periodoTxt, vacio, errorHtml, toast, nombreArchivo, urlFirmada, urlFuncion, icono } from '../util.js';

const ESTADOS_DE = {
  consulta: ['abierto', 'en_proceso', 'respondido', 'cerrado'],
  cobro: ['abierto', 'extrajudicial', 'demanda', 'convenio', 'cerrado'],
};
const NOMBRE = { abierto: 'Abierto', en_proceso: 'En proceso', respondido: 'Respondido', extrajudicial: 'Cobro extrajudicial', demanda: 'Demanda', convenio: 'Convenio de pago', cerrado: 'Cerrado' };
const CLASE = { abierto: 'oro', en_proceso: 'alerta', respondido: 'ok', extrajudicial: 'alerta', demanda: 'error', convenio: 'ok', cerrado: '' };
const QUIEN = { abogado: 'Abogado', junta: 'Junta', administracion: 'Administración' };
const chipEstado = (e) => `<span class="chip ${CLASE[e] || ''}">${esc(NOMBRE[e] || e)}</span>`;
const fechaHora = (t) => new Date(t).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
}

function itemCaso(x) {
  const extra = x.tipo === 'cobro' ? ` · debe ${usd(x.deuda_actual_usd)}` : '';
  return `<li><a class="caso" href="#/legal/${x.id}">
    <div><b>${esc(x.asunto)}</b>${x.urgente ? ' <span class="chip error">Urgente</span>' : ''}
      <div class="muted">Nº ${x.numero} · ${esc(x.creado_por || '')} · ${fecha(String(x.updated_at).slice(0, 10))} · ${x.mensajes} ${x.mensajes === 1 ? 'mensaje' : 'mensajes'}${extra}</div></div>
    ${chipEstado(x.estado)}</a></li>`;
}

export async function vista(ctx, el) {
  if (ctx.demo) { el.innerHTML = `<h1>Legal</h1><div class="tarjeta">${vacio('Vista previa sin datos.')}</div>`; return; }
  const d = await rpc('casos_lista', { p_condo: ctx.condo.id });
  const consultas = d.casos.filter((x) => x.tipo === 'consulta');
  const cobros = d.casos.filter((x) => x.tipo === 'cobro');
  const puedeConsultar = ['administracion', 'junta'].includes(d.soy);
  const puedeAbrir = ['administracion', 'abogado'].includes(d.soy);

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Legal</h1>
      <p class="muted">${d.soy === 'abogado' ? 'Las consultas y los expedientes de cobro de este edificio.'
        : 'Consultas al abogado del edificio y expedientes de cobro. Todo queda por escrito, con fecha y autor.'}</p></div>
    <section class="tarjeta" id="secConsultas">
      <h2>Consultas al abogado</h2>
      ${consultas.length ? `<ul class="casos">${consultas.map(itemCaso).join('')}</ul>` : vacio('Todavía no hay consultas.')}
      ${puedeConsultar ? `
      <details class="plegable" style="margin-top:12px"><summary><h2>Nueva consulta</h2></summary>
        <form id="fConsulta">
          <label for="cAsunto">Qué quieres preguntar</label>
          <input id="cAsunto" required minlength="3" maxlength="200" placeholder="Ej.: ¿Qué mayoría aprueba una obra en la asamblea?">
          <label for="cDetalle">Detalle (opcional)</label>
          <textarea id="cDetalle" rows="4" maxlength="8000" placeholder="Cuéntale al abogado el caso con fechas y montos."></textarea>
          <label class="check"><input id="cUrgente" type="checkbox"> Es urgente</label>
          <div id="msgC"></div>
          <button class="btn" style="margin-top:12px">Enviar consulta</button>
          <p class="muted">El abogado asesora al condominio: por eso las consultas las hacen la junta y la administración.</p>
        </form>
      </details>` : ''}
    </section>
    <section class="tarjeta" id="secExpedientes">
      <h2>Expedientes de cobro</h2>
      <p class="muted">Para los apartamentos con más de 30 días de deuda vencida. El abogado recibe en un solo PDF el estado de cuenta, los avisos enviados y los recibos con su QR.</p>
      ${cobros.length ? `<ul class="casos">${cobros.map(itemCaso).join('')}</ul>` : vacio('No hay expedientes de cobro.')}
      ${puedeAbrir && d.candidatos.length ? `
      <h3 class="subtitulo">Pueden pasar a cobro</h3>
      <ul class="casos">${d.candidatos.map((x) => `<li><div class="caso">
        <div><b>Apto ${esc(x.codigo)}</b> · ${esc(x.propietario || 'Sin propietario')}
          <div class="muted">${usd(x.vencido_usd)} vencidos · ${x.dias} días</div></div>
        <button class="btn linea chico" type="button" data-abrir="${x.unidad_id}" data-codigo="${esc(x.codigo)}">Abrir expediente</button></div></li>`).join('')}</ul>` : ''}
    </section>`;

  el.querySelector('#fConsulta')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button');
    b.disabled = true;
    try {
      const id = await rpc('nueva_consulta', {
        p_condo: ctx.condo.id, p_asunto: el.querySelector('#cAsunto').value.trim(),
        p_detalle: el.querySelector('#cDetalle').value.trim(), p_urgente: el.querySelector('#cUrgente').checked,
      });
      toast('Consulta enviada al abogado', 'ok');
      location.hash = `#/legal/${id}`;
    } catch (err) { b.disabled = false; el.querySelector('#msgC').innerHTML = errorHtml(err); }
  });
  el.querySelectorAll('[data-abrir]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`¿Abrir un expediente de cobro para el apto ${b.dataset.codigo}?\n\nEl abogado lo verá con el estado de cuenta, los avisos enviados y los recibos pendientes.`)) return;
    b.disabled = true;
    try {
      const id = await rpc('abrir_expediente', { p_unidad: b.dataset.abrir });
      toast('Expediente abierto', 'ok');
      location.hash = `#/legal/${id}`;
    } catch (err) { b.disabled = false; toast(err.message, 'error'); }
  }));
}

function htmlExpediente(ex) {
  const deuda = ex.recibos.reduce((a, r) => a + Number(r.saldo_usd), 0);
  const p = ex.propietarios[0];
  return `
    <section class="tarjeta">
      <h2>Expediente</h2>
      <div class="kpis">
        <div class="kpi"><div class="etiqueta">Deuda total</div><div class="valor">${usd(deuda)}</div>
          ${ex.tasa_hoy ? `<div class="muted">${bs(deuda * ex.tasa_hoy)} a la tasa BCV de hoy</div>` : ''}</div>
        <div class="kpi"><div class="etiqueta">Recibos pendientes</div><div class="valor">${ex.recibos.length}</div></div>
        <div class="kpi"><div class="etiqueta">Avisos enviados</div><div class="valor">${ex.avisos.length}</div></div>
      </div>
      <p><b>${esc(p?.nombre || 'Sin propietario registrado')}</b>${p ? `<span class="muted"> · ${esc([p.cedula, p.email, p.telefono].filter(Boolean).join(' · '))}</span>` : ''}</p>
      <div class="scroll-x"><table class="tabla"><thead><tr><th>Recibo</th><th>Periodo</th><th>Vence</th><th class="num">Días</th><th class="num">Saldo</th></tr></thead><tbody>
        ${ex.recibos.map((r) => `<tr><td>Nº ${String(r.numero).padStart(6, '0')}</td><td>${periodoTxt(r)}</td><td>${fecha(r.fecha_vencimiento)}</td>
          <td class="num">${r.dias_vencido || '—'}</td><td class="num">${usd(r.saldo_usd)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>`;
}

export async function caso(ctx, el, id) {
  const d = await rpc('caso_detalle', { p_caso: id });
  const k = d.caso;
  const puedeEstado = ['abogado', 'administracion'].includes(d.soy);
  el.innerHTML = `
    <div class="acciones" style="margin-bottom:12px">
      <a class="btn linea chico" href="#/legal">Volver</a>
      ${k.tipo === 'cobro' ? `<button class="btn chico" id="btnExpediente" type="button">${icono.recibos} Descargar expediente (PDF)</button>` : ''}
    </div>
    <section class="tarjeta">
      <div class="caso-cab">
        <div><span class="etiqueta-seccion">${k.tipo === 'cobro' ? 'Expediente de cobro' : 'Consulta'} Nº ${k.numero}</span>
          <h1>${esc(k.asunto)}</h1>
          <p class="muted">Abierto por ${esc(k.creado_por || '—')} el ${fecha(String(k.created_at).slice(0, 10))} ·
            ${d.abogados.length ? `Abogado: ${d.abogados.map((a) => esc(a.nombre)).join(', ')}` : 'Este edificio todavía no tiene abogado asignado'}</p></div>
        ${chipEstado(k.estado)}
      </div>
      ${k.detalle ? `<p class="caso-detalle">${esc(k.detalle)}</p>` : ''}
      ${puedeEstado ? `<div class="acciones"><label for="selEstado">Estado del caso</label>
        <select id="selEstado">${ESTADOS_DE[k.tipo].map((e) => `<option value="${e}" ${e === k.estado ? 'selected' : ''}>${NOMBRE[e]}</option>`).join('')}</select></div>` : ''}
    </section>
    ${d.expediente ? htmlExpediente(d.expediente) : ''}
    <section class="tarjeta">
      <h2>Conversación</h2>
      ${d.mensajes.length ? `<ul class="hilo">${d.mensajes.map((m) => `
        <li class="msg ${m.rol}"><div class="msg-cab"><b>${esc(m.autor)}</b> · ${QUIEN[m.rol] || ''} <span class="muted">${fechaHora(m.created_at)}</span></div>
          <div class="msg-texto">${esc(m.texto)}</div>
          ${m.archivo_url ? `<button class="btn linea chico" type="button" data-archivo="${esc(m.archivo_url)}">Ver adjunto</button>` : ''}</li>`).join('')}</ul>`
        : vacio('Todavía no hay mensajes.')}
      ${k.estado === 'cerrado' ? '<p class="muted">El caso está cerrado.</p>' : `
      <form id="fResp">
        <label for="txtResp">${d.soy === 'abogado' ? 'Respuesta' : 'Escribir al abogado'}</label>
        <textarea id="txtResp" rows="4" required maxlength="8000"></textarea>
        <label for="adjResp">Adjuntar un PDF o una imagen (opcional)</label>
        <input id="adjResp" type="file" accept="application/pdf,image/*">
        <div id="msgR"></div>
        <button class="btn" style="margin-top:12px">Enviar</button>
      </form>`}
    </section>`;

  el.querySelector('#selEstado')?.addEventListener('change', async (e) => {
    try {
      await rpc('cambiar_estado_caso', { p_caso: id, p_estado: e.target.value });
      toast('Estado actualizado', 'ok');
      caso(ctx, el, id);
    } catch (err) { toast(err.message, 'error'); e.target.value = k.estado; }
  });
  el.querySelectorAll('[data-archivo]').forEach((b) => (b.onclick = async () => {
    const url = await urlFirmada('legal', b.dataset.archivo);
    if (url) window.open(url, '_blank', 'noopener'); else toast('No se encontró el archivo', 'error');
  }));
  el.querySelector('#fResp')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button');
    b.disabled = true;
    try {
      let ruta = null;
      const archivo = el.querySelector('#adjResp').files[0];
      if (archivo) {
        ruta = `${k.condominio_id}/${k.id}/${nombreArchivo(archivo)}`;
        const up = await sb.storage.from('legal').upload(ruta, archivo);
        if (up.error) throw up.error;
      }
      await rpc('responder_caso', { p_caso: id, p_texto: el.querySelector('#txtResp').value.trim(), p_archivo: ruta });
      caso(ctx, el, id);
    } catch (err) { b.disabled = false; el.querySelector('#msgR').innerHTML = errorHtml(err); }
  });
  el.querySelector('#btnExpediente')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch(`${urlFuncion('expediente-pdf')}?caso=${id}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      if (!r.ok) throw new Error(await r.text());
      const nombre = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || `expediente-${k.numero}.pdf`;
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await r.blob()), download: nombre });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) { toast(err.message || 'No se pudo descargar el expediente', 'error'); }
    b.disabled = false;
  });
}
