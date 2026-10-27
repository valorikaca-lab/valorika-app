// Carga masiva de apartamentos desde Excel: plantilla con lo ya cargado, lectura
// del archivo y vista previa. La base simula la importación entera antes de guardar.
import { sb, esc, num2, cap, q, hoyVE, toast, errorHtml } from '../util.js';

// SheetJS 0.20.3 (con los arreglos de seguridad), servido desde la propia app.
let lector;
function cargarXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  lector ??= new Promise((ok, mal) => {
    const s = Object.assign(document.createElement('script'), { src: 'vendor/xlsx-0.20.3.full.min.js' });
    s.onload = () => ok(window.XLSX);
    s.onerror = () => { lector = null; s.remove(); mal(new Error('No se pudo abrir el lector de Excel. Revisa la conexión e inténtalo de nuevo.')); };
    document.head.append(s);
  });
  return lector;
}

// Columnas de la plantilla: clave que espera la base, título y ancho en Excel.
const COLUMNAS = [
  ['codigo', 'Código', 10], ['piso', 'Piso', 6], ['alicuota_pct', 'Alícuota (%)', 12], ['propietario', 'Propietario', 28],
  ['cedula', 'Cédula o RIF', 14], ['correo', 'Correo', 28], ['whatsapp', 'WhatsApp', 15], ['torre', 'Torre', 8],
  ['tipo', 'Tipo', 14], ['metros2', 'Metros²', 9],
];
const AYUDA = [
  'Cómo llenar la plantilla',
  '',
  '1. Una fila por apartamento. No cambies los títulos de la primera fila.',
  '2. Código y Alícuota (%) son obligatorios. La alícuota va en porcentaje (8,3333, no 0,083333) y entre todos deben sumar 100.',
  '3. Propietario, Cédula o RIF, Correo y WhatsApp son opcionales. Con el correo, el propietario recibe sus recibos y puede entrar a la app.',
  '4. La cédula puede ir como 12345678, V-12345678 o V-12.345.678. El WhatsApp como 0412-1234567 o 584121234567.',
  '5. Si un apartamento ya existe, se actualiza con lo que diga el archivo. Los que no vengan en el archivo no se tocan.',
  '6. Antes de guardar, la app muestra una vista previa con todo lo que va a cambiar.',
  '',
  'Tipos válidos: apartamento, casa, local, oficina, estacionamiento, deposito, parcela, otro.',
];

// Títulos que se reconocen aunque la planilla venga de otro sistema.
const plano = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS = {
  codigo: ['codigo', 'cod', 'apto', 'apartamento', 'unidad', 'casa', 'parcela', 'local', 'inmueble', 'numero', 'nro'],
  alicuota_pct: ['alicuota', 'alicuotapct', 'alicuotas', 'porcentaje', 'pct'],
  propietario: ['propietario', 'propietaria', 'nombre', 'nombreyapellido', 'dueno', 'duena'],
  cedula: ['cedula', 'cedulaorif', 'cedularif', 'rif', 'ci', 'ced'],
  correo: ['correo', 'email', 'mail', 'correoelectronico'],
  whatsapp: ['whatsapp', 'telefono', 'celular', 'movil', 'tlf', 'tel'],
  piso: ['piso', 'nivel'], torre: ['torre', 'edificio', 'bloque'], tipo: ['tipo'],
  metros2: ['metros', 'metros2', 'm2', 'mts', 'mts2', 'area'],
};
function columnaDe(titulo) {
  const t = plano(titulo);
  if (!t) return null;
  return Object.keys(ALIAS).find((k) => ALIAS[k].includes(t))
    || Object.keys(ALIAS).find((k) => ALIAS[k].some((a) => a.length > 3 && t.startsWith(a))) || null;
}

// "8,3333", "8.3333" o "1.234,5" -> número. Si no se entiende, queda el texto y la base lo reporta.
function aNumero(v) {
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[\s%]/g, '');
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if (coma > -1 && punto > -1) s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (coma > -1) s = s.replace(',', '.');
  const n = Number(s);
  return s && Number.isFinite(n) ? n : String(v);
}

