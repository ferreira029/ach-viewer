import type { AchBatch, AchEntry, FileHeaderRecord } from "@/lib/ach/types";

const RECORD_LENGTH = 94;
const BLOCKING_FACTOR = 10;
const RETURN_CREDIT_SPACER_LENGTH = 26;
const RETURN_DEBIT_SPACER_LENGTH = 20;
const CREDIT_TRANSACTION_CODES = new Set(["22", "32"]);
const DEBIT_TRANSACTION_CODES = new Set(["27", "37"]);

export type AchReturnKind = "return" | "noc";

export interface AchReturnFormValues {
  returnKind: AchReturnKind;
  returnCode: string;
  companyId: string;
  entryClass: string;
  returnDate: string;
  effectiveEntryDate: string;
  companyName: string;
  companyEntryDescription: string;
  paymentRelatedInfo: string;
  fileName: string;
}

export interface AchReturnSource {
  fileHeader?: FileHeaderRecord;
  batch: AchBatch;
  entry: AchEntry;
}

export interface GeneratedAchReturnFile {
  content: string;
  fileName: string;
}

function padLeft(value: string, length: number, fill = "0") {
  return value.slice(-length).padStart(length, fill);
}

function padRight(value: string, length: number, fill = " ") {
  return value.slice(0, length).padEnd(length, fill);
}

