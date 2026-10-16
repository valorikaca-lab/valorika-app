// Cuentas del edificio: ingresos y egresos de cada mes, con las facturas de los
// gastos aprobados. La ven propietarios, junta y administración (solo totales del
// edificio, sin datos de otros propietarios).
import { sb, esc, usd, bs, num2, pct, fecha, periodoTxt, chip, vacio, errorHtml, q, urlFirmada, icono } from '../util.js';

let periodoSel = null;

// Día en que se emiten solos los recibos de un periodo abierto.
export function fechaEmisionAuto(p, condo) {
  const d = new Date(Date.UTC(p.anio, p.mes, 1)); // primer día del mes siguiente
  d.setUTCDate(d.getUTCDate() + (Number(condo?.dia_emision || 1) - 1));
  return d.toISOString().slice(0, 10);
}

export async function vista(ctx, el) {
  if (ctx.demo) { el.innerHTML = `<h1>Cuentas del edificio</h1><div class="tarjeta">${vacio('Vista previa sin datos.')}</div>`; return; }
  const c = ctx.condo.id;
  const [{ data: resumen, error }, [condo]] = await Promise.all([
    sb.rpc('resumen_cuentas', { p_condo: c }),
    q(sb.from('condominios').select('dia_emision, emision_automatica, fondo_reserva_pct').eq('id', c)),
  ]);
  if (error) throw error;
  const meses = resumen || [];
  if (!meses.length) { el.innerHTML = `<h1>Cuentas del edificio</h1><div class="tarjeta">${vacio('Todavía no hay meses con movimientos.')}</div>`; return; }
  if (!meses.some((m) => m.periodo_id === periodoSel)) periodoSel = (meses.find((m) => m.estado === 'emitido') || meses[0]).periodo_id;
  const m = meses.find((x) => x.periodo_id === periodoSel);
  const abierto = ['abierto', 'en_revision'].includes(m.estado);

  const { data: gastos, error: e2 } = await sb.rpc('gastos_del_periodo', { p_periodo: m.periodo_id });
  if (e2) throw e2;
  const porCategoria = {};
  for (const g of gastos) (porCategoria[g.categoria] ||= []).push(g);
  const categorias = Object.entries(porCategoria).map(([k, gs]) => [k, gs, gs.reduce((a, g) => a + Number(g.monto_usd), 0)]).sort((a, b) => b[2] - a[2]);
  const maxCat = Math.max(0, ...categorias.map((x) => x[2]));
  const egresos = Number(m.egresos_usd);
  const cobrado = Number(m.cobrado_usd);
  const facturado = Number(m.facturado_usd);
  const maxBarra = Math.max(cobrado, egresos, facturado) || 1;

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Cuentas del edificio</h1>
      <p class="muted">En qué se usa el dinero de todos, mes a mes. Son los gastos que aprobó la junta, cada uno con su factura.</p></div>
    <div class="meses" role="tablist" aria-label="Mes">
      ${meses.map((x) => `<button type="button" role="tab" data-p="${x.periodo_id}" class="${x.periodo_id === periodoSel ? 'activo' : ''}" aria-selected="${x.periodo_id === periodoSel}">${periodoTxt(x)}</button>`).join('')}
    </div>
    ${abierto ? `
      <div class="aviso">Mes en curso: van ${usd(egresos)} en gastos aprobados.
        ${condo?.emision_automatica ? `Los recibos se emiten solos el ${fecha(fechaEmisionAuto(m, condo))}, cuando la junta haya aprobado todo.` : 'La administración emitirá los recibos al cerrar el mes.'}</div>` : `
      <div class="kpis">
        <div class="kpi ok"><div class="etiqueta">Entró (cobrado)</div><div class="valor">${usd(cobrado)}</div><div class="muted">de ${usd(facturado)} facturado</div></div>
        <div class="kpi primario"><div class="etiqueta">Salió (gastos)</div><div class="valor">${usd(egresos)}</div><div class="muted">${gastos.length} facturas</div></div>
        <div class="kpi"><div class="etiqueta">Por cobrar</div><div class="valor">${usd(m.por_cobrar_usd)}</div><div class="muted">${m.unidades_pagadas} de ${m.unidades} apartamentos pagaron</div></div>
        <div class="kpi"><div class="etiqueta">Fondo de reserva del mes</div><div class="valor">${usd(m.reserva_usd)}</div><div class="muted">${pct(condo?.fondo_reserva_pct)} de los gastos comunes</div></div>
      </div>
      <section class="tarjeta">
        <h2>Entró y salió en ${periodoTxt(m)}</h2>
        <div class="barras">
          <div class="barra-fila"><span class="barra-etq">Facturado</span><span class="barra-h"><span class="oro" style="width:${(100 * facturado) / maxBarra}%"></span></span><span class="barra-valor">${usd(facturado)}</span></div>
          <div class="barra-fila"><span class="barra-etq">Cobrado</span><span class="barra-h"><span class="ok" style="width:${(100 * cobrado) / maxBarra}%"></span></span><span class="barra-valor">${usd(cobrado)}</span></div>
          <div class="barra-fila"><span class="barra-etq">Gastado</span><span class="barra-h"><span style="width:${(100 * egresos) / maxBarra}%"></span></span><span class="barra-valor">${usd(egresos)}</span></div>
        </div>
        <p class="muted">${facturado ? `Se ha cobrado el ${pct((100 * cobrado) / facturado)} de lo facturado.` : ''} Lo facturado incluye el fondo de reserva.</p>
      </section>`}
    <section class="tarjeta">
      <h2>En qué se gastó</h2>
      ${categorias.length ? `<div class="barras">${categorias.map(([k, , total]) => `
        <div class="barra-fila"><span class="barra-etq">${esc(k)}</span><span class="barra-h"><span style="width:${Math.max(1.5, (100 * total) / maxCat)}%"></span></span><span class="barra-valor">${usd(total)}</span></div>`).join('')}</div>` : vacio('No hay gastos aprobados en este mes.')}
    </section>
    ${categorias.map(([k, gs, total]) => `
      <section class="tarjeta">
        <div class="cat-cab"><h2>${esc(k)}</h2><b>${usd(total)}</b></div>
        <ul class="facturas">${gs.map((g) => `
          <li>
            <div><b>${esc(g.descripcion)}</b>${g.tipo === 'extraordinario' ? ' <span class="chip oro">Extraordinario</span>' : ''}${g.es_comun ? '' : ' <span class="chip">No común</span>'}
              <div class="muted">${esc(g.proveedor || 'Sin proveedor')} · ${fecha(g.fecha_factura)} · Fact. ${esc(g.numero_factura || 's/n')}</div></div>
            <div class="num"><b>${usd(g.monto_usd)}</b>${g.moneda === 'VES' ? `<div class="muted">${bs(g.monto)}</div>` : ''}</div>
            ${g.soporte_url ? `<button type="button" class="btn linea chico" data-factura="${esc(g.soporte_url)}" data-titulo="${esc(g.descripcion)}">${icono.recibos} Ver factura</button>` : ''}
          </li>`).join('')}</ul>
      </section>`).join('')}
    <section class="tarjeta scroll-x">
      <h2>Últimos meses</h2>
      <table class="tabla"><thead><tr><th>Mes</th><th class="num">Facturado</th><th class="num">Cobrado</th><th class="num">Gastos</th></tr></thead><tbody>
        ${meses.map((x) => `<tr><td>${periodoTxt(x)} ${['abierto', 'en_revision'].includes(x.estado) ? chip('periodo', x.estado) : ''}</td>
          <td class="num">${usd(x.facturado_usd)}</td><td class="num">${usd(x.cobrado_usd)}</td><td class="num">${usd(x.egresos_usd)}</td></tr>`).join('')}
      </tbody></table>
    </section>
    <dialog id="visor" class="visor">
      <div class="visor-cab"><b id="visorTitulo"></b><button type="button" class="btn linea chico" id="visorCerrar">Cerrar</button></div>
      <div id="visorCuerpo"></div>
    </dialog>`;

  el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { periodoSel = b.dataset.p; vista(ctx, el); }));
  const visor = el.querySelector('#visor');
  el.querySelector('#visorCerrar').onclick = () => visor.close();
  visor.addEventListener('click', (e) => { if (e.target === visor) visor.close(); });
  el.querySelectorAll('[data-factura]').forEach((b) => (b.onclick = async () => {
    const url = await urlFirmada('soportes', b.dataset.factura);
    el.querySelector('#visorTitulo').textContent = b.dataset.titulo;
    el.querySelector('#visorCuerpo').innerHTML = !url ? errorHtml('No se pudo abrir la factura.')
      : /\.pdf($|\?)/i.test(b.dataset.factura) ? `<iframe src="${esc(url)}" title="Factura"></iframe>`
      : `<img src="${esc(url)}" alt="Factura: ${esc(b.dataset.titulo)}">`;
    visor.showModal();
  }));
}
