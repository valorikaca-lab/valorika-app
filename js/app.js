// Arranque, sesión, roles y navegación.
import { sb, configurado, esc, icono, tasaHoy, tiraTasaHtml, vigilarTasa } from './util.js';
import { vistaAcceso, vistaSinVinculo, vistaCrearCondominio } from './vistas/acceso.js';
import * as admin from './vistas/admin.js';
import * as junta from './vistas/junta.js';
import * as residente from './vistas/residente.js';
import * as cartelera from './vistas/cartelera.js';
import * as empresa from './vistas/empresa.js';
import * as recibo from './vistas/recibo.js';
import * as cuentas from './vistas/cuentas.js';
import * as config from './vistas/config.js';
import * as plataforma from './vistas/plataforma.js';
import * as recorrido from './recorrido.js'; // TEMPORAL: recorrido guiado

const app = document.getElementById('app');

// Menú por rol: [ruta, etiqueta, icono, pantalla]
const MENUS = {
  admin: [
    ['inicio', 'Inicio', 'inicio', admin.inicio],
    ['unidades', 'Apartamentos', 'edificio', admin.unidades],
    ['gastos', 'Gastos', 'gastos', admin.gastos],
    ['pagos', 'Pagos', 'pagos', admin.pagos],
    ['recibos', 'Recibos', 'recibos', admin.recibos],
    ['cuentas', 'Cuentas del edificio', 'cuentas', cuentas.vista],
    ['cartelera', 'Cartelera', 'cartelera', cartelera.vista],
    ['reportes', 'Reportes', 'reportes', admin.reportes],
    ['config', 'Configuración', 'ajustes', config.vista],
  ],
  junta: [
    ['inicio', 'Inicio', 'inicio', junta.inicio],
    ['aprobar', 'Aprobar gastos', 'aprobar', junta.aprobar],
    ['cuentas', 'Cuentas del edificio', 'cuentas', cuentas.vista],
    ['recibos', 'Recibos', 'recibos', admin.recibos],
    ['cartelera', 'Cartelera', 'cartelera', cartelera.vista],
    ['reportes', 'Reportes', 'reportes', admin.reportes],
  ],
  residente: [
    ['inicio', 'Mi cuenta', 'inicio', residente.inicio],
    ['pagar', 'Reportar pago', 'pagos', residente.pagar],
    ['recibos', 'Mis recibos', 'recibos', residente.recibos],
    ['cuentas', 'Cuentas del edificio', 'cuentas', cuentas.vista],
    ['cartelera', 'Cartelera', 'cartelera', cartelera.vista],
  ],
};
const MENU_DUENA = ['empresa', 'Mi empresa', 'empresa', empresa.vista];
const MENU_PLATAFORMA = ['plataforma', 'Plataforma', 'reportes', plataforma.vista];

const guardar = (k, v) => { try { localStorage.setItem('valorika.' + k, v); } catch {} };
const leer = (k) => { try { return localStorage.getItem('valorika.' + k); } catch { return null; } };

// Contexto de la sesión: usuario, condominios visibles y roles en cada uno.
export const ctx = { usuario: null, perfil: null, orgs: [], condominios: [], condo: null, roles: [], rol: null, demo: false };

const nombreRol = (r) => (r === 'admin' ? (ctx.esDuena ? 'Dueña' : 'Administración') : r === 'junta' ? 'Junta de condominio' : 'Propietario');

