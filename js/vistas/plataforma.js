// Panel de la plataforma (superadministradora): clientes, planes, suspensión y
// cifras de toda la plataforma. También la pantalla de cuenta suspendida.
import { sb, esc, usd, fecha, toast, errorHtml, vacio, icono } from '../util.js';

const PLANES = { prueba: 'Prueba', basico: 'Básico', profesional: 'Profesional', empresa: 'Empresa' };
const ESTADOS = { prueba: ['En prueba', 'oro'], activa: ['Activa', 'ok'], suspendida: ['Suspendida', 'error'], cancelada: ['Cancelada', 'error'] };
const TIPOS = { residencial: 'Residencial', comercial: 'Comercial', mixto: 'Mixto', corporativo: 'Corporativo', parcelamiento: 'Parcelamiento (casas)' };

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
}
const opciones = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(Array.isArray(v) ? v[0] : v)}</option>`).join('');

function htmlCliente(c) {
  const [txt, cls] = ESTADOS[c.estado] || [c.estado, ''];
  const duenas = c.duenos.map((d) => d.nombre === d.email ? d.email : `${d.nombre} · ${d.email}`).join(', ') || 'Sin dueña asignada';
  return `<li class="cliente">
    <details>
      <summary>
        <div class="cliente-nombre"><b>${esc(c.nombre)}</b>${c.ejemplo ? ' <span class="chip">Ejemplo</span>' : ''}
          <div class="muted">${esc(duenas)}</div></div>
        <div class="cliente-cifras"><span class="chip ${cls}">${esc(txt)}</span>
          <span class="muted">${esc(PLANES[c.plan] || c.plan)} · ${c.condominios.length} de ${c.max_condominios} condominios · ${c.unidades} unidades</span></div>
      </summary>
      <div class="cliente-detalle">
        <p class="muted">Alta: ${fecha(String(c.created_at).slice(0, 10))}${c.rif ? ` · RIF ${esc(c.rif)}` : ''} · Emitido este mes: ${usd(c.emitido_mes_usd)}
          ${c.estado === 'prueba' && c.prueba_hasta ? ` · Prueba hasta el ${fecha(c.prueba_hasta)}` : ''}<br>
          Condominios: ${c.condominios.map((x) => esc(x.nombre)).join(', ') || 'ninguno'}</p>
        ${c.ejemplo ? '<p class="muted">El cliente de ejemplo se reinicia solo cada noche; no se modifica.</p>' : `
        <form class="fCliente" data-id="${c.id}">
          <div class="fila3">
            <div><label>Estado</label><select name="estado">${opciones(ESTADOS, c.estado)}</select></div>
            <div><label>Plan</label><select name="plan">${opciones(PLANES, c.plan)}</select></div>
            <div><label>Condominios permitidos</label><input name="max" type="number" min="1" max="500" value="${c.max_condominios}" required></div>
          </div>
          <p class="muted">Suspendida o cancelada: su equipo y su junta no entran; los propietarios siguen viendo sus recibos.</p>
          <button class="btn chico">Guardar cambios</button>
        </form>`}
      </div>
    </details>
  </li>`;
}

export async function vista(ctx, el) {
  const [res, clientes] = await Promise.all([rpc('plataforma_resumen'), rpc('plataforma_clientes')]);
  const cl = res.clientes || {};
  const reales = clientes.filter((c) => !c.ejemplo);
  el.innerHTML = `
    <div class="titulo-pagina"><h1>Plataforma</h1>
      <p class="muted">Todos los clientes de Valórika. Las cifras no cuentan el edificio de ejemplo.</p></div>
    <div class="kpis">
      <div class="kpi"><div class="etiqueta">Clientes activos</div><div class="valor">${cl.activa || 0}</div></div>
      <div class="kpi"><div class="etiqueta">En prueba</div><div class="valor">${cl.prueba || 0}</div></div>
      <div class="kpi"><div class="etiqueta">Suspendidos</div><div class="valor">${(cl.suspendida || 0) + (cl.cancelada || 0)}</div></div>
      <div class="kpi"><div class="etiqueta">Condominios</div><div class="valor">${res.condominios}</div></div>
      <div class="kpi"><div class="etiqueta">Unidades</div><div class="valor">${res.unidades}</div></div>
      <div class="kpi"><div class="etiqueta">Emitido este mes</div><div class="valor">${usd(res.emitido_mes_usd)}</div></div>
      <div class="kpi"><div class="etiqueta">Cobrado este mes</div><div class="valor">${usd(res.cobrado_mes_usd)}</div></div>
      <div class="kpi"><div class="etiqueta">Pagos por revisar</div><div class="valor">${res.pagos_por_revisar}</div></div>
    </div>
    <section class="tarjeta">
      <h2>Clientes</h2>
      <p class="muted">Cada cliente es una administradora (o un condominio que se administra solo). Toca uno para cambiar su plan o suspenderlo.</p>
      ${clientes.length ? `<ul class="lista-clientes">${clientes.map(htmlCliente).join('')}</ul>` : vacio('Todavía no hay clientes.')}
    </section>
    <details class="tarjeta plegable">
      <summary><h2>Nuevo cliente</h2></summary>
      <form id="fNuevoCliente">
        <p class="muted">La dueña debe crear primero su cuenta con su correo ("Crear cuenta" en la entrada). Si se registra sola, aparece aquí en prueba por 30 días.</p>
        <div class="fila"><div><label for="ncNombre">Nombre de la administradora</label><input id="ncNombre" required></div>
          <div><label for="ncRif">RIF</label><input id="ncRif" placeholder="J-12345678-9"></div></div>
        <div class="fila3"><div><label for="ncCorreo">Correo de la dueña</label><input id="ncCorreo" type="email" required></div>
          <div><label for="ncPlan">Plan</label><select id="ncPlan">${opciones(PLANES, 'basico')}</select></div>
          <div><label for="ncMax">Condominios permitidos</label><input id="ncMax" type="number" min="1" max="500" value="1" required></div></div>
        <div id="msgNc"></div>
        <button class="btn" style="margin-top:12px">Crear cliente</button>
      </form>
    </details>
    <details class="tarjeta plegable">
      <summary><h2>Nuevo condominio para un cliente</h2></summary>
      ${reales.length ? `<form id="fNuevoCondo">
        <div class="fila"><div><label for="ndCliente">Cliente</label><select id="ndCliente">${reales.map((c) => `<option value="${c.id}">${esc(c.nombre)} (${c.condominios.length} de ${c.max_condominios})</option>`).join('')}</select></div>
          <div><label for="ndTipo">Tipo</label><select id="ndTipo">${opciones(TIPOS, 'residencial')}</select></div></div>
        <div class="fila"><div><label for="ndNombre">Nombre del condominio</label><input id="ndNombre" required></div>
          <div><label for="ndRif">RIF del condominio</label><input id="ndRif" required placeholder="J-12345678-9"></div></div>
        <div id="msgNd"></div>
        <button class="btn" style="margin-top:12px">Crear condominio</button>
      </form>` : vacio('Primero crea un cliente.')}
    </details>`;

  el.querySelectorAll('.fCliente').forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const b = f.querySelector('button');
      b.disabled = true;
      try {
        await rpc('plataforma_actualizar_cliente', { p_org: f.dataset.id, p_estado: f.estado.value, p_plan: f.plan.value, p_max: Number(f.max.value) });
        toast('Cliente actualizado', 'ok');
        vista(ctx, el);
      } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    };
  });
  const v = (id) => el.querySelector('#' + id).value.trim();
  el.querySelector('#fNuevoCliente').onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button');
    b.disabled = true;
    try {
      await rpc('plataforma_crear_cliente', { p_nombre: v('ncNombre'), p_rif: v('ncRif'), p_correo: v('ncCorreo'), p_plan: v('ncPlan'), p_max: Number(v('ncMax')) });
      toast('Cliente creado. Ya puede entrar con su correo.', 'ok');
      vista(ctx, el);
    } catch (err) { b.disabled = false; el.querySelector('#msgNc').innerHTML = errorHtml(err); }
  };
  el.querySelector('#fNuevoCondo')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button');
    b.disabled = true;
    try {
      await rpc('plataforma_crear_condominio', { p_org: v('ndCliente'), p_nombre: v('ndNombre'), p_rif: v('ndRif'), p_tipo: v('ndTipo') });
      toast('Condominio creado para el cliente', 'ok');
      vista(ctx, el);
    } catch (err) { b.disabled = false; el.querySelector('#msgNd').innerHTML = errorHtml(err); }
  });
}

// Se muestra al equipo de un cliente suspendido o cancelado.
export function vistaSuspendida(app, orgs) {
  const cancelada = orgs.every((o) => o.estado === 'cancelada');
  app.innerHTML = `
    <header class="barra"><div class="marca">${icono.logo}<div>VALÓRIKA<small>GESTIÓN INTELIGENTE</small></div></div></header>
    <main><section class="tarjeta" style="max-width:560px;margin:32px auto">
      <h1>Cuenta ${cancelada ? 'cancelada' : 'suspendida'}</h1>
      <p>La cuenta de <b>${orgs.map((o) => esc(o.nombre)).join(', ')}</b> está ${cancelada ? 'cancelada' : 'suspendida'}.
        Mientras tanto, el equipo y la junta no pueden entrar; los propietarios siguen viendo sus recibos.</p>
      <p class="muted">Para reactivarla, comunícate con Valórika.</p>
      <button class="btn linea" id="btnSalirSusp" type="button">Salir</button>
    </section></main>`;
  app.querySelector('#btnSalirSusp').onclick = async () => {
    await sb.auth.signOut();
    location.hash = '';
    location.reload();
  };
}
