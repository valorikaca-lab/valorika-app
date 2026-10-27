// Gastos del mes (administración): facturas con su soporte, aprobación de la junta,
// cuotas extraordinarias y pagos a los proveedores (pendiente / abonado / pagado).
import {
  sb, esc, usd, bs, num2, fecha, periodoTxt, hoyVE, chip, vacio, errorHtml, q, toast,
  nombreArchivo, urlFirmada, tasaUsd,
} from '../util.js';

let periodoGastos = null;
const ESTADO_PAGO = { pendiente: ['Pago pendiente', 'error'], parcial: ['Abonado', 'alerta'], pagado: ['Pagado al proveedor', 'ok'] };
const chipPago = (e) => `<span class="chip ${ESTADO_PAGO[e]?.[1] || ''}">${ESTADO_PAGO[e]?.[0] || e}</span>`;
const enMoneda = (moneda, n) => (moneda === 'VES' ? bs(n) : usd(n));

export async function gastos(ctx, el) {
  if (ctx.demo) { el.innerHTML = `<h1>Gastos</h1><div class="tarjeta">${vacio('Vista previa sin datos.')}</div>`; return; }
  const c = ctx.condo.id;
  const [periodos, proveedores, categorias, unidadesL, cuentas, porPagar] = await Promise.all([
    q(sb.from('periodos').select('id, anio, mes, estado').eq('condominio_id', c).order('anio', { ascending: false }).order('mes', { ascending: false })),
    q(sb.from('proveedores').select('id, razon_social, rif, servicio, tipo_contrato').eq('condominio_id', c).eq('activo', true).order('razon_social')),
    q(sb.from('categorias_gasto').select('id, nombre, tipo_defecto').or(`condominio_id.is.null,condominio_id.eq.${c}`).order('orden')),
    q(sb.from('unidades').select('id, codigo').eq('condominio_id', c).eq('activa', true).order('codigo')),
    q(sb.from('cuentas_bancarias').select('id, banco, tipo, numero').eq('condominio_id', c).eq('activa', true)),
    q(sb.from('v_gastos_pago_proveedor').select('gasto_id, moneda, a_pagar, pagado, estado_pago').eq('condominio_id', c).neq('estado_pago', 'pagado')),
  ]);
  const abierto = periodos.find((p) => ['abierto', 'en_revision'].includes(p.estado));
  if (!periodos.some((p) => p.id === periodoGastos)) periodoGastos = (abierto || periodos[0])?.id || null;
  const periodo = periodos.find((p) => p.id === periodoGastos);
  const editable = periodo && ['abierto', 'en_revision'].includes(periodo.estado);

  const lista = periodo ? await q(sb.from('gastos')
    .select('id, descripcion, numero_factura, fecha_factura, moneda, monto, tasa_aplicada, monto_usd, tipo, es_comun, estado, soporte_url, cuotas, cuotas_cobradas, proveedores(razon_social), categorias_gasto(nombre), gasto_unidades(unidades(codigo)), gasto_aprobaciones(decision, comentario, created_at)')
    .eq('periodo_id', periodo.id).order('fecha_factura')) : [];
  const ids = lista.map((g) => g.id);
  const [estados, pagosProv] = ids.length ? await Promise.all([
    q(sb.from('v_gastos_pago_proveedor').select('gasto_id, a_pagar, pagado, estado_pago').in('gasto_id', ids)),
    q(sb.from('gasto_pagos').select('id, gasto_id, fecha, moneda, monto, monto_usd, referencia, comprobante_url').in('gasto_id', ids).order('fecha')),
  ]) : [[], []];
  const estadoDe = Object.fromEntries(estados.map((e) => [e.gasto_id, e]));
  const total = (est) => lista.filter((g) => est.includes(g.estado)).reduce((a, g) => a + Number(g.monto_usd), 0);
  const mesActual = { anio: Number(hoyVE().slice(0, 4)), mes: Number(hoyVE().slice(5, 7)) };

  // Obligaciones con proveedores de todos los meses (gastos aprobados sin pagar del todo)
  const aprobadosPend = porPagar.length ? await q(sb.from('gastos').select('id, descripcion, moneda, monto, estado, periodo_id, periodos(anio, mes), proveedores(razon_social)')
    .in('id', porPagar.map((x) => x.gasto_id)).eq('estado', 'aprobado')) : [];
  const saldoProv = (g) => { const e = porPagar.find((x) => x.gasto_id === g.id); return e ? Number(e.a_pagar) - Number(e.pagado) : 0; };
  const deudaUsd = aprobadosPend.reduce((a, g) => a + (g.moneda === 'VES' ? saldoProv(g) / (tasaUsd() || 1) : saldoProv(g)), 0);

  el.innerHTML = `
    <div class="titulo-pagina con-accion">
      <div><h1>Gastos</h1><p class="muted">Las facturas del mes. La junta las aprueba, con ellas se emiten los recibos y aquí registras cuándo le pagaste a cada proveedor.</p></div>
      ${periodos.length ? `<select id="selPeriodo" aria-label="Periodo">${periodos.map((p) => `<option value="${p.id}" ${p.id === periodoGastos ? 'selected' : ''}>${periodoTxt(p)}</option>`).join('')}</select>` : ''}
    </div>
    ${!abierto ? `<div class="aviso">No hay un periodo abierto. <button class="btn chico" id="btnAbrir" type="button">Abrir ${periodoTxt(mesActual)}</button></div>` : ''}
    ${aprobadosPend.length ? `
    <details class="tarjeta plegable obligaciones">
      <summary><h2>Por pagar a proveedores: ${aprobadosPend.length} factura${aprobadosPend.length > 1 ? 's' : ''} · ≈ ${usd(deudaUsd)}</h2></summary>
      <table class="tabla"><tbody>${aprobadosPend.map((g) => `<tr>
        <td><b>${esc(g.descripcion)}</b><div class="muted">${esc(g.proveedores?.razon_social || '')} · ${periodoTxt(g.periodos)}</div></td>
        <td class="num">${enMoneda(g.moneda, saldoProv(g))}<div class="muted">por pagar</div></td>
        <td><button class="btn linea chico" type="button" data-ir-periodo="${g.periodo_id}">Ver</button></td></tr>`).join('')}</tbody></table>
    </details>` : ''}
    ${periodo ? `
      <div class="resumen-chips">
        ${chip('periodo', periodo.estado)}
        <span class="chip ok">Aprobado ${usd(total(['aprobado']))}</span>
        <span class="chip alerta">Esperando a la junta ${usd(total(['en_revision']))}</span>
        <span class="chip">Borrador ${usd(total(['borrador']))}</span>
        ${total(['rechazado']) ? `<span class="chip error">Rechazado ${usd(total(['rechazado']))}</span>` : ''}
      </div>
      <div id="msgG"></div>
      <div class="lista-gastos">
        ${lista.length ? lista.map((g) => {
          const ultima = [...(g.gasto_aprobaciones || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          const ep = estadoDe[g.id];
          const pagos = pagosProv.filter((x) => x.gasto_id === g.id);
          const saldo = ep ? Math.max(0, Number(ep.a_pagar) - Number(ep.pagado)) : Number(g.monto);
          const puedePagar = ['aprobado', 'en_revision'].includes(g.estado) && ep?.estado_pago !== 'pagado';
          return `
          <article class="tarjeta gasto">
            <div class="gasto-cab">
              <div><b>${esc(g.descripcion)}</b>
                <div class="muted">${esc(g.proveedores?.razon_social || 'Sin proveedor')} · ${esc(g.categorias_gasto?.nombre || 'Sin categoría')} · Fact. ${esc(g.numero_factura || 's/n')} · ${fecha(g.fecha_factura)}</div>
                <div class="chips-linea">${chip('gasto', g.estado)}${g.tipo === 'extraordinario' ? '<span class="chip oro">Extraordinario</span>' : ''}
                  ${g.cuotas > 1 ? `<span class="chip oro">En ${g.cuotas} cuotas · cobradas ${g.cuotas_cobradas}</span>` : ''}
                  ${!g.es_comun ? `<span class="chip">Solo ${esc((g.gasto_unidades || []).map((x) => x.unidades?.codigo).join(', ') || 'algunas unidades')}</span>` : ''}
                  ${ep && g.estado !== 'rechazado' ? chipPago(ep.estado_pago) : ''}</div>
              </div>
              <div class="num"><b>${usd(g.monto_usd)}</b>${g.moneda === 'VES' ? `<div class="muted">${bs(g.monto)} a ${num2(g.tasa_aplicada)}</div>` : ''}</div>
            </div>
            ${ultima && g.estado === 'rechazado' ? `<div class="aviso error">La junta lo rechazó: ${esc(ultima.comentario || '')}</div>` : ''}
            ${pagos.length ? `<ul class="pagos-prov">${pagos.map((x) => `<li>${fecha(x.fecha)} · ref. <b>${esc(x.referencia || 's/n')}</b>
              <span class="num">${enMoneda(x.moneda, x.monto)}</span>${x.comprobante_url ? ` <button class="btn linea chico" type="button" data-ver="${esc(x.comprobante_url)}">Comprobante</button>` : ''}</li>`).join('')}
              ${ep?.estado_pago === 'parcial' ? `<li class="muted">Falta por pagar: <b>${enMoneda(g.moneda, saldo)}</b></li>` : ''}</ul>` : ''}
            <div class="acciones">
              ${g.soporte_url ? `<button class="btn linea chico" data-ver="${esc(g.soporte_url)}" type="button">Ver factura</button>` : ''}
              ${puedePagar ? `<button class="btn linea chico" data-pagar="${g.id}" type="button">Registrar pago al proveedor</button>` : ''}
              ${['borrador', 'rechazado'].includes(g.estado) && !g.soporte_url ? `<label class="btn linea chico subir">Adjuntar factura<input type="file" accept="image/*,application/pdf" data-adjuntar="${g.id}" hidden></label>` : ''}
              ${['borrador', 'rechazado'].includes(g.estado) && g.soporte_url ? `<button class="btn chico" data-enviar="${g.id}" type="button">${g.estado === 'rechazado' ? 'Reenviar a la junta' : 'Enviar a la junta'}</button>` : ''}
              ${g.estado === 'borrador' ? `<button class="btn linea chico peligro" data-borrar="${g.id}" type="button">Eliminar</button>` : ''}
            </div>
            ${puedePagar ? `
            <form class="form-pago-prov" data-form-pago="${g.id}" hidden>
              <div class="fila3">
                <div><label>Fecha del pago</label><input type="date" name="fecha" required value="${hoyVE()}" max="${hoyVE()}"></div>
                <div><label>Moneda</label><select name="moneda"><option value="USD" ${g.moneda === 'USD' ? 'selected' : ''}>Dólares</option><option value="VES" ${g.moneda === 'VES' ? 'selected' : ''}>Bolívares</option></select></div>
                <div><label>Monto</label><input type="number" name="monto" inputmode="decimal" step="0.01" min="0.01" required value="${Math.round(saldo * 100) / 100}"></div>
              </div>
              <div class="fila">
                <div><label>Referencia del banco</label><input name="referencia" required minlength="3" placeholder="Número de la transferencia"></div>
                <div><label>Desde la cuenta</label><select name="cuenta">${cuentas.filter((x) => !['zelle', 'pago_movil'].includes(x.tipo)).map((x) => `<option value="${x.id}">${esc(x.banco)} ${esc(x.numero ? '...' + x.numero.slice(-4) : '')}</option>`).join('')}<option value="">Otra</option></select></div>
              </div>
              <label>Comprobante (opcional)</label><input type="file" name="comprobante" accept="image/*,application/pdf">
              <div class="acciones"><button class="btn chico">Guardar pago</button><button class="btn linea chico" type="button" data-cancelar>Cancelar</button></div>
            </form>` : ''}
          </article>`; }).join('') : `<div class="tarjeta">${vacio('Este periodo todavía no tiene gastos.')}</div>`}
      </div>` : ''}
    ${editable ? `
    <details class="tarjeta plegable" ${lista.length ? '' : 'open'}>
      <summary><h2>Cargar un gasto de ${periodoTxt(periodo)}</h2></summary>
      <form id="fGasto">
        <div class="fila"><div><label for="gProv">Proveedor</label><select id="gProv">${proveedores.map((p) => `<option value="${p.id}">${esc(p.razon_social)}</option>`).join('')}<option value="">Otro / sin proveedor</option></select></div>
          <div><label for="gCat">Categoría</label><select id="gCat">${categorias.map((k) => `<option value="${k.id}" data-tipo="${k.tipo_defecto}">${esc(k.nombre)}</option>`).join('')}</select></div></div>
        <label for="gDesc">Descripción</label><input id="gDesc" required placeholder="Ej.: 4 bombillos para el pasillo">
        <div class="fila3"><div><label for="gFact">Nº de factura</label><input id="gFact"></div>
          <div><label for="gFecha">Fecha</label><input id="gFecha" type="date" required value="${hoyVE()}"></div>
          <div><label for="gTipo">Tipo</label><select id="gTipo"><option value="ordinario">Ordinario</option><option value="extraordinario">Extraordinario</option></select></div></div>
        <div id="gCuotasFila" hidden>
          <label for="gCuotas">Cobrarlo a los propietarios en</label>
          <select id="gCuotas">${[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => `<option value="${n}">${n === 1 ? 'Una sola cuota (este mes)' : n + ' cuotas mensuales'}</option>`).join('')}</select>
        </div>
        <div class="fila"><div><label for="gMon">Moneda</label><select id="gMon"><option value="USD">Dólares</option><option value="VES">Bolívares</option></select></div>
          <div><label for="gMonto">Monto</label><input id="gMonto" type="number" inputmode="decimal" step="0.01" min="0.01" required><div class="muted" id="gEquiv"></div></div></div>
        <label for="gA">¿A quién se le cobra?</label>
        <select id="gA"><option value="todos">A todos, según su alícuota</option>${unidadesL.map((u) => `<option value="${u.id}">Solo al apartamento ${esc(u.codigo)}</option>`).join('')}</select>
        <label for="gSoporte">Foto de la factura o soporte</label><input id="gSoporte" type="file" accept="image/*,application/pdf" capture="environment">
        <div id="msgF"></div>
        <div class="acciones" style="margin-top:16px">
          <button class="btn" data-modo="enviar">Guardar y enviar a la junta</button>
          <button class="btn linea" data-modo="borrador">Guardar como borrador</button>
        </div>
      </form>
    </details>` : ''}`;

  const msg = (e) => { el.querySelector('#msgG').innerHTML = errorHtml(e); };
  el.querySelector('#selPeriodo')?.addEventListener('change', (e) => { periodoGastos = e.target.value; gastos(ctx, el); });
  el.querySelectorAll('[data-ir-periodo]').forEach((b) => (b.onclick = () => { periodoGastos = b.dataset.irPeriodo; gastos(ctx, el); }));
  el.querySelector('#btnAbrir')?.addEventListener('click', async () => {
    const { data, error } = await sb.from('periodos').insert({ condominio_id: c, ...mesActual }).select('id').single();
    if (error) { msg(error); return; }
    periodoGastos = data.id;
    gastos(ctx, el);
  });
  el.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = async () => {
    const url = await urlFirmada('soportes', b.dataset.ver);
    if (url) window.open(url, '_blank', 'noopener'); else toast('No se encontró el archivo', 'error');
  }));
  el.querySelectorAll('[data-adjuntar]').forEach((inp) => (inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    const ruta = `${c}/${nombreArchivo(f)}`;
    const up = await sb.storage.from('soportes').upload(ruta, f);
    if (up.error) { msg(up.error); return; }
    const { error } = await sb.from('gastos').update({ soporte_url: ruta }).eq('id', inp.dataset.adjuntar);
    if (error) { msg(error); return; }
    toast('Factura adjuntada', 'ok');
    gastos(ctx, el);
  }));
  el.querySelectorAll('[data-enviar]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const { error } = await sb.from('gastos').update({ estado: 'en_revision' }).eq('id', b.dataset.enviar);
    if (error) { msg(error); b.disabled = false; return; }
    toast('Enviado a la junta para su aprobación', 'ok');
    gastos(ctx, el);
  }));
  el.querySelectorAll('[data-borrar]').forEach((b) => (b.onclick = async () => {
    if (!confirm('¿Eliminar este borrador?')) return;
    const { error } = await sb.from('gastos').delete().eq('id', b.dataset.borrar);
    if (error) { msg(error); return; }
    gastos(ctx, el);
  }));

  // Pago al proveedor
  el.querySelectorAll('[data-pagar]').forEach((b) => (b.onclick = () => {
    const f = el.querySelector(`[data-form-pago="${b.dataset.pagar}"]`);
    f.hidden = !f.hidden;
    if (!f.hidden) f.querySelector('[name=referencia]').focus();
  }));
  el.querySelectorAll('[data-cancelar]').forEach((b) => (b.onclick = () => { b.closest('form').hidden = true; }));
  el.querySelectorAll('[data-form-pago]').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      let comprobante = null;
      const archivo = f.comprobante.files[0];
      if (archivo) {
        const ruta = `${c}/pagos-proveedores/${nombreArchivo(archivo)}`;
        const up = await sb.storage.from('soportes').upload(ruta, archivo);
        if (up.error) throw up.error;
        comprobante = ruta;
      }
      const { error } = await sb.from('gasto_pagos').insert({
        gasto_id: f.dataset.formPago, fecha: f.fecha.value, moneda: f.moneda.value, monto: Number(f.monto.value),
        monto_usd: 1, referencia: f.referencia.value.trim(), cuenta_id: f.cuenta.value || null,
        comprobante_url: comprobante, created_by: ctx.usuario.id,
      });
      if (error) throw error;
      toast('Pago al proveedor registrado', 'ok');
      gastos(ctx, el);
    } catch (err) {
      msg(err);
      btn.disabled = false;
    }
  }));

  // Formulario de gasto nuevo
  const f = el.querySelector('#fGasto');
  if (!f) return;
  const equiv = () => {
    const n = Number(f.querySelector('#gMonto').value);
    const t = tasaUsd();
    f.querySelector('#gEquiv').textContent = f.querySelector('#gMon').value === 'VES' && n && t ? `≈ ${usd(n / t)} a la tasa BCV de hoy` : '';
  };
  const verCuotas = () => { f.querySelector('#gCuotasFila').hidden = f.querySelector('#gTipo').value !== 'extraordinario'; if (f.querySelector('#gCuotasFila').hidden) f.querySelector('#gCuotas').value = '1'; };
  f.querySelector('#gMonto').addEventListener('input', equiv);
  f.querySelector('#gMon').addEventListener('change', equiv);
  f.querySelector('#gTipo').addEventListener('change', verCuotas);
  f.querySelector('#gCat').addEventListener('change', (e) => { f.querySelector('#gTipo').value = e.target.selectedOptions[0].dataset.tipo; verCuotas(); });
  let modo = 'enviar';
  f.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.modo; }));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const msgF = f.querySelector('#msgF');
    const botones = f.querySelectorAll('button');
    botones.forEach((b) => (b.disabled = true));
    try {
      const archivo = f.querySelector('#gSoporte').files[0];
      if (modo === 'enviar' && !archivo) throw new Error('Para enviarlo a la junta adjunta la foto de la factura (o guárdalo como borrador).');
      let soporte = null;
      if (archivo) {
        const ruta = `${c}/${nombreArchivo(archivo)}`;
        const up = await sb.storage.from('soportes').upload(ruta, archivo);
        if (up.error) throw up.error;
        soporte = ruta;
      }
      const a = f.querySelector('#gA').value;
      const { data: g, error } = await sb.from('gastos').insert({
        condominio_id: c, periodo_id: periodo.id,
        proveedor_id: f.querySelector('#gProv').value || null, categoria_id: f.querySelector('#gCat').value || null,
        tipo: f.querySelector('#gTipo').value, es_comun: a === 'todos', cuotas: Number(f.querySelector('#gCuotas').value),
        descripcion: f.querySelector('#gDesc').value.trim(), numero_factura: f.querySelector('#gFact').value.trim() || null,
        fecha_factura: f.querySelector('#gFecha').value, moneda: f.querySelector('#gMon').value,
        monto: Number(f.querySelector('#gMonto').value), monto_usd: 1,
        soporte_url: soporte, estado: modo === 'enviar' ? 'en_revision' : 'borrador', creado_por: ctx.usuario.id,
      }).select('id, monto_usd').single();
      if (error) throw error;
      if (a !== 'todos') {
        const r = await sb.from('gasto_unidades').insert({ gasto_id: g.id, unidad_id: a, monto_usd: g.monto_usd });
        if (r.error) throw r.error;
      }
      toast(modo === 'enviar' ? 'Gasto guardado y enviado a la junta' : 'Gasto guardado como borrador', 'ok');
      gastos(ctx, el);
    } catch (err) {
      msgF.innerHTML = errorHtml(err);
      botones.forEach((b) => (b.disabled = false));
    }
  };
}