async function cargarContexto() {
  const { data: { user } } = await sb.auth.getUser();
  ctx.usuario = user;
  await sb.rpc('vincular_mi_cuenta');

  const [perfil, orgs, condos, miembros, personas] = await Promise.all([
    sb.from('perfiles').select('*').eq('id', user.id).maybeSingle(),
    sb.from('organizacion_miembros').select('organizacion_id, rol').eq('usuario_id', user.id),
    sb.from('condominios').select('id, nombre, organizacion_id, rif, tipo').eq('activo', true).order('nombre'),
    sb.from('condominio_miembros').select('condominio_id, rol, cargo').eq('usuario_id', user.id),
    sb.from('personas').select('id, condominio_id, nombre').eq('usuario_id', user.id),
  ]);
  ctx.perfil = perfil.data;
  ctx.orgs = orgs.data || [];
  ctx.personas = personas.data || [];
  const orgIds = new Set(ctx.orgs.map((o) => o.organizacion_id));
  const superAdmin = Boolean(ctx.perfil?.es_super_admin);

  ctx.condominios = (condos.data || []).map((c) => {
    const roles = [];
    const m = (miembros.data || []).filter((x) => x.condominio_id === c.id);
    if (superAdmin || orgIds.has(c.organizacion_id) || m.some((x) => x.rol === 'admin')) roles.push('admin');
    if (m.some((x) => x.rol === 'junta')) roles.push('junta');
    if (ctx.personas.some((p) => p.condominio_id === c.id)) roles.push('residente');
    return { ...c, roles, cargo: m.find((x) => x.rol === 'junta')?.cargo };
  }).filter((c) => c.roles.length);

  ctx.condo = ctx.condominios.find((c) => c.id === leer('condo')) || ctx.condominios[0] || null;
  elegirRol(leer('rol'));
}

function elegirRol(preferido) {
  ctx.roles = ctx.condo?.roles || [];
  ctx.rol = ctx.roles.includes(preferido) ? preferido : ctx.roles[0] || null;
  ctx.esDuena = Boolean(ctx.condo && ctx.orgs.some((o) => o.rol === 'dueno' && o.organizacion_id === ctx.condo.organizacion_id));
  ctx.esEjemplo = Boolean(ctx.condo?.nombre?.includes('(ejemplo)'));
}

function menuActual() {
  // En un parcelamiento las unidades son casas.
  const m = MENUS[ctx.rol].map((x) => (x[0] === 'unidades' && ctx.condo?.tipo === 'parcelamiento' ? ['unidades', 'Casas', x[2], x[3]] : x));
  if (ctx.rol === 'admin' && ctx.esDuena) m.splice(1, 0, MENU_DUENA);
  if (ctx.rol === 'admin' && ctx.perfil?.es_super_admin) m.unshift(MENU_PLATAFORMA);
  return m;
}

