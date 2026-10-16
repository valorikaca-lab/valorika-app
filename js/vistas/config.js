// Configuración del edificio (administración): datos, recibos y cobranza, mora,
// texto legal (edificios o parcelamientos), cuentas bancarias y proveedores.
import { sb, esc, vacio, errorHtml, q, toast, nombreArchivo } from '../util.js';

export const TEXTO_LEGAL = {
  lph: 'El presente recibo, emitido conforme al Artículo 14 de la Ley de Propiedad Horizontal, tiene fuerza ejecutiva y constituye título suficiente para el cobro judicial de las cantidades adeudadas por concepto de gastos comunes.',
  parcelamiento: 'El presente recibo se emite conforme al documento de parcelamiento de la urbanización y a la normativa venezolana aplicable a los parcelamientos, y constituye soporte para el cobro de las contribuciones adeudadas por concepto de mantenimiento y servicios comunes.',
};
const TIPOS = [['residencial', 'Edificio residencial'], ['comercial', 'Centro comercial u oficinas'], ['mixto', 'Mixto'], ['corporativo', 'Corporativo'], ['parcelamiento', 'Parcelamiento o urbanización de casas']];
const CONTRATOS = [['servicios_profesionales', 'Servicios profesionales'], ['outsourcing', 'Empresa de outsourcing'], ['obra', 'Contrato de obra'], ['suministro', 'Suministro o servicio público']];
const TIPOS_CUENTA = [['corriente', 'Cuenta corriente'], ['ahorro', 'Cuenta de ahorro'], ['pago_movil', 'Pago móvil'], ['zelle', 'Zelle'], ['divisas', 'Cuenta en divisas']];
const opciones = (lista, actual) => lista.map(([v, t]) => `<option value="${v}" ${v === actual ? 'selected' : ''}>${t}</option>`).join('');

