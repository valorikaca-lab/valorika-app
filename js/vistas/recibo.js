// Recibo de condominio (título ejecutivo, Art. 14 LPH): dentro de la app, por
// enlace sin cuenta (lo que le llega al propietario por correo) y verificación
// pública por QR.
import {
  sb, esc, usd, bs, num2, fecha, periodoTxt, chip, estadoRecibo, METODOS, vacio, errorHtml, q, qrSvg,
  tasaHoy, tiraTasaHtml, toast, hoyVE, icono, urlPdfRecibo, enlaceWhatsApp,
} from '../util.js';

const GRUPOS = [
  ['gasto_comun', 'Gastos comunes (según alícuota)'],
  ['gasto_no_comun', 'Gastos propios de este apartamento'],
  ['fondo_reserva', 'Fondo de reserva'],
  ['mora', 'Intereses de mora'],
  ['ajuste', 'Ajustes'],
];
const baseUrl = () => `${location.origin}${location.pathname}`;
export const enlaceRecibo = (hash) => `${baseUrl()}#/r/${hash}`;

// d: { numero, estado, alicuota_pct, fecha_emision, fecha_vencimiento, tasa_emision, total_usd,
//      total_ves_emision, saldo_usd, texto_legal, hash, condominio{}, unidad, periodo{},
//      propietario, cedula, lineas[], abonos[] }
export function htmlRecibo(d, tasa, { preliminar = false } = {}) {
  const aplicado = (d.abonos || []).reduce((a, x) => a + Number(x.monto_usd), 0);
  // Lo que se descontó sin un pago propio (saldo a favor aplicado al emitir).
  const favor = d.estado === 'anulado' ? 0 : Number(d.total_usd) - Number(d.saldo_usd) - aplicado;
  const verificar = `${baseUrl()}#/verificar/${d.hash}`;
  const c = d.condominio || {};
  return `
    <article class="tarjeta recibo-doc ${preliminar ? 'preliminar' : ''}">
      ${preliminar ? '<div class="banda-preliminar">Recibo preliminar · todavía no está emitido · puede cambiar si se aprueban más gastos</div>' : ''}
      <header class="recibo-cab">
        <div><div class="recibo-condo">${esc(c.nombre)}</div>
          <div class="muted">RIF ${esc(c.rif)} · ${esc(c.direccion || '')}${c.ciudad ? ', ' + esc(c.ciudad) : ''}</div></div>
        <div class="recibo-num"><span class="etiqueta-seccion">Recibo de condominio</span><b>${preliminar ? 'Nº por asignar' : 'Nº ' + String(d.numero).padStart(6, '0')}</b>${chip('recibo', preliminar ? 'preliminar' : estadoRecibo(d))}</div>
      </header>
      <div class="recibo-datos">
        <div><span>Apartamento</span><b>${esc(d.unidad)}</b></div>
        <div><span>Propietario</span><b>${esc(d.propietario || '—')}</b></div>
        ${d.cedula !== undefined ? `<div><span>Cédula</span><b>${esc(d.cedula || '—')}</b></div>` : ''}
        <div><span>Alícuota</span><b>${Number(d.alicuota_pct).toFixed(6)} %</b></div>
        <div><span>Periodo</span><b>${periodoTxt(d.periodo)}</b></div>
        <div><span>Emisión</span><b>${fecha(d.fecha_emision)}</b></div>
        <div><span>Vence</span><b>${fecha(d.fecha_vencimiento)}</b></div>
        <div><span>Tasa BCV de emisión</span><b>${num2(d.tasa_emision)}</b></div>
      </div>
      <table class="tabla recibo-lineas">
        <thead><tr><th>Concepto</th><th class="num">USD</th></tr></thead>
        ${GRUPOS.map(([tipo, titulo]) => {
          const ls = (d.lineas || []).filter((l) => l.tipo === tipo);
          if (!ls.length) return '';
          return `<tbody><tr class="grupo"><td colspan="2">${titulo}</td></tr>
            ${ls.map((l) => `<tr><td>${esc(l.concepto)}</td><td class="num">${num2(l.monto_usd)}</td></tr>`).join('')}</tbody>`;
        }).join('')}
        <tfoot>
          <tr class="total"><td>Total del recibo</td><td class="num">${usd(d.total_usd)}</td></tr>
          <tr><td>Equivalente en bolívares a la tasa BCV del ${fecha(d.fecha_emision)}</td><td class="num">${bs(d.total_ves_emision)}</td></tr>
          ${(d.abonos || []).map((a) => `<tr class="abono"><td>Abono ${esc(METODOS[a.metodo] || '')} del ${fecha(a.fecha)} · ref. ${esc(a.referencia)}</td><td class="num">− ${num2(a.monto_usd)}</td></tr>`).join('')}
          ${favor > 0.004 ? `<tr class="abono"><td>Saldo a favor de pagos anteriores</td><td class="num">− ${num2(favor)}</td></tr>` : ''}
          <tr class="total saldo"><td>Saldo pendiente${tasa && Number(d.saldo_usd) > 0 ? ` <span class="muted">(${bs(d.saldo_usd * tasa)} a la tasa BCV de hoy)</span>` : ''}</td><td class="num">${usd(d.saldo_usd)}</td></tr>
        </tfoot>
      </table>
      <footer class="recibo-pie ${preliminar ? 'sin-qr' : ''}">
        ${preliminar ? '' : `<div class="qr" aria-label="Código QR de verificación">${qrSvg(verificar)}</div>`}
        <div>
          <p class="recibo-legal">${esc(d.texto_legal)}</p>
          ${preliminar ? '<p class="muted">El código QR de autenticidad se genera al emitir el recibo.</p>'
            : `<p class="muted">Verifique la autenticidad de este recibo escaneando el código QR o en:<br><span class="codigo">${esc(verificar)}</span></p>`}
        </div>
      </footer>
    </article>`;
}

