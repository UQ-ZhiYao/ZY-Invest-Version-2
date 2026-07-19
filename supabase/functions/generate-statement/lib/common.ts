import { PDFDocument, PDFFont, PDFPage, RGB, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

// A4 landscape, in points (1pt = 1/72in). Matches the ReportLab version this
// was ported from (scripts/statements/src/pdf_common.py).
export const PAGE_W = 841.89;
export const PAGE_H = 595.28;
export const MARGIN = 45; // ~16mm

export const RED = rgb(0.7529, 0, 0); // #C00000
export const BLACK = rgb(0, 0, 0);

export const FUND_EMAIL = "nzy.invest@gmail.com";
export const FUND_PHONE = "(+60)11 - 1121 8085";

export interface Fonts {
  serif: PDFFont;
  serifBold: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
}

export interface Doc {
  pdf: PDFDocument;
  fonts: Fonts;
  pages: PDFPage[];
  page: PDFPage;
  y: number;
}

export interface InvestorInfo {
  accountType: string;
  accountId: string;
  registeredName: string;
  settlementType: string;
  phone: string;
  bankName: string;
  email: string;
  bankAccountNo: string;
  nomineeLabel: string;
  nomineeValue: string;
  totalDaysHeldText: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  issuedDate: Date;
}

export type Cell = string | { text: string; color: RGB };
export interface Column {
  header: string;
  width: number;
}
export interface TableSpec {
  columns: Column[];
  rows: Cell[][];
  fontSize?: number;
  repeatHeaderOnBreak?: boolean;
  noHeader?: boolean;
}

export async function newDoc(): Promise<Doc> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const doc = { pdf, fonts, pages: [], y: PAGE_H - MARGIN } as unknown as Doc;
  addPage(doc);
  return doc;
}

export function addPage(doc: Doc): PDFPage {
  const page = doc.pdf.addPage([PAGE_W, PAGE_H]);
  doc.pages.push(page);
  doc.page = page;
  doc.y = PAGE_H - MARGIN;
  return page;
}

export function ensureSpace(doc: Doc, height: number): void {
  if (doc.y - height < MARGIN + 24 /* footer clearance */) {
    addPage(doc);
  }
}

export function wrapText(text: unknown, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text).split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export function drawText(
  doc: Doc,
  text: unknown,
  { x, y, font, size, color = BLACK }: { x: number; y: number; font: PDFFont; size: number; color?: RGB },
): void {
  doc.page.drawText(String(text), { x, y, size, font, color });
}

// Draws right-aligned text at x (x is the RIGHT edge).
export function drawTextRight(
  doc: Doc,
  text: unknown,
  { x, y, font, size, color = BLACK }: { x: number; y: number; font: PDFFont; size: number; color?: RGB },
): void {
  const w = font.widthOfTextAtSize(String(text), size);
  doc.page.drawText(String(text), { x: x - w, y, size, font, color });
}

export function drawRect(doc: Doc, { x, y, width, height }: { x: number; y: number; width: number; height: number }): void {
  doc.page.drawRectangle({ x, y, width, height, borderColor: BLACK, borderWidth: 0.6 });
}

function cellText(cell: Cell): string {
  return typeof cell === "object" ? cell.text : cell;
}
function cellColor(cell: Cell): RGB {
  return typeof cell === "object" && cell.color ? cell.color : BLACK;
}

/**
 * Draws a bordered table starting at doc.y, moving doc.y down as it goes.
 * Automatically breaks onto a new page when a row doesn't fit, optionally
 * repeating the header row on the continuation page.
 */
