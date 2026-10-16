// Pantallas del propietario / inquilino: cuánto debe, sus recibos y reportar pagos.
import {
  sb, esc, usd, bs, num2, fecha, periodoTxt, hoyVE, diasEntre, chip, estadoRecibo, METODOS,
  vacio, errorHtml, q, toast, nombreArchivo, tasaHoy, tasaUsd, tarjetaTasaHtml, conversorHtml, activarConversor,
} from '../util.js';

// Solo las unidades de esta persona (aunque también sea de la junta y vea todo el edificio).
async function misCuentas(ctx) {
  if (ctx.demo) return [];
  const mias = await q(sb.from('unidad_personas').select('unidad_id, personas!inner(usuario_id, condominio_id)')
    .eq('personas.usuario_id', ctx.usuario.id).eq('personas.condominio_id', ctx.condo.id).or(`hasta.is.null,hasta.gte.${hoyVE()}`));
  if (!mias.length) return [];
  return q(sb.from('v_estado_cuenta').select('*').in('unidad_id', mias.map((m) => m.unidad_id)).order('codigo'));
}
const nombrePersona = (ctx) => ctx.personas?.find((p) => p.condominio_id === ctx.condo.id)?.nombre?.split(' ')[0] || '';

export async function inicio(ctx, el) {
  const [unidades, t] = await Promise.all([misCuentas(ctx), tasaHoy()]);
  const ids = unidades.map((u) => u.unidad_id);
  const [pendientes, enRevision] = ctx.demo || !ids.length ? [[], []] : await Promise.all([
    q(sb.from('recibos').select('id, numero, saldo_usd, total_usd, estado, fecha_vencimiento, unidades(codigo), periodos(anio, mes)').in('unidad_id', ids).in('estado', ['emitido', 'parcial']).order('fecha_vencimiento')),
    q(sb.from('pagos').select('id, monto, moneda, fecha_pago, metodo').in('unidad_id', ids).eq('estado', 'pendiente')),
  ]);
  const deuda = unidades.reduce((a, u) => a + Number(u.deuda_usd), 0);
  const tasa = t?.usd?.tasa;
  const favor = unidades.reduce((a, u) => a + Number(u.saldo_favor_usd), 0);
  const hoy = hoyVE();

  el.innerHTML = `
    <div class="titulo-pagina"><h1>${nombrePersona(ctx) ? 'Hola, ' + esc(nombrePersona(ctx)) : 'Mi cuenta'}</h1>
      <p class="muted">${unidades.map((u) => 'Apto ' + esc(u.codigo)).join(' · ')} · ${esc(ctx.condo.nombre)}</p></div>
    <section class="tarjeta saldo ${deuda > 0 ? '' : 'al-dia'}">
      <div class="muted">${deuda > 0 ? 'Tienes por pagar' : 'Estás al día'}</div>
      <div class="saldo-grande">${usd(deuda)}</div>
      ${deuda > 0 && tasa ? `<div class="saldo-bs">${bs(deuda * tasa)} <span class="muted">a la tasa BCV de hoy</span></div>` : ''}
      ${favor > 0 ? `<div class="chip ok">Tienes ${usd(favor)} a favor</div>` : ''}
      ${deuda > 0 ? '<a class="btn oro bloque" href="#/pagar" style="margin-top:16px">Reportar un pago</a>' : ''}
    </section>
    ${enRevision.length ? `<div class="aviso">${enRevision.map((p) => `Tu pago de ${p.moneda === 'VES' ? bs(p.monto) : usd(p.monto)} del ${fecha(p.fecha_pago)} está en revisión.`).join('<br>')} Te avisaremos cuando la administración lo confirme.</div>` : ''}
    ${pendientes.length ? `
    <section class="tarjeta">
      <h2>Recibos por pagar</h2>
      <ul class="lista-recibos">${pendientes.map((r) => {
        const d = diasEntre(hoy, r.fecha_vencimiento);
        return `<li><a href="#/recibo/${r.id}">
          <div><b>${periodoTxt(r.periodos)}</b> · apto ${esc(r.unidades?.codigo)}
            <div class="muted">${d > 1 ? `Vence en ${d} días (${fecha(r.fecha_vencimiento)})` : d === 1 ? 'Vence mañana' : d === 0 ? 'Vence hoy' : d === -1 ? 'Venció ayer' : `Venció hace ${-d} días`}</div></div>
          <div class="num"><b>${usd(r.saldo_usd)}</b>${tasa ? `<div class="muted">${bs(r.saldo_usd * tasa)}</div>` : ''}</div>
          ${chip('recibo', estadoRecibo(r))}</a></li>`; }).join('')}</ul>
    </section>` : ''}
    ${!ctx.demo && !unidades.length ? `<div class="tarjeta">${vacio('No hay inmuebles asociados a tu cuenta.')}</div>` : ''}
    <div class="dos-col">${tarjetaTasaHtml(t)}${conversorHtml(t)}</div>`;
  activarConversor(el);
}