// Recibo preliminar de una unidad (fila de prever_recibos) con los datos del condominio.
export function htmlPreliminar(fila, condo, periodo, previo) {
  const total = Number(fila.total_usd);
  const emision = previo.fecha;
  const vence = new Date(new Date(emision + 'T12:00:00').getTime() + Number(condo.dias_para_vencer || 15) * 86400_000).toISOString().slice(0, 10);
  return htmlRecibo({
    numero: null, estado: 'emitido', alicuota_pct: fila.alicuota_pct, fecha_emision: emision, fecha_vencimiento: vence,
    tasa_emision: previo.tasa, total_usd: total, total_ves_emision: Math.round(total * (previo.tasa || 0) * 100) / 100,
    saldo_usd: total, texto_legal: condo.texto_legal_recibo, hash: '', condominio: condo, unidad: fila.codigo,
    periodo, propietario: fila.propietario, lineas: fila.lineas, abonos: [],
  }, null, { preliminar: true });
}

// "¿Por qué cambió este recibo?": comparación con el recibo anterior del apartamento.
export function htmlVariacion(v) {
  if (!v?.hay_anterior) return '';
  const dif = Number(v.dif_usd);
  const per = periodoTxt(v.anterior.periodo);
  const titulo = dif > 0.004 ? `Subió ${usd(dif)} frente a ${per}` : dif < -0.004 ? `Bajó ${usd(-dif)} frente a ${per}` : `En dólares es igual al de ${per}`;
  const signo = (n) => (Number(n) > 0 ? `+ ${usd(n)}` : `− ${usd(-Number(n))}`);
  return `
    <section class="tarjeta no-imprimir variacion">
      <h2>¿Por qué cambió este recibo?</h2>
      <p><b>${titulo}</b> <span class="muted">(${usd(v.anterior.total_usd)} → ${usd(v.actual.total_usd)}${v.dif_pct !== null && Math.abs(dif) > 0.004 ? `, ${v.dif_pct > 0 ? '+' : ''}${num2(v.dif_pct)} %` : ''})</span></p>
      ${v.factores.length ? `<ul class="filas-balance">${v.factores.slice(0, 8).map((f) => `
        <li><div>${esc(f.factor)}<div class="muted">${usd(f.antes)} → ${usd(f.ahora)}</div></div><div class="num"><b>${signo(f.dif)}</b></div></li>`).join('')}</ul>` : ''}
      <p class="muted">En bolívares pasó de ${bs(v.anterior.total_ves)} a ${bs(v.actual.total_ves)}: ${signo(v.dif_ves_tasa).replace('USD', 'Bs')} por la tasa BCV
        (${num2(v.anterior.tasa)} → ${num2(v.actual.tasa)}) y ${signo(v.dif_ves_gastos).replace('USD', 'Bs')} por los gastos.</p>
    </section>`;
}

