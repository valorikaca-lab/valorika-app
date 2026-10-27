// Pantallas de la Junta de Condominio: supervisa las cuentas y aprueba los gastos.
import {
  pct, sb, esc, usd, bs, num2, fecha, periodoTxt, chip, vacio, errorHtml, q, cuenta, toast, urlFirmada,
  tasaHoy, tarjetaTasaHtml, conversorHtml, activarConversor, icono,
} from '../util.js';

const CONTRATO = { outsourcing: 'Empresa de outsourcing', servicios_profesionales: 'Servicios profesionales', obra: 'Contrato de obra', suministro: 'Suministro' };

export async function inicio(ctx, el) {
  if (ctx.demo) { el.innerHTML = `<h1>Inicio</h1><div class="tarjeta">${vacio('Vista previa sin datos.')}</div>`; return; }
  const c = ctx.condo.id;
  const [porAprobar, mor, rec, abiertos, t] = await Promise.all([
    q(sb.from('gastos').select('id, monto_usd').eq('condominio_id', c).eq('estado', 'en_revision')),
    q(sb.from('v_morosidad_antiguedad').select('*').eq('condominio_id', c)),
    q(sb.from('v_recaudacion_mensual').select('*').eq('condominio_id', c).order('anio', { ascending: false }).order('mes', { ascending: false }).limit(1)),
    q(sb.from('periodos').select('id, anio, mes').eq('condominio_id', c).in('estado', ['abierto', 'en_revision']).limit(1)),
    tasaHoy(),
  ]);
  const aprobadoMes = abiertos[0] ? await q(sb.from('gastos').select('monto_usd').eq('periodo_id', abiertos[0].id).eq('estado', 'aprobado')) : [];
  const m = mor[0] || {};
  const r = rec[0];
  const totalPend = porAprobar.reduce((a, g) => a + Number(g.monto_usd), 0);
  const vencido = ['d1_30_usd', 'd31_60_usd', 'd61_90_usd', 'd90_mas_usd'].reduce((a, k) => a + Number(m[k] || 0), 0);

  el.innerHTML = `
    <div class="titulo-pagina"><h1>${esc(ctx.condo.nombre)}</h1><p class="muted">${esc(ctx.condo.cargo || 'Junta de condominio')}: aquí revisas en qué se gasta el dinero del edificio.</p></div>
    <div class="kpis">
      <a class="kpi" href="#/aprobar"><div class="etiqueta">Gastos por aprobar</div><div class="valor">${porAprobar.length}</div></a>
      <a class="kpi" href="#/aprobar"><div class="etiqueta">Monto por aprobar</div><div class="valor">${usd(totalPend)}</div></a>
      <a class="kpi" href="#/reportes"><div class="etiqueta">Deuda vencida</div><div class="valor">${usd(vencido)}</div></a>
      <a class="kpi" href="#/recibos"><div class="etiqueta">Cobrado de ${r ? periodoTxt(r) : 'último mes'}</div><div class="valor">${pct(r?.pct_cobrado)}</div></a>
    </div>
    <section class="tarjeta">
      <h2>Para revisar</h2>
      <ul class="tareas">
        ${porAprobar.length ? `<li><span class="tarea-icono">${icono.aprobar}</span><div><b>${porAprobar.length} gastos esperan tu aprobación</b><div class="muted">Sin tu aprobación no se pueden emitir los recibos</div></div><a class="btn chico" href="#/aprobar">Revisar</a></li>` : ''}
        ${abiertos[0] ? `<li><span class="tarea-icono">${icono.recibos}</span><div><b>${periodoTxt(abiertos[0])}</b><div class="muted">Aprobado hasta ahora: ${usd(aprobadoMes.reduce((a, g) => a + Number(g.monto_usd), 0))}</div></div><a class="btn linea chico" href="#/recibos">Ver</a></li>` : ''}
        ${m.unidades_morosas ? `<li><span class="tarea-icono">${icono.alerta}</span><div><b>${m.unidades_morosas} apartamentos con deuda vencida</b><div class="muted">${usd(vencido)} en total</div></div><a class="btn linea chico" href="#/reportes">Ver</a></li>` : ''}
      </ul>
      ${!porAprobar.length && !m.unidades_morosas ? vacio('Todo al día.') : ''}
    </section>
    <div class="dos-col">${tarjetaTasaHtml(t)}${conversorHtml(t)}</div>`;
  activarConversor(el);
}

