/** Parseo compartido del Excel de "auxiliares contables" — usado tanto por el import de un solo
 * proyecto (egresos-import) como por el import multi-proyecto (egresos-import-multi). Reconoce
 * DOS formatos de columnas, porque el mismo archivo suele traer más de una hoja y cada una puede
 * usar un orden distinto:
 *
 *  - v1: la hoja "normal" — Cuenta, Tercero, Fecha, Nota, Cheque, Doc Num, Debitos, Creditos,
 *    Saldo, Centro de Costos, Mvto, Cuenta (mayor), Mayor, Mes. "Cuenta" aparece dos veces
 *    (detallada y de mayor) — a propósito, la validación compara posición por posición.
 *  - v2: la hoja "Cuenta 28 acumulada" — CentroCostos, CuentaContable, Cuenta Tercero, Fecha,
 *    Notas, ChequeNumero, NumDoc, Débitos, Créditos, Saldos, MES, CUENTA. No trae Mvto separado;
 *    el código de mayor va en la única columna "CUENTA" al final.
 */

export const EXPECTED_HEADERS_V1 = [
  'Cuenta', 'Tercero', 'Fecha', 'Nota', 'Cheque', 'Doc Num', 'Debitos', 'Creditos',
  'Saldo', 'Centro de Costos', 'Mvto', 'Cuenta', 'Mayor', 'Mes',
];

export const EXPECTED_HEADERS_V2 = [
  'CentroCostos', 'CuentaContable', 'Cuenta Tercero', 'Fecha', 'Notas', 'ChequeNumero', 'NumDoc',
  'Débitos', 'Créditos', 'Saldos', 'MES', 'CUENTA',
];

const HEADER_SCAN_ROWS = 10;

export function normalizeHeaderCell(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // quita tildes para comparar sin ser frágil
}

const V1_NORMALIZED = EXPECTED_HEADERS_V1.map(normalizeHeaderCell);
const V2_NORMALIZED = EXPECTED_HEADERS_V2.map(normalizeHeaderCell);

export type AuxiliarLayout = 'v1' | 'v2';

export interface AuxiliarHeaderMatch {
  rowIndex: number;
  layout: AuxiliarLayout;
}

/** Busca, entre las primeras filas de la hoja, la que calce EXACTAMENTE (posición por posición)
 * con alguno de los dos formatos conocidos — devuelve el índice de esa fila y cuál formato
 * matcheó, o null si ninguno de los dos calza. */
export function findAuxiliarHeaderRow(rows: unknown[][]): AuxiliarHeaderMatch | null {
  const limit = Math.min(HEADER_SCAN_ROWS, rows.length);
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? [];
    if (row.length >= V1_NORMALIZED.length && V1_NORMALIZED.every((expected, col) => normalizeHeaderCell(row[col]) === expected)) {
      return { rowIndex: i, layout: 'v1' };
    }
    if (row.length >= V2_NORMALIZED.length && V2_NORMALIZED.every((expected, col) => normalizeHeaderCell(row[col]) === expected)) {
      return { rowIndex: i, layout: 'v2' };
    }
  }
  return null;
}

export const AUXILIAR_HEADERS_ERROR_MESSAGE =
  'Esta hoja no tiene las columnas esperadas en el orden correcto. Se reconocen dos formatos — ' +
  '(1) Cuenta, Tercero, Fecha, Nota, Cheque, Doc Num, Debitos, Creditos, Saldo, Centro de Costos, Mvto, Cuenta, Mayor, Mes; ' +
  '(2) CentroCostos, CuentaContable, Cuenta Tercero, Fecha, Notas, ChequeNumero, NumDoc, Débitos, Créditos, Saldos, MES, CUENTA. ' +
  'Verifica que no se hayan movido ni renombrado columnas antes de continuar, o elige otra hoja del archivo.';

function parseColombianNumber(v: unknown): number {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  // formato colombiano: punto = miles, coma = decimales
  const normalized = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

export function parseAuxiliarDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  // "DD/MM/YYYY" o "DD-MM-YYYY"
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

export interface ParsedAuxiliarFields {
  rowNumber: number;
  value: number;
  date: string | null;
  tercero: string;
  nota: string;
  docNum: string;
  cheque: string;
  mvto: string;
  saldo: number | null;
  sourceAccountCode: string;
  sourceAccountName: string;
  sourceMayorCode: string;
  sourceCostCenterRaw: string;
  sourceMes: string;
}

/** Extrae los campos comunes de una fila de datos ya ubicada después del header, según el
 * formato detectado (ver AuxiliarLayout) — null si la fila está completamente vacía. */
export function parseAuxiliarRow(row: unknown[], rowNumber: number, layout: AuxiliarLayout): ParsedAuxiliarFields | null {
  if (row.every(c => String(c ?? '').trim() === '')) return null;
  const cell = (i: number) => String(row[i] ?? '').trim();

  if (layout === 'v2') {
    const cuentaCell = cell(1);
    const accountMatch = cuentaCell.match(/^(\d+)\s*(.*)$/);
    const debitos = parseColombianNumber(row[7]);
    const creditos = parseColombianNumber(row[8]);
    const saldoRaw = cell(9);
    return {
      rowNumber,
      value: debitos !== 0 ? debitos : (creditos !== 0 ? -creditos : 0),
      date: parseAuxiliarDate(row[3]),
      tercero: cell(2),
      nota: cell(4),
      docNum: cell(6),
      cheque: cell(5),
      mvto: '', // esta hoja no trae un "Mvto" separado del código de mayor
      saldo: saldoRaw ? parseColombianNumber(row[9]) : null,
      sourceAccountCode: accountMatch ? accountMatch[1] : '',
      sourceAccountName: accountMatch ? accountMatch[2].trim() : cuentaCell,
      sourceMayorCode: cell(11),
      sourceCostCenterRaw: cell(0),
      sourceMes: cell(10),
    };
  }

  // v1 (formato "normal")
  const cuentaCell = cell(0);
  const accountMatch = cuentaCell.match(/^(\d+)\s*(.*)$/);
  const debitos = parseColombianNumber(row[6]);
  const creditos = parseColombianNumber(row[7]);
  const saldoRaw = cell(8);
  return {
    rowNumber,
    value: debitos !== 0 ? debitos : (creditos !== 0 ? -creditos : 0),
    date: parseAuxiliarDate(row[2]),
    tercero: cell(1),
    nota: cell(3),
    docNum: cell(5),
    cheque: cell(4),
    mvto: cell(10),
    saldo: saldoRaw ? parseColombianNumber(row[8]) : null,
    sourceAccountCode: accountMatch ? accountMatch[1] : '',
    sourceAccountName: accountMatch ? accountMatch[2].trim() : cuentaCell,
    sourceMayorCode: cell(11) || cell(12),
    sourceCostCenterRaw: cell(9),
    sourceMes: cell(13),
  };
}
