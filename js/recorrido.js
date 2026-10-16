// Recorrido guiado (TEMPORAL): le muestra a la clienta cómo funciona Valórika con
// el edificio de ejemplo, entrando sola con cada rol de prueba.
// Para quitarlo: borrar este archivo, sus 2 líneas en app.js, la tarjeta en
// vistas/acceso.js y el bloque "Recorrido guiado" de css/estilos.css.
import { sb, cuentasDemo, esc } from './util.js';

const CLAVE = 'valorika.recorrido';

// rol: cuenta de prueba con la que se ve el paso · ruta: pantalla · marcar: qué resaltar
const PASOS = [
  { rol: 'duena', ruta: '#/inicio', marcar: '.tareas',
    titulo: 'Así empieza tu día',
    texto: 'Esta es tu pantalla de inicio. El sistema te dice qué hay que hacer hoy: pagos por revisar, gastos esperando a la junta y apartamentos con deuda. Arriba siempre está la tasa oficial del BCV del día.',
    porque: 'Nadie tiene que buscar la tasa ni llevar listas en Excel: todo se calcula solo.' },
  { rol: 'duena', ruta: '#/empresa', marcar: '.kpis',
    titulo: 'Tu empresa en un vistazo',
    texto: 'Aquí ves todos tus edificios: cuánto se cobró el último mes, cuánto se debe y quién trabaja contigo. Más abajo está lo que puede hacer cada persona.',
    porque: 'Controlas el negocio completo sin estar encima de cada edificio.' },
  { rol: 'trabajadora', ruta: '#/gastos', marcar: '.lista-gastos',
    titulo: 'Tu equipo carga los gastos',
    texto: 'Cada factura se carga con su foto y su monto, en dólares o en bolívares. Ningún gasto entra al recibo hasta que la junta lo aprueba.',
    porque: 'Todo queda con su soporte digital: cero papeles perdidos y cuentas claras.' },
  { rol: 'junta', ruta: '#/aprobar', marcar: 'article.pago',
    titulo: 'La junta aprueba desde su teléfono',
    texto: 'La junta de condominio ve cada factura y la aprueba o la rechaza con un comentario. Cada decisión queda registrada.',
    porque: 'La junta confía porque lo ve todo, y no hace falta reunirse por cada gasto.' },
  { rol: 'trabajadora', ruta: '#/recibos', marcar: '.interruptor',
    titulo: 'Los recibos salen solos',
    texto: 'Cuando la junta aprobó todo, los recibos se emiten solos el día 1: uno por apartamento, en dólares y en bolívares a la tasa BCV, con código QR y el texto del Artículo 14 de la Ley de Propiedad Horizontal.',
    porque: 'No hay que calcular, imprimir ni repartir recibos.' },
  { rol: 'trabajadora', ruta: '#/pagos', marcar: '.verif',
    titulo: 'Los pagos se comparan con el banco',
    texto: 'Cuando un propietario reporta su pago con la captura, el sistema te dice si ya aparece en el estado de cuenta del banco. Con un clic se confirma y se descuenta de sus recibos.',
    porque: 'Menos tiempo revisando capturas una por una, y menos errores.' },
  { rol: 'propietaria', ruta: 'enlace', marcar: '.saldo',
    titulo: 'Lo que recibe el propietario, sin app',
    texto: 'Al propietario le llega su recibo por correo con un enlace como este. Sin crear cuenta ve cuánto debe en dólares y en bolívares, dónde pagar, y reporta su pago con la captura.',
    porque: 'Tus clientes no tienen que instalar nada ni recordar contraseñas.' },
  { rol: 'propietaria', ruta: '#/cuentas', marcar: '.kpis',
    titulo: 'Cuentas claras para todos',
    texto: 'Cada propietario puede ver en qué se gastó el dinero del edificio cada mes, con las facturas aprobadas.',
    porque: 'Se acaba la desconfianza hacia la administración. Es tu mejor argumento para conseguir edificios.' },
  { rol: 'trabajadora', ruta: '#/reportes', marcar: '.avisos',
    titulo: 'La cobranza la hace el sistema',
    texto: 'El sistema avisa solo por correo: 3 días antes de que venza el recibo, el día que vence y a los 1, 15 y 30 días. Aquí ves los avisos y lo que lee el propietario en cada uno.',
    porque: 'Menos morosidad sin que tu equipo tenga que llamar a nadie.' },
  { rol: 'duena', ruta: '#/inicio', marcar: null,
    titulo: 'Eso es Valórika',
    texto: 'Recibos automáticos en dólares y bolívares, cobranza sin personal, transparencia para la junta y los propietarios, y proveedores siempre como contratistas: cero pasivo laboral.',
    porque: 'Tú contratas el sistema y la administración del edificio se hace sola.' },
];

const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; } };
const guardar = (e) => { try { e ? localStorage.setItem(CLAVE, JSON.stringify(e)) : localStorage.removeItem(CLAVE); } catch {} };
export const disponible = () => Boolean(sb && cuentasDemo.length);

