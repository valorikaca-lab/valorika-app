// Pantallas de la administradora (dueña y trabajadoras): el día a día del edificio.
import {
  pct, sb, esc, usd, bs, num2, fecha, diaMes, periodoTxt, hoyVE, diasEntre, chip, estadoRecibo, METODOS,
  vacio, errorHtml, q, cuenta, toast, nombreArchivo, urlFirmada, tasaHoy, tasaUsd,
  tarjetaTasaHtml, conversorHtml, activarConversor, icono, enlaceWhatsApp,
} from '../util.js';
import { fechaEmisionAuto } from './cuentas.js';
import { htmlPreliminar, enlaceRecibo } from './recibo.js';
import { activarImportacion } from './importar.js';

const primerNombre = (ctx) => (ctx.perfil?.nombre || '').split('(')[0].trim() || 'equipo';

function vistaPrevia(el, titulo) {
  el.innerHTML = `<h1>${esc(titulo)}</h1><div class="tarjeta">${vacio('Vista previa sin datos. Entra con una cuenta para ver la información real.')}</div>`;
}

// ---------------------------------------------------------------- Inicio
export async function inicio(ctx, el) {
  if (ctx.demo) return vistaPrevia(el, 'Inicio');
  const c = ctx.condo.id;
  const [mor, rec, porRevisar, enJunta, borradores, abiertos, t] = await Promise.all([
    q(sb.from('v_morosidad_antiguedad').select('*').eq('condominio_id', c)),
    q(sb.from('v_recaudacion_mensual').select('*').eq('condominio_id', c).order('anio', { ascending: false }).order('mes', { ascending: false }).limit(1)),
    cuenta(sb.from('pagos').select('id', { count: 'exact', head: true }).eq('condominio_id', c).eq('estado', 'pendiente')),
    cuenta(sb.from('gastos').select('id', { count: 'exact', head: true }).eq('condominio_id', c).eq('estado', 'en_revision')),
    cuenta(sb.from('gastos').select('id', { count: 'exact', head: true }).eq('condominio_id', c).eq('estado', 'borrador')),
    q(sb.from('periodos').select('id, anio, mes, estado').eq('condominio_id', c).in('estado', ['abierto', 'en_revision']).order('anio').order('mes').limit(1)),
    tasaHoy(),
  ]);
  const m = mor[0] || {};
  const r = rec[0];
  const vencido = ['d1_30_usd', 'd31_60_usd', 'd61_90_usd', 'd90_mas_usd'].reduce((a, k) => a + Number(m[k] || 0), 0);
  const abierto = abiertos[0];
  const s = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const tareas = [
    porRevisar && ['pagos', s(porRevisar, 'pago por revisar', 'pagos por revisar'), 'Compáralos con el banco y confírmalos', '#/pagos', 'Revisar'],
    enJunta && ['aprobar', s(enJunta, 'gasto esperando a la junta', 'gastos esperando a la junta'), 'La junta debe aprobarlos antes de emitir', '#/gastos', 'Ver'],
    borradores && ['gastos', s(borradores, 'gasto en borrador', 'gastos en borrador'), 'Falta adjuntar la factura y enviarlos a la junta', '#/gastos', 'Completar'],
    abierto && ['recibos', `${periodoTxt(abierto)}: periodo abierto`,
      enJunta || borradores ? 'Cuando todos los gastos estén aprobados podrás emitir los recibos' : 'Todo aprobado: ya puedes emitir los recibos', '#/recibos', 'Ir'],
    m.unidades_morosas && ['alerta', s(m.unidades_morosas, 'apartamento con deuda vencida', 'apartamentos con deuda vencida'), `Total vencido: ${usd(vencido)}`, '#/reportes', 'Ver'],
  ].filter(Boolean);

  el.innerHTML = `
    <div class="titulo-pagina"><h1>${esc(ctx.condo.nombre)}</h1><p class="muted">Hola, ${esc(primerNombre(ctx))}. Esto es lo que hay que hacer hoy.</p></div>
    <div class="kpis">
      <a class="kpi" href="#/pagos"><div class="etiqueta">Pagos por revisar</div><div class="valor">${porRevisar}</div></a>
      <a class="kpi" href="#/reportes"><div class="etiqueta">Deuda vencida</div><div class="valor">${usd(vencido)}</div></a>
      <a class="kpi" href="#/reportes"><div class="etiqueta">Apartamentos morosos</div><div class="valor">${m.unidades_morosas || 0}</div></a>
      <a class="kpi" href="#/recibos"><div class="etiqueta">Cobrado de ${r ? periodoTxt(r) : 'último mes'}</div><div class="valor">${pct(r?.pct_cobrado)}</div></a>
    </div>
    <section class="tarjeta">
      <h2>Para hacer hoy</h2>
      ${tareas.length ? `<ul class="tareas">${tareas.map(([ic, txt, det, href, btn]) => `
        <li><span class="tarea-icono">${icono[ic]}</span><div><b>${esc(txt)}</b><div class="muted">${esc(det)}</div></div>
          <a class="btn linea chico" href="${href}">${btn}</a></li>`).join('')}</ul>` : vacio('Todo al día. No hay pendientes.')}
    </section>
    <div class="dos-col">${tarjetaTasaHtml(t)}${conversorHtml(t)}</div>`;
  activarConversor(el);
}