function shell() {
  const menu = menuActual();
  const [ruta, param] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/');
  let item = menu.find((m) => m[0] === ruta) || menu[0];
  let pantalla = item[3];
  if (ruta === 'recibo' && param) {
    item = menu.find((m) => m[0] === 'recibos') || menu[0];
    pantalla = (c, el) => recibo.detalle(c, el, param);
  }

  const selCondo = ctx.condominios.length > 1
    ? `<select id="selCondo" aria-label="Condominio">${ctx.condominios.map((c) =>
        `<option value="${c.id}" ${c.id === ctx.condo.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>`
    : `<span class="barra-condo">${esc(ctx.condo.nombre)}</span>`;
  const selRol = ctx.roles.length > 1
    ? `<select id="selRol" aria-label="Ver como">${ctx.roles.map((r) =>
        `<option value="${r}" ${r === ctx.rol ? 'selected' : ''}>${nombreRol(r)}</option>`).join('')}</select>`
    : `<span class="barra-rol">${nombreRol(ctx.rol)}</span>`;

  app.innerHTML = `
    <header class="barra">
      <div class="marca">${icono.logo}<div>VALÓRIKA<small>GESTIÓN INTELIGENTE</small></div></div>
      <div class="barra-der">
        <div class="barra-quien">${selCondo}${selRol}</div>
        ${ctx.demo ? '' : `<a href="#" id="btnSalir" title="Salir" aria-label="Salir" class="barra-salir">${icono.salir}</a>`}
      </div>
    </header>
    <div id="tiraTasa" class="tira-tasa"></div>
    ${ctx.esEjemplo ? '<div class="tira-ejemplo">Edificio de ejemplo · todos los datos son ficticios</div>' : ''}
    <div class="layout">
      <nav class="nav">${menu.map(([r, txt, ic]) =>
        `<a href="#/${r}" class="${r === item[0] ? 'activo' : ''}">${icono[ic]}<span>${txt}</span></a>`).join('')}</nav>
      <main id="vista"><div class="skeleton bloque"></div><div class="skeleton linea"></div></main>
    </div>`;

  document.getElementById('btnSalir')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (sb) await sb.auth.signOut();
    location.hash = '';
    location.reload();
  });
  document.getElementById('selCondo')?.addEventListener('change', (e) => {
    ctx.condo = ctx.condominios.find((c) => c.id === e.target.value);
    guardar('condo', ctx.condo.id);
    elegirRol(ctx.rol);
    location.hash = '#/inicio';
    shell();
  });
  document.getElementById('selRol')?.addEventListener('change', (e) => {
    elegirRol(e.target.value);
    guardar('rol', ctx.rol);
    location.hash = '#/inicio';
    shell();
  });

  tasaHoy().then(() => {
    const tira = document.getElementById('tiraTasa');
    if (tira) tira.innerHTML = tiraTasaHtml();
  });

  const vista = document.getElementById('vista');
  window.scrollTo(0, 0);
  Promise.resolve(pantalla(ctx, vista)).catch((err) => {
    console.error(err);
    vista.innerHTML = `<div class="aviso error">${esc(err.message || err)}</div>`;
  }).finally(() => recorrido.pintar());
}

// Vista previa sin datos (?demo=admin|junta|residente).
function arrancarDemo(rol) {
  ctx.demo = true;
  ctx.condominios = [{ id: 'demo', nombre: 'Vista previa', roles: ['admin', 'junta', 'residente'] }];
  ctx.condo = ctx.condominios[0];
  elegirRol(rol);
  shell();
}

// Un solo arranque a la vez (el login y el aviso de sesión pueden llegar juntos).
let arrancando = null;
function arrancar() {
  if (!arrancando) arrancando = arrancarAhora().finally(() => { arrancando = null; });
  return arrancando;
}

async function arrancarAhora() {
  const [ruta, param] = location.hash.replace(/^#\/?/, '').split('/');
  if (ruta === 'verificar' && param) return recibo.verificar(app, param);
  // Recibo por enlace (lo que le llega al propietario por correo): sin cuenta.
  if (ruta === 'r' && param) { await recibo.publico(app, param); recorrido.pintar(); return; }

  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) return arrancarDemo(demo);

  if (!configurado) {
    vistaAcceso(app, { aviso: 'Falta configurar Supabase en js/config.js.' });
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    vistaAcceso(app, { alEntrar: arrancar });
    return;
  }

  await cargarContexto();
  if (!ctx.condo) {
    // Equipo o junta de un cliente suspendido: avisarlo en vez de una pantalla vacía.
    const { data: suyas } = await sb.rpc('mis_organizaciones');
    const suspendidas = (suyas || []).filter((o) => ['suspendida', 'cancelada'].includes(o.estado));
    if (suspendidas.length) return plataforma.vistaSuspendida(app, suspendidas);
    if (ctx.orgs.length) return vistaCrearCondominio(app, ctx, arrancar);
    return vistaSinVinculo(app, ctx, arrancar);
  }
  shell();
}

window.addEventListener('hashchange', () => {
  const [ruta] = location.hash.replace(/^#\/?/, '').split('/');
  if (ruta === 'verificar' || ruta === 'r') return arrancar();
  if (ctx.rol) shell();
});
// Enlace mágico del correo: al volver con la sesión, entrar directo.
sb?.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_IN' && !ctx.usuario) setTimeout(arrancar, 0); });

vigilarTasa();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

arrancar();
