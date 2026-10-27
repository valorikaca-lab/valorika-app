// Utilidades compartidas: cliente Supabase, formato, escape de HTML, estados,
// avisos flotantes, QR, iconos y la tasa oficial BCV.

const cfg = window.VALORIKA_CONFIG || {};
export const configurado = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
export const sb = configurado ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
// Accesos de prueba del edificio de ejemplo (solo existen en el config.js local).
export const cuentasDemo = Array.isArray(cfg.demoCuentas) ? cfg.demoCuentas : [];
// Recibo en PDF por el código de su enlace (función pública recibo-pdf).
export const urlFuncion = (nombre) => `${cfg.supabaseUrl}/functions/v1/${nombre}`;
export const urlPdfRecibo = (hash) => `${cfg.supabaseUrl}/functions/v1/recibo-pdf?t=${hash}`;
// WhatsApp sin API: abre el chat con el mensaje escrito y sale desde el WhatsApp de quien lo toca.
// Sin número válido abre WhatsApp para elegir el contacto.
export function enlaceWhatsApp(telefono, texto) {
  let n = String(telefono || '').replace(/\D/g, '');
  if (/^0\d{10}$/.test(n)) n = '58' + n.slice(1);
  else if (/^4\d{9}$/.test(n)) n = '58' + n;
  return `https://wa.me/${n.length >= 10 ? n : ''}?text=${encodeURIComponent(texto)}`;
}