function currentAchDate() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function currentAchTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${hours}${minutes}`;
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function getPaymentDirection(transactionCode: string) {
  if (CREDIT_TRANSACTION_CODES.has(transactionCode)) {
    return "credit";
  }

  if (DEBIT_TRANSACTION_CODES.has(transactionCode)) {
    return "debit";
  }

  return "credit";
}

function buildPaymentRelatedInformation(
  values: AchReturnFormValues,
  amountInCents: number,
  transactionCode: string,
) {
  if (values.paymentRelatedInfo.trim()) {
    return padRight(values.paymentRelatedInfo.trim(), 80);
  }

  const amount = String(amountInCents);
  const spacerLength =
    getPaymentDirection(transactionCode) === "credit"
      ? RETURN_CREDIT_SPACER_LENGTH
      : RETURN_DEBIT_SPACER_LENGTH;
  const prefix = `${values.returnCode}${" ".repeat(spacerLength)}${amount}`;

  return padRight(prefix, 80);
}

function getControlTotals(sources: AchReturnSource[]) {
  let entryHashTotal = 0;
  let debitAmountTotal = 0;
  let creditAmountTotal = 0;

  for (const source of sources) {
    entryHashTotal += Number.parseInt(source.entry.detail.receivingDfiId || "0", 10);

    if (getPaymentDirection(source.entry.detail.transactionCode) === "debit") {
      debitAmountTotal += source.entry.detail.amountInCents;
    } else {
      creditAmountTotal += source.entry.detail.amountInCents;
    }
  }

  return {
    entryHash: padLeft(String(entryHashTotal % 10_000_000_000), 10),
    debitAmount: padLeft(String(debitAmountTotal), 12),
    creditAmount: padLeft(String(creditAmountTotal), 12),
    entryAddendaCount: padLeft(String(sources.length * 2), 6),
    fileEntryAddendaCount: padLeft(String(sources.length * 2), 8),
  };
}

function buildFileHeader(source: AchReturnSource, values: AchReturnFormValues) {
  const fileHeader = source.fileHeader;

  return [
    "1",
    padRight(fileHeader?.priorityCode || "01", 2, "0"),
    padLeft(fileHeader?.immediateDestination || "", 10, " "),
    padLeft(fileHeader?.immediateOrigin || "", 10, " "),
    currentAchDate(),
    currentAchTime(),
    padRight(fileHeader?.fileIdModifier || "A", 1),
    padLeft(fileHeader?.recordSize || "094", 3),
    padLeft(fileHeader?.blockingFactor || "10", 2),
    padLeft(fileHeader?.formatCode || "1", 1),
    padRight(fileHeader?.immediateDestinationName || "Receiving Bank", 23),
    padRight(fileHeader?.immediateOriginName || values.companyName, 23),
    padRight(fileHeader?.referenceCode || "", 8),
  ].join("");
}

function buildBatchHeader(source: AchReturnSource, values: AchReturnFormValues) {
  return [
    "5",
    padLeft(source.batch.header.serviceClassCode || "200", 3),
    padRight(values.companyName, 16),
    padRight(source.batch.header.companyDiscretionaryData || "", 20),
    padRight(values.companyId, 10),
    padRight(values.entryClass, 3),
    padRight(values.companyEntryDescription, 10),
    padRight(values.returnDate, 6),
    padRight(values.effectiveEntryDate, 6),
    padRight("000", 3),
    padRight(source.batch.header.originatorStatusCode || "1", 1),
    padLeft(source.batch.header.originationDfiId || "00000000", 8),
    padLeft(source.batch.header.batchNumber || "1", 7),
  ].join("");
}

function buildEntryDetail(source: AchReturnSource, traceSequence: string) {
  const routingNumber = `${source.entry.detail.receivingDfiId}${source.entry.detail.checkDigit}`;
  const normalizedRoutingNumber = normalizeDigits(routingNumber);
  const receivingDfiId = normalizedRoutingNumber.slice(0, 8);
  const checkDigit = normalizedRoutingNumber.slice(8, 9);
  const traceNumber = `${padLeft(source.batch.header.originationDfiId || "00000000", 8)}${traceSequence}`;

  return [
    "6",
    padLeft(source.entry.detail.transactionCode, 2),
    padLeft(receivingDfiId, 8),
    padLeft(checkDigit, 1),
    padRight(source.entry.detail.dfiAcctNbr, 17),
    padLeft(String(source.entry.detail.amountInCents), 10),
    padRight(source.entry.detail.individualIdNbr || "", 15),
    padRight(source.entry.detail.individualName || "", 22),
    padRight(source.entry.detail.discretionaryData || "", 2),
    "1",
    padLeft(traceNumber, 15),
  ].join("");
}

function buildAddenda(source: AchReturnSource, values: AchReturnFormValues, traceSequence: string) {
  return [
    "7",
    values.returnKind === "noc" ? "98" : "99",
    buildPaymentRelatedInformation(
      values,
      source.entry.detail.amountInCents,
      source.entry.detail.transactionCode,
    ),
    "0001",
    traceSequence,
  ].join("");
}

function buildBatchControl(source: AchReturnSource, values: AchReturnFormValues, sources: AchReturnSource[]) {
  const totals = getControlTotals(sources);

  return [
    "8",
    padLeft(source.batch.header.serviceClassCode || "200", 3),
    totals.entryAddendaCount,
    totals.entryHash,
    totals.debitAmount,
    totals.creditAmount,
    padRight(values.companyId, 10),
    padRight("", 19),
    padRight("", 6),
    padLeft(source.batch.header.originationDfiId || "00000000", 8),
    padLeft(source.batch.header.batchNumber || "1", 7),
  ].join("");
}

function buildFileControl(sources: AchReturnSource[], recordsCount: number) {
  const totals = getControlTotals(sources);
  const blockCount = padLeft(String(Math.ceil(recordsCount / BLOCKING_FACTOR)), 6);

  return [
    "9",
    "000001",
    blockCount,
    totals.fileEntryAddendaCount,
    totals.entryHash,
    totals.debitAmount,
    totals.creditAmount,
    padRight("", 39),
  ].join("");
}

function padToBlock(records: string[]) {
  const paddingNeeded = (BLOCKING_FACTOR - (records.length % BLOCKING_FACTOR || BLOCKING_FACTOR)) % BLOCKING_FACTOR;

  return [
    ...records,
    ...Array.from({ length: paddingNeeded }, () => "9".repeat(RECORD_LENGTH)),
  ];
}

export function createDefaultReturnFormValues(sources: AchReturnSource[]): AchReturnFormValues {
  const source = sources[0];

  if (!source) {
    throw new Error("At least one payment is required.");
  }

  const dateStamp = currentAchDate();
  const trace = normalizeDigits(source.entry.detail.traceNumber).slice(-7) || "0000001";
  const fileName = sources.length === 1 ? `return-${trace}.ach` : `return-${dateStamp}.ach`;

  return {
    returnKind: "return",
    returnCode: "R03",
    companyId: source.batch.header.companyId,
    entryClass: source.batch.header.standardEntryClassCode || "CCD",
    returnDate: dateStamp,
    effectiveEntryDate: source.batch.header.effectiveEntryDate,
    companyName: source.batch.header.companyName,
    companyEntryDescription: source.batch.header.companyEntryDescription,
    paymentRelatedInfo: "",
    fileName,
  };
}

export function createReturnAchFile(
  sources: AchReturnSource[],
  values: AchReturnFormValues,
): GeneratedAchReturnFile {
  const source = sources[0];

  if (!source) {
    throw new Error("Select at least one payment to generate a return file.");
  }

  if (!values.returnCode.trim()) {
    throw new Error("Return code is required.");
  }

  const entryRecords = sources.flatMap((currentSource, index) => {
    const traceSequence = padLeft(String(index + 1), 7);

    return [
      buildEntryDetail(currentSource, traceSequence),
      buildAddenda(currentSource, values, traceSequence),
    ];
  });

  const recordsWithoutFileControl = [
    buildFileHeader(source, values),
    buildBatchHeader(source, values),
    ...entryRecords,
    buildBatchControl(source, values, sources),
  ];
  const fileControl = buildFileControl(sources, recordsWithoutFileControl.length + 1);
  const records = [...recordsWithoutFileControl, fileControl];

  const content = `${padToBlock(records).join("\r\n")}\r\n`;

  return {
    content,
    fileName: values.fileName.trim() || "return.ach",
  };
}