// ---------------------------------------------------------------- Dentro de la app
export async function detalle(ctx, el, id) {
  const [r] = await q(sb.from('recibos')
    .select('id, condominio_id, numero, alicuota_pct, fecha_emision, fecha_vencimiento, tasa_emision, total_usd, total_ves_emision, saldo_usd, estado, texto_legal, hash_verificacion, unidad_id, unidades(codigo), periodos(anio, mes), recibo_lineas(tipo, concepto, monto_usd, orden), pago_aplicaciones(monto_usd, pagos(fecha_pago, metodo, referencia))')
    .eq('id', id).limit(1));
  if (!r) { el.innerHTML = `<div class="tarjeta">${vacio('No encontramos este recibo o no tienes acceso a él.')}</div>`; return; }
  const [[condo], gente, t, variacion] = await Promise.all([
    q(sb.from('condominios').select('nombre, rif, direccion, ciudad').eq('id', r.condominio_id)),
    q(sb.from('unidad_personas').select('personas(nombre, cedula_rif, telefono)').eq('unidad_id', r.unidad_id).eq('responsable_pago', true)),
    tasaHoy(),
    sb.rpc('variacion_recibo', { p_recibo: r.id }).then((x) => x.data, () => null),
  ]);
  const titular = gente.map((g) => g.personas).filter(Boolean);
  const d = {
    ...r, hash: r.hash_verificacion, condominio: condo, unidad: r.unidades?.codigo, periodo: r.periodos,
    propietario: titular.map((p) => p.nombre).join(', '),
    cedula: titular.map((p) => p.cedula_rif).filter(Boolean).join(', '),
    lineas: [...(r.recibo_lineas || [])].sort((a, b) => a.orden - b.orden || a.concepto.localeCompare(b.concepto)),
    abonos: (r.pago_aplicaciones || []).map((a) => ({ monto_usd: a.monto_usd, fecha: a.pagos?.fecha_pago, metodo: a.pagos?.metodo, referencia: a.pagos?.referencia })),
  };
  const enlace = enlaceRecibo(r.hash_verificacion);
  const contacto = titular.find((p) => p.telefono) || titular[0];
  const hola = `Hola${contacto?.nombre ? ' ' + contacto.nombre.split(' ')[0] : ''}`;
  const saldo = Number(r.saldo_usd);
  const enBs = t?.usd?.tasa && saldo > 0 ? ` (${bs(saldo * t.usd.tasa)} a la tasa BCV de hoy)` : '';
  const queRecibo = `tu recibo de condominio de ${periodoTxt(r.periodos)} (apto ${r.unidades?.codigo})`;
  const mensajeWa = saldo <= 0.004 ? `${hola}, ${queRecibo} está pagado. Gracias. Puedes verlo aquí: ${enlace}`
    : estadoRecibo(r) === 'vencido' ? `${hola}, ${queRecibo} venció el ${fecha(r.fecha_vencimiento)} y tiene ${usd(saldo)} por pagar${enBs}. Míralo y reporta tu pago aquí: ${enlace}`
    : `${hola}, ya está ${queRecibo}: ${usd(saldo)}${enBs}. Vence el ${fecha(r.fecha_vencimiento)}. Míralo y reporta tu pago aquí: ${enlace}`;

  el.innerHTML = `
    <div class="acciones no-imprimir" style="margin-bottom:12px">
      <a class="btn linea chico" href="#/recibos">Volver</a>
      <a class="btn linea chico" href="${urlPdfRecibo(r.hash_verificacion)}">${icono.recibos} Descargar PDF</a>
      <button class="btn linea chico" id="btnImprimir" type="button">${icono.imprimir} Imprimir</button>
      ${ctx.rol === 'admin' ? `<a class="btn chico" href="${esc(enlaceWhatsApp(contacto?.telefono, mensajeWa))}" target="_blank" rel="noopener">${icono.chat} Enviar por WhatsApp</a>
      <button class="btn linea chico" id="btnEnlace" type="button">${icono.correo} Copiar enlace para el propietario</button>` : ''}
      ${ctx.rol === 'residente' && Number(r.saldo_usd) > 0 ? '<a class="btn chico" href="#/pagar">Reportar un pago</a>' : ''}
    </div>
    ${htmlRecibo(d, t?.usd?.tasa)}
    ${htmlVariacion(variacion)}`;
  el.querySelector('#btnImprimir').onclick = () => window.print();
  el.querySelector('#btnEnlace')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(enlace); toast('Enlace copiado: el propietario abre su recibo y reporta el pago sin crear cuenta', 'ok'); }
    catch { prompt('Copia el enlace del recibo:', enlace); }
  });
}