// Todo texto que venga de la base pasa por esc() antes de ir al HTML.
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Formatos ----------
const fmt2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const num2 = (n) => fmt2.format(Number(n || 0));
export const usd = (n) => 'USD ' + fmt2.format(Number(n || 0));
export const bs = (n) => 'Bs ' + fmt2.format(Number(n || 0));
export const tasaTxt = (n) => 'Bs ' + fmt4.format(Number(n || 0));
const fmtPct = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 1 });
export const pct = (n) => fmtPct.format(Number(n || 0)) + ' %';
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const dia = (d) => new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
export const fecha = (d) => (d ? dia(d).toLocaleDateString('es-VE') : '');
export const fechaLarga = (d) => (d ? dia(d).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
export const diaMes = (f) => (f ? `${String(f).slice(8, 10)}/${String(f).slice(5, 7)}` : '');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const periodoTxt = (p) => (p ? `${cap(MESES[p.mes - 1])} ${p.anio}` : '');
export const hoyVE = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
export const diasEntre = (a, b) => Math.round((dia(b) - dia(a)) / 86400_000);

// ---------- Estados (texto claro para cualquier persona) ----------
const ESTADOS = {
  recibo:  { emitido: ['Por pagar', 'oro'], parcial: ['Abonado', 'alerta'], pagado: ['Pagado', 'ok'], anulado: ['Anulado', 'error'], vencido: ['Vencido', 'error'], preliminar: ['Preliminar', 'alerta'] },
  pago:    { pendiente: ['Por revisar', 'alerta'], aprobado: ['Confirmado', 'ok'], rechazado: ['Rechazado', 'error'], anulado: ['Anulado', 'error'] },
  gasto:   { borrador: ['Borrador', ''], en_revision: ['Esperando a la junta', 'alerta'], aprobado: ['Aprobado', 'ok'], rechazado: ['Rechazado', 'error'], anulado: ['Anulado', 'error'] },
  periodo: { abierto: ['Abierto', 'oro'], en_revision: ['En revisión', 'alerta'], emitido: ['Recibos emitidos', 'ok'], cerrado: ['Cerrado', 'ok'] },
  aviso:   { pendiente: ['En cola', 'alerta'], enviada: ['Enviado', 'ok'], fallida: ['Falló', 'error'], omitida: ['Omitido', ''] },
};
export function chip(tipo, estado) {
  const [texto, clase] = ESTADOS[tipo]?.[estado] || [String(estado).replace(/_/g, ' '), ''];
  return `<span class="chip ${clase}">${esc(texto)}</span>`;
}
// Un recibo por pagar cuya fecha de vencimiento ya pasó se muestra como "Vencido".
export const estadoRecibo = (r) => (['emitido', 'parcial'].includes(r.estado) && r.fecha_vencimiento < hoyVE() ? 'vencido' : r.estado);
export const chipEstado = (estado) => chip('recibo', estado);

export const METODOS = { transferencia: 'Transferencia', pago_movil: 'Pago móvil', deposito: 'Depósito', zelle: 'Zelle', efectivo_usd: 'Efectivo en divisas', otro: 'Otro' };

export function vacio(texto) {
  return `<div class="vacio">${esc(texto)}</div>`;
}
export function errorHtml(e) {
  return `<div class="aviso error">${esc(e?.message || e)}</div>`;
}

// Consultas: devuelven los datos o lanzan el error de Supabase.
export async function q(consulta) {
  const { data, error } = await consulta;
  if (error) throw error;
  return data ?? [];
}
export async function cuenta(consulta) {
  const { count, error } = await consulta;
  if (error) throw error;
  return count ?? 0;
}

// ---------- Avisos flotantes ----------
export function toast(mensaje, tipo = '') {
  let caja = document.getElementById('toasts');
  if (!caja) {
    caja = document.createElement('div');
    caja.id = 'toasts';
    caja.setAttribute('role', 'status');
    document.body.appendChild(caja);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = mensaje;
  caja.appendChild(t);
  setTimeout(() => t.classList.add('fuera'), 5200);
  setTimeout(() => t.remove(), 5700);
}

// ---------- QR (librería qrcode-generator cargada en index.html) ----------
export function qrSvg(texto) {
  if (!window.qrcode) return '';
  const qr = window.qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag(4, 2);
}

// ---------- Archivos ----------
export const nombreArchivo = (f) => `${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`;
export async function urlFirmada(bucket, ruta) {
  if (!ruta) return null;
  const { data } = await sb.storage.from(bucket).createSignedUrl(ruta, 600);
  return data?.signedUrl || null;
}

// ---------- Tasa oficial BCV (Edge Function pública tasa-hoy, sin login) ----------
// Se revisa sola cada 10 minutos y al volver a la pestaña; la tira, la tarjeta y el
// conversor se repintan con el dato nuevo sin recargar la página.
const REVISAR_CADA = 10 * 60 * 1000;
let tasa = null;
let tasaRevisada = 0;
let recalcularConversor = null;
const horaCorta = (ms) => new Date(ms).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' });

export async function tasaHoy(forzar = false) {
  if (tasa && !forzar && Date.now() - tasaRevisada < REVISAR_CADA) return tasa;
  if (!cfg.supabaseUrl) return tasa;
  try {
    const r = await fetch(cfg.supabaseUrl + '/functions/v1/tasa-hoy', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    tasa = await r.json();
    tasaRevisada = Date.now();
    try { localStorage.setItem('valorika.tasa', JSON.stringify({ tasa, tasaRevisada })); } catch {}
  } catch {
    if (!tasa) {
      try {
        const g = JSON.parse(localStorage.getItem('valorika.tasa'));
        if (g?.tasa) { tasa = { ...g.tasa, guardada: true }; tasaRevisada = g.tasaRevisada; }
      } catch {}
    }
  }
  return tasa;
}
export const tasaUsd = () => tasa?.usd?.tasa || null;

function variacion(item) {
  if (!item?.anterior?.tasa) return '';
  const p = (item.tasa / item.anterior.tasa - 1) * 100;
  const flecha = p > 0.005 ? '▲' : p < -0.005 ? '▼' : '=';
  return `<span class="tasa-var">${flecha} ${fmt2.format(Math.abs(p))} % vs. ${diaMes(item.anterior.fecha)}</span>`;
}

export function tiraTasaHtml(t = tasa) {
  if (!t?.usd) return '<span>Tasa oficial BCV no disponible por ahora</span>';
  return `
    <span class="nw">Dólar BCV <b>${bs(t.usd.tasa)}</b></span>
    ${t.eur ? `<span class="nw solo-ancho">Euro <b>${bs(t.eur.tasa)}</b></span>` : ''}
    <span class="nw muted">${diaMes(t.usd.fecha)}${t.guardada ? ' · sin conexión' : ''}</span>`;
}

function graficaHtml(serie) {
  if (!serie || serie.length < 2) return '';
  const W = 320, H = 70, P = 5;
  const vals = serie.map((s) => Number(s[1]));
  const min = Math.min(...vals), max = Math.max(...vals), rango = max - min || 1;
  const x = (i) => P + (i * (W - 2 * P)) / (serie.length - 1);
  const y = (v) => H - P - ((v - min) * (H - 2 * P)) / rango;
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const u = vals.length - 1;
  return `<svg class="tasa-grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dólar BCV en los últimos ${serie.length} días hábiles">
      <polygon points="${P},${H - P} ${pts} ${(W - P)},${H - P}" fill="var(--oro-suave)"/>
      <polyline points="${pts}" fill="none" stroke="var(--primario)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(u).toFixed(1)}" cy="${y(vals[u]).toFixed(1)}" r="4" fill="var(--primario)"/>
    </svg>`;
}

export function tarjetaTasaHtml(t = tasa) {
  if (!t?.usd) return `<section class="tarjeta" id="tarjetaTasa"><h2>Tasa oficial BCV</h2>${vacio('La tasa del BCV no está disponible por ahora.')}</section>`;
  const s = t.serie || [];
  const cambio = s.length > 1 ? (s[s.length - 1][1] / s[0][1] - 1) * 100 : null;
  const prox = t.proxima?.usd;
  return `
    <section class="tarjeta tasa-card" id="tarjetaTasa">
      <div class="tasa-cab"><span class="etiqueta-seccion">Tasa oficial BCV</span><span class="muted">${cap(fechaLarga(t.usd.fecha))}</span></div>
      <div class="tasa-grid">
        <div><div class="tasa-mon">Dólar</div><div class="tasa-valor" title="${tasaTxt(t.usd.tasa)}">${bs(t.usd.tasa)}</div>${variacion(t.usd)}</div>
        ${t.eur ? `<div><div class="tasa-mon">Euro</div><div class="tasa-valor sec" title="${tasaTxt(t.eur.tasa)}">${bs(t.eur.tasa)}</div>${variacion(t.eur)}</div>` : ''}
      </div>
      ${graficaHtml(s)}
      <div class="tasa-pie">
        ${cambio !== null ? `<span class="muted">Dólar en ${s.length} días hábiles: ${cambio >= 0 ? '+' : '−'}${fmt2.format(Math.abs(cambio))} %</span>` : ''}
        ${prox ? `<span class="chip oro">Desde el ${diaMes(prox.fecha)}: ${bs(prox.tasa)}</span>` : ''}
      </div>
      <div class="muted tasa-act">Se actualiza sola${tasaRevisada ? ' · revisada a las ' + horaCorta(tasaRevisada) : ''}${t.guardada ? ' · sin conexión' : ''}</div>
    </section>`;
}

export function conversorHtml(t = tasa) {
  if (!t?.usd) return '';
  return `
    <section class="tarjeta conversor">
      <h2>Convertir</h2>
      <div class="segmento" role="group" aria-label="Moneda">
        <button type="button" data-m="usd" class="activo" aria-pressed="true">Dólar</button>
        ${t.eur ? '<button type="button" data-m="eur" aria-pressed="false">Euro</button>' : ''}
      </div>
      <label for="cvMonto" id="cvEtq">Monto en dólares</label>
      <div class="campo-moneda"><span id="cvPref">$</span><input id="cvMonto" type="number" inputmode="decimal" min="0" step="0.01" value="100"></div>
      <button type="button" class="btn linea cv-invertir" id="cvInvertir">${icono.invertir} Invertir</button>
      <div class="cv-resultado">
        <div class="muted">Equivale a</div>
        <div class="cv-valor" id="cvRes"></div>
        <div class="muted" id="cvTasa"></div>
      </div>
    </section>`;
}

export function activarConversor(raiz) {
  const monto = raiz.querySelector('#cvMonto');
  if (!monto) return;
  let moneda = 'usd';
  let aBs = true; // true: divisa -> Bs; false: Bs -> divisa
  const simbolo = { usd: '$', eur: '€' };
  const nombre = { usd: 'dólares', eur: 'euros' };
  const sigla = { usd: 'USD', eur: 'EUR' };
  const calcular = () => {
    const item = tasa?.[moneda];
    if (!item) return;
    const n = Number(monto.value);
    raiz.querySelector('#cvEtq').textContent = aBs ? `Monto en ${nombre[moneda]}` : 'Monto en bolívares';
    raiz.querySelector('#cvPref').textContent = aBs ? simbolo[moneda] : 'Bs';
    const res = aBs ? n * item.tasa : n / item.tasa;
    raiz.querySelector('#cvRes').textContent = monto.value === '' ? '—' : (aBs ? 'Bs ' : simbolo[moneda] + ' ') + fmt2.format(res);
    raiz.querySelector('#cvTasa').textContent = `Tasa del ${diaMes(item.fecha)}: 1 ${sigla[moneda]} = ${tasaTxt(item.tasa)}`;
  };
  monto.addEventListener('input', calcular);
  raiz.querySelectorAll('.segmento button').forEach((b) => b.addEventListener('click', () => {
    moneda = b.dataset.m;
    raiz.querySelectorAll('.segmento button').forEach((x) => { const on = x === b; x.classList.toggle('activo', on); x.setAttribute('aria-pressed', on); });
    calcular();
  }));
  raiz.querySelector('#cvInvertir').addEventListener('click', () => {
    const item = tasa?.[moneda];
    if (item && monto.value !== '') {
      const n = Number(monto.value);
      monto.value = Math.round((aBs ? n * item.tasa : n / item.tasa) * 100) / 100;
    }
    aBs = !aBs;
    calcular();
  });
  recalcularConversor = calcular;
  calcular();
}

let vigilando = false;
export function vigilarTasa() {
  if (vigilando) return;
  vigilando = true;
  const revisar = async () => {
    await tasaHoy(true);
    const tira = document.getElementById('tiraTasa');
    if (tira) tira.innerHTML = tiraTasaHtml();
    const tarjeta = document.getElementById('tarjetaTasa');
    if (tarjeta) tarjeta.outerHTML = tarjetaTasaHtml();
    if (document.getElementById('cvMonto')) recalcularConversor?.();
  };
  setInterval(revisar, REVISAR_CADA);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - tasaRevisada > 60 * 1000) revisar();
  });
}

