// Balance del edificio: lo que tiene (caja por cuenta y lo que le deben) contra lo
// que debe (proveedores, saldos a favor y otros pasivos). Lo ven la junta y la
// administración; la administración registra pasivos, abonos y concilia con el banco.
import { sb, esc, usd, bs, fecha, hoyVE, vacio, errorHtml, toast } from '../util.js';

const TIPOS = { prestamo: 'Préstamo', proveedor: 'Deuda con proveedor', laboral: 'Deuda laboral', impuesto: 'Impuesto o tasa', judicial: 'Juicio o sentencia', otro: 'Otro' };
const CUENTA = { corriente: 'Cuenta corriente', ahorro: 'Cuenta de ahorro', divisas: 'Cuenta en divisas', pago_movil: 'Pago móvil', zelle: 'Zelle', otro: 'Otra' };
const enMoneda = (m, n) => (m === 'VES' ? bs(n) : usd(n));

export async function vista(ctx, el) {
  if (ctx.demo) { el.innerHTML = `<h1>Balance del edificio</h1><div class="tarjeta">${vacio('Vista previa sin datos.')}</div>`; return; }
  const c = ctx.condo.id;
  const { data: b, error } = await sb.rpc('balance_edificio', { p_condo: c });
  if (error) throw error;
  const a = b.activos, p = b.pasivos;
  const admin = ctx.rol === 'admin';
  const sin = a.sin_cuenta || { bs: 0, usd: 0 };
  const haySin = Math.abs(Number(sin.bs)) > 0.004 || Math.abs(Number(sin.usd)) > 0.004;
  const opcionesCuenta = (vacia) => `<option value="">${vacia}</option>` + a.cuentas.filter((x) => x.activa)
    .map((x) => `<option value="${x.id}">${esc(x.banco)} · ${CUENTA[x.tipo] || x.tipo} (${x.moneda === 'VES' ? 'Bs' : x.moneda})</option>`).join('');

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Balance del edificio</h1>
      <p class="muted">Al ${fecha(b.fecha)} · todo en dólares a la tasa BCV de hoy (${bs(b.tasa)}).</p></div>
    <div class="kpis">
      <div class="kpi ok"><div class="etiqueta">Lo que tiene</div><div class="valor">${usd(a.total_usd)}</div><div class="muted">caja y cuentas por cobrar</div></div>
      <div class="kpi primario"><div class="etiqueta">Lo que debe</div><div class="valor">${usd(p.total_usd)}</div><div class="muted">proveedores y otros pasivos</div></div>
      <div class="kpi"><div class="etiqueta">Le queda</div><div class="valor">${usd(b.patrimonio_usd)}</div><div class="muted">lo que tiene menos lo que debe</div></div>
    </div>
    ${b.caja_cubre ? `<div class="nota-ok">Con la caja de hoy (${usd(a.caja_usd)}) el edificio puede pagar todo lo que debe (${usd(p.total_usd)}).</div>`
      : `<div class="aviso">Con la caja de hoy (${usd(a.caja_usd)}) le faltan ${usd(b.faltante_usd)} para pagar todo lo que debe. Cobrar lo vencido (${usd(a.vencido_usd)}) lo cubriría${Number(a.vencido_usd) >= Number(b.faltante_usd) ? '' : ' solo en parte'}.</div>`}
    <div class="dos-col">
      <section class="tarjeta">
        <h2>Lo que tiene</h2>
        <h3 class="subtitulo">Caja · ${usd(a.caja_usd)}</h3>
        <ul class="filas-balance">${a.cuentas.map((x) => `
          <li><div><b>${esc(x.banco)}</b> · ${CUENTA[x.tipo] || esc(x.tipo)}${x.numero ? ` ···${esc(x.numero)}` : ''}${x.activa ? '' : ' <span class="chip">Inactiva</span>'}
              <div class="muted">${x.saldo_banco !== null ? `Según el banco al ${fecha(x.saldo_banco_fecha)}: ${enMoneda(x.moneda, x.saldo_banco)}
                ${Math.abs(Number(x.diferencia)) < 0.01 ? '<span class="chip ok">Cuadra</span>' : `<span class="chip alerta">Diferencia ${enMoneda(x.moneda, x.diferencia)}</span>`}`
                : 'Sin conciliar con el banco'}</div></div>
            <div class="num"><b>${enMoneda(x.moneda, x.saldo)}</b>${x.moneda === 'VES' ? `<div class="muted">${usd(x.saldo_usd)}</div>` : ''}</div>
            ${admin ? `<details class="ajuste"><summary>Conciliar o ajustar</summary>
              <form class="fCuenta" data-id="${x.id}">
                <div class="fila"><div><label>Saldo según el banco (${x.moneda === 'VES' ? 'Bs' : x.moneda})</label><input name="saldo_banco" type="number" step="0.01" value="${x.saldo_banco ?? ''}"></div>
                  <div><label>Al día</label><input name="saldo_banco_fecha" type="date" max="${hoyVE()}" value="${x.saldo_banco_fecha || hoyVE()}"></div></div>
                <div class="fila"><div><label>Saldo con el que empezó en Valórika</label><input name="saldo_inicial" type="number" step="0.01" value="${x.saldo_inicial}"></div>
                  <div><label>Desde el día</label><input name="saldo_inicial_fecha" type="date" max="${hoyVE()}" value="${x.saldo_inicial_fecha || ''}"></div></div>
                <button class="btn chico">Guardar</button>
              </form></details>` : ''}</li>`).join('')}
          ${haySin ? `<li><div><b>Pagos sin cuenta asignada</b><div class="muted">Efectivo o pagos registrados sin decir en qué cuenta entraron o de cuál salieron</div></div>
            <div class="num"><b>${usd(Number(sin.usd) + Number(sin.bs) / Number(b.tasa || 1))}</b>${Math.abs(Number(sin.bs)) > 0.004 ? `<div class="muted">${bs(sin.bs)} + ${usd(sin.usd)}</div>` : ''}</div></li>` : ''}
        </ul>
        <p class="muted">Fondo de reserva cobrado: <b>${usd(a.fondo_reserva_usd)}</b>. Es parte de la caja y no se usa para los gastos de todos los meses.</p>
        <h3 class="subtitulo">Por cobrar a los propietarios · ${usd(a.por_cobrar_usd)}</h3>
        <ul class="filas-balance">
          <li><div>Recibos que todavía no vencen</div><div class="num">${usd(a.por_vencer_usd)}</div></li>
          <li><div>Vencido<div class="muted">${a.morosos} ${a.morosos === 1 ? 'apartamento' : 'apartamentos'} con deuda vencida</div></div><div class="num"><b>${usd(a.vencido_usd)}</b></div></li>
        </ul>
      </section>
      <section class="tarjeta">
        <h2>Lo que debe</h2>
        <h3 class="subtitulo">Facturas por pagar a proveedores · ${usd(p.proveedores_usd)}</h3>
        ${p.facturas.length ? `<ul class="filas-balance">${p.facturas.map((f) => `
          <li><div>${esc(f.descripcion)}<div class="muted">${esc(f.proveedor || 'Sin proveedor')}${f.fecha ? ' · ' + fecha(f.fecha) : ''}</div></div>
            <div class="num">${enMoneda(f.moneda, f.saldo)}${f.moneda === 'VES' ? `<div class="muted">${usd(f.saldo_usd)}</div>` : ''}</div></li>`).join('')}</ul>`
          : '<p class="muted">Todas las facturas aprobadas están pagadas.</p>'}
        <h3 class="subtitulo">Saldos a favor de propietarios · ${usd(p.saldos_favor_usd)}</h3>
        <p class="muted">Pagos adelantados: se descuentan solos en los próximos recibos.</p>
        <h3 class="subtitulo">Otros pasivos · ${usd(p.otros_usd)}</h3>
        ${p.otros.length ? `<ul class="filas-balance">${p.otros.map((o) => `
          <li><div><b>${esc(o.acreedor)}</b> <span class="chip">${TIPOS[o.tipo] || esc(o.tipo)}</span>
              <div class="muted">${o.descripcion ? esc(o.descripcion) + ' · ' : ''}Desde el ${fecha(o.fecha)}${o.vence ? ` · vence el ${fecha(o.vence)}` : ''}
                ${Number(o.abonado) > 0 ? ` · abonado ${enMoneda(o.moneda, o.abonado)} de ${enMoneda(o.moneda, o.monto)}` : ''}</div></div>
            <div class="num"><b>${enMoneda(o.moneda, o.saldo)}</b>${o.moneda === 'VES' ? `<div class="muted">${usd(o.saldo_usd)}</div>` : ''}</div>
            ${admin ? `<details class="ajuste"><summary>Abonar o anular</summary>
              <form class="fAbono" data-id="${o.id}">
                <div class="fila3"><div><label>Monto</label><input name="monto" type="number" step="0.01" min="0.01" required></div>
                  <div><label>Moneda</label><select name="moneda"><option value="USD">USD</option><option value="VES" ${o.moneda === 'VES' ? 'selected' : ''}>Bs</option></select></div>
                  <div><label>Fecha</label><input name="fecha" type="date" max="${hoyVE()}" value="${hoyVE()}" required></div></div>
                <div class="fila"><div><label>Salió de</label><select name="cuenta_id">${opcionesCuenta('No salió de ninguna cuenta')}</select></div>
                  <div><label>Referencia</label><input name="referencia"></div></div>
                <div class="acciones"><button class="btn chico">Registrar abono</button>
                  <button class="btn linea chico" type="button" data-anular="${o.id}">Anular este pasivo</button></div>
              </form></details>` : ''}</li>`).join('')}</ul>`
          : '<p class="muted">No hay otros pasivos registrados.</p>'}
        <p class="muted">Pasivos laborales: el edificio trabaja con contratistas, sin nómina propia. Si hay una deuda laboral, regístrala aquí como pasivo.</p>
        ${admin ? `
        <details class="plegable" style="margin-top:12px"><summary><h2>Registrar un pasivo</h2></summary>
          <form id="fPasivo">
            <div class="fila"><div><label for="pvTipo">Tipo</label><select id="pvTipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
              <div><label for="pvAcreedor">A quién se le debe</label><input id="pvAcreedor" required minlength="2" maxlength="150"></div></div>
            <label for="pvDesc">Detalle (opcional)</label><input id="pvDesc" maxlength="1000">
            <div class="fila3"><div><label for="pvMonto">Monto</label><input id="pvMonto" type="number" step="0.01" min="0.01" required></div>
              <div><label for="pvMoneda">Moneda</label><select id="pvMoneda"><option value="USD">USD</option><option value="VES">Bs</option></select></div>
              <div><label for="pvFecha">Desde el día</label><input id="pvFecha" type="date" max="${hoyVE()}" value="${hoyVE()}" required></div></div>
            <div class="fila"><div><label for="pvVence">Vence (opcional)</label><input id="pvVence" type="date"></div>
              <div><label for="pvCuenta">¿Entró dinero a una cuenta?</label><select id="pvCuenta">${opcionesCuenta('No (es una deuda sin dinero recibido)')}</select></div></div>
            <div id="msgPv"></div>
            <button class="btn" style="margin-top:12px">Registrar pasivo</button>
          </form>
        </details>` : ''}
      </section>
    </div>`;

  if (!admin) return;
  const recargar = (txt) => { toast(txt, 'ok'); vista(ctx, el); };
  el.querySelectorAll('.fCuenta').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    const { error: err } = await sb.from('cuentas_bancarias').update({
      saldo_banco: d.saldo_banco === '' ? null : Number(d.saldo_banco), saldo_banco_fecha: d.saldo_banco === '' ? null : d.saldo_banco_fecha || hoyVE(),
      saldo_inicial: Number(d.saldo_inicial || 0), saldo_inicial_fecha: d.saldo_inicial_fecha || null,
    }).eq('id', f.dataset.id);
    if (err) { toast(err.message, 'error'); return; }
    recargar('Cuenta actualizada');
  }));
  el.querySelectorAll('.fAbono').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    const { error: err } = await sb.from('pasivo_abonos').insert({
      pasivo_id: f.dataset.id, condominio_id: c, moneda: d.moneda, monto: Number(d.monto), fecha: d.fecha,
      cuenta_id: d.cuenta_id || null, referencia: d.referencia.trim() || null,
    });
    if (err) { toast(err.message, 'error'); return; }
    recargar('Abono registrado');
  }));
  el.querySelectorAll('[data-anular]').forEach((btn) => (btn.onclick = async () => {
    if (!confirm('¿Anular este pasivo? Úsalo solo si se registró por error.')) return;
    const { error: err } = await sb.from('pasivos').update({ estado: 'anulado' }).eq('id', btn.dataset.anular);
    if (err) { toast(err.message, 'error'); return; }
    recargar('Pasivo anulado');
  }));
  el.querySelector('#fPasivo').onsubmit = async (e) => {
    e.preventDefault();
    const v = (id) => el.querySelector('#' + id).value.trim();
    const { error: err } = await sb.from('pasivos').insert({
      condominio_id: c, tipo: v('pvTipo'), acreedor: v('pvAcreedor'), descripcion: v('pvDesc') || null,
      moneda: v('pvMoneda'), monto: Number(v('pvMonto')), fecha: v('pvFecha'), vence: v('pvVence') || null, cuenta_id: v('pvCuenta') || null,
    });
    if (err) { el.querySelector('#msgPv').innerHTML = errorHtml(err); return; }
    recargar('Pasivo registrado');
  };
}

// Resumen para "Cuentas del edificio" (también lo ven los propietarios).
export async function resumenHtml(ctx) {
  const { data: b } = await sb.rpc('balance_edificio', { p_condo: ctx.condo.id });
  if (!b) return '';
  return `
    <section class="tarjeta">
      <h2>Balance del edificio hoy</h2>
      <div class="kpis">
        <div class="kpi ok"><div class="etiqueta">Lo que tiene</div><div class="valor">${usd(b.activos.total_usd)}</div><div class="muted">caja ${usd(b.activos.caja_usd)} · por cobrar ${usd(b.activos.por_cobrar_usd)}</div></div>
        <div class="kpi primario"><div class="etiqueta">Lo que debe</div><div class="valor">${usd(b.pasivos.total_usd)}</div><div class="muted">proveedores ${usd(b.pasivos.proveedores_usd)}</div></div>
        <div class="kpi"><div class="etiqueta">Le queda</div><div class="valor">${usd(b.patrimonio_usd)}</div><div class="muted">fondo de reserva ${usd(b.activos.fondo_reserva_usd)}</div></div>
      </div>
      ${['admin', 'junta'].includes(ctx.rol) ? '<a class="btn linea chico" href="#/balance">Ver el balance completo</a>' : ''}
    </section>`;
}
