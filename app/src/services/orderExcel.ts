import ExcelJS from 'exceljs';
import type { ParsedOrderRow } from '../types/orderRow';
import { resolveMarketKey } from './marketRegistry';

const COL_PASSWORD = 8; // H
const COL_ORDER_INFO = 9; // I
const COL_COURIER_COMPANY = 11; // K
const COL_COURIER_TRACKING_NO = 12; // L

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  if (typeof v === 'object' && v !== null && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('');
  }
  if (typeof v === 'object' && v !== null && 'result' in v) {
    const r = (v as ExcelJS.CellFormulaValue).result;
    return r === null || r === undefined ? '' : String(r);
  }
  return String(v);
}

export type OrderExcelMeta = {
  /** 읽은 첫 시트 이름 */
  sheetName: string;
  /** 통합문서 내 시트 개수 */
  totalWorksheets: number;
  /** ExcelJS rowCount */
  rowCountRaw: number;
  /** ExcelJS lastRow?.number */
  lastRowNumber: number;
  /** 실제 스캔에 사용한 마지막 행 번호 (max(rowCount, lastRow)) */
  lastRowNum: number;
};

export type ParseOrderExcelResult = {
  rows: ParsedOrderRow[];
  meta: OrderExcelMeta;
};

/**
 * 첫 번째 시트만 사용. 1행은 헤더로 건너뜀.
 * H=비밀번호, I=마켓·아이디·주문번호(공백 구분)
 */
export async function parseOrderRowsFromFile(
  filePath: string,
): Promise<ParseOrderExcelResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      rows: [],
      meta: {
        sheetName: '',
        totalWorksheets: 0,
        rowCountRaw: 0,
        lastRowNumber: 0,
        lastRowNum: 0,
      },
    };
  }

  const rowCountRaw = sheet.rowCount ?? 0;
  const lastRowNumber = sheet.lastRow?.number ?? 0;
  const lastRowNum = Math.max(rowCountRaw, lastRowNumber);

  const meta: OrderExcelMeta = {
    sheetName: sheet.name,
    totalWorksheets: workbook.worksheets.length,
    rowCountRaw,
    lastRowNumber,
    lastRowNum,
  };

  const rows: ParsedOrderRow[] = [];

  for (let r = 2; r <= lastRowNum; r++) {
    const row = sheet.getRow(r);
    const password = cellToString(row.getCell(COL_PASSWORD)).trim();
    const orderInfoRaw = cellToString(row.getCell(COL_ORDER_INFO)).trim();

    if (!password && !orderInfoRaw) {
      continue;
    }

    const parts = orderInfoRaw.split(/\s+/).filter(Boolean);
    if (parts.length < 3) {
      rows.push({
        excelRow: r,
        password,
        marketLabel: parts[0] ?? '',
        marketKey: null,
        userId: parts[1] ?? '',
        orderNo: parts.slice(2).join(' '),
      });
      continue;
    }

    const marketLabel = parts[0];
    const userId = parts[1];
    const orderNo = parts.slice(2).join(' ');
    rows.push({
      excelRow: r,
      password,
      marketLabel,
      marketKey: resolveMarketKey(marketLabel),
      userId,
      orderNo,
    });
  }

  return { rows, meta };
}

export async function writeCourierToExcel(
  filePath: string,
  excelRow: number,
  company: string,
  trackingNo: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return;

  const row = sheet.getRow(excelRow);
  row.getCell(COL_COURIER_COMPANY).value = company;
  row.getCell(COL_COURIER_TRACKING_NO).value = trackingNo;
  row.commit();

  await workbook.xlsx.writeFile(filePath);
}
