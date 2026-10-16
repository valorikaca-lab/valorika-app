// Entrada: correo y contraseña, enlace mágico al correo (sin contraseña) y, solo en
// esta Mac, los accesos de prueba del edificio de ejemplo. También los primeros pasos.
import { sb, esc, icono, errorHtml, cuentasDemo } from '../util.js';
import * as recorrido from '../recorrido.js'; // TEMPORAL: recorrido guiado

const logo = `<div class="logo">${icono.logo}<b>VALÓRIKA</b><small>GESTIÓN INTELIGENTE</small></div>`;

const DESCRIPCION_DEMO = {
  duena: 'Ve toda su empresa: edificios, cobranza y equipo.',
  trabajadora: 'Carga gastos, revisa pagos y emite recibos.',
  junta: 'Aprueba los gastos y ve las cuentas del edificio.',
  propietaria: 'Ve lo que debe, sus recibos y reporta sus pagos.',
  plataforma: 'Solo en esta Mac: clientes, planes y cifras de toda la plataforma.',
};

export function vistaAcceso(app, { aviso, alEntrar }) {
  let modo = 'entrar';
  const pintar = () => {
    app.innerHTML = `
      <div class="acceso"><div class="tarjeta">
        ${logo}
        ${aviso ? `<div class="aviso">${esc(aviso)}</div>` : ''}
        ${recorrido.disponible() && modo === 'entrar' ? `
          <div class="rec-entrada">
            <div class="etiqueta-seccion">Recorrido guiado</div>
            <p><b>Conoce Valórika en 10 pasos.</b> Verás lo que ves tú, lo que hace tu equipo, lo que aprueba la junta y lo que reciben los propietarios, con un edificio de ejemplo. Unos 10 minutos.</p>
            <button type="button" class="btn oro bloque" id="btnRecorrido">Empezar el recorrido</button>
          </div>` : ''}
        ${cuentasDemo.length && modo === 'entrar' ? `
          <div class="demo-accesos">
            <div class="etiqueta-seccion">Edificio de ejemplo · entrar como</div>
            ${cuentasDemo.map((c, i) => `
              <button type="button" class="demo-acceso" data-i="${i}">
                <span class="demo-icono">${icono.usuario}</span>
                <span><b>${esc(c.etiqueta)}</b><small>${esc(DESCRIPCION_DEMO[c.rol] || '')}</small></span>
                ${icono.flecha}
              </button>`).join('')}
          </div>
          <div class="separador"><span>o con tu cuenta</span></div>` : ''}
        <form id="f">
          ${modo === 'registro' ? `<label for="nombre">Nombre completo</label><input id="nombre" autocomplete="name" required>` : ''}
          <label for="email">Correo</label>
          <input id="email" type="email" autocomplete="email" required>
          ${modo !== 'enlace' ? `
            <label for="clave">Contraseña</label>
            <input id="clave" type="password" autocomplete="${modo === 'registro' ? 'new-password' : 'current-password'}" minlength="8" required>` : ''}
          <div id="msg"></div>
          <button class="btn bloque" style="margin-top:16px" ${sb ? '' : 'disabled'}>
            ${modo === 'registro' ? 'Crear cuenta' : modo === 'enlace' ? 'Enviarme el enlace' : 'Entrar'}</button>
        </form>
        <div class="acceso-opciones">
          ${modo !== 'enlace' ? '<a href="#" data-modo="enlace">Entrar sin contraseña (enlace al correo)</a>' : '<a href="#" data-modo="entrar">Entrar con contraseña</a>'}
          ${modo !== 'registro' ? '<a href="#" data-modo="registro">Crear cuenta de administradora</a>' : '<a href="#" data-modo="entrar">Ya tengo cuenta</a>'}
        </div>
      </div></div>`;

    app.querySelectorAll('[data-modo]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); modo = a.dataset.modo; pintar(); }));
    app.querySelector('#btnRecorrido')?.addEventListener('click', (e) => { e.target.disabled = true; recorrido.empezar(); });
    app.querySelectorAll('.demo-acceso').forEach((b) => (b.onclick = async () => {
      const c = cuentasDemo[Number(b.dataset.i)];
      b.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: c.email, password: c.password });
      if (error) { app.querySelector('#msg').innerHTML = errorHtml(error); b.disabled = false; return; }
      alEntrar?.();
    }));

    app.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      const msg = app.querySelector('#msg');
      const email = app.querySelector('#email').value.trim();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        if (modo === 'enlace') {
          const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          msg.innerHTML = '<div class="aviso">Listo. Revisa tu correo y abre el enlace para entrar.</div>';
          return;
        }
        const password = app.querySelector('#clave').value;
        if (modo === 'registro') {
          const nombre = app.querySelector('#nombre').value.trim();
          const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nombre } } });
          if (error) throw error;
          if (!data.session) {
            msg.innerHTML = '<div class="aviso">Te enviamos un correo para confirmar la cuenta. Ábrelo y luego entra.</div>';
            return;
          }
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
        alEntrar?.();
      } catch (err) {
        msg.innerHTML = errorHtml(err.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : err);
      } finally {
        btn.disabled = false;
      }
    };
  };
  pintar();
}

