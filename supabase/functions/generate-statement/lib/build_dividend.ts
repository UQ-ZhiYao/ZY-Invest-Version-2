import {
  newDoc, drawHeaderBlock, drawInfoCard, drawSectionHeader, drawKeptTogether, drawImportantNotices,
  drawFooterOnAllPages, drawText, rm, colWidths, BODY_W, SECTION_GAP, CONTENT_SIZE, InvestorInfo, Cell,
} from "./common.ts";
import { DistributionRow } from "./compute.ts";

export async function buildDividendPdf(
  { distributions, investor, holdingUnits, periodText }: {
    distributions: DistributionRow[];
    investor: InvestorInfo;
    holdingUnits: number;
    periodText: string;
  },
): Promise<Uint8Array> {
  if (!distributions.length) throw new Error("at least one distribution row is required");

  const doc = await newDoc();
  drawHeaderBlock(doc, {
    title: "DIVIDEND  PAYMENT  STATEMENT", investor,
    statementType: "Dividend Statement", periodText,
  });
  drawSectionHeader(doc, "Investor's Profile");
  drawInfoCard(doc, [
    ["Account Type", investor.accountType, "Account ID", investor.accountId],
    ["Registered Name", investor.registeredName, "Settlement Type", investor.settlementType],
    ["Reference No.", investor.referenceNo, "Bank Name", investor.bankName],
    ["Bank Account No.", investor.bankAccountNo, "", ""],
  ]);
  doc.y -= SECTION_GAP;

  const w = colWidths(BODY_W, [76, 106, 80, 49, 49, 61, 84]);
  const columns = [
    { header: "Date", width: w[0] },
    { header: "Description", width: w[1] },
    { header: "Holding Units", width: w[2], align: "right" as const },
    { header: "EPS", width: w[3], align: "right" as const },
    { header: "DPR", width: w[4], align: "right" as const },
    { header: "DPS", width: w[5], align: "right" as const },
    { header: "Dividend Amount (RM)", width: w[6], align: "right" as const },
  ];
  let totalDps = 0, totalAmount = 0;
  const rows = distributions.map((d) => {
    const dps = Number(d.dps);
    const amount = Math.round(holdingUnits * dps / 100 * 100) / 100;
    totalDps += dps;
    totalAmount += amount;
    const payDate = new Date((d.pay_date || d.ex_date) + "T00:00:00Z");
    const dateStr = payDate.toISOString().slice(0, 10).split("-").reverse().join(" - ");
    return [dateStr, `${d.type || ""} Dividend`.trim(), holdingUnits.toLocaleString("en-US", { minimumFractionDigits: 4 }),
      "-", "-", dps.toLocaleString("en-US", { minimumFractionDigits: 4 }), rm(amount)];
  });
  rows.push(["Total", "", "", "", "", totalDps.toLocaleString("en-US", { minimumFractionDigits: 4 }), rm(totalAmount)]);

  drawKeptTogether(doc, "Dividend Details", { columns, rows });
  const { sans } = doc.fonts;
  drawText(doc, "Notes: EPS: Earning Per Share ; DPR: Dividend Payout Ratio ; DPS: Dividend Per Share",
    { x: 45, y: doc.y - 12, font: sans, size: CONTENT_SIZE - 1 });
  doc.y -= 20;

  drawImportantNotices(doc);
  drawFooterOnAllPages(doc);
  return doc.pdf.save();
}