function celdasDeHoja(XLSX, hoja) {
  if (!hoja?.['!ref']) return [];
  const R = XLSX.utils.decode_range(hoja['!ref']);
  const filas = [];
  for (let r = R.s.r; r <= Math.min(R.e.r, R.s.r + 3000); r++) {
    const celdas = [];
    for (let c = R.s.c; c <= Math.min(R.e.c, R.s.c + 40); c++) {
      const x = hoja[XLSX.utils.encode_cell({ r, c })];
      if (!x) { celdas.push({ v: '' }); continue; }
      if (x.t === 'e') { celdas.push({ v: x.w || '#ERROR' }); continue; }
      // Una celda con formato de porcentaje guarda 0,0833 para 8,33 %.
      const v = x.t === 'n' && /%/.test(x.z || '') ? Math.round(x.v * 1e8) / 1e6 : x.v;
      celdas.push({ v, w: x.w });
    }
    filas.push({ n: r + 1, celdas });
  }
  return filas;
}

async function leerArchivo(archivo) {
  const XLSX = await cargarXlsx();
  const datos = await archivo.arrayBuffer();
  let libro;
  if (/\.(csv|txt)$/i.test(archivo.name)) {
    // Excel en español guarda los CSV en Windows-1252; los de la plantilla vieja van en UTF-8.
    let texto;
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(datos); } catch { texto = new TextDecoder('windows-1252').decode(datos); }
    libro = XLSX.read(texto.replace(/^﻿/, ''), { type: 'string', raw: true });
  } else {
    libro = XLSX.read(datos, { type: 'array', cellNF: true });
  }
  // La primera hoja que tenga los títulos de la plantilla.
  for (const nombre of libro.SheetNames) {
    const tabla = celdasDeHoja(XLSX, libro.Sheets[nombre]);
    const i = tabla.findIndex((f) => { const k = f.celdas.map((c) => columnaDe(c.v)); return k.includes('codigo') && k.includes('alicuota_pct'); });
    if (i > -1) return armarFilas(tabla, i);
  }
  throw new Error('No encontré los títulos de las columnas. La primera fila debe decir al menos "Código" y "Alícuota (%)", como en la plantilla.');
}

function armarFilas(tabla, i) {
  const claves = tabla[i].celdas.map((c) => columnaDe(c.v));
  const filas = [];
  for (const f of tabla.slice(i + 1)) {
    const o = { fila: f.n };
    claves.forEach((k, j) => {
      const c = f.celdas[j];
      if (!k || o[k] !== undefined || !c) return;
      if (String(c.v ?? '').trim() === '') return;
      if (k === 'alicuota_pct' || k === 'metros2') o[k] = aNumero(c.v);
      else if (k === 'cedula' || k === 'whatsapp') o[k] = String(c.v).trim();
      else o[k] = String(c.w ?? c.v).trim();   // el texto como se ve en Excel (respeta ceros a la izquierda)
    });
    if (Object.keys(o).length > 1) filas.push(o);
  }
  if (!filas.length) throw new Error('El archivo no trae apartamentos debajo de los títulos.');
  return filas;
}

async function importar(condo, filas, simular) {
  const { data, error } = await sb.rpc('importar_unidades', { p_condo: condo, p_filas: filas, p_simular: simular });
  if (error) throw error;
  return data;
}

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'edificio';