export function drawTable(doc: Doc, spec: TableSpec): void {
  const { columns, rows, fontSize = 10, repeatHeaderOnBreak = true, noHeader = false } = spec;
  const { sans, sansBold } = doc.fonts;
  const lineHeight = fontSize + 3;
  const cellPadX = 6;
  const cellPadY = 5;

  function rowHeight(cells: Cell[], bold: boolean): number {
    const font = bold ? sansBold : sans;
    let maxLines = 1;
    cells.forEach((cell, i) => {
      const lines = wrapText(cellText(cell), font, fontSize, columns[i].width - cellPadX * 2);
      maxLines = Math.max(maxLines, lines.length);
    });
    return maxLines * lineHeight + cellPadY * 2;
  }

  function drawRow(cells: Cell[], bold: boolean, topY: number): number {
    const font = bold ? sansBold : sans;
    const h = rowHeight(cells, bold);
    let x = MARGIN;
    cells.forEach((cell, i) => {
      const w = columns[i].width;
      drawRect(doc, { x, y: topY - h, width: w, height: h });
      const lines = wrapText(cellText(cell), font, fontSize, w - cellPadX * 2);
      const blockH = lines.length * lineHeight;
      let ty = topY - (h - blockH) / 2 - fontSize + 1;
      for (const line of lines) {
        drawText(doc, line, { x: x + cellPadX, y: ty, font, size: fontSize, color: cellColor(cell) });
        ty -= lineHeight;
      }
      x += w;
    });
    return topY - h;
  }

  const header: Cell[] = columns.map((c) => c.header);
  if (!noHeader) {
    ensureSpace(doc, rowHeight(header, true));
    doc.y = drawRow(header, true, doc.y);
  }

  for (const row of rows) {
    const h = rowHeight(row, false);
    if (doc.y - h < MARGIN + 24) {
      addPage(doc);
      if (repeatHeaderOnBreak && !noHeader) doc.y = drawRow(header, true, doc.y);
    }
    doc.y = drawRow(row, false, doc.y);
  }
}

// Reserves the vertical space a table would need, without drawing — used to
// decide whether a "section header + table" pair should jump to a fresh page
// together (avoids a lone header stranded at the bottom of a page).
export function estimateTableHeight(doc: Doc, spec: Pick<TableSpec, "columns" | "rows">, fontSize = 10): number {
  const { columns, rows } = spec;
  const { sans, sansBold } = doc.fonts;
  const lineHeight = fontSize + 3;
  const cellPadY = 5;
  function h(cells: Cell[], bold: boolean): number {
    const font = bold ? sansBold : sans;
    let maxLines = 1;
    cells.forEach((cell, i) => {
      const lines = wrapText(cellText(cell), font, fontSize, columns[i].width - 12);
      maxLines = Math.max(maxLines, lines.length);
    });
    return maxLines * lineHeight + cellPadY * 2;
  }
  let total = h(columns.map((c) => c.header), true);
  for (const row of rows) total += h(row, false);
  return total;
}

export function drawSectionHeader(doc: Doc, text: string): void {
  const { sans } = doc.fonts;
  ensureSpace(doc, 24);
  doc.y -= 4;
  drawText(doc, text, { x: MARGIN, y: doc.y - 12, font: sans, size: 12.5, color: BLACK });
  doc.y -= 22;
}

export function drawNoticeHeader(doc: Doc, text: string): void {
  const { sansBold } = doc.fonts;
  ensureSpace(doc, 24);
  doc.y -= 10;
  drawText(doc, text, { x: MARGIN, y: doc.y - 11, font: sansBold, size: 11, color: BLACK });
  doc.y -= 20;
}

// Keeps a section header + the table that follows on the same page: if the
// pair doesn't fit in the remaining space (but would fit on a fresh page),
// starts a new page first. Mirrors ReportLab's KeepTogether in the Python
// version — a lone table header stranded at the bottom of a page looks bad.
export function drawKeptTogether(doc: Doc, headerText: string, tableSpec: TableSpec): void {
  const needed = 30 + estimateTableHeight(doc, tableSpec);
  if (doc.y - needed < MARGIN + 24 && needed < PAGE_H - MARGIN * 2) {
    addPage(doc);
  }
  drawSectionHeader(doc, headerText);
  drawTable(doc, tableSpec);
}

