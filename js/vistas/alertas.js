// Alertas de irregularidades del edificio: gastos que suben mucho, facturas
// repetidas, pagos que no están en el banco, cuentas que no cuadran, pasivos
// vencidos... Las calcula la base en el momento; aquí se revisan con una nota.
import { sb, esc, fecha, vacio, errorHtml, toast } from '../util.js';

const NIVEL = { alta: ['Grave', 'error'], media: ['Revisar', 'alerta'], info: ['Aviso', ''] };
const TIPO = { gasto: 'Gastos', proveedor: 'Proveedores', pago: 'Pagos', banco: 'Banco', balance: 'Balance', cobranza: 'Cobranza', pasivo: 'Pasivos', unidades: 'Apartamentos' };

function htmlAlerta(a, revisada) {
  const [txt, cls] = NIVEL[a.nivel] || [a.nivel, ''];
  return `<li class="alerta-item ${a.nivel}">
    <div class="alerta-cab"><span class="chip ${cls}">${esc(txt)}</span> <span class="muted">${esc(TIPO[a.tipo] || a.tipo)}</span></div>
    <b>${esc(a.titulo)}</b>
    <div class="alerta-detalle">${esc(a.detalle)}</div>
    ${revisada ? `<div class="muted">Revisada por ${esc(a.revisada_por || '—')} el ${fecha(String(a.revisada_at).slice(0, 10))}${a.nota ? ` · «${esc(a.nota)}»` : ''}</div>` : ''}
    <div class="acciones">
      ${a.enlace ? `<a class="btn linea chico" href="${esc(a.enlace)}">Ver</a>` : ''}
      ${revisada ? `<button class="btn linea chico" type="button" data-reabrir="${esc(a.clave)}">Reabrir</button>`
        : `<button class="btn chico" type="button" data-revisar="${esc(a.clave)}">Marcar como revisada</button>`}
    </div>
  </li>`;
}

export async function vista(ctx, el) {
  if (ctx.demo) { el.innerHTML = `<h1>Alertas</h1><div class="tarjeta">${vacio('Vista previa sin datos.')}</div>`; return; }
  const c = ctx.condo.id;
  const { data: d, error } = await sb.rpc('alertas_edificio', { p_condo: c });
  if (error) throw error;
  el.innerHTML = `
    <div class="titulo-pagina"><h1>Alertas</h1>
      <p class="muted">Lo que el sistema encontró fuera de lo normal: gastos que suben mucho, facturas repetidas, pagos que no están en el banco,
        cuentas que no cuadran o deudas que vencen. Revísalas y deja una nota: queda el registro de quién lo vio y por qué.</p></div>
    <section class="tarjeta">
      ${d.alertas.length ? `<ul class="alertas-lista">${d.alertas.map((a) => htmlAlerta(a, false)).join('')}</ul>`
        : vacio('Todo en orden: no hay nada fuera de lo normal.')}
    </section>
    ${d.revisadas.length ? `
    <details class="tarjeta plegable">
      <summary><h2>Revisadas (${d.revisadas.length})</h2></summary>
      <ul class="alertas-lista">${d.revisadas.map((a) => htmlAlerta(a, true)).join('')}</ul>
    </details>` : ''}
    <div id="msgAl"></div>`;

  el.querySelectorAll('[data-revisar]').forEach((b) => (b.onclick = async () => {
    const nota = prompt('¿Qué encontraste? (opcional: queda en el registro)', '');
    if (nota === null) return;
    const { error: e } = await sb.rpc('revisar_alerta', { p_condo: c, p_clave: b.dataset.revisar, p_nota: nota });
    if (e) { el.querySelector('#msgAl').innerHTML = errorHtml(e); return; }
    toast('Alerta revisada', 'ok');
    vista(ctx, el);
  }));
  el.querySelectorAll('[data-reabrir]').forEach((b) => (b.onclick = async () => {
    const { error: e } = await sb.rpc('reabrir_alerta', { p_condo: c, p_clave: b.dataset.reabrir });
    if (e) { toast(e.message.includes('No autorizado') ? 'Solo la administración puede reabrir una alerta' : e.message, 'error'); return; }
    toast('Alerta reabierta', 'ok');
    vista(ctx, el);
  }));
}

// Cuántas alertas hay sin revisar (para la tarea de Inicio). Nunca rompe la pantalla.
export async function pendientes(condo) {
  const { data } = await sb.rpc('alertas_edificio', { p_condo: condo });
  return data ? { pendientes: data.pendientes, alta: data.alta } : { pendientes: 0, alta: 0 };
}
