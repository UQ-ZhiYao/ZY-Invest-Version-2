import {
  newDoc, drawHeaderBlock, drawLabelValueGrid, drawSectionHeader, drawNoticeHeader, drawKeptTogether,
  drawFooterOnAllPages, drawText, rm, InvestorInfo, Cell,
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
  drawSectionHeader(doc, "Investor's Information");
  drawLabelValueGrid(doc, [
    ["Investor's Name", investor.registeredName, "Settlement Type", investor.settlementType],
    ["Phone Number", investor.phone, "Bank Name", investor.bankName],
    ["Email Address", investor.email, "Bank Account No.", investor.bankAccountNo],
  ]);
  doc.y -= 4;

  const columns = [
    { header: "Date", width: 100 },
    { header: "Description", width: 140 },
    { header: "Holding Units", width: 105 },
    { header: "EPS", width: 65 },
    { header: "DPR", width: 65 },
    { header: "DPS", width: 80 },
    { header: "Dividend Amount", width: 110 },
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
    { x: 45, y: doc.y - 12, font: sans, size: 9 });
  doc.y -= 20;

  drawNoticeHeader(doc, "IMPORTANT NOTICES");
  drawFooterOnAllPages(doc);
  return doc.pdf.save();
}
