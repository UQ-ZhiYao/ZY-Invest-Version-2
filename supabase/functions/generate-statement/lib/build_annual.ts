import {
  newDoc, drawHeaderBlock, drawInfoCard, drawSectionHeader, drawKeptTogether, drawImportantNotices,
  drawFooterOnAllPages, drawText, rm, redIfNegative, fmt, colWidths, BODY_W, SECTION_GAP, CONTENT_SIZE,
  InvestorInfo, Cell,
} from "./common.ts";
import { xirr, CapitalInjectionRow, DistributionRow } from "./compute.ts";

function dstr(d: Date): string {
  return d.toISOString().slice(0, 10).split("-").reverse().join(" - ");
}
function dmy(d: Date): string {
  return d.toISOString().slice(0, 10).split("-").reverse().join("/");
}

export interface BuildAnnualArgs {
  investor: InvestorInfo;
  fyStart: Date;
  fyEnd: Date;
  openingUnits: number;
  openingCost: number;
  closingUnits: number;
  closingCost: number;
  latestNavPerUnit: number;
  transactionsInFy: CapitalInjectionRow[];
  distributionsInFy: DistributionRow[];
  cashflowsForIrr: [Date, number][];
  realizedPl?: number;
  adjustment?: number;
}

export async function buildAnnualPdf({
  investor, fyStart, fyEnd, openingUnits, openingCost, closingUnits, closingCost,
  latestNavPerUnit, transactionsInFy, distributionsInFy, cashflowsForIrr,
  realizedPl = 0, adjustment = 0,
}: BuildAnnualArgs): Promise<Uint8Array> {
  const periodText = `${dmy(fyStart)} - ${dmy(fyEnd)}`;
  const doc = await newDoc();

  drawHeaderBlock(doc, { title: "INVESTMENT  ACCOUNT  STATEMENT", investor, statementType: "Annually", periodText });
  drawSectionHeader(doc, "Investor's Profile");
  drawInfoCard(doc, [
    ["Account Type", investor.accountType, "Account ID", investor.accountId],
    ["Registered Name", investor.registeredName, "Settlement Type", investor.settlementType],
    ["Reference No.", investor.referenceNo, "Bank Name", investor.bankName],
    ["Bank Account No.", investor.bankAccountNo, "", ""],
  ]);
  doc.y -= SECTION_GAP;

  // --- Principal Transaction: itemised ------------------------------------
  const pW = colWidths(BODY_W, [74, 70, 118, 86, 78, 78]);
  const pCols = [
    { header: "Date", width: pW[0] },
    { header: "Description", width: pW[1] },
    { header: "Cashflow (RM) @ Price", width: pW[2], align: "right" as const },
    { header: "Avg. Cost (RM)", width: pW[3], align: "right" as const },
    { header: "Units Issued", width: pW[4], align: "right" as const },
    { header: "Units Balanced", width: pW[5], align: "right" as const },
  ];
  let runUnits = openingUnits, runCost = openingCost;
  const pRows: Cell[][] = [
    [dstr(fyStart), "Opening", "-", runUnits > 0 ? rm(runCost / runUnits, 4) : "-", "-", fmt(runUnits)],
  ];
  for (const tx of transactionsInFy) {
    const d = new Date(tx.date + "T00:00:00Z");
    const amt = Number(tx.amount), units = Number(tx.units), price = Number(tx.nta);
    const signedUnits = tx.type === "Subscription" ? units : -units;
    runUnits += signedUnits;
    runCost += tx.type === "Subscription" ? amt : -amt;
    pRows.push([
      dstr(d), tx.type, `${rm(amt)} @ ${fmt(price)}`,
      runUnits > 0 ? rm(runCost / runUnits, 4) : "-",
      redIfNegative(signedUnits, 4), fmt(runUnits),
    ]);
  }
  pRows.push([dstr(fyEnd), "Closing", "-", closingUnits > 0 ? rm(closingCost / closingUnits, 4) : "-", "-", fmt(closingUnits)]);
  drawKeptTogether(doc, "Principal Transaction", { columns: pCols, rows: pRows });
  doc.y -= SECTION_GAP;

  // --- Dividend Transaction: itemised --------------------------------------
  const dW = colWidths(BODY_W, [76, 96, 60, 88, 96, 92]);
  const dCols = [
    { header: "Date", width: dW[0] },
    { header: "Description", width: dW[1] },
    { header: "DPS", width: dW[2], align: "right" as const },
    { header: "Holding Units", width: dW[3], align: "right" as const },
    { header: "Dividend Amount (RM)", width: dW[4], align: "right" as const },
    { header: "Balanced (RM)", width: dW[5], align: "right" as const },
  ];
  let runningDiv = 0;
  const dRows: Cell[][] = [[dstr(fyStart), "Opening", "", "", "", rm(0)]];
  for (const d of distributionsInFy) {
    const payDate = new Date((d.pay_date || d.ex_date) + "T00:00:00Z");
    const dps = Number(d.dps);
    const amount = Math.round(closingUnits * dps / 100 * 100) / 100;
    runningDiv += amount;
    dRows.push([dstr(payDate), `${d.type || ""} Dividend`.trim(), fmt(dps), fmt(closingUnits), rm(amount), rm(runningDiv)]);
  }
  const dividendReceived = Math.round(runningDiv * 100) / 100;
  dRows.push([dstr(fyEnd), "Closing", "", "", "", rm(dividendReceived)]);
  drawKeptTogether(doc, "Dividend Transaction", { columns: dCols, rows: dRows });
  doc.y -= SECTION_GAP;

  // --- Account Summary -------------------------------------------------------
  const marketValue = Math.round(closingUnits * latestNavPerUnit * 100) / 100;
  const costBasis = Math.round(closingCost * 100) / 100;
  const unrealizedPl = Math.round((marketValue - costBasis) * 100) / 100;
  const totalPl = Math.round((unrealizedPl + realizedPl + dividendReceived + adjustment) * 100) / 100;
  const totalPerfPct = costBasis ? (totalPl / costBasis) * 100 : null;
  const irr = xirr(cashflowsForIrr);

  const sW = colWidths(BODY_W, [174, 103, 103, 126]);
  const sCols = [
    { header: "Fields", width: sW[0] },
    { header: "Holding Units", width: sW[1], align: "right" as const },
    { header: "Average Price", width: sW[2], align: "right" as const },
    { header: "Total Value (RM)", width: sW[3], align: "right" as const },
  ];
  // One table start to finish — the performance rows below just leave the
  // Holding Units / Average Price columns blank rather than starting a
  // second, visually detached table.
  const sRows: Cell[][] = [
    ["( a )  Latest Fund Price", fmt(closingUnits), fmt(latestNavPerUnit, 6), rm(marketValue)],
    ["( b )  Subscription Cost", fmt(closingUnits), closingUnits ? fmt(Math.abs(costBasis / closingUnits), 6) : "-",
      redIfNegative(-costBasis, 2)],
    ["( c )  Unrealized Profit & Loss:  ( a ) + ( b )", "", "", rm(unrealizedPl)],
    ["( d )  Realized Profit & Loss", "", "", rm(realizedPl)],
    ["( e )  Dividend Received", "", "", rm(dividendReceived)],
    ["( f )  Adjustment", "", "", rm(adjustment)],
    ["Total Profit & Loss:  ( c ) + ( d ) + ( e ) + ( f )", "", "", rm(totalPl)],
    ["Total Performance %", "", "", totalPerfPct !== null ? `${totalPerfPct.toFixed(2)} %` : "-"],
    ["Annualized Performance* %", "", "", irr !== null ? `${(irr * 100).toFixed(2)} %` : "-"],
  ];
  drawKeptTogether(doc, "Account Summary", { columns: sCols, rows: sRows });
  doc.y -= 2;
  const { sans } = doc.fonts;
  drawText(doc,
    "*Powered by Financial Formulation of Internal Rate of Return (IRR) & Mathematical Algorithm Newton's method",
    { x: 45, y: doc.y - 10, font: sans, size: CONTENT_SIZE - 1 });
  doc.y -= 18;

  drawImportantNotices(doc);
  drawFooterOnAllPages(doc);
  return doc.pdf.save();
}