export async function aprobar(ctx, el) {
  if (ctx.demo) { el.innerHTML = `<h1>Aprobar gastos</h1><div class="tarjeta">${vacio('Vista previa sin datos.')}</div>`; return; }
  const c = ctx.condo.id;
  const [lista, recientes] = await Promise.all([
    q(sb.from('gastos').select('id, descripcion, fecha_factura, moneda, monto, tasa_aplicada, monto_usd, tipo, es_comun, soporte_url, numero_factura, numero_control, periodos(anio, mes), categorias_gasto(nombre), proveedores(razon_social, rif, tipo_contrato, servicio)')
      .eq('condominio_id', c).eq('estado', 'en_revision').order('fecha_factura')),
    q(sb.from('gasto_aprobaciones').select('decision, comentario, created_at, gastos!inner(descripcion, monto_usd, condominio_id)')
      .eq('gastos.condominio_id', c).order('created_at', { ascending: false }).limit(10)),
  ]);
  const fotos = await Promise.all(lista.map((g) => urlFirmada('soportes', g.soporte_url)));

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Aprobar gastos</h1><p class="muted">Revisa cada factura. Solo los gastos aprobados entran en los recibos del mes.</p></div>
    <div id="msgA"></div>
    ${lista.length ? lista.map((g, i) => `
      <article class="tarjeta pago">
        ${fotos[i] ? `<a class="pago-foto" href="${esc(fotos[i])}" target="_blank" rel="noopener"><img src="${esc(fotos[i])}" alt="Factura: ${esc(g.descripcion)}"></a>` : '<div class="pago-foto sin">Sin factura</div>'}
        <div class="pago-info">
          <div class="pago-cab"><div><b>${esc(g.descripcion)}</b>
            <div class="muted">${periodoTxt(g.periodos)} · ${esc(g.categorias_gasto?.nombre || '')} · ${g.tipo === 'extraordinario' ? 'Extraordinario' : 'Ordinario'}${g.es_comun ? '' : ' · no común'}</div></div>
            <div class="num"><b>${usd(g.monto_usd)}</b>${g.moneda === 'VES' ? `<div class="muted">${bs(g.monto)} a ${num2(g.tasa_aplicada)}</div>` : ''}</div></div>
          <div class="muted">${esc(g.proveedores?.razon_social || 'Sin proveedor')}${g.proveedores?.rif ? ' · RIF ' + esc(g.proveedores.rif) : ''}${g.proveedores?.tipo_contrato ? ' · ' + CONTRATO[g.proveedores.tipo_contrato] + ' (sin relación laboral)' : ''}</div>
          <div class="muted">Factura ${esc(g.numero_factura || 's/n')} · control ${esc(g.numero_control || 's/n')} · ${fecha(g.fecha_factura)}</div>
          <label for="com-${g.id}">Comentario (obligatorio si rechazas)</label>
          <textarea id="com-${g.id}" rows="2" placeholder="Ej.: Conforme con la factura"></textarea>
          <div class="acciones">
            <button class="btn" data-decidir="aprobado" data-id="${g.id}" type="button">Aprobar</button>
            <button class="btn linea peligro" data-decidir="rechazado" data-id="${g.id}" type="button">Rechazar</button>
          </div>
        </div>
      </article>`).join('') : `<div class="tarjeta">${vacio('No hay gastos esperando tu aprobación.')}</div>`}
    <section class="tarjeta">
      <h2>Decisiones recientes</h2>
      ${recientes.length ? `<ul class="historial">${recientes.map((h) => `
        <li>${chip('gasto', h.decision === 'observacion' ? 'en_revision' : h.decision)} <b>${esc(h.gastos?.descripcion)}</b> · ${usd(h.gastos?.monto_usd)}
          <div class="muted">${fecha(h.created_at.slice(0, 10))}${h.comentario ? ' · ' + esc(h.comentario) : ''}</div></li>`).join('')}</ul>` : vacio('Sin decisiones todavía.')}
    </section>`;

  el.querySelectorAll('[data-decidir]').forEach((b) => (b.onclick = async () => {
    const id = b.dataset.id;
    const decision = b.dataset.decidir;
    const comentario = el.querySelector('#com-' + id).value.trim();
    if (decision === 'rechazado' && !comentario) { el.querySelector('#com-' + id).focus(); toast('Escribe el motivo del rechazo', 'error'); return; }
    b.disabled = true;
    const { error } = await sb.rpc('decidir_gasto', { p_gasto: id, p_decision: decision, p_comentario: comentario || null });
    if (error) { el.querySelector('#msgA').innerHTML = errorHtml(error); b.disabled = false; return; }
    toast(decision === 'aprobado' ? 'Gasto aprobado' : 'Gasto rechazado: la administración verá tu comentario', 'ok');
    aprobar(ctx, el);
  }));
}
