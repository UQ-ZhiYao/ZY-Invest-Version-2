import { PDFDocument, PDFFont, PDFImage, PDFPage, RGB, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

// A4 portrait, in points (1pt = 1/72in). Matches the ReportLab version this
// was ported from (scripts/statements/src/pdf_common.py).
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 45; // ~16mm
export const BODY_W = PAGE_W - MARGIN * 2;

export const RED = rgb(0.7529, 0, 0); // #C00000
export const BLACK = rgb(0, 0, 0);

export const FUND_EMAIL = "nzy.invest@gmail.com";
export const FUND_PHONE = "(+60)11 - 1121 8085";

// One uniform font size for the entire document — titles, section headers,
// table content, the investor info card, notices, footer, all of it.
export const CONTENT_SIZE = 7.5;
// Vertical gap between one table/section and the next — "1 line" of space.
export const SECTION_GAP = 16;

// ZY-Invest logo (assets/img/logo.png, trimmed + downsized to 212x180 and
// palette-quantized so it can be inlined here as one self-contained module —
// no extra file, no network fetch at render time).
const LOGO_PNG_BASE64 =
  "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";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

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
  logoImage: PDFImage;
}

export interface InvestorInfo {
  accountType: string; // "Personal Account" | "Joint Account"
  accountId: string; // first 8 characters of referenceNo
  referenceNo: string; // the investor's profile id
  registeredName: string;
  settlementType: string;
  bankName: string;
  bankAccountNo: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
}

export type Cell = string | { text: string; color: RGB };
export interface Column {
  header: string;
  width: number;
  align?: "left" | "right";
}
export interface TableSpec {
  columns: Column[];
  rows: Cell[][];
  fontSize?: number;
  repeatHeaderOnBreak?: boolean;
  noHeader?: boolean;
}

// Splits `total` into widths proportional to `weights`, forced to sum to
// exactly `total` (the remainder is folded into the last column) — every
// table/grid width call goes through this so its columns always add up to
// exactly the page body width, never more, never less.
export function colWidths(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.round((total * w) / sum * 100) / 100);
  const used = widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] = Math.round((widths[widths.length - 1] + (total - used)) * 100) / 100;
  return widths;
}

export async function newDoc(): Promise<Doc> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const logoImage = await pdf.embedPng(base64ToBytes(LOGO_PNG_BASE64));
  const doc = { pdf, fonts, pages: [], y: PAGE_H - MARGIN, logoImage } as unknown as Doc;
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

