// Cartelera virtual: la administración y la junta publican; los propietarios leen.
import { sb, esc, fecha, vacio, errorHtml, q, toast } from '../util.js';

export async function vista(ctx, el) {
  const publica = ctx.rol === 'admin' || ctx.rol === 'junta';
  const anuncios = ctx.demo ? [] : await q(sb.from('anuncios').select('id, titulo, cuerpo, importante, publicado_desde')
    .eq('condominio_id', ctx.condo.id).order('importante', { ascending: false }).order('publicado_desde', { ascending: false }).limit(30));

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Cartelera</h1><p class="muted">Comunicados para todo el edificio.</p></div>
    ${anuncios.length ? anuncios.map((a) => `
      <article class="tarjeta anuncio ${a.importante ? 'importante' : ''}">
        ${a.importante ? '<span class="chip oro">Importante</span>' : ''}
        <h2>${esc(a.titulo)}</h2><div class="muted">${fecha(a.publicado_desde.slice(0, 10))}</div>
        <p style="white-space:pre-line">${esc(a.cuerpo)}</p>
      </article>`).join('') : `<div class="tarjeta">${vacio('No hay comunicados publicados.')}</div>`}
    ${publica ? `
    <details class="tarjeta plegable">
      <summary><h2>Publicar un comunicado</h2></summary>
      <form id="fAnuncio">
        <label for="aTit">Título</label><input id="aTit" required maxlength="120">
        <label for="aCue">Mensaje</label><textarea id="aCue" rows="5" required></textarea>
        <label class="check"><input type="checkbox" id="aImp"> Marcar como importante</label>
        <div id="msgC"></div>
        <button class="btn" style="margin-top:12px">Publicar</button>
      </form>
    </details>` : ''}`;

  el.querySelector('#fAnuncio')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.from('anuncios').insert({
      condominio_id: ctx.condo.id, titulo: el.querySelector('#aTit').value.trim(),
      cuerpo: el.querySelector('#aCue').value.trim(), importante: el.querySelector('#aImp').checked, creado_por: ctx.usuario.id,
    });
    if (error) { el.querySelector('#msgC').innerHTML = errorHtml(error); return; }
    toast('Comunicado publicado: ya lo ven todos los propietarios', 'ok');
    vista(ctx, el);
  });
}
