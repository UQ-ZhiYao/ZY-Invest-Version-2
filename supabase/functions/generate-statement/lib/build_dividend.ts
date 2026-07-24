import {
  newDoc, drawHeaderBlock, drawPageNo, drawInfoCard, drawSectionHeader, drawKeptTogether, drawImportantNotices,
  drawFooterOnAllPages, drawText, rm, colWidths, BODY_W, SECTION_GAP, CONTENT_SIZE, InvestorInfo, Cell,
} from "./common.ts";
import { DistributionRow } from "./compute.ts";

export async function buildDividendPdf(
  { distribution, investor, holdingUnits, periodText, referenceNo }: {
    distribution: DistributionRow;
    investor: InvestorInfo;
    holdingUnits: number;
    periodText: string;
    referenceNo: string;
  },
): Promise<Uint8Array> {
  const doc = await newDoc();
  const pageNoPos = drawHeaderBlock(doc, {
    title: "DIVIDEND  PAYMENT  STATEMENT", investor,
    statementType: "Dividend Statement", periodText,
    referenceNo,
  });
  drawSectionHeader(doc, "Investor's Profile");
  drawInfoCard(doc, [
    ["Account Type", investor.accountType, "Account ID", investor.accountId],
    ["Registered Name", investor.registeredName, "Settlement Type", investor.settlementType],
    ["Email Address", investor.email, "Bank Name", investor.bankName],
    ["Phone No.", investor.phone, "Bank Account No.", investor.bankAccountNo],
  ]);
  doc.y -= SECTION_GAP;

  const w = colWidths(BODY_W, [90, 130, 95, 90, 100]);
  const columns = [
    { header: "Date", width: w[0] },
    { header: "Description", width: w[1] },
    { header: "Holding Units", width: w[2], align: "right" as const },
    { header: "DPS", width: w[3], align: "right" as const },
    { header: "Dividend Amount", width: w[4], align: "right" as const, currency: true },
  ];
  const dps = Number(distribution.dps);
  const amount = Math.round(holdingUnits * dps / 100 * 100) / 100;
  const payDate = new Date((distribution.pay_date || distribution.ex_date) + "T00:00:00Z");
  const dateStr = payDate.toISOString().slice(0, 10).split("-").reverse().join(" - ");
  const rows = [[
    dateStr, `${distribution.type || ""} Dividend`.trim(),
    holdingUnits.toLocaleString("en-US", { minimumFractionDigits: 4 }),
    dps.toLocaleString("en-US", { minimumFractionDigits: 4 }), rm(amount),
  ]];

  drawKeptTogether(doc, "Dividend Details", { columns, rows });
  const { sans } = doc.fonts;
  drawText(doc, "Notes: DPS: Dividend Per Share",
    { x: 45, y: doc.y - 12, font: sans, size: CONTENT_SIZE - 1 });
  doc.y -= 20;

  drawImportantNotices(doc);
  drawFooterOnAllPages(doc);
  drawPageNo(doc, pageNoPos);
  return doc.pdf.save();
}