export function rm(value: number | string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "-") return "-";
  return `RM ${Number(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function redIfNegative(value: number, decimals = 2): Cell {
  const formatted = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (value < 0) return { text: `(${formatted})`, color: RED };
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmt(value: number | string, decimals = 4): string {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function drawHeaderBlock(
  doc: Doc,
  { title, investor, statementType, periodText }: {
    title: string;
    investor: InvestorInfo;
    statementType: string;
    periodText: string;
  },
): void {
  const { serif, serifBold, sans } = doc.fonts;
  const titleSize = 13;
  drawTextRight(doc, title, { x: PAGE_W - MARGIN, y: doc.y - titleSize, font: serifBold, size: titleSize });
  doc.y -= titleSize + 10;

  const leftTopY = doc.y;
  let ly = leftTopY;
  const nameSize = 11;
  drawText(doc, investor.registeredName.toUpperCase(), { x: MARGIN, y: ly - nameSize, font: serif, size: nameSize });
  ly -= nameSize + 4;
  for (const line of [investor.addressLine1, investor.addressLine2, investor.addressLine3]) {
    if (!line) continue;
    drawText(doc, line, { x: MARGIN, y: ly - nameSize, font: serif, size: nameSize });
    ly -= nameSize + 4;
  }

  const metaRows: [string, string][] = [
    ["Page No.", ": 1 of 1"],
    ["Issued Date", `: ${new Date().toISOString().slice(0, 10).split("-").reverse().join("-")}`],
    ["Statement Type", `: ${statementType}`],
    ["Statement Period", `: ${periodText}`],
    ["Email Address", `: ${FUND_EMAIL}`],
    ["Telephone No.", `: ${FUND_PHONE}`],
  ];
  const metaSize = 10;
  const metaLabelX = PAGE_W - MARGIN - 340;
  const metaValueX = PAGE_W - MARGIN - 205;
  let my = leftTopY;
  for (const [label, value] of metaRows) {
    drawText(doc, label, { x: metaLabelX, y: my - metaSize, font: sans, size: metaSize });
    drawText(doc, value, { x: metaValueX, y: my - metaSize, font: sans, size: metaSize });
    my -= metaSize + 3.5;
  }

  doc.y = Math.min(ly, my) - 14;
}

// rows: [[label, value, label, value], ...] — 4-column grid, 2 label/value pairs per row
export function drawLabelValueGrid(doc: Doc, rows: [string, string, string, string][]): void {
  const colWidths = [130, 210, 130, 210];
  const { sans } = doc.fonts;
  const fontSize = 10;
  const rowH = 24;
  ensureSpace(doc, rowH * rows.length);
  for (const row of rows) {
    let x = MARGIN;
    for (let i = 0; i < 4; i++) {
      drawRect(doc, { x, y: doc.y - rowH, width: colWidths[i], height: rowH });
      drawText(doc, row[i], { x: x + 6, y: doc.y - rowH / 2 - fontSize / 2 + 2, font: sans, size: fontSize });
      x += colWidths[i];
    }
    doc.y -= rowH;
  }
}

export function drawFooterOnAllPages(doc: Doc): void {
  const { sans } = doc.fonts;
  const y = MARGIN - 12;
  for (const page of doc.pages) {
    page.drawLine({ start: { x: MARGIN, y: y + 14 }, end: { x: PAGE_W - MARGIN, y: y + 14 }, thickness: 0.6, color: BLACK });
    page.drawText("Head Office: None", { x: MARGIN, y, size: 8.5, font: sans });
    const text = `Line: ${FUND_PHONE}      Email: ${FUND_EMAIL}      Website: -`;
    const w = sans.widthOfTextAtSize(text, 8.5);
    page.drawText(text, { x: PAGE_W - MARGIN - w, y, size: 8.5, font: sans });
  }
}
