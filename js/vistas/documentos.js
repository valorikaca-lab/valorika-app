// Documentos del edificio: reglamento, actas, convocatorias, contratos y pólizas.
// Los "para todos" los ven los propietarios; los internos, solo la junta, la
// administración y el abogado (la base lo hace cumplir, también en los archivos).
import { sb, esc, fecha, vacio, errorHtml, toast, nombreArchivo, urlFirmada, q, hoyVE } from '../util.js';

const CATEGORIAS = {
  reglamento: 'Reglamento', documento_condominio: 'Documento de condominio', acta: 'Actas de asamblea',
  convocatoria: 'Convocatorias', contrato: 'Contratos', poliza: 'Pólizas de seguro', otro: 'Otros',
};

export async function vista(ctx, el) {
  if (ctx.demo) { el.innerHTML = `<h1>Documentos</h1><div class="tarjeta">${vacio('Vista previa sin datos.')}</div>`; return; }
  const c = ctx.condo.id;
  const docs = await q(sb.from('documentos').select('id, categoria, titulo, fecha, archivo_url, visibilidad')
    .eq('condominio_id', c).order('fecha', { ascending: false, nullsFirst: false }));
  const puedeSubir = ['admin', 'junta', 'abogado'].includes(ctx.rol);
  const grupos = Object.keys(CATEGORIAS).map((k) => [k, docs.filter((d) => d.categoria === k)]).filter(([, l]) => l.length);

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Documentos</h1>
      <p class="muted">${ctx.rol === 'residente' ? 'El reglamento, las actas y las convocatorias de tu edificio.'
        : 'Reglamento, actas, convocatorias, contratos y pólizas del edificio, siempre a la mano.'}</p></div>
    <section class="tarjeta">
      ${grupos.length ? grupos.map(([k, l]) => `
        <h2 class="subtitulo">${CATEGORIAS[k]}</h2>
        <ul class="docs">${l.map((d) => `<li>
          <div><b>${esc(d.titulo)}</b>${d.visibilidad === 'junta' ? ' <span class="chip">Solo junta y administración</span>' : ''}
            <div class="muted">${d.fecha ? fecha(d.fecha) : ''}</div></div>
          <button class="btn linea chico" type="button" data-ver="${esc(d.archivo_url)}">Abrir</button></li>`).join('')}</ul>`).join('')
        : vacio('Todavía no hay documentos.')}
    </section>
    ${puedeSubir ? `
    <details class="tarjeta plegable">
      <summary><h2>Subir un documento</h2></summary>
      <form id="fDoc">
        <div class="fila">
          <div><label for="dCat">Tipo</label><select id="dCat">${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div><label for="dFecha">Fecha del documento</label><input id="dFecha" type="date" max="${hoyVE()}"></div>
        </div>
        <label for="dTitulo">Título</label><input id="dTitulo" required minlength="3" maxlength="200" placeholder="Ej.: Acta de asamblea de octubre">
        <label for="dVis">Quién lo ve</label>
        <select id="dVis"><option value="todos">Todos los propietarios</option><option value="junta">Solo junta, administración y abogado</option></select>
        <label for="dArchivo">Archivo (PDF o imagen, hasta 10 MB)</label><input id="dArchivo" type="file" accept="application/pdf,image/*" required>
        <div id="msgD"></div>
        <button class="btn" style="margin-top:12px">Subir documento</button>
      </form>
    </details>` : ''}`;

  el.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = async () => {
    const url = await urlFirmada('documentos', b.dataset.ver);
    if (url) window.open(url, '_blank', 'noopener'); else toast('No se encontró el archivo', 'error');
  }));
  el.querySelector('#fDoc')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button');
    b.disabled = true;
    try {
      const archivo = el.querySelector('#dArchivo').files[0];
      const vis = el.querySelector('#dVis').value;
      const ruta = `${c}/${vis}/${nombreArchivo(archivo)}`;
      const up = await sb.storage.from('documentos').upload(ruta, archivo);
      if (up.error) throw up.error;
      const { error } = await sb.from('documentos').insert({
        condominio_id: c, categoria: el.querySelector('#dCat').value, titulo: el.querySelector('#dTitulo').value.trim(),
        fecha: el.querySelector('#dFecha').value || null, archivo_url: ruta, visibilidad: vis, subido_por: ctx.usuario.id,
      });
      if (error) throw error;
      toast('Documento subido', 'ok');
      vista(ctx, el);
    } catch (err) { b.disabled = false; el.querySelector('#msgD').innerHTML = errorHtml(err); }
  });
}