// ---------------------------------------------------------------- Apartamentos
export async function unidades(ctx, el) {
  if (ctx.demo) return vistaPrevia(el, 'Apartamentos');
  const c = ctx.condo.id;
  const [cuentas, gente, alic] = await Promise.all([
    q(sb.from('v_estado_cuenta').select('*').eq('condominio_id', c).order('codigo')),
    q(sb.from('unidad_personas').select('unidad_id, relacion, personas(nombre, email, telefono, usuario_id), unidades!inner(condominio_id)').eq('unidades.condominio_id', c)
      .or(`hasta.is.null,hasta.gte.${hoyVE()}`)),
    q(sb.from('v_alicuotas').select('*').eq('condominio_id', c)),
  ]);
  const dueno = Object.fromEntries(gente.map((g) => [g.unidad_id, g.personas]));
  const suma = Number(alic[0]?.suma_pct || 0);
  const conDeuda = cuentas.filter((u) => Number(u.vencido_usd) > 0).length;
  const estado = (u) => Number(u.vencido_usd) > 0 ? `<span class="chip error">Moroso · ${u.dias_mora} días</span>`
    : Number(u.deuda_usd) > 0 ? '<span class="chip oro">Por pagar</span>'
    : Number(u.saldo_favor_usd) > 0 ? `<span class="chip ok">A favor ${usd(u.saldo_favor_usd)}</span>` : '<span class="chip ok">Al día</span>';

  el.innerHTML = `
    <div class="titulo-pagina"><h1>${ctx.condo.tipo === 'parcelamiento' ? 'Casas' : 'Apartamentos'}</h1>
      <p class="muted">${cuentas.length} ${ctx.condo.tipo === 'parcelamiento' ? 'casas' : 'apartamentos'} · alícuotas suman ${num2(suma)} % · ${conDeuda} con deuda vencida</p></div>
    ${cuentas.length && Math.abs(suma - 100) > 0.001 ? `<div class="aviso">Las alícuotas suman ${num2(suma)} %. Deben sumar 100 % para poder emitir recibos.</div>` : ''}
    <div class="tarjeta scroll-x">
      ${cuentas.length ? `<table class="tabla apilada t-unidades"><thead><tr><th>Apto</th><th>Propietario</th><th class="num">Alícuota</th><th class="num">Debe</th><th>Estado</th></tr></thead><tbody>
        ${cuentas.map((u) => { const p = dueno[u.unidad_id]; return `<tr>
          <td class="c-apto"><b>${esc(u.codigo)}</b></td>
          <td class="c-prop">${esc(p?.nombre || 'Sin propietario')}${p?.usuario_id ? ' <span class="chip ok">usa la app</span>' : ''}<div class="muted">${esc(p?.email || '')}</div></td>
          <td class="num c-alic">${Number(u.alicuota_pct).toFixed(4)} %</td>
          <td class="num c-debe">${usd(u.deuda_usd)}<div class="muted">${bs(u.deuda_ves_hoy)}</div></td>
          <td class="c-est">${estado(u)}</td></tr>`; }).join('')}
      </tbody></table>` : vacio('Aún no hay apartamentos. Agrega el primero abajo.')}
    </div>
    <details class="tarjeta plegable">
      <summary><h2>Agregar un apartamento</h2></summary>
      <form id="fUnidad">
        <div class="fila3">
          <div><label for="uCod">Código</label><input id="uCod" required placeholder="7-A"></div>
          <div><label for="uPiso">Piso</label><input id="uPiso" placeholder="7"></div>
          <div><label for="uAlic">Alícuota (%)</label><input id="uAlic" type="number" step="0.000001" min="0.000001" max="100" required></div>
        </div>
        <div class="fila"><div><label for="uNom">Propietario</label><input id="uNom" required placeholder="Nombre y apellido"></div>
          <div><label for="uCed">Cédula o RIF</label><input id="uCed" placeholder="V-12345678"></div></div>
        <div class="fila"><div><label for="uMail">Correo (para recibos y acceso)</label><input id="uMail" type="email"></div>
          <div><label for="uTel">WhatsApp</label><input id="uTel" inputmode="tel" placeholder="584121234567"></div></div>
        <div id="msgU"></div>
        <button class="btn" style="margin-top:16px">Guardar apartamento</button>
        <p class="muted">Cuando el propietario entre a la app con ese mismo correo, verá su estado de cuenta.</p>
      </form>
    </details>
    <section class="tarjeta">
      <h2>Carga masiva desde Excel</h2>
      <p class="muted">Descarga la plantilla (trae lo que ya está cargado), llénala o corrígela en Excel y súbela. Antes de guardar verás una vista previa con todo lo que cambia.</p>
      <div class="acciones">
        <button class="btn linea" id="btnPlantilla" type="button">Descargar plantilla Excel</button>
        <button class="btn" id="btnSubirX" type="button">Subir Excel</button>
        <input id="archivoX" type="file" accept=".xlsx,.xls,.ods,.csv" hidden>
      </div>
      <div id="prevImport"></div>
    </section>`;

  activarImportacion(ctx, el, () => unidades(ctx, el));

  el.querySelector('#fUnidad').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    const v = (id) => el.querySelector('#' + id).value.trim();
    try {
      const { data: u, error: e1 } = await sb.from('unidades').insert({
        condominio_id: c, codigo: v('uCod').toUpperCase(), piso: v('uPiso') || null, alicuota_pct: Number(v('uAlic')),
      }).select('id').single();
      if (e1) throw e1.code === '23505' ? new Error('Ya existe un apartamento con ese código') : e1;
      const { data: p, error: e2 } = await sb.from('personas').insert({
        condominio_id: c, nombre: v('uNom'), cedula_rif: v('uCed').toUpperCase() || null, email: v('uMail').toLowerCase() || null, telefono: v('uTel') || null,
      }).select('id').single();
      if (e2) throw e2;
      const { error: e3 } = await sb.from('unidad_personas').insert({ unidad_id: u.id, persona_id: p.id, relacion: 'propietario' });
      if (e3) throw e3;
      toast('Apartamento agregado. Recuerda: las alícuotas deben sumar 100 % para emitir.', 'ok');
      unidades(ctx, el);
    } catch (err) {
      el.querySelector('#msgU').innerHTML = errorHtml(err);
      btn.disabled = false;
    }
  };
}