export async function vista(ctx, el) {
  if (ctx.demo) { el.innerHTML = `<h1>Configuración</h1><div class="tarjeta">${vacio('Vista previa sin datos.')}</div>`; return; }
  const c = ctx.condo.id;
  const [[condo], cuentas, proveedores] = await Promise.all([
    q(sb.from('condominios').select('*').eq('id', c)),
    q(sb.from('cuentas_bancarias').select('*').eq('condominio_id', c).order('created_at')),
    q(sb.from('proveedores').select('*').eq('condominio_id', c).order('razon_social')),
  ]);

  el.innerHTML = `
    <div class="titulo-pagina"><h1>Configuración</h1><p class="muted">Los datos del edificio, cómo se emiten y cobran los recibos, y dónde pagan los propietarios.</p></div>
    <div id="msgCfg"></div>
    <form class="tarjeta" id="fDatos">
      <h2>Datos del edificio</h2>
      <div class="fila"><div><label>Nombre</label><input name="nombre" required value="${esc(condo.nombre)}"></div>
        <div><label>RIF</label><input name="rif" required value="${esc(condo.rif)}"></div></div>
      <label>Tipo</label><select name="tipo">${opciones(TIPOS, condo.tipo)}</select>
      <div class="fila"><div><label>Dirección</label><input name="direccion" value="${esc(condo.direccion || '')}"></div>
        <div><label>Ciudad</label><input name="ciudad" value="${esc(condo.ciudad || '')}"></div></div>
      <button class="btn" style="margin-top:14px">Guardar datos</button>
    </form>

    <form class="tarjeta" id="fCobro">
      <h2>Recibos y cobranza</h2>
      <div class="fila3">
        <div><label>Día de emisión</label><input name="dia_emision" type="number" min="1" max="28" required value="${condo.dia_emision}"></div>
        <div><label>Días para pagar</label><input name="dias_para_vencer" type="number" min="1" max="60" required value="${condo.dias_para_vencer}"></div>
        <div><label>Fondo de reserva (%)</label><input name="fondo_reserva_pct" type="number" min="0" max="100" step="0.01" required value="${condo.fondo_reserva_pct}"></div>
      </div>
      <label class="check"><input type="checkbox" name="emision_automatica" ${condo.emision_automatica ? 'checked' : ''}> Emitir los recibos automáticamente cuando la junta apruebe todo</label>
      <div class="fila">
        <div><label>Mora a los que pagan tarde</label><select name="mora_tipo">
          ${opciones([['ninguna', 'No cobrar mora'], ['interes', 'Interés mensual (por días de atraso)'], ['recargo', 'Recargo único por recibo vencido']], condo.mora_tipo)}</select></div>
        <div><label>Porcentaje de mora (%)</label><input name="mora_pct" type="number" min="0" max="50" step="0.01" value="${condo.mora_pct}"></div>
      </div>
      <p class="muted">La mora se suma en el recibo siguiente, nunca sobre la mora anterior. El porcentaje debe ser el que fije el documento de condominio o la asamblea. La deuda ya está en dólares: si alguien paga tarde en bolívares, paga a la tasa BCV del día (eso es la indexación).</p>
      <button class="btn" style="margin-top:8px">Guardar</button>
    </form>

    <form class="tarjeta" id="fLegal">
      <h2>Texto legal del recibo</h2>
      <textarea name="texto_legal_recibo" rows="4" required>${esc(condo.texto_legal_recibo)}</textarea>
      <div class="acciones">
        <button type="button" class="btn linea chico" data-legal="lph">Usar texto para edificios (LPH, Art. 14)</button>
        <button type="button" class="btn linea chico" data-legal="parcelamiento">Usar texto para parcelamientos</button>
      </div>
      <p class="muted">Sale en cada recibo nuevo. Para parcelamientos, confirma con tu abogado el artículo exacto que aplica y escríbelo aquí.</p>
      <button class="btn" style="margin-top:8px">Guardar texto</button>
    </form>

    <section class="tarjeta">
      <h2>Cuentas para recibir pagos</h2>
      ${cuentas.length ? `<ul class="equipo">${cuentas.map((x) => `<li>
        <b>${esc(TIPOS_CUENTA.find((t) => t[0] === x.tipo)?.[1] || x.tipo)}</b> · ${esc(x.banco)} ${x.numero ? '· ' + esc(x.numero) : ''}${x.telefono_pago_movil ? '· ' + esc(x.telefono_pago_movil) : ''}${x.email_zelle ? '· ' + esc(x.email_zelle) : ''}
        <span class="chip ${x.activa ? 'ok' : ''}">${x.activa ? 'Visible para los propietarios' : 'Oculta'}</span>
        <div class="muted">${esc(x.titular)} ${x.rif_titular ? '· ' + esc(x.rif_titular) : ''} · ${x.moneda === 'USD' ? 'dólares' : 'bolívares'}
          <button type="button" class="btn linea chico" data-cuenta="${x.id}" data-activa="${x.activa}">${x.activa ? 'Ocultar' : 'Mostrar'}</button></div></li>`).join('')}</ul>` : vacio('Todavía no hay cuentas.')}
      <details class="plegable" style="margin-top:12px"><summary><h2>Agregar una cuenta</h2></summary>
        <form id="fCuenta">
          <div class="fila"><div><label>Tipo</label><select name="tipo">${opciones(TIPOS_CUENTA, 'corriente')}</select></div>
            <div><label>Banco</label><input name="banco" required placeholder="Banesco, Mercantil, Zelle..."></div></div>
          <div class="fila"><div><label>Número de cuenta (20 dígitos)</label><input name="numero" inputmode="numeric" pattern="[0-9]{20}"></div>
            <div><label>Titular</label><input name="titular" required value="${esc(condo.nombre)}"></div></div>
          <div class="fila3"><div><label>RIF del titular</label><input name="rif_titular" value="${esc(condo.rif)}"></div>
            <div><label>Teléfono (pago móvil)</label><input name="telefono_pago_movil" inputmode="tel"></div>
            <div><label>Correo (Zelle)</label><input name="email_zelle" type="email"></div></div>
          <label>Moneda</label><select name="moneda"><option value="VES">Bolívares</option><option value="USD">Dólares</option></select>
          <button class="btn" style="margin-top:12px">Agregar cuenta</button>
        </form>
      </details>
    </section>

    <section class="tarjeta">
      <h2>Proveedores</h2>
      <p class="muted">Siempre como contratistas independientes (servicios profesionales, obra o outsourcing), con su RIF vigente: así el edificio no tiene nómina ni pasivo laboral.</p>
      ${proveedores.length ? `<ul class="equipo">${proveedores.map((p) => `<li><b>${esc(p.razon_social)}</b> · RIF ${esc(p.rif)}
        <span class="chip">${esc(CONTRATOS.find((t) => t[0] === p.tipo_contrato)?.[1] || p.tipo_contrato)}</span>
        ${p.rif_vence && p.rif_vence < new Date().toISOString().slice(0, 10) ? '<span class="chip error">RIF vencido</span>' : ''}
        <div class="muted">${esc(p.servicio || '')}${p.email ? ' · ' + esc(p.email) : ''}${p.rif_vence ? ' · RIF vence ' + esc(p.rif_vence) : ''}</div></li>`).join('')}</ul>` : vacio('Todavía no hay proveedores.')}
      <details class="plegable" style="margin-top:12px"><summary><h2>Agregar un proveedor</h2></summary>
        <form id="fProv">
          <div class="fila"><div><label>Razón social o nombre</label><input name="razon_social" required></div>
            <div><label>RIF</label><input name="rif" required placeholder="J-12345678-9"></div></div>
          <div class="fila"><div><label>Tipo de contrato</label><select name="tipo_contrato">${opciones(CONTRATOS, 'servicios_profesionales')}</select></div>
            <div><label>Servicio</label><input name="servicio" placeholder="Vigilancia, ascensores, jardinería..."></div></div>
          <div class="fila3"><div><label>Correo</label><input name="email" type="email"></div>
            <div><label>Teléfono</label><input name="telefono" inputmode="tel"></div>
            <div><label>RIF vence el</label><input name="rif_vence" type="date"></div></div>
          <label>Copia del RIF (foto o PDF)</label><input name="rif_archivo" type="file" accept="image/*,application/pdf">
          <button class="btn" style="margin-top:12px">Agregar proveedor</button>
        </form>
      </details>
    </section>`;

  const msg = (e) => { el.querySelector('#msgCfg').innerHTML = errorHtml(e); el.querySelector('#msgCfg').scrollIntoView({ behavior: 'smooth' }); };
  const guardar = async (cambios, texto) => {
    const { error } = await sb.from('condominios').update(cambios).eq('id', c);
    if (error) { msg(error); return; }
    toast(texto, 'ok');
    vista(ctx, el);
  };
  const datos = (f) => Object.fromEntries(new FormData(f).entries());

  el.querySelector('#fDatos').onsubmit = (e) => {
    e.preventDefault();
    const d = datos(e.target);
    guardar({ nombre: d.nombre.trim(), rif: d.rif.trim().toUpperCase(), tipo: d.tipo, direccion: d.direccion.trim() || null, ciudad: d.ciudad.trim() || null }, 'Datos guardados');
  };
  el.querySelector('#fCobro').onsubmit = (e) => {
    e.preventDefault();
    const d = datos(e.target);
    guardar({
      dia_emision: Number(d.dia_emision), dias_para_vencer: Number(d.dias_para_vencer), fondo_reserva_pct: Number(d.fondo_reserva_pct),
      emision_automatica: Boolean(e.target.emision_automatica.checked), mora_tipo: d.mora_tipo, mora_pct: Number(d.mora_pct || 0),
    }, 'Configuración de cobranza guardada');
  };
  el.querySelectorAll('[data-legal]').forEach((b) => (b.onclick = () => { el.querySelector('#fLegal textarea').value = TEXTO_LEGAL[b.dataset.legal]; }));
  el.querySelector('#fLegal').onsubmit = (e) => {
    e.preventDefault();
    guardar({ texto_legal_recibo: e.target.texto_legal_recibo.value.trim() }, 'Texto legal guardado: saldrá en los próximos recibos');
  };
  el.querySelectorAll('[data-cuenta]').forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from('cuentas_bancarias').update({ activa: b.dataset.activa !== 'true' }).eq('id', b.dataset.cuenta);
    if (error) { msg(error); return; }
    vista(ctx, el);
  }));
  el.querySelector('#fCuenta').onsubmit = async (e) => {
    e.preventDefault();
    const d = datos(e.target);
    const { error } = await sb.from('cuentas_bancarias').insert({
      condominio_id: c, tipo: d.tipo, banco: d.banco.trim(), numero: d.numero.trim() || null, titular: d.titular.trim(),
      rif_titular: d.rif_titular.trim().toUpperCase() || null, telefono_pago_movil: d.telefono_pago_movil.trim() || null,
      email_zelle: d.email_zelle.trim() || null, moneda: d.moneda,
    });
    if (error) { msg(error); return; }
    toast('Cuenta agregada: ya la ven los propietarios al pagar', 'ok');
    vista(ctx, el);
  };
  el.querySelector('#fProv').onsubmit = async (e) => {
    e.preventDefault();
    const d = datos(e.target);
    try {
      let rifUrl = null;
      const archivo = e.target.rif_archivo.files[0];
      if (archivo) {
        const ruta = `${c}/proveedores/${nombreArchivo(archivo)}`;
        const up = await sb.storage.from('soportes').upload(ruta, archivo);
        if (up.error) throw up.error;
        rifUrl = ruta;
      }
      const { error } = await sb.from('proveedores').insert({
        condominio_id: c, razon_social: d.razon_social.trim(), rif: d.rif.trim().toUpperCase(), tipo_contrato: d.tipo_contrato,
        servicio: d.servicio.trim() || null, email: d.email.trim() || null, telefono: d.telefono.trim() || null,
        rif_vence: d.rif_vence || null, rif_url: rifUrl,
      });
      if (error) throw error.code === '23505' ? new Error('Ya existe un proveedor con ese RIF') : error;
      toast('Proveedor agregado', 'ok');
      vista(ctx, el);
    } catch (err) { msg(err); }
  };
}
