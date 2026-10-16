// "Mi empresa": lo que ve la dueña de la administradora. Todos sus edificios,
// la cobranza del negocio y su equipo.
import { sb, esc, usd, pct, periodoTxt, vacio, q } from '../util.js';

const PLAN = { prueba: 'Prueba', basico: 'Básico', profesional: 'Profesional', empresa: 'Empresa' };

const PERMISOS = [
  ['Ver todos los edificios y la cobranza del negocio', true, false, false, false],
  ['Cargar apartamentos, propietarios y gastos', true, true, false, false],
  ['Confirmar o rechazar pagos', true, true, false, false],
  ['Emitir los recibos del mes', true, true, false, false],
  ['Aprobar o rechazar gastos', true, true, true, false],
  ['Ver cuentas, reportes y morosidad del edificio', true, true, true, false],
  ['Publicar en la cartelera', true, true, true, false],
  ['Ver su deuda, sus recibos y reportar pagos', false, false, false, true],
];

export async function vista(ctx, el) {
  const orgId = ctx.condo.organizacion_id;
  const condos = ctx.condominios.filter((c) => c.organizacion_id === orgId);
  const ids = condos.map((c) => c.id);
  const [[org], mor, rec, alic, miembros, juntas] = await Promise.all([
    q(sb.from('organizaciones').select('nombre, rif, plan, estado, max_condominios, prueba_hasta').eq('id', orgId)),
    q(sb.from('v_morosidad_antiguedad').select('*').in('condominio_id', ids)),
    q(sb.from('v_recaudacion_mensual').select('*').in('condominio_id', ids).order('anio', { ascending: false }).order('mes', { ascending: false })),
    q(sb.from('v_alicuotas').select('*').in('condominio_id', ids)),
    q(sb.from('organizacion_miembros').select('usuario_id, rol').eq('organizacion_id', orgId)),
    q(sb.from('condominio_miembros').select('usuario_id, rol, cargo, condominio_id').in('condominio_id', ids)),
  ]);
  const uids = [...new Set([...miembros, ...juntas].map((m) => m.usuario_id))];
  const perfiles = uids.length ? await q(sb.from('perfiles').select('id, nombre, email').in('id', uids)) : [];
  const perfil = Object.fromEntries(perfiles.map((p) => [p.id, p]));
  const vencidoDe = (m) => ['d1_30_usd', 'd31_60_usd', 'd61_90_usd', 'd90_mas_usd'].reduce((a, k) => a + Number(m?.[k] || 0), 0);
  const ultimoDe = (id) => rec.find((r) => r.condominio_id === id);

  const filas = condos.map((c) => {
    const m = mor.find((x) => x.condominio_id === c.id);
    const r = ultimoDe(c.id);
    return { c, aptos: alic.find((a) => a.condominio_id === c.id)?.unidades || 0, r, vencido: vencidoDe(m), morosos: m?.unidades_morosas || 0 };
  });
  const tot = (k) => filas.reduce((a, f) => a + Number(k(f) || 0), 0);
  const facturado = tot((f) => f.r?.facturado_usd);
  const cobrado = tot((f) => f.r?.cobrado_usd);
  const nombreDe = (id) => condos.find((c) => c.id === id)?.nombre || '';

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Mi empresa</h1>
      <p class="muted">${esc(org?.nombre)} · RIF ${esc(org?.rif || '—')} · plan ${PLAN[org?.plan] || org?.plan} (${condos.length} de ${org?.max_condominios} edificios)</p></div>
    <div class="kpis">
      <div class="kpi"><div class="etiqueta">Edificios</div><div class="valor">${condos.length}</div></div>
      <div class="kpi"><div class="etiqueta">Apartamentos</div><div class="valor">${tot((f) => f.aptos)}</div></div>
      <div class="kpi"><div class="etiqueta">Cobrado del último mes</div><div class="valor">${pct(facturado ? (100 * cobrado) / facturado : 0)}</div></div>
      <div class="kpi"><div class="etiqueta">Deuda vencida total</div><div class="valor">${usd(tot((f) => f.vencido))}</div></div>
    </div>
    <section class="tarjeta scroll-x">
      <h2>Edificios</h2>
      <table class="tabla"><thead><tr><th>Edificio</th><th class="num">Aptos</th><th>Último mes</th><th class="num">Vencido</th><th class="num">Morosos</th></tr></thead><tbody>
        ${filas.map((f) => `<tr><td><b>${esc(f.c.nombre)}</b></td><td class="num">${f.aptos}</td>
          <td>${f.r ? `${periodoTxt(f.r)}: ${pct(f.r.pct_cobrado)} cobrado<div class="muted">${usd(f.r.cobrado_usd)} de ${usd(f.r.facturado_usd)}</div>` : '—'}</td>
          <td class="num">${usd(f.vencido)}</td><td class="num">${f.morosos}</td></tr>`).join('')}
      </tbody></table>
    </section>
    <section class="tarjeta">
      <h2>Equipo</h2>
      <ul class="equipo">
        ${miembros.map((m) => `<li><b>${esc(perfil[m.usuario_id]?.nombre || 'Sin nombre')}</b>
          <span class="chip ${m.rol === 'dueno' ? 'oro' : ''}">${m.rol === 'dueno' ? 'Dueña' : 'Trabajadora'}</span>
          <div class="muted">${esc(perfil[m.usuario_id]?.email || '')} · todos los edificios</div></li>`).join('')}
        ${juntas.map((m) => `<li><b>${esc(perfil[m.usuario_id]?.nombre || 'Sin nombre')}</b>
          <span class="chip">${m.rol === 'junta' ? 'Junta' : 'Administración'}${m.cargo ? ' · ' + esc(m.cargo) : ''}</span>
          <div class="muted">${esc(perfil[m.usuario_id]?.email || '')} · ${esc(nombreDe(m.condominio_id))}</div></li>`).join('')}
      </ul>
      <p class="muted">Invitar trabajadoras y juntas por correo llega en la siguiente fase.</p>
    </section>
    <section class="tarjeta scroll-x">
      <h2>Qué puede hacer cada quien</h2>
      <table class="tabla permisos"><thead><tr><th></th><th>Dueña</th><th>Trabajadora</th><th>Junta</th><th>Propietario</th></tr></thead><tbody>
        ${PERMISOS.map(([txt, ...si]) => `<tr><td>${txt}</td>${si.map((s) => `<td class="centro">${s ? '<span class="si">Sí</span>' : '<span class="no">—</span>'}</td>`).join('')}</tr>`).join('')}
      </tbody></table>
    </section>
    ${condos.length ? '' : `<div class="tarjeta">${vacio('Todavía no tienes edificios.')}</div>`}`;
}