// ---------------------------------------------------------------- Por enlace (sin cuenta)
export async function publico(app, token) {
  app.innerHTML = '<div class="cargando"><div class="skeleton bloque"></div><div class="skeleton linea"></div></div>';
  const [res, t, vari] = await Promise.all([sb ? sb.rpc('recibo_por_enlace', { p_token: token }) : { data: null }, tasaHoy(),
    sb ? sb.rpc('variacion_recibo_enlace', { p_token: token }).then((x) => x.data, () => null) : null]);
  const d = res.data;
  const tasa = t?.usd?.tasa;
  const marca = `<header class="barra"><div class="marca">${icono.logo}<div>VALÓRIKA<small>GESTIÓN INTELIGENTE</small></div></div></header>`;
  if (!d) {
    app.innerHTML = `${marca}<main><div class="tarjeta">${vacio('Este enlace no es válido o el recibo fue anulado. Pide a tu administradora un enlace nuevo.')}</div></main>`;
    return;
  }
  const deudaTotal = Number(d.deuda_unidad_usd);
  const saldo = Number(d.saldo_usd);
  const montoSugerido = deudaTotal > 0 ? deudaTotal : saldo;
  const datoCuenta = (c) => c.tipo === 'pago_movil' ? `<b>Pago móvil</b> · ${esc(c.banco)} · ${esc(c.telefono_pago_movil)} · ${esc(c.rif_titular || '')}`
    : c.tipo === 'zelle' ? `<b>Zelle</b> · ${esc(c.email_zelle)}`
    : `<b>${esc(c.banco)}</b> · cuenta ${esc(c.tipo)} ${esc(c.numero || '')} · ${esc(c.titular)} · ${esc(c.rif_titular || '')}`;

  app.innerHTML = `
    ${marca}
    <div id="tiraTasa" class="tira-tasa">${tiraTasaHtml(t)}</div>
    <main class="publico">
      <div class="titulo-pagina no-imprimir"><h1>Hola${d.propietario ? ', ' + esc(d.propietario.split(' ')[0]) : ''}</h1>
        <p class="muted">Tu recibo de condominio de ${periodoTxt(d.periodo)} · apto ${esc(d.unidad)} · ${esc(d.condominio?.nombre)}</p></div>
      ${d.pagos_en_revision ? `<div class="aviso no-imprimir">Tienes ${d.pagos_en_revision} pago${d.pagos_en_revision > 1 ? 's' : ''} en revisión. Te avisaremos por correo cuando la administración lo confirme.</div>` : ''}
      <section class="tarjeta saldo no-imprimir ${saldo > 0 ? '' : 'al-dia'}">
        <div class="muted">${saldo > 0 ? 'Por pagar de este recibo' : 'Este recibo está pagado'}</div>
        <div class="saldo-grande">${usd(saldo)}</div>
        ${saldo > 0 && tasa ? `<div class="saldo-bs">${bs(saldo * tasa)} <span class="muted">a la tasa BCV de hoy</span></div>` : ''}
        ${deudaTotal > saldo + 0.004 ? `<div class="muted" style="margin-top:6px">Deuda total del apartamento: <b>${usd(deudaTotal)}</b>${tasa ? ` (${bs(deudaTotal * tasa)})` : ''}</div>` : ''}
        <div class="acciones" style="justify-content:center">
          ${deudaTotal > 0 ? '<button class="btn oro" type="button" id="irPagar">Reportar mi pago</button>' : ''}
          <a class="btn linea" href="${urlPdfRecibo(d.hash)}">${icono.recibos} Descargar PDF</a>
          <button class="btn linea" type="button" id="btnImprimir">${icono.imprimir} Imprimir</button>
        </div>
      </section>
      ${htmlRecibo(d, tasa)}
      ${htmlVariacion(vari)}
      ${deudaTotal > 0 ? `
      <section class="tarjeta no-imprimir"><h2>Dónde pagar</h2>
        <ul class="datos-pago">${(d.cuentas || []).map((c) => `<li>${datoCuenta(c)}</li>`).join('') || '<li>Pide los datos a tu administradora.</li>'}</ul></section>
      <form id="fPago" class="tarjeta no-imprimir" name="pagar">
        <h2 id="pagar">Reportar mi pago</h2>
        <p class="muted">Paga por tu banco y luego cuéntanos aquí los datos. La administración lo confirma con el banco.</p>
        <label for="metodo">Forma de pago</label>
        <select id="metodo">${Object.entries(METODOS).filter(([k]) => k !== 'otro').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <div class="fila">
          <div><label for="moneda">Moneda</label><select id="moneda"><option value="VES">Bolívares</option><option value="USD">Dólares</option></select></div>
          <div><label for="monto">Monto</label><input id="monto" type="number" inputmode="decimal" step="0.01" min="0.01" required><div class="muted" id="equiv"></div></div>
        </div>
        <div class="fila">
          <div><label for="ref">Número de referencia</label><input id="ref" minlength="4" required></div>
          <div><label for="fechaPago">Fecha del pago</label><input id="fechaPago" type="date" required value="${hoyVE()}" max="${hoyVE()}"></div>
        </div>
        <label for="banco">Banco desde donde pagaste</label><input id="banco" placeholder="Ej.: Banesco, Mercantil, Venezuela">
        <label for="captura">Captura del pago</label><input id="captura" type="file" accept="image/*,application/pdf">
        <div id="msg"></div>
        <button class="btn bloque" style="margin-top:16px">Enviar reporte</button>
      </form>` : ''}
    </main>`;

  app.querySelector('#btnImprimir').onclick = () => window.print();
  app.querySelector('#irPagar')?.addEventListener('click', () => app.querySelector('#fPago').scrollIntoView({ behavior: 'smooth' }));
  const f = app.querySelector('#fPago');
  if (!f) return;
  const sel = (id) => f.querySelector('#' + id);
  const ajustar = () => {
    const m = sel('metodo').value;
    sel('moneda').value = ['zelle', 'efectivo_usd'].includes(m) ? 'USD' : 'VES';
    sel('monto').value = sel('moneda').value === 'VES' && tasa ? Math.round(montoSugerido * tasa * 100) / 100 : montoSugerido;
    equiv();
  };
  const equiv = () => {
    const n = Number(sel('monto').value);
    sel('equiv').textContent = n && tasa ? (sel('moneda').value === 'VES' ? `≈ ${usd(n / tasa)}` : `≈ ${bs(n * tasa)}`) : '';
  };
  sel('metodo').addEventListener('change', ajustar);
  sel('moneda').addEventListener('change', equiv);
  sel('monto').addEventListener('input', equiv);
  ajustar();

  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      let comprobante = null;
      const archivo = sel('captura').files[0];
      if (archivo) {
        const ruta = `${d.ruta_comprobantes}-${Date.now()}-${archivo.name.replace(/[^\w.-]/g, '_')}`;
        const up = await sb.storage.from('comprobantes').upload(ruta, archivo);
        if (up.error) throw up.error;
        comprobante = ruta;
      }
      const { error } = await sb.rpc('reportar_pago_enlace', {
        p_token: token, p_metodo: sel('metodo').value, p_banco_origen: sel('banco').value.trim(),
        p_referencia: sel('ref').value.trim(), p_fecha: sel('fechaPago').value, p_moneda: sel('moneda').value,
        p_monto: Number(sel('monto').value), p_comprobante: comprobante,
      });
      if (error) throw error;
      f.innerHTML = `<div class="verif-ok">${icono.ok}<b>Pago reportado</b></div>
        <p>Gracias. La administración lo comparará con el banco y te avisará por correo cuando lo confirme. Tu deuda se descuenta al confirmarlo.</p>`;
      f.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      sel('msg').innerHTML = errorHtml(err);
      btn.disabled = false;
    }
  };
}

