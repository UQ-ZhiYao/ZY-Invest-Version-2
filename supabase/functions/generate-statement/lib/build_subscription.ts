import {
  newDoc, drawHeaderBlock, drawLabelValueGrid, drawSectionHeader, drawNoticeHeader, drawKeptTogether,
  drawFooterOnAllPages, rm, redIfNegative, fmt, colWidths, BODY_W, InvestorInfo,
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
  });
  drawSectionHeader(doc, "Investor's Information");
  drawLabelValueGrid(doc, [
    ["Account Type", investor.accountType, "Account ID", investor.accountId],
    ["Registered Name", investor.registeredName, "Settlement Type", investor.settlementType],
    ["Phone No.", investor.phone, "Bank Name", investor.bankName],
    ["Email Address", investor.email, "Bank Account No.", investor.bankAccountNo],
    [investor.nomineeLabel, investor.nomineeValue, "Total Days Held", investor.totalDaysHeldText],
  ]);
  doc.y -= 4;

  const w = colWidths(BODY_W, [78, 86, 90, 82, 90, 78]);
  const columns = [
    { header: "Date", width: w[0] },
    { header: "Description", width: w[1] },
    { header: "Investment Value", width: w[2] },
    { header: `${txType} Price`, width: w[3] },
    { header: "Unit Balanced", width: w[4] },
    { header: "Average Cost", width: w[5] },
  ];
  const rows = [
    [dateStr, "Opening", rm(openingCost), "-", fmt(openingUnits),
      openingUnits > 0 ? rm(openingCost / openingUnits, 4) : "-"],
    [dateStr, `Fund ${txType}`, rm(amount), rm(price, 4), redIfNegative(signedUnits, 4), "-"],
    [dateStr, "Closing", rm(closingCost), "-", fmt(closingUnits),
      closingUnits > 0 ? rm(closingCost / closingUnits, 4) : "-"],
  ];
  drawKeptTogether(doc, "Principal Transaction", { columns, rows });

  drawNoticeHeader(doc, "IMPORTANT NOTICES");
  drawFooterOnAllPages(doc);
  return doc.pdf.save();
}