export async function descargarPlantilla(ctx) {
  const XLSX = await cargarXlsx();
  const c = ctx.condo.id;
  const [us, gente] = await Promise.all([
    q(sb.from('unidades').select('id, codigo, tipo, torre, piso, metros2, alicuota_pct').eq('condominio_id', c).eq('activa', true).order('codigo')),
    q(sb.from('unidad_personas').select('unidad_id, personas(nombre, cedula_rif, email, telefono), unidades!inner(condominio_id)')
      .eq('unidades.condominio_id', c).eq('relacion', 'propietario').or(`hasta.is.null,hasta.gte.${hoyVE()}`)),
  ]);
  const dueno = Object.fromEntries(gente.map((g) => [g.unidad_id, g.personas || {}]));
  const casas = ctx.condo.tipo === 'parcelamiento';
  const filas = us.length
    ? us.map((u) => { const p = dueno[u.id] || {};
      return [u.codigo, u.piso, Number(u.alicuota_pct), p.nombre, p.cedula_rif, p.email, p.telefono, u.torre, u.tipo, u.metros2 ? Number(u.metros2) : ''];
    })
    : [[casas ? 'C-01' : '1-A', casas ? '' : '1', 8.333333, 'María Pérez', 'V-12345678', 'maria@correo.com', '584121234567', '', casas ? 'casa' : 'apartamento', 85],
       [casas ? 'C-02' : '1-B', casas ? '' : '1', 8.333333, 'José Rodríguez', 'V-9876543', '', '584241234567', '', casas ? 'casa' : 'apartamento', 85],
       [casas ? 'P-01' : 'PB-L1', casas ? '' : 'PB', 4, 'Inversiones Sol C.A.', 'J-40123456-7', 'admin@sol.com', '', '', casas ? 'parcela' : 'local', 40]];
  const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS.map((x) => x[1]), ...filas.map((f) => f.map((v) => v ?? ''))]);
  hoja['!cols'] = COLUMNAS.map((x) => ({ wch: x[2] }));
  const ayuda = XLSX.utils.aoa_to_sheet(AYUDA.map((l) => [l]));
  ayuda['!cols'] = [{ wch: 120 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, casas ? 'Casas' : 'Apartamentos');
  XLSX.utils.book_append_sheet(libro, ayuda, 'Cómo llenarla');
  XLSX.writeFile(libro, `${slug(ctx.condo.nombre)}-${casas ? 'casas' : 'apartamentos'}.xlsx`);
}

const QUE = { nueva: ['ok', 'Nuevo'], actualizada: ['oro', 'Se actualiza'], igual: ['', 'Sin cambios'] };