// ---------------------------------------------------------------- Verificación pública (QR)
export async function verificar(app, hash) {
  app.innerHTML = '<div class="cargando"><div class="skeleton bloque"></div></div>';
  let datos = null;
  if (sb) {
    const { data } = await sb.rpc('verificar_recibo', { p_hash: hash });
    datos = data?.[0] || null;
  }
  app.innerHTML = `
    <div class="acceso"><div class="tarjeta verificacion">
      <div class="logo">${icono.logo}<b>VALÓRIKA</b><small>VERIFICACIÓN DE RECIBOS</small></div>
      ${!sb ? '<div class="aviso">La verificación en línea estará disponible cuando la app esté conectada.</div>'
      : datos ? `
        <div class="verif-ok">${icono.ok}<b>Recibo auténtico</b></div>
        <div class="recibo-datos">
          <div><span>Condominio</span><b>${esc(datos.condominio)}</b></div>
          <div><span>RIF</span><b>${esc(datos.rif)}</b></div>
          <div><span>Recibo</span><b>Nº ${String(datos.numero).padStart(6, '0')}</b></div>
          <div><span>Apartamento</span><b>${esc(datos.unidad)}</b></div>
          <div><span>Periodo</span><b>${esc(datos.periodo)}</b></div>
          <div><span>Emisión</span><b>${fecha(datos.fecha_emision)}</b></div>
          <div><span>Total</span><b>${usd(datos.total_usd)}</b></div>
          <div><span>Estado</span><b>${chip('recibo', datos.estado)}</b></div>
        </div>
        <p class="muted">Este recibo fue emitido por el sistema Valórika y no ha sido alterado.</p>`
      : `<div class="verif-mal">${icono.alerta}<b>No encontramos un recibo con este código</b></div>
         <p class="muted">Puede que el código esté incompleto o que el documento no sea auténtico.</p>`}
      <a class="btn linea bloque" href="#/">Ir a Valórika</a>
    </div></div>`;
}