export async function pagar(ctx, el) {
  const [unidades, t] = await Promise.all([misCuentas(ctx), tasaHoy()]);
  const cuentas = ctx.demo ? [] : await q(sb.from('cuentas_bancarias').select('id, banco, tipo, numero, titular, rif_titular, telefono_pago_movil, email_zelle, moneda').eq('condominio_id', ctx.condo.id).eq('activa', true));
  const tasa = t?.usd?.tasa;
  const datoCuenta = (c) => c.tipo === 'pago_movil' ? `Pago móvil · ${esc(c.banco)} · ${esc(c.telefono_pago_movil)} · ${esc(c.rif_titular || '')}`
    : c.tipo === 'zelle' ? `Zelle · ${esc(c.email_zelle)}`
    : `${esc(c.banco)} · cuenta ${esc(c.tipo)} ${esc(c.numero || '')} · ${esc(c.titular)} · ${esc(c.rif_titular || '')}`;

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Reportar un pago</h1><p class="muted">Paga por tu banco y luego cuéntanos aquí los datos del pago.</p></div>
    ${cuentas.length ? `<section class="tarjeta"><h2>Dónde pagar</h2><ul class="datos-pago">${cuentas.map((c) => `<li>${datoCuenta(c)}</li>`).join('')}</ul></section>` : ''}
    <form id="f" class="tarjeta">
      <label for="unidad">Inmueble</label>
      <select id="unidad" required>${unidades.map((u) => `<option value="${u.unidad_id}" data-deuda="${u.deuda_usd}">Apto ${esc(u.codigo)} · debe ${usd(u.deuda_usd)}</option>`).join('')}</select>
      <div class="muted" id="deudaBs"></div>
      <label for="metodo">Forma de pago</label>
      <select id="metodo">${Object.entries(METODOS).filter(([k]) => k !== 'otro').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <label for="cuenta">Cuenta a la que pagaste</label>
      <select id="cuenta"><option value="">No sé / otra</option>${cuentas.map((c) => `<option value="${c.id}" data-tipo="${c.tipo}">${c.tipo === 'pago_movil' ? 'Pago móvil' : c.tipo === 'zelle' ? 'Zelle' : esc(c.banco) + ' ' + esc(c.tipo)}</option>`).join('')}</select>
      <div class="fila">
        <div><label for="moneda">Moneda</label><select id="moneda"><option value="VES">Bolívares</option><option value="USD">Dólares</option></select></div>
        <div><label for="monto">Monto</label><input id="monto" type="number" inputmode="decimal" step="0.01" min="0.01" required><div class="muted" id="equiv"></div></div>
      </div>
      <div class="fila">
        <div><label for="ref">Número de referencia</label><input id="ref" minlength="4" required></div>
        <div><label for="fechaPago">Fecha del pago</label><input id="fechaPago" type="date" required value="${hoyVE()}" max="${hoyVE()}"></div>
      </div>
      <label for="banco">Banco desde donde pagaste</label><input id="banco" placeholder="Ej.: Banesco, Mercantil, Venezuela">
      <label for="captura">Captura del pago</label>
      <input id="captura" type="file" accept="image/*,application/pdf">
      <div id="msg"></div>
      <button class="btn bloque" style="margin-top:16px" ${ctx.demo || !unidades.length ? 'disabled' : ''}>Enviar reporte</button>
      <p class="muted">Tu deuda no se descuenta hasta que la administración confirme el pago con el banco. Te avisaremos por correo.</p>
    </form>`;

  const f = el.querySelector('#f');
  const sel = (id) => f.querySelector('#' + id);
  const pintarEquiv = () => {
    const deuda = Number(sel('unidad').selectedOptions[0]?.dataset.deuda || 0);
    sel('deudaBs').textContent = deuda && tasa ? `Tu deuda hoy: ${usd(deuda)} = ${bs(deuda * tasa)} a la tasa BCV` : '';
    const n = Number(sel('monto').value);
    sel('equiv').textContent = n && tasa ? (sel('moneda').value === 'VES' ? `≈ ${usd(n / tasa)}` : `≈ ${bs(n * tasa)}`) : '';
  };
  const ajustarMetodo = () => {
    const m = sel('metodo').value;
    sel('moneda').value = ['zelle', 'efectivo_usd'].includes(m) ? 'USD' : 'VES';
    const tipo = m === 'zelle' ? 'zelle' : m === 'pago_movil' ? 'pago_movil' : 'corriente';
    const op = [...sel('cuenta').options].find((o) => o.dataset.tipo === tipo);
    sel('cuenta').value = op ? op.value : '';
    const deuda = Number(sel('unidad').selectedOptions[0]?.dataset.deuda || 0);
    if (deuda && tasa) sel('monto').value = sel('moneda').value === 'VES' ? (Math.round(deuda * tasa * 100) / 100) : deuda;
    pintarEquiv();
  };
  ['monto', 'moneda'].forEach((id) => sel(id).addEventListener('input', pintarEquiv));
  sel('unidad')?.addEventListener('change', ajustarMetodo);
  sel('metodo').addEventListener('change', ajustarMetodo);
  ajustarMetodo();

  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const unidad = sel('unidad').value;
      let comprobante = null;
      const archivo = sel('captura').files[0];
      if (archivo) {
        const ruta = `${ctx.condo.id}/${unidad}/${nombreArchivo(archivo)}`;
        const up = await sb.storage.from('comprobantes').upload(ruta, archivo);
        if (up.error) throw up.error;
        comprobante = ruta;
      }
      const { error } = await sb.from('pagos').insert({
        condominio_id: ctx.condo.id, unidad_id: unidad, reportado_por: ctx.usuario.id,
        cuenta_destino_id: sel('cuenta').value || null, metodo: sel('metodo').value,
        banco_origen: sel('banco').value.trim() || null, referencia: sel('ref').value.trim(),
        fecha_pago: sel('fechaPago').value, moneda: sel('moneda').value, monto: Number(sel('monto').value),
        monto_usd: 1, // lo calcula la base con la tasa BCV de la fecha del pago
        comprobante_url: comprobante,
      });
      if (error) throw error.code === '23505' ? new Error('Esa referencia ya fue reportada') : error;
      toast('Pago reportado. La administración lo revisará y te avisará.', 'ok');
      location.hash = '#/inicio';
    } catch (err) {
      sel('msg').innerHTML = errorHtml(err);
      btn.disabled = false;
    }
  };
}

export async function recibos(ctx, el) {
  const unidades = await misCuentas(ctx);
  const ids = unidades.map((u) => u.unidad_id);
  const [lista, pagosL] = ctx.demo || !ids.length ? [[], []] : await Promise.all([
    q(sb.from('recibos').select('id, numero, total_usd, saldo_usd, estado, fecha_vencimiento, unidades(codigo), periodos(anio, mes)').in('unidad_id', ids).order('fecha_emision', { ascending: false }).limit(36)),
    q(sb.from('pagos').select('id, fecha_pago, referencia, metodo, moneda, monto, monto_usd, estado, motivo_rechazo').in('unidad_id', ids).order('fecha_pago', { ascending: false }).limit(20)),
  ]);
  el.innerHTML = `
    <div class="titulo-pagina"><h1>Mis recibos</h1><p class="muted">Toca un recibo para verlo completo, con su código QR de autenticidad.</p></div>
    <section class="tarjeta">
      ${lista.length ? `<ul class="lista-recibos">${lista.map((r) => `<li><a href="#/recibo/${r.id}">
        <div><b>${periodoTxt(r.periodos)}</b> · apto ${esc(r.unidades?.codigo)}<div class="muted">Recibo Nº ${String(r.numero).padStart(6, '0')} · total ${usd(r.total_usd)}</div></div>
        <div class="num"><b>${usd(r.saldo_usd)}</b><div class="muted">por pagar</div></div>
        ${chip('recibo', estadoRecibo(r))}</a></li>`).join('')}</ul>` : vacio('Aún no tienes recibos.')}
    </section>
    <section class="tarjeta scroll-x">
      <h2>Mis pagos</h2>
      ${pagosL.length ? `<table class="tabla"><tbody>${pagosL.map((p) => `<tr><td>${fecha(p.fecha_pago)}<div class="muted">${esc(METODOS[p.metodo] || p.metodo)} · ref. ${esc(p.referencia)}</div></td>
        <td class="num">${p.moneda === 'VES' ? bs(p.monto) : usd(p.monto)}<div class="muted">${usd(p.monto_usd)}</div></td>
        <td>${chip('pago', p.estado)}${p.motivo_rechazo ? `<div class="muted">${esc(p.motivo_rechazo)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : vacio('Sin pagos reportados.')}
    </section>`;
}