export function empezar() { irA(0); }

// Entra con la cuenta del rol del paso (si hace falta), abre su pantalla y recarga.
async function irA(i) {
  const paso = PASOS[i];
  const cuenta = cuentasDemo.find((c) => c.rol === paso.rol);
  if (!paso || !cuenta) return;
  guardar({ paso: i, mini: false });
  document.getElementById('recorrido')?.classList.add('cargando-paso');
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user?.email !== cuenta.email) {
    await sb.auth.signOut();
    const { error } = await sb.auth.signInWithPassword({ email: cuenta.email, password: cuenta.password });
    if (error) { alert('No se pudo entrar con la cuenta de ejemplo: ' + error.message); return; }
  }
  let ruta = paso.ruta;
  if (ruta === 'enlace') {
    const { data } = await sb.from('recibos').select('hash_verificacion, estado').order('fecha_vencimiento', { ascending: false }).limit(5);
    const r = (data || []).find((x) => ['emitido', 'parcial'].includes(x.estado)) || (data || [])[0];
    ruta = r ? `#/r/${r.hash_verificacion}` : '#/inicio';
  }
  try { localStorage.setItem('valorika.rol', { duena: 'admin', trabajadora: 'admin', junta: 'junta', propietaria: 'residente' }[paso.rol]); } catch {}
  location.hash = ruta;
  location.reload();
}

async function terminar() {
  guardar(null);
  document.body.classList.remove('con-recorrido');
  document.getElementById('recorrido')?.remove();
  await sb.auth.signOut();
  location.hash = '';
  location.reload();
}

const ROL_TXT = { duena: 'la dueña de la administradora', trabajadora: 'tu trabajadora', junta: 'la junta de condominio', propietaria: 'una propietaria (Carmen, apto 3-B)' };

// Se llama cada vez que se pinta una pantalla.
export function pintar() {
  const estado = leer();
  if (!estado || !disponible()) return;
  const i = Math.min(Math.max(0, estado.paso), PASOS.length - 1);
  const paso = PASOS[i];
  let caja = document.getElementById('recorrido');
  if (!caja) {
    caja = document.createElement('aside');
    caja.id = 'recorrido';
    caja.setAttribute('aria-label', 'Recorrido guiado');
    document.body.appendChild(caja);
  }
  document.body.classList.toggle('con-recorrido', !estado.mini);
  caja.className = 'recorrido' + (estado.mini ? ' mini' : '');
  caja.innerHTML = estado.mini
    ? `<button type="button" class="rec-mostrar">Recorrido · paso ${i + 1} de ${PASOS.length} · Mostrar</button>`
    : `
      <div class="rec-cab"><span class="etiqueta-seccion">Recorrido · paso ${i + 1} de ${PASOS.length}</span>
        <button type="button" class="rec-ocultar" aria-label="Ocultar el recorrido">Ocultar</button></div>
      <div class="rec-puntos">${PASOS.map((_, k) => `<span class="${k <= i ? 'hecho' : ''}"></span>`).join('')}</div>
      <div class="muted">Estás viendo lo que ve ${ROL_TXT[paso.rol]}</div>
      <h3>${esc(paso.titulo)}</h3>
      <p>${esc(paso.texto)}</p>
      <p class="rec-porque"><b>Por qué te sirve:</b> ${esc(paso.porque)}</p>
      <div class="rec-acciones">
        ${i > 0 ? '<button type="button" class="btn linea" data-ir="-1">Anterior</button>' : ''}
        ${i < PASOS.length - 1 ? '<button type="button" class="btn" data-ir="1">Siguiente</button>' : '<button type="button" class="btn" id="recFin">Terminar</button>'}
      </div>
      <button type="button" class="rec-salir">Salir del recorrido</button>`;

  caja.querySelector('.rec-mostrar')?.addEventListener('click', () => { guardar({ ...estado, mini: false }); pintar(); });
  caja.querySelector('.rec-ocultar')?.addEventListener('click', () => { guardar({ ...estado, mini: true }); pintar(); });
  caja.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => { b.disabled = true; irA(i + Number(b.dataset.ir)); }));
  caja.querySelector('#recFin')?.addEventListener('click', terminar);
  caja.querySelector('.rec-salir')?.addEventListener('click', terminar);

  // Resaltar lo importante de la pantalla (las vistas cargan sus datos con un poco de espera).
  document.querySelectorAll('.rec-marca').forEach((n) => n.classList.remove('rec-marca'));
  if (paso.marcar && !estado.mini) {
    let intentos = 0;
    const buscar = () => {
      const n = document.querySelector(paso.marcar);
      if (n) {
        n.classList.add('rec-marca');
        // Dejarlo justo debajo de la barra superior, por encima del panel del recorrido.
        window.scrollTo({ top: Math.max(0, n.getBoundingClientRect().top + window.scrollY - 140), behavior: 'smooth' });
        return;
      }
      if (++intentos < 12) setTimeout(buscar, 400);
    };
    setTimeout(buscar, 300);
  }
}