// ---------------------------------------------------------------- Gastos
// (en su propio archivo: facturas, cuotas y pagos a proveedores)
export { gastos } from './gastos.js';

// ---------------------------------------------------------------- Pagos
const MOTIVOS = ['La referencia no aparece en el banco', 'El monto no coincide', 'La captura no se ve bien', 'El pago ya estaba registrado'];

export async function pagos(ctx, el) {
  if (ctx.demo) return vistaPrevia(el, 'Pagos');
  const c = ctx.condo.id;
  const [pend, recientes] = await Promise.all([
    q(sb.from('pagos').select('id, unidad_id, fecha_pago, metodo, banco_origen, referencia, moneda, monto, tasa_bcv, monto_usd, comprobante_url, cuenta_destino_id, created_at, unidades(codigo), cuentas_bancarias(banco, tipo)')
      .eq('condominio_id', c).eq('estado', 'pendiente').order('created_at')),
    q(sb.from('pagos').select('id, fecha_pago, metodo, referencia, moneda, monto, monto_usd, estado, motivo_rechazo, revisado_at, unidades(codigo)')
      .eq('condominio_id', c).in('estado', ['aprobado', 'rechazado']).order('revisado_at', { ascending: false }).limit(15)),
  ]);
  const refs = pend.map((p) => p.referencia);
  const [movs, deudas, fotos] = await Promise.all([
    refs.length ? q(sb.from('movimientos_banco').select('referencia, cuenta_id, fecha, monto').in('referencia', refs)) : [],
    pend.length ? q(sb.from('v_estado_cuenta').select('unidad_id, deuda_usd').in('unidad_id', pend.map((p) => p.unidad_id))) : [],
    pend.some((p) => p.comprobante_url) ? sb.storage.from('comprobantes').createSignedUrls(pend.filter((p) => p.comprobante_url).map((p) => p.comprobante_url), 600).then((r) => r.data || []) : [],
  ]);
  const foto = Object.fromEntries(fotos.filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  const deuda = Object.fromEntries(deudas.map((d) => [d.unidad_id, d.deuda_usd]));
  const banco = (p) => {
    if (['zelle', 'efectivo_usd'].includes(p.metodo)) return `<div class="verif neutro">${icono.alerta} ${p.metodo === 'zelle' ? 'Verificar en la cuenta Zelle' : 'Verificar el efectivo recibido'}</div>`;
    const m = movs.find((x) => x.referencia.toLowerCase() === p.referencia.toLowerCase());
    if (!m) return `<div class="verif mal">${icono.alerta} No aparece en el último estado de cuenta del banco</div>`;
    const igual = Math.abs(Number(m.monto) - Number(p.monto)) < 0.01;
    return `<div class="verif ${igual ? 'bien' : 'mal'}">${igual ? icono.ok : icono.alerta} En el banco el ${diaMes(m.fecha)} por ${bs(m.monto)}${igual ? ': coincide' : ': el monto no coincide'}</div>`;
  };

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Pagos por revisar</h1><p class="muted">Lo que reportan los propietarios. Al confirmarlo se descuenta de sus recibos más viejos.</p></div>
    <div id="msgP"></div>
    ${pend.length ? pend.map((p) => `
      <article class="tarjeta pago">
        ${foto[p.comprobante_url] ? `<a class="pago-foto" href="${esc(foto[p.comprobante_url])}" target="_blank" rel="noopener"><img src="${esc(foto[p.comprobante_url])}" alt="Captura del pago de ${esc(p.unidades?.codigo)}"></a>` : '<div class="pago-foto sin">Sin captura</div>'}
        <div class="pago-info">
          <div class="pago-cab"><div><b>Apto ${esc(p.unidades?.codigo)}</b> · ${esc(METODOS[p.metodo] || p.metodo)}${p.banco_origen ? ' desde ' + esc(p.banco_origen) : ''}
            <div class="muted">Ref. <b>${esc(p.referencia)}</b> · pagado el ${fecha(p.fecha_pago)} · reportado ${fecha(p.created_at.slice(0, 10))}</div></div>
            <div class="num"><b>${p.moneda === 'VES' ? bs(p.monto) : usd(p.monto)}</b><div class="muted">${p.moneda === 'VES' ? `= ${usd(p.monto_usd)} a ${num2(p.tasa_bcv)}` : ''}</div></div></div>
          ${banco(p)}
          <div class="muted">Este apartamento debe ${usd(deuda[p.unidad_id] || 0)}</div>
          <div class="acciones">
            <button class="btn" data-ok="${p.id}" type="button">Confirmar pago</button>
            <select data-motivo="${p.id}" aria-label="Motivo del rechazo"><option value="">Rechazar por…</option>${MOTIVOS.map((m) => `<option>${m}</option>`).join('')}</select>
          </div>
        </div>
      </article>`).join('') : `<div class="tarjeta">${vacio('No hay pagos por revisar.')}</div>`}
    <section class="tarjeta scroll-x">
      <h2>Últimos revisados</h2>
      ${recientes.length ? `<table class="tabla"><thead><tr><th>Apto</th><th>Pago</th><th class="num">Monto</th><th>Estado</th></tr></thead><tbody>
        ${recientes.map((p) => `<tr><td><b>${esc(p.unidades?.codigo)}</b></td><td>${esc(METODOS[p.metodo] || p.metodo)} · ${fecha(p.fecha_pago)}<div class="muted">Ref. ${esc(p.referencia)}</div></td>
          <td class="num">${p.moneda === 'VES' ? bs(p.monto) : usd(p.monto)}<div class="muted">${usd(p.monto_usd)}</div></td>
          <td>${chip('pago', p.estado)}${p.motivo_rechazo ? `<div class="muted">${esc(p.motivo_rechazo)}</div>` : ''}</td></tr>`).join('')}
      </tbody></table>` : vacio('Todavía no hay pagos revisados.')}
    </section>`;

  el.querySelectorAll('[data-ok]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const { data, error } = await sb.rpc('aprobar_pago', { p_pago: b.dataset.ok });
    if (error) { el.querySelector('#msgP').innerHTML = errorHtml(error); b.disabled = false; return; }
    toast(`Pago confirmado. Se aplicó a los recibos más viejos${Number(data) > 0 ? ` y quedaron ${usd(data)} a favor` : ''}. Se avisará al propietario.`, 'ok');
    pagos(ctx, el);
  }));
  el.querySelectorAll('[data-motivo]').forEach((s) => (s.onchange = async () => {
    if (!s.value) return;
    const motivo = s.value;
    if (!confirm(`¿Rechazar este pago?\nMotivo: ${motivo}`)) { s.value = ''; return; }
    const { error } = await sb.rpc('rechazar_pago', { p_pago: s.dataset.motivo, p_motivo: motivo });
    if (error) { el.querySelector('#msgP').innerHTML = errorHtml(error); return; }
    toast('Pago rechazado. Se avisará al propietario con el motivo.', 'ok');
    pagos(ctx, el);
  }));
}

// ---------------------------------------------------------------- Recibos
let periodoRecibos = null;
let previoDe = null; // periodo cuyo recibo preliminar está abierto
const MORA_TXT = { interes: (p) => `${pct(p)} mensual sobre lo vencido`, recargo: (p) => `recargo único del ${pct(p)} por recibo vencido` };

export async function recibos(ctx, el) {
  if (ctx.demo) return vistaPrevia(el, 'Recibos');
  const c = ctx.condo.id;
  const [periodos, rec, gastosP, [condo]] = await Promise.all([
    q(sb.from('periodos').select('id, anio, mes, estado, fecha_emision, fecha_vencimiento, tasa_emision').eq('condominio_id', c).order('anio', { ascending: false }).order('mes', { ascending: false })),
    q(sb.from('v_recaudacion_mensual').select('*').eq('condominio_id', c)),
    q(sb.from('gastos').select('periodo_id, estado, monto_usd').eq('condominio_id', c).in('estado', ['borrador', 'en_revision', 'aprobado'])),
    q(sb.from('condominios').select('nombre, rif, direccion, ciudad, texto_legal_recibo, dias_para_vencer, dia_emision, emision_automatica, mora_tipo, mora_pct').eq('id', c)),
  ]);
  const auto = Boolean(condo?.emision_automatica);
  let previo = null;
  if (previoDe && periodos.some((p) => p.id === previoDe && ['abierto', 'en_revision'].includes(p.estado))) {
    const { data, error } = await sb.rpc('prever_recibos', { p_periodo: previoDe });
    if (error) throw error;
    previo = data;
  } else previoDe = null;
  const periodoPrevio = periodos.find((p) => p.id === previoDe);
  const recaudo = Object.fromEntries(rec.map((r) => [r.periodo_id, r]));
  const emitidos = periodos.filter((p) => ['emitido', 'cerrado'].includes(p.estado));
  if (!periodos.some((p) => p.id === periodoRecibos)) periodoRecibos = emitidos[0]?.id || null;
  const lista = periodoRecibos ? await q(sb.from('recibos').select('id, numero, total_usd, total_ves_emision, saldo_usd, estado, fecha_vencimiento, unidades(codigo)').eq('periodo_id', periodoRecibos).order('numero')) : [];
  const t = await tasaHoy();
  const puedeEmitir = ctx.rol === 'admin';

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Recibos</h1><p class="muted">Un recibo por apartamento cada mes, en dólares y en bolívares a la tasa BCV del día de emisión.</p></div>
    <div id="msgR"></div>
    ${puedeEmitir ? `
    <section class="tarjeta interruptor">
      <div><b>Emisión automática ${auto ? '<span class="chip ok">Activada</span>' : '<span class="chip">Desactivada</span>'}</b>
        <div class="muted">${auto ? `Los recibos salen solos el día ${condo.dia_emision} de cada mes, con la tasa BCV de ese día, si la junta aprobó todos los gastos. Si falta algo, salen apenas quede aprobado.` : 'Los recibos se emiten con el botón de cada mes.'}</div></div>
      <label class="check"><input type="checkbox" id="autoEmision" ${auto ? 'checked' : ''}> Automática</label>
    </section>` : ''}
    <p class="muted">Mora: ${condo?.mora_tipo && condo.mora_tipo !== 'ninguna' && Number(condo.mora_pct) > 0 ? `${MORA_TXT[condo.mora_tipo](condo.mora_pct)}, se suma en el recibo siguiente` : 'no se cobra'}${puedeEmitir ? ' · se cambia en Configuración' : ''}.</p>
    <div class="periodos">
      ${periodos.map((p) => {
        const g = gastosP.filter((x) => x.periodo_id === p.id);
        const aprob = g.filter((x) => x.estado === 'aprobado');
        const pend = g.length - aprob.length;
        const r = recaudo[p.id];
        const abierto = ['abierto', 'en_revision'].includes(p.estado);
        return `
        <article class="tarjeta periodo ${p.id === periodoRecibos ? 'activo' : ''}">
          <div class="periodo-cab"><b>${periodoTxt(p)}</b>${chip('periodo', p.estado)}</div>
          ${abierto ? `
            <div class="muted">${aprob.length} gastos aprobados (${usd(aprob.reduce((a, x) => a + Number(x.monto_usd), 0))})${pend ? ` · ${pend} sin aprobar` : ''}</div>
            ${auto ? `<div class="muted"><b>Se emiten solos el ${fecha(fechaEmisionAuto(p, condo))}</b>${pend ? ' si la junta aprueba todo antes' : ''}.</div>` : ''}
            ${aprob.length ? `<button class="btn linea chico" data-preliminar="${p.id}" type="button">Ver recibo preliminar</button>` : ''}
            ${puedeEmitir ? `<button class="btn chico ${auto ? 'linea' : ''}" data-emitir="${p.id}" type="button" ${pend || !aprob.length ? 'disabled' : ''}>${auto ? 'Emitir ya' : 'Emitir recibos'}</button>
              ${pend ? '<div class="muted">Primero la junta debe aprobar todos los gastos.</div>' : ''}` : ''}`
          : `
            <div class="barra-progreso" title="Cobrado ${pct(r?.pct_cobrado)}"><span style="width:${Math.min(100, Number(r?.pct_cobrado || 0))}%"></span></div>
            <div class="muted">Cobrado ${usd(r?.cobrado_usd)} de ${usd(r?.facturado_usd)} (${pct(r?.pct_cobrado)})</div>
            <div class="muted">Emitidos el ${fecha(p.fecha_emision)} a ${num2(p.tasa_emision)} · vencen el ${fecha(p.fecha_vencimiento)}</div>
            <button class="btn linea chico" data-ver-periodo="${p.id}" type="button">Ver recibos</button>`}
        </article>`; }).join('') || `<div class="tarjeta">${vacio('Todavía no hay periodos.')}</div>`}
    </div>
    ${previo ? `
    <section class="tarjeta" id="secPreliminar">
      <div class="cat-cab"><h2>Recibo preliminar de ${periodoTxt(periodoPrevio)}</h2><button class="btn linea chico" type="button" id="cerrarPrevio">Cerrar</button></div>
      <p class="muted">Así saldrían los recibos si se emitieran hoy (${fecha(previo.fecha)}), a la tasa BCV de ${num2(previo.tasa)}. Se va armando solo a medida que la junta aprueba gastos.</p>
      ${previo.pendientes.cantidad ? `<div class="aviso">Hay ${previo.pendientes.cantidad} gasto${previo.pendientes.cantidad > 1 ? 's' : ''} (${usd(previo.pendientes.monto_usd)}) esperando a la junta: todavía no están incluidos.</div>` : ''}
      <ul class="facturas">${previo.gastos.map((g) => `<li><div>${esc(g.descripcion)}${g.cuotas > 1 ? ` <span class="chip oro">cuota ${g.cuota} de ${g.cuotas}</span>` : ''}${g.es_comun ? '' : ' <span class="chip">no común</span>'}</div><div class="num"><b>${usd(g.monto_usd)}</b></div></li>`).join('')}</ul>
      <div class="scroll-x"><table class="tabla apilada t-recibos" style="margin-top:12px"><thead><tr><th>Apto</th><th>Propietario</th><th class="num">Total</th><th class="num">En Bs</th><th></th></tr></thead><tbody>
        ${previo.unidades.map((u, i) => `<tr><td class="r-apto"><b>Apto ${esc(u.codigo)}</b></td><td class="r-num">${esc(u.propietario || '')}</td>
          <td class="num r-total">${usd(u.total_usd)}</td><td class="num r-saldo">${bs(Number(u.total_usd) * Number(previo.tasa || 0))}</td>
          <td class="r-abrir"><button class="btn linea chico" type="button" data-ver-prev="${i}">Ver</button></td></tr>`).join('')}
      </tbody></table></div>
      <p><b>Total a facturar: ${usd(previo.unidades.reduce((a, u) => a + Number(u.total_usd), 0))}</b></p>
      <div id="prevDetalle"></div>
    </section>` : ''}
    ${periodoRecibos ? `
    <section class="tarjeta scroll-x">
      <h2>Recibos de ${periodoTxt(periodos.find((p) => p.id === periodoRecibos))}</h2>
      <table class="tabla apilada t-recibos"><thead><tr><th>Nº</th><th>Apto</th><th class="num">Total</th><th class="num">Saldo</th><th>Estado</th><th></th></tr></thead><tbody>
        ${lista.map((r) => `<tr class="fila-link" data-href="#/recibo/${r.id}">
          <td class="r-num">Nº ${String(r.numero).padStart(6, '0')}</td><td class="r-apto"><b>Apto ${esc(r.unidades?.codigo)}</b></td>
          <td class="num r-total">${usd(r.total_usd)}<div class="muted">${bs(r.total_ves_emision)}</div></td>
          <td class="num r-saldo">Saldo ${usd(r.saldo_usd)}</td><td class="r-est">${chip('recibo', estadoRecibo(r))}</td>
          <td class="r-abrir"><a class="btn linea chico" href="#/recibo/${r.id}">Abrir</a></td></tr>`).join('')}
      </tbody></table>
    </section>` : ''}`;

  el.querySelector('#autoEmision')?.addEventListener('change', async (e) => {
    const { error } = await sb.from('condominios').update({ emision_automatica: e.target.checked }).eq('id', c);
    if (error) { el.querySelector('#msgR').innerHTML = errorHtml(error); return; }
    toast(e.target.checked ? 'Emisión automática activada' : 'Emisión automática desactivada', 'ok');
    recibos(ctx, el);
  });
  el.querySelectorAll('[data-ver-periodo]').forEach((b) => (b.onclick = () => { periodoRecibos = b.dataset.verPeriodo; recibos(ctx, el); }));
  el.querySelectorAll('[data-preliminar]').forEach((b) => (b.onclick = async () => {
    previoDe = b.dataset.preliminar;
    await recibos(ctx, el);
    el.querySelector('#secPreliminar')?.scrollIntoView({ behavior: 'smooth' });
  }));
  el.querySelector('#cerrarPrevio')?.addEventListener('click', () => { previoDe = null; recibos(ctx, el); });
  el.querySelectorAll('[data-ver-prev]').forEach((b) => (b.onclick = () => {
    const fila = previo.unidades[Number(b.dataset.verPrev)];
    const caja = el.querySelector('#prevDetalle');
    caja.innerHTML = htmlPreliminar(fila, condo, periodoPrevio, previo);
    caja.scrollIntoView({ behavior: 'smooth' });
  }));
  el.querySelectorAll('.fila-link').forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
  el.querySelectorAll('[data-emitir]').forEach((b) => (b.onclick = async () => {
    const p = periodos.find((x) => x.id === b.dataset.emitir);
    const tasa = t?.usd?.tasa;
    if (!confirm(`¿Emitir los recibos de ${periodoTxt(p)}?\n\nSe crea un recibo por apartamento con su alícuota${tasa ? ` y la tasa BCV de hoy (${bs(tasa)})` : ''}. Los propietarios reciben el aviso con el enlace a su recibo.`)) return;
    b.disabled = true;
    const { data, error } = await sb.rpc('emitir_periodo', { p_periodo: p.id });
    if (error) { el.querySelector('#msgR').innerHTML = errorHtml(error); b.disabled = false; return; }
    toast(`Se emitieron ${data} recibos de ${periodoTxt(p)}. Los avisos por correo quedaron listos para enviarse.`, 'ok');
    periodoRecibos = p.id;
    recibos(ctx, el);
  }));
}

// ---------------------------------------------------------------- Reportes
const TEXTO_AVISO = {
  recibo_emitido: (n, x) => `Hola ${x.nombre}. Ya está disponible tu recibo de condominio de ${x.periodo} (apto ${x.codigo}) por ${usd(x.total)}. Míralo y reporta tu pago aquí: ${x.enlace}`,
  aviso_previo: (n, x) => `Hola ${x.nombre}, te recordamos que tu recibo de ${x.periodo} (apto ${x.codigo}) vence el ${x.vence}. Por pagar: ${usd(x.saldo)}${x.bs ? ` (${bs(x.bs)} a la tasa BCV de hoy)` : ''}. Paga y repórtalo aquí: ${x.enlace}`,
  vence_hoy: (n, x) => `Hola ${x.nombre}, hoy vence tu recibo de ${x.periodo} (apto ${x.codigo}). Por pagar: ${usd(x.saldo)}${x.bs ? ` (${bs(x.bs)} a la tasa BCV de hoy)` : ''}. Paga y repórtalo aquí: ${x.enlace}`,
  recordatorio: (n, x) => `Hola ${x.nombre}, tu recibo de ${x.periodo} (apto ${x.codigo}) ya venció. Saldo: ${usd(x.saldo)}${x.bs ? ` (${bs(x.bs)} a la tasa BCV de hoy)` : ''}. Paga y repórtalo aquí: ${x.enlace}`,
  cobro_preventivo: (n, x) => `Hola ${x.nombre}, tu recibo de ${x.periodo} (apto ${x.codigo}) tiene más de 15 días vencido. Saldo: ${usd(x.saldo)}. Te pedimos ponerte al día para evitar acciones de cobro: ${x.enlace}`,
  aviso_ejecutivo: (n, x) => `Sr(a). ${x.nombre}: el recibo de ${x.periodo} del apto ${x.codigo} tiene más de 30 días vencido (saldo ${usd(x.saldo)}). Conforme al Art. 14 de la Ley de Propiedad Horizontal, el recibo tiene fuerza ejecutiva. Comuníquese con la administración: ${x.enlace}`,
  pago_aprobado: (n, x) => `Hola ${x.nombre}, confirmamos tu ${(n.asunto || 'pago').toLowerCase()}. Gracias por estar al día.`,
  pago_rechazado: (n, x) => `Hola ${x.nombre}, no pudimos confirmar tu ${(n.asunto || 'pago').toLowerCase()}. Motivo: ${n.cuerpo || 'revisar con la administración'}.`,
};
const NOMBRE_AVISO = { recibo_emitido: 'Recibo emitido', aviso_previo: 'Vence pronto', vence_hoy: 'Vence hoy', recordatorio: 'Recordatorio', cobro_preventivo: 'Cobro preventivo', aviso_ejecutivo: 'Aviso de título ejecutivo', pago_aprobado: 'Pago confirmado', pago_rechazado: 'Pago rechazado', general: 'General' };

function barras(filas, max) {
  return `<div class="barras">${filas.map(([etq, valor, txt, clase]) => `
    <div class="barra-fila"><span class="barra-etq">${esc(etq)}</span>
      <span class="barra-h"><span class="${clase || ''}" style="width:${max ? Math.max(1.5, (100 * valor) / max) : 0}%"></span></span>
      <span class="barra-valor">${txt}</span></div>`).join('')}</div>`;
}

export async function reportes(ctx, el) {
  if (ctx.demo) return vistaPrevia(el, 'Reportes');
  const c = ctx.condo.id;
  const [mor, rec, cuentas, gente, periodos, t, pendientes] = await Promise.all([
    q(sb.from('v_morosidad_antiguedad').select('*').eq('condominio_id', c)),
    q(sb.from('v_recaudacion_mensual').select('*').eq('condominio_id', c).order('anio').order('mes')),
    q(sb.from('v_estado_cuenta').select('*').eq('condominio_id', c).gt('vencido_usd', 0).order('dias_mora', { ascending: false })),
    q(sb.from('unidad_personas').select('unidad_id, personas(nombre, telefono), unidades!inner(condominio_id)').eq('unidades.condominio_id', c)
      .or(`hasta.is.null,hasta.gte.${hoyVE()}`)),
    q(sb.from('periodos').select('id, anio, mes').eq('condominio_id', c).eq('estado', 'emitido').order('anio', { ascending: false }).order('mes', { ascending: false }).limit(1)),
    tasaHoy(),
    ctx.rol === 'admin' ? q(sb.from('recibos').select('unidad_id, hash_verificacion').eq('condominio_id', c).in('estado', ['emitido', 'parcial']).order('fecha_emision')) : [],
  ]);
  const ultimo = periodos[0];
  const hashDe = Object.fromEntries(pendientes.map((r) => [r.unidad_id, r.hash_verificacion]));   // el más reciente queda
  const [cat, avisos] = await Promise.all([
    ultimo ? q(sb.from('v_gastos_categoria').select('*').eq('periodo_id', ultimo.id).order('total_usd', { ascending: false })) : [],
    ctx.rol === 'admin' ? q(sb.from('notificaciones').select('id, tipo, canal, destino, asunto, cuerpo, estado, created_at, recibo_id, personas(nombre), recibos(numero, saldo_usd, total_usd, fecha_vencimiento, hash_verificacion, unidades(codigo), periodos(anio, mes))')
      .eq('condominio_id', c).order('created_at', { ascending: false }).limit(120)) : [],
  ]);
  const quien = Object.fromEntries(gente.map((g) => [g.unidad_id, g.personas]));
  const PRIORIDAD = ['aviso_ejecutivo', 'cobro_preventivo', 'recordatorio', 'vence_hoy', 'aviso_previo', 'pago_rechazado', 'pago_aprobado', 'recibo_emitido', 'general'];
  avisos.sort((a, b) => PRIORIDAD.indexOf(a.tipo) - PRIORIDAD.indexOf(b.tipo) || b.created_at.localeCompare(a.created_at));
  const porTipo = PRIORIDAD.map((t) => [t, avisos.filter((n) => n.tipo === t).length]).filter(([, n]) => n);
  const m = mor[0] || {};
  const tramos = [['Por vencer', Number(m.por_vencer_usd || 0), 'oro'], ['1 a 30 días', Number(m.d1_30_usd || 0), 'alerta'], ['31 a 60 días', Number(m.d31_60_usd || 0), 'error'], ['61 a 90 días', Number(m.d61_90_usd || 0), 'error'], ['Más de 90 días', Number(m.d90_mas_usd || 0), 'error']];
  const maxT = Math.max(...tramos.map((x) => x[1]));
  const maxR = Math.max(0, ...rec.map((r) => Number(r.facturado_usd)));
  const maxC = Math.max(0, ...cat.map((x) => Number(x.total_usd)));
  const tasa = t?.usd?.tasa;
  const datosAviso = (n) => ({
    nombre: n.personas?.nombre?.split(' ')[0] || 'propietario', codigo: n.recibos?.unidades?.codigo || '',
    periodo: n.recibos?.periodos ? periodoTxt(n.recibos.periodos) : '', total: n.recibos?.total_usd, saldo: n.recibos?.saldo_usd,
    bs: tasa && n.recibos ? n.recibos.saldo_usd * tasa : null,
    vence: n.recibos?.fecha_vencimiento ? fecha(n.recibos.fecha_vencimiento) : '',
    enlace: n.recibos?.hash_verificacion ? enlaceRecibo(n.recibos.hash_verificacion) : `${location.origin}${location.pathname}#/recibo/${n.recibo_id || ''}`,
  });

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Reportes</h1><p class="muted">Cómo va la cobranza, quién debe y en qué se gasta el dinero.</p></div>
    <div class="dos-col">
      <section class="tarjeta"><h2>Deuda por antigüedad</h2>${barras(tramos.map(([e, v, cl]) => [e, v, usd(v), cl]), maxT)}
        <p class="muted">${m.unidades_morosas || 0} apartamentos con deuda vencida.</p></section>
      <section class="tarjeta"><h2>Facturado y cobrado por mes</h2>
        ${rec.length ? `<div class="barras">${rec.map((r) => `
          <div class="barra-fila"><span class="barra-etq">${periodoTxt(r)}</span>
            <span class="barra-h doble"><span class="fondo" style="width:${(100 * r.facturado_usd) / maxR}%"></span><span style="width:${(100 * r.cobrado_usd) / maxR}%"></span></span>
            <span class="barra-valor">${pct(r.pct_cobrado)}</span></div>`).join('')}</div>
          <p class="muted"><span class="punto primario"></span> Cobrado <span class="punto claro"></span> Facturado</p>` : vacio('Aún no hay recibos emitidos.')}
      </section>
    </div>
    <div class="dos-col">
      <section class="tarjeta scroll-x"><h2>Quién debe</h2>
        ${cuentas.length ? `<table class="tabla"><thead><tr><th>Apto</th><th>Propietario</th><th class="num">Vencido</th><th class="num">Días</th></tr></thead><tbody>
          ${cuentas.map((u) => `<tr><td><b>${esc(u.codigo)}</b></td><td>${esc(quien[u.unidad_id]?.nombre || '')}
            ${ctx.rol === 'admin' ? `<div><a class="btn linea chico accion-wa" target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(quien[u.unidad_id]?.telefono,
              `Hola${quien[u.unidad_id]?.nombre ? ' ' + quien[u.unidad_id].nombre.split(' ')[0] : ''}, te escribimos de la administración de ${ctx.condo.nombre}. El apto ${u.codigo} tiene ${usd(u.vencido_usd)} vencidos${tasa ? ` (${bs(u.vencido_usd * tasa)} a la tasa BCV de hoy)` : ''}. Puedes ver tu recibo y reportar tu pago aquí: ${hashDe[u.unidad_id] ? enlaceRecibo(hashDe[u.unidad_id]) : ''}`))}">${icono.chat} WhatsApp</a></div>` : ''}</td>
            <td class="num">${usd(u.vencido_usd)}<div class="muted">${bs(tasa ? u.vencido_usd * tasa : 0)}</div></td><td class="num">${u.dias_mora}</td></tr>`).join('')}
        </tbody></table>` : vacio('Nadie tiene deuda vencida.')}
      </section>
      <section class="tarjeta"><h2>Gastos de ${ultimo ? periodoTxt(ultimo) : 'último mes'}</h2>
        ${cat.length ? barras(cat.map((x) => [x.categoria, Number(x.total_usd), usd(x.total_usd), 'primario']), maxC) : vacio('Sin gastos emitidos todavía.')}
      </section>
    </div>
    ${ctx.rol === 'admin' ? `
    <section class="tarjeta">
      <h2>Avisos a los propietarios</h2>
      <p class="muted">Lo que el sistema prepara cada día, cada uno con el enlace directo al recibo. Los de WhatsApp los envías tú con su botón: se abre tu WhatsApp con el mensaje escrito y solo tocas Enviar.</p>
      ${porTipo.length ? `<div class="resumen-chips">${porTipo.map(([t, n]) => `<span class="chip ${['aviso_ejecutivo', 'cobro_preventivo'].includes(t) ? 'error' : t === 'recordatorio' ? 'alerta' : ''}">${NOMBRE_AVISO[t]}: ${n}</span>`).join('')}</div>` : ''}
      ${avisos.length ? `<ul class="avisos">${avisos.slice(0, 30).map((n) => `
        <li><details><summary>
          <span class="aviso-canal">${n.canal === 'whatsapp' ? 'WhatsApp' : 'Correo'}</span>
          <span><b>${esc(NOMBRE_AVISO[n.tipo] || n.tipo)}</b> · ${esc(n.personas?.nombre || n.destino)}${n.recibos?.unidades ? ' · apto ' + esc(n.recibos.unidades.codigo) : ''}
            <div class="muted">${fecha(n.created_at.slice(0, 10))} · ${esc(n.destino)}</div></span>
          ${chip('aviso', n.estado)}</summary>
          <div class="mensaje ${n.canal}">${esc((TEXTO_AVISO[n.tipo] || (() => n.cuerpo || n.asunto || ''))(n, datosAviso(n)))}</div>
          ${n.canal === 'whatsapp' ? `<a class="btn chico accion-wa" target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(n.destino, (TEXTO_AVISO[n.tipo] || (() => n.cuerpo || n.asunto || ''))(n, datosAviso(n))))}">${icono.chat} Enviar por WhatsApp</a>` : ''}
        </details></li>`).join('')}</ul>` : vacio('Todavía no hay avisos.')}
    </section>` : ''}`;
}