function htmlVista(res, archivo, [uno, varios]) {
  const cerrar = '<button class="btn linea" id="btnCancelarImp" type="button">Cerrar</button>';
  if (res.errores?.length) {
    const n = res.errores.length;
    return `
      <div class="aviso error"><b>${n === 1 ? 'Una fila tiene errores' : `${n} filas tienen errores`}.</b> Corrígelas en Excel y vuelve a subir el archivo. No se guardó nada.</div>
      <div class="scroll-x"><table class="tabla"><thead><tr><th>Fila</th><th>Código</th><th>Qué hay que corregir</th></tr></thead><tbody>
        ${res.errores.slice(0, 100).map((e) => `<tr><td>${e.fila}</td><td>${esc(e.codigo || '')}</td><td>${esc(cap(e.mensaje))}</td></tr>`).join('')}
      </tbody></table></div>
      ${n > 100 ? `<p class="muted">Y ${n - 100} más.</p>` : ''}
      <div class="acciones">${cerrar}</div>`;
  }
  const suma = Number(res.suma_alicuotas);
  const sumaOk = Math.abs(suma - 100) <= 0.001;
  const cambios = res.nuevas + res.actualizadas;
  return `
    <h3 class="titulo-import">Vista previa de ${esc(archivo)}</h3>
    <div class="chips-linea">
      <span class="chip ok">${res.nuevas} ${res.nuevas === 1 ? 'nuevo' : 'nuevos'}</span>
      <span class="chip oro">${res.actualizadas} ${res.actualizadas === 1 ? 'se actualiza' : 'se actualizan'}</span>
      <span class="chip">${res.iguales} sin cambios</span>
      ${res.personas_nuevas ? `<span class="chip">${res.personas_nuevas} ${res.personas_nuevas === 1 ? 'propietario nuevo' : 'propietarios nuevos'}</span>` : ''}
    </div>
    ${sumaOk ? `<p>Después de importar, las alícuotas suman <b>${num2(suma)} %</b> <span class="chip ok">Correcto</span></p>`
      : `<div class="aviso">Después de importar, las alícuotas sumarían <b>${num2(suma)} %</b>. Deben sumar 100 % para poder emitir recibos.</div>`}
    ${res.no_vienen ? `<p class="muted">${res.no_vienen === 1 ? `1 ${uno} que ya está cargado no viene` : `${res.no_vienen} ${varios} que ya están cargados no vienen`} en el archivo: no se tocan.</p>` : ''}
    ${res.cambios_propietario?.length ? `<div class="aviso"><b>Cambian de propietario:</b><ul class="lista-cambios">
      ${res.cambios_propietario.map((x) => `<li>${esc(x.codigo)}: ${esc(x.antes)} pasa a ${esc(x.ahora)}</li>`).join('')}</ul></div>` : ''}
    <div class="scroll-x"><table class="tabla apilada t-import"><thead><tr><th>Código</th><th class="num">Alícuota</th><th>Propietario</th><th>Qué pasa</th></tr></thead><tbody>
      ${res.detalle.slice(0, 200).map((d) => `<tr>
        <td><b>${esc(d.codigo)}</b></td>
        <td class="num">${Number(d.alicuota_pct).toFixed(4)} %</td>
        <td>${esc(d.propietario || 'Sin propietario')}<div class="muted">${esc([d.cedula, d.correo, d.whatsapp].filter(Boolean).join(' · '))}</div></td>
        <td><span class="chip ${QUE[d.unidad][0]}">${QUE[d.unidad][1]}</span></td></tr>`).join('')}
    </tbody></table></div>
    ${res.detalle.length > 200 ? `<p class="muted">Y ${res.detalle.length - 200} filas más.</p>` : ''}
    <div class="acciones">
      ${cambios ? '<button class="btn" id="btnImportar" type="button">Confirmar importación</button>' : '<span class="muted">No hay cambios: todo coincide con lo que ya está cargado.</span>'}
      ${cerrar}
    </div>`;
}

export function activarImportacion(ctx, el, alTerminar) {
  const caja = el.querySelector('#prevImport');
  const input = el.querySelector('#archivoX');
  const nombres = ctx.condo.tipo === 'parcelamiento' ? ['casa', 'casas'] : ['apartamento', 'apartamentos'];

  el.querySelector('#btnPlantilla').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await descargarPlantilla(ctx); } catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; }
  };
  el.querySelector('#btnSubirX').onclick = () => input.click();

  input.onchange = async () => {
    const archivo = input.files[0];
    input.value = '';   // permite volver a subir el mismo archivo ya corregido
    if (!archivo) return;
    caja.innerHTML = '<p class="muted">Leyendo el archivo...</p>';
    try {
      const filas = await leerArchivo(archivo);
      const res = await importar(ctx.condo.id, filas, true);
      caja.innerHTML = htmlVista(res, archivo.name, nombres);
      caja.scrollIntoView({ behavior: 'smooth', block: 'start' });
      caja.querySelector('#btnCancelarImp').onclick = () => { caja.innerHTML = ''; };
      const btn = caja.querySelector('#btnImportar');
      if (btn) btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Importando...';
        try {
          const r = await importar(ctx.condo.id, filas, false);
          toast(`Importación lista: ${r.nuevas} ${r.nuevas === 1 ? 'nuevo' : 'nuevos'} y ${r.actualizadas} ${r.actualizadas === 1 ? 'actualizado' : 'actualizados'}.`, 'ok');
          alTerminar();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Confirmar importación';
          caja.insertAdjacentHTML('beforeend', errorHtml(err));
        }
      };
    } catch (err) {
      caja.innerHTML = errorHtml(err);
    }
  };
}