// ---------- Iconos SVG en línea (sin emojis) ----------
const trazo = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
export const icono = {
  logo: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 10 L32 56 L56 10" fill="none" stroke="#C5A059" stroke-width="6" stroke-linejoin="round"/><rect x="22" y="26" width="5" height="14" fill="currentColor"/><rect x="29.5" y="20" width="5" height="22" fill="currentColor"/><rect x="37" y="14" width="5" height="18" fill="currentColor"/></svg>`,
  inicio: `<svg viewBox="0 0 24 24" ${trazo}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`,
  edificio: `<svg viewBox="0 0 24 24" ${trazo}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/></svg>`,
  gastos: `<svg viewBox="0 0 24 24" ${trazo}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>`,
  pagos: `<svg viewBox="0 0 24 24" ${trazo}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>`,
  recibos: `<svg viewBox="0 0 24 24" ${trazo}><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>`,
  reportes: `<svg viewBox="0 0 24 24" ${trazo}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  cartelera: `<svg viewBox="0 0 24 24" ${trazo}><path d="M4 5h16v11H8l-4 4z"/></svg>`,
  empresa: `<svg viewBox="0 0 24 24" ${trazo}><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>`,
  aprobar: `<svg viewBox="0 0 24 24" ${trazo}><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/></svg>`,
  salir: `<svg viewBox="0 0 24 24" ${trazo}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/></svg>`,
  invertir: `<svg viewBox="0 0 24 24" ${trazo}><path d="M7 4v16M7 4L4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/></svg>`,
  flecha: `<svg viewBox="0 0 24 24" ${trazo}><path d="M9 6l6 6-6 6"/></svg>`,
  ok: `<svg viewBox="0 0 24 24" ${trazo}><path d="M5 12l5 5L20 7"/></svg>`,
  alerta: `<svg viewBox="0 0 24 24" ${trazo}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>`,
  imprimir: `<svg viewBox="0 0 24 24" ${trazo}><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/></svg>`,
  correo: `<svg viewBox="0 0 24 24" ${trazo}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`,
  usuario: `<svg viewBox="0 0 24 24" ${trazo}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  balance: `<svg viewBox="0 0 24 24" ${trazo}><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2M7 3h10"/></svg>`,
  legal: `<svg viewBox="0 0 24 24" ${trazo}><path d="M12 4v16M8 20h8M5 7h14M7 7l-3 6a3 3 0 0 0 6 0zM17 7l-3 6a3 3 0 0 0 6 0z"/></svg>`,
  documentos: `<svg viewBox="0 0 24 24" ${trazo}><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" ${trazo}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>`,
  ajustes: `<svg viewBox="0 0 24 24" ${trazo}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  cuentas: `<svg viewBox="0 0 24 24" ${trazo}><path d="M12 3v18M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.8 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3"/></svg>`,
};