// Breaks a single word that's wider than maxWidth all on its own (a long
// reference number/UUID with no spaces, or a plain long label in a narrow
// column) into character chunks — otherwise wrapText below has no space to
// break on and the word silently overflows past its cell's border.
function breakOversizedWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const chunks: string[] = [];
  let cur = "";
  for (const ch of word) {
    const trial = cur + ch;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && cur) {
      chunks.push(cur);
      cur = ch;
    } else {
      cur = trial;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function wrapText(text: unknown, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text).split(" ").flatMap((w) => breakOversizedWord(w, font, size, maxWidth));
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

// Draws horizontally-centered text at x (x is the CENTER of the text block).
export function drawTextCenter(
  doc: Doc,
  text: unknown,
  { x, y, font, size, color = BLACK }: { x: number; y: number; font: PDFFont; size: number; color?: RGB },
): void {
  const w = font.widthOfTextAtSize(String(text), size);
  doc.page.drawText(String(text), { x: x - w / 2, y, size, font, color });
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
  const { columns, rows, fontSize = CONTENT_SIZE, repeatHeaderOnBreak = true, noHeader = false } = spec;
  const { sans } = doc.fonts;
  const lineHeight = fontSize + 3;
  const cellPadX = 4;
  const cellPadY = 4;

  function rowHeight(cells: Cell[]): number {
    let maxLines = 1;
    cells.forEach((cell, i) => {
      const lines = wrapText(cellText(cell), sans, fontSize, columns[i].width - cellPadX * 2);
      maxLines = Math.max(maxLines, lines.length);
    });
    return maxLines * lineHeight + cellPadY * 2;
  }

  // Header cells are always centered, regardless of the column's own
  // (left/right) data alignment — data rows keep that alignment.
  function drawRow(cells: Cell[], isHeader: boolean, topY: number): number {
    const h = rowHeight(cells);
    let x = MARGIN;
    cells.forEach((cell, i) => {
      const w = columns[i].width;
      const align = isHeader ? "center" : (columns[i].align || "left");
      drawRect(doc, { x, y: topY - h, width: w, height: h });
      const lines = wrapText(cellText(cell), sans, fontSize, w - cellPadX * 2);
      const blockH = lines.length * lineHeight;
      let ty = topY - (h - blockH) / 2 - fontSize + 1;
      for (const line of lines) {
        if (align === "center") {
          drawTextCenter(doc, line, { x: x + w / 2, y: ty, font: sans, size: fontSize, color: cellColor(cell) });
        } else if (align === "right") {
          drawTextRight(doc, line, { x: x + w - cellPadX, y: ty, font: sans, size: fontSize, color: cellColor(cell) });
        } else {
          drawText(doc, line, { x: x + cellPadX, y: ty, font: sans, size: fontSize, color: cellColor(cell) });
        }
        ty -= lineHeight;
      }
      x += w;
    });
    return topY - h;
  }

  const header: Cell[] = columns.map((c) => c.header);
  if (!noHeader) {
    ensureSpace(doc, rowHeight(header));
    doc.y = drawRow(header, true, doc.y);
  }

  for (const row of rows) {
    const h = rowHeight(row);
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
export function estimateTableHeight(doc: Doc, spec: Pick<TableSpec, "columns" | "rows">, fontSize = CONTENT_SIZE): number {
  const { columns, rows } = spec;
  const { sans } = doc.fonts;
  const lineHeight = fontSize + 3;
  const cellPadY = 4;
  function h(cells: Cell[]): number {
    let maxLines = 1;
    cells.forEach((cell, i) => {
      const lines = wrapText(cellText(cell), sans, fontSize, columns[i].width - 8);
      maxLines = Math.max(maxLines, lines.length);
    });
    return maxLines * lineHeight + cellPadY * 2;
  }
  let total = h(columns.map((c) => c.header));
  for (const row of rows) total += h(row);
  return total;
}

export function drawSectionHeader(doc: Doc, text: string): void {
  const { sans } = doc.fonts;
  ensureSpace(doc, 24);
  doc.y -= 4;
  drawText(doc, text, { x: MARGIN, y: doc.y - CONTENT_SIZE, font: sans, size: CONTENT_SIZE, color: BLACK });
  doc.y -= CONTENT_SIZE + 9;
}

// Not bold — every other heading in the document is plain weight too.
export function drawNoticeHeader(doc: Doc, text: string): void {
  const { sans } = doc.fonts;
  ensureSpace(doc, 24);
  doc.y -= 10;
  drawText(doc, text, { x: MARGIN, y: doc.y - CONTENT_SIZE, font: sans, size: CONTENT_SIZE, color: BLACK });
  doc.y -= CONTENT_SIZE + 8;
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

// No "RM" prefix — the currency is named once in the column header
// (e.g. "Total Value (RM)"), not repeated on every data cell.
export function rm(value: number | string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "-") return "-";
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
  const topY = doc.y;

  // Logo, top-left, small.
  const logoDrawW = 42;
  const logoDims = doc.logoImage.scale(1);
  const logoDrawH = (logoDims.height / logoDims.width) * logoDrawW;
  doc.page.drawImage(doc.logoImage, { x: MARGIN, y: topY - logoDrawH, width: logoDrawW, height: logoDrawH });

  // Two columns below the logo: investor name/address on the left,
  // statement meta info on the right. The title sits on the logo's row,
  // centered over the right column.
  const [leftColW, rightColW] = colWidths(BODY_W, [270, 235]);
  const rightColX = MARGIN + leftColW;

  const titleSize = CONTENT_SIZE;
  const titleW = serifBold.widthOfTextAtSize(title, titleSize);
  drawText(doc, title, {
    x: rightColX + (rightColW - titleW) / 2,
    y: topY - logoDrawH / 2 - titleSize / 2 + 2,
    font: serifBold,
    size: titleSize,
  });

  const rowTopY = topY - Math.max(logoDrawH, titleSize) - 14;

  // Left: investor name + address, stacked.
  let ly = rowTopY;
  const nameSize = CONTENT_SIZE;
  drawText(doc, investor.registeredName.toUpperCase(), { x: MARGIN, y: ly - nameSize, font: serif, size: nameSize });
  ly -= nameSize + 4;
  for (const line of [investor.addressLine1, investor.addressLine2, investor.addressLine3]) {
    if (!line) continue;
    drawText(doc, line, { x: MARGIN, y: ly - nameSize, font: serif, size: nameSize });
    ly -= nameSize + 4;
  }

  // Right: meta info, one label/value pair per line (wraps if a value is long).
  const metaLabelW = 95;
  const metaRows: [string, string][] = [
    ["Page No.", "1 of 1"],
    ["Issued Date", new Date().toISOString().slice(0, 10).split("-").reverse().join("-")],
    ["Statement Type", statementType],
    ["Statement Period", periodText],
    ["Email Address", FUND_EMAIL],
    ["Telephone No.", FUND_PHONE],
  ];
  const metaSize = CONTENT_SIZE;
  const metaLineHeight = metaSize + 3;
  const valueMaxW = rightColW - metaLabelW;
  let my = rowTopY;
  for (const [label, value] of metaRows) {
    drawText(doc, label, { x: rightColX, y: my - metaSize, font: sans, size: metaSize });
    const lines = wrapText(`: ${value}`, sans, metaSize, valueMaxW);
    let vy = my - metaSize;
    for (const line of lines) {
      drawText(doc, line, { x: rightColX + metaLabelW, y: vy, font: sans, size: metaSize });
      vy -= metaLineHeight;
    }
    my -= Math.max(metaSize + 4.5, (lines.length - 1) * metaLineHeight + metaSize + 4.5);
  }

  doc.y = Math.min(ly, my) - 12;
}

const NOTICE_ITEMS: [string, string][] = [
  ["Confidentiality", "This statement contains personal data and is intended solely for the recipient. Please do not share this document with any third parties."],
  ["Discrepancies", 'Please review all figures carefully. Any discrepancies or "untally" figures must be reported to us immediately; failure to do so may result in the recipient bearing any associated losses.'],
  ["Digital Statements", "Effective 1st January 2026, all future portfolio statements will be provided exclusively via App ZY-Invest."],
];

// Draws one line of already-split words stretched to fill `width` by
// distributing the leftover space evenly between words (last line of a
// paragraph should NOT go through this — it stays left-aligned, standard
// justified-text convention).
function drawJustifiedLine(
  doc: Doc,
  words: string[],
  { x, y, font, size, width }: { x: number; y: number; font: PDFFont; size: number; width: number },
): void {
  if (words.length <= 1) {
    drawText(doc, words.join(" "), { x, y, font, size });
    return;
  }
  const wordWidths = words.map((w) => font.widthOfTextAtSize(w, size));
  const totalWordsW = wordWidths.reduce((a, b) => a + b, 0);
  const gap = (width - totalWordsW) / (words.length - 1);
  let cx = x;
  words.forEach((w, i) => {
    drawText(doc, w, { x: cx, y, font, size });
    cx += wordWidths[i] + gap;
  });
}

function estimateNoticesHeight(doc: Doc): number {
  const { sans, sansBold } = doc.fonts;
  const size = CONTENT_SIZE;
  const lineHeight = size + 4;
  const headingH = 28; // matches drawNoticeHeader's own vertical consumption
  let itemsH = 0;
  for (let i = 0; i < NOTICE_ITEMS.length; i++) {
    const [label, text] = NOTICE_ITEMS[i];
    const lead = `${i + 1}. ${label}: `;
    const leadW = sansBold.widthOfTextAtSize(lead, size);
    const lines = wrapText(text, sans, size, BODY_W - leadW);
    itemsH += Math.max(lines.length * lineHeight + 2, lineHeight);
  }
  return headingH + itemsH;
}

// Always sits at the bottom of whichever page ends up being the last page —
// never immediately trailing the last table with a cramped or awkward gap.
// If there's blank space left on the current page, that space moves to sit
// ABOVE the notices instead of below them; if the current page is too full,
// the whole block moves to a fresh page instead of splitting.
export function drawImportantNotices(doc: Doc): void {
  const bottomY = MARGIN + 24;
  const totalH = estimateNoticesHeight(doc);
  const targetTopY = bottomY + totalH;
  if (doc.y < targetTopY) {
    addPage(doc);
  }
  doc.y = targetTopY;

  drawNoticeHeader(doc, "IMPORTANT NOTICES");
  const { sans, sansBold } = doc.fonts;
  const size = CONTENT_SIZE;
  const lineHeight = size + 4;
  const textWidth = BODY_W;
  for (let i = 0; i < NOTICE_ITEMS.length; i++) {
    const [label, text] = NOTICE_ITEMS[i];
    const lead = `${i + 1}. ${label}: `;
    const leadW = sansBold.widthOfTextAtSize(lead, size);
    const lines = wrapText(text, sans, size, textWidth - leadW);
    const itemH = lines.length * lineHeight + 2;
    drawText(doc, lead, { x: MARGIN, y: doc.y - size, font: sansBold, size });
    let ty = doc.y;
    lines.forEach((line, li) => {
      const isLastLine = li === lines.length - 1;
      const y = ty - size;
      if (isLastLine) {
        drawText(doc, line, { x: MARGIN + leadW, y, font: sans, size });
      } else {
        drawJustifiedLine(doc, line.split(" "), { x: MARGIN + leadW, y, font: sans, size, width: textWidth - leadW });
      }
      ty -= lineHeight;
    });
    doc.y -= Math.max(itemH, lineHeight);
  }
}

// A compact identity card — up to 2 label/value pairs per row (4 columns),
// sized to a fraction of the page body width (not the full width every
// other table uses) so it reads as a small info box rather than a
// spanning table. Pass "" for an unused label/value in the last row.
export function drawInfoCard(doc: Doc, rows: [string, string, string, string][], widthFraction = 0.4): void {
  const cardW = BODY_W * widthFraction;
  const colW = colWidths(cardW, [1, 1, 1, 1]);
  const { sans } = doc.fonts;
  const fontSize = CONTENT_SIZE;
  const lineHeight = fontSize + 3;
  const padY = 6;
  for (const row of rows) {
    const cellLines = row.map((text, i) => wrapText(text, sans, fontSize, colW[i] - 8));
    const maxLines = Math.max(...cellLines.map((l) => l.length));
    const rowH = maxLines * lineHeight + padY * 2 - 3;
    ensureSpace(doc, rowH);
    let x = MARGIN;
    for (let i = 0; i < 4; i++) {
      drawRect(doc, { x, y: doc.y - rowH, width: colW[i], height: rowH });
      const blockH = cellLines[i].length * lineHeight;
      let ty = doc.y - (rowH - blockH) / 2 - fontSize + 1;
      for (const line of cellLines[i]) {
        drawText(doc, line, { x: x + 4, y: ty, font: sans, size: fontSize });
        ty -= lineHeight;
      }
      x += colW[i];
    }
    doc.y -= rowH;
  }
}

export function drawFooterOnAllPages(doc: Doc): void {
  const { sans } = doc.fonts;
  const y = MARGIN - 12;
  for (const page of doc.pages) {
    page.drawLine({ start: { x: MARGIN, y: y + 14 }, end: { x: PAGE_W - MARGIN, y: y + 14 }, thickness: 0.6, color: BLACK });
    page.drawText("Head Office: None", { x: MARGIN, y, size: 7.5, font: sans });
    const text = `Line: ${FUND_PHONE}      Email: ${FUND_EMAIL}      Website: -`;
    const w = sans.widthOfTextAtSize(text, 7.5);
    page.drawText(text, { x: PAGE_W - MARGIN - w, y, size: 7.5, font: sans });
  }
}
