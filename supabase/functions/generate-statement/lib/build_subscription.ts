import {
  newDoc, drawHeaderBlock, drawInfoCard, drawSectionHeader, drawKeptTogether, drawImportantNotices,
  drawFooterOnAllPages, rm, redIfNegative, fmt, colWidths, BODY_W, SECTION_GAP, InvestorInfo,
} from "./common.ts";
import { CapitalInjectionRow } from "./compute.ts";

export async function buildSubscriptionPdf(
  { tx, investor, openingUnits, openingCost }: {
    tx: CapitalInjectionRow;
    investor: InvestorInfo;
    openingUnits: number;
    openingCost: number;
  },
): Promise<Uint8Array> {
  const txType = tx.type; // 'Subscription' | 'Redemption'
  const isRedemption = txType === "Redemption";
  const txDate = new Date(tx.date + "T00:00:00Z");
  const amount = Number(tx.amount);
  const price = Number(tx.nta);
  const units = Number(tx.units);

  const signedUnits = isRedemption ? -units : units;
  const signedAmount = isRedemption ? -amount : amount;
  const closingUnits = openingUnits + signedUnits;
  const closingCost = openingCost + signedAmount;

  const doc = await newDoc();
  const dateStr = txDate.toISOString().slice(0, 10).split("-").reverse().join(" - ");

  drawHeaderBlock(doc, {
    title: `FUND  ${txType.toUpperCase()}  STATEMENT`,
    investor, statementType: `${txType} Statement`, periodText: dateStr.replaceAll(" - ", "/"),
    referenceNo: tx.reference_id || "-",
  });
  drawSectionHeader(doc, "Investor's Profile");
  drawInfoCard(doc, [
    ["Account Type", investor.accountType, "Account ID", investor.accountId],
    ["Registered Name", investor.registeredName, "Settlement Type", investor.settlementType],
    ["Phone No.", investor.phone, "Email Address", investor.email],
    ["Bank Name", investor.bankName, "Bank Account No.", investor.bankAccountNo],
  ]);
  doc.y -= SECTION_GAP;

  const w = colWidths(BODY_W, [78, 86, 90, 82, 90, 78]);
  const columns = [
    { header: "Date", width: w[0] },
    { header: "Description", width: w[1] },
    { header: "Investment Value", width: w[2], align: "right" as const, currency: true },
    { header: `${txType} Price`, width: w[3], align: "right" as const, currency: true },
    { header: "Unit Balanced", width: w[4], align: "right" as const },
    { header: "Average Cost", width: w[5], align: "right" as const, currency: true },
  ];
  const rows = [
    [dateStr, "Opening", rm(openingCost), "-", fmt(openingUnits),
      openingUnits > 0 ? rm(openingCost / openingUnits, 4) : "-"],
    [dateStr, `Fund ${txType}`, rm(amount), rm(price, 4), redIfNegative(signedUnits, 4), "-"],
    [dateStr, "Closing", rm(closingCost), "-", fmt(closingUnits),
      closingUnits > 0 ? rm(closingCost / closingUnits, 4) : "-"],
  ];
  drawKeptTogether(doc, "Principal Transaction", { columns, rows });

  drawImportantNotices(doc);
  drawFooterOnAllPages(doc);
  return doc.pdf.save();
}