// Usuario sin condominios: o es una administradora nueva, o un propietario
// al que todavía no han registrado con ese correo.
export function vistaSinVinculo(app, ctx, alTerminar) {
  app.innerHTML = `
    <div class="acceso"><div class="tarjeta">
      ${logo}
      <h2>Bienvenido</h2>
      <p>Tu cuenta (${esc(ctx.usuario.email)}) todavía no está asociada a ningún condominio.</p>
      <p class="muted"><b>Si eres propietario o inquilino:</b> pide a tu administradora que te registre con este mismo correo. Al volver a entrar verás tu estado de cuenta.</p>
      <hr style="border:0;border-top:1px solid var(--borde);margin:20px 0">
      <p class="muted"><b>Si eres una administradora o junta autogestionada:</b> crea tu organización (30 días de prueba).</p>
      <form id="f">
        <label for="org">Nombre de la organización</label><input id="org" required>
        <label for="rif">RIF (opcional)</label><input id="rif" placeholder="J-12345678-9">
        <div id="msg"></div>
        <button class="btn bloque" style="margin-top:16px">Crear organización</button>
      </form>
      <button class="btn linea bloque" id="salir" style="margin-top:12px">Salir</button>
    </div></div>`;
  app.querySelector('#salir').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.rpc('crear_organizacion', {
      p_nombre: app.querySelector('#org').value, p_rif: app.querySelector('#rif').value || null,
    });
    if (error) { app.querySelector('#msg').innerHTML = errorHtml(error); return; }
    alTerminar();
  };
}

export function vistaCrearCondominio(app, ctx, alTerminar) {
  app.innerHTML = `
    <div class="acceso"><div class="tarjeta">
      ${logo}
      <h2>Tu primer condominio</h2>
      <form id="f">
        <label for="nombre">Nombre</label><input id="nombre" required placeholder="Residencias Los Samanes">
        <label for="rif">RIF del condominio</label><input id="rif" required placeholder="J-30111222-3">
        <label for="tipo">Tipo</label>
        <select id="tipo"><option value="residencial">Residencial</option><option value="comercial">Comercial</option>
          <option value="mixto">Mixto</option><option value="corporativo">Corporativo</option></select>
        <div id="msg"></div>
        <button class="btn bloque" style="margin-top:16px">Crear condominio</button>
      </form>
    </div></div>`;
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.from('condominios').insert({
      organizacion_id: ctx.orgs[0].organizacion_id,
      nombre: app.querySelector('#nombre').value.trim(),
      rif: app.querySelector('#rif').value.trim().toUpperCase(),
      tipo: app.querySelector('#tipo').value,
    });
    if (error) { app.querySelector('#msg').innerHTML = errorHtml(error); return; }
    alTerminar();
  };
}
