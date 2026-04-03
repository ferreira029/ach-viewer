import {
  type AchBatch,
  type AchBatchSummary,
  type AddendaRecord,
  type BatchControlRecord,
  type BatchHeaderRecord,
  type EntryDetailRecord,
  type FileControlRecord,
  type FileHeaderRecord,
  type ParsedAchFile,
  type ValidationMessage,
} from "@/lib/ach/types";

const RECORD_LENGTH = 94;
const DEFAULT_BLOCKING_FACTOR = 10;

const CREDIT_TRANSACTION_CODES = new Set([
  "20",
  "21",
  "22",
  "23",
  "24",
  "30",
  "31",
  "32",
  "33",
  "34",
  "40",
  "41",
  "42",
  "43",
  "44",
  "50",
  "51",
  "52",
  "53",
  "54",
  "80",
  "81",
  "82",
  "83",
  "84",
]);

const DEBIT_TRANSACTION_CODES = new Set([
  "25",
  "26",
  "27",
  "28",
  "29",
  "35",
  "36",
  "37",
  "38",
  "39",
  "45",
  "46",
  "47",
  "48",
  "49",
  "55",
  "56",
  "57",
  "58",
  "59",
  "85",
  "86",
  "87",
  "88",
  "89",
]);

function sliceField(record: string, start: number, end: number) {
  return record.slice(start - 1, end).trim();
}

function createValidationMessage(
  level: ValidationMessage["level"],
  message: string,
  suffix?: string,
): ValidationMessage {
  return {
    id: `${level}-${message}-${suffix ?? ""}`.toLowerCase().replace(/\s+/g, "-"),
    level,
    message,
  };
}

function parseInteger(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return 0;
  }

  return Number.parseInt(normalized, 10);
}

function formatEntryHash(value: number) {
  return String(value % 10_000_000_000).padStart(10, "0");
}

function splitRecords(source: string) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const content = normalized.replace(/^\n+|\n+$/g, "");

  if (!content) {
    throw new Error("The ACH file is empty.");
  }

  const rawLines = content.split("\n");
  const firstAchLineIndex = rawLines.findIndex(
    (line) => line.length === RECORD_LENGTH && /^[1-9]/.test(line),
  );

  const lines = firstAchLineIndex >= 0 ? rawLines.slice(firstAchLineIndex) : rawLines;

  if (lines.length > 1) {
    const invalidLine = lines.find((line) => line.length !== RECORD_LENGTH);

    if (invalidLine) {
      throw new Error(
        `Each ACH record must have ${RECORD_LENGTH} characters. Found ${invalidLine.length}.`,
      );
    }

    return lines;
  }

  if (content.length % RECORD_LENGTH !== 0) {
    throw new Error(
      `The ACH content length must be a multiple of ${RECORD_LENGTH} when no line breaks are present.`,
    );
  }

  const records: string[] = [];

  for (let index = 0; index < content.length; index += RECORD_LENGTH) {
    records.push(content.slice(index, index + RECORD_LENGTH));
  }

  return records;
}

function parseFileHeader(record: string, lineNumber: number): FileHeaderRecord {
  return {
    kind: "fileHeader",
    lineNumber,
    raw: record,
    priorityCode: sliceField(record, 2, 3),
    immediateDestination: sliceField(record, 4, 13),
    immediateOrigin: sliceField(record, 14, 23),
    fileCreationDate: sliceField(record, 24, 29),
    fileCreationTime: sliceField(record, 30, 33),
    fileIdModifier: sliceField(record, 34, 34),
    recordSize: sliceField(record, 35, 37),
    blockingFactor: sliceField(record, 38, 39),
    formatCode: sliceField(record, 40, 40),
    immediateDestinationName: sliceField(record, 41, 63),
    immediateOriginName: sliceField(record, 64, 86),
    referenceCode: sliceField(record, 87, 94),
  };
}

function parseBatchHeader(record: string, lineNumber: number): BatchHeaderRecord {
  return {
    kind: "batchHeader",
    lineNumber,
    raw: record,
    serviceClassCode: sliceField(record, 2, 4),
    companyName: sliceField(record, 5, 20),
    companyDiscretionaryData: sliceField(record, 21, 40),
    companyId: sliceField(record, 41, 50),
    standardEntryClassCode: sliceField(record, 51, 53),
    companyEntryDescription: sliceField(record, 54, 63),
    companyDescriptiveDate: sliceField(record, 64, 69),
    effectiveEntryDate: sliceField(record, 70, 75),
    settlementDate: sliceField(record, 76, 78),
    originatorStatusCode: sliceField(record, 79, 79),
    originationDfiId: sliceField(record, 80, 87),
    batchNumber: sliceField(record, 88, 94),
  };
}

function parseEntryDetail(record: string, lineNumber: number): EntryDetailRecord {
  const amount = sliceField(record, 30, 39);

  return {
    kind: "entryDetail",
    lineNumber,
    raw: record,
    transactionCode: sliceField(record, 2, 3),
    receivingDfiId: sliceField(record, 4, 11),
    checkDigit: sliceField(record, 12, 12),
    dfiAcctNbr: sliceField(record, 13, 29),
    amount,
    amountInCents: parseInteger(amount),
    individualIdNbr: sliceField(record, 40, 54),
    individualName: sliceField(record, 55, 76),
    discretionaryData: sliceField(record, 77, 78),
    addendaRecordInd: sliceField(record, 79, 79),
    traceNumber: sliceField(record, 80, 94),
  };
}

function parseAddenda(record: string, lineNumber: number): AddendaRecord {
  return {
    kind: "addenda",
    lineNumber,
    raw: record,
    addendaTypeCode: sliceField(record, 2, 3),
    paymentRelatedInfo: sliceField(record, 4, 83),
    addendaSeqNbr: sliceField(record, 84, 87),
    entryDetailSeqNbr: sliceField(record, 88, 94),
  };
}

function parseBatchControl(record: string, lineNumber: number): BatchControlRecord {
  return {
    kind: "batchControl",
    lineNumber,
    raw: record,
    serviceClassCode: sliceField(record, 2, 4),
    entryAddendaCount: sliceField(record, 5, 10),
    entryHash: sliceField(record, 11, 20),
    totDebitDollarAmt: sliceField(record, 21, 32),
    totCreditDollarAmt: sliceField(record, 33, 44),
    companyId: sliceField(record, 45, 54),
    messageAuthCode: sliceField(record, 55, 73),
    reserved: sliceField(record, 74, 79),
    originatingDfiId: sliceField(record, 80, 87),
    batchNumber: sliceField(record, 88, 94),
  };
}

function parseFileControl(record: string, lineNumber: number): FileControlRecord {
  return {
    kind: "fileControl",
    lineNumber,
    raw: record,
    batchCount: sliceField(record, 2, 7),
    blockCount: sliceField(record, 8, 13),
    entryAddendaCount: sliceField(record, 14, 21),
    entryHash: sliceField(record, 22, 31),
    totDebitDollarAmt: sliceField(record, 32, 43),
    totCreditDollarAmt: sliceField(record, 44, 55),
    reserved: sliceField(record, 56, 94),
  };
}

function calculateBatchSummary(batch: AchBatch): AchBatchSummary {
  let addendaCount = 0;
  let debitAmountInCents = 0;
  let creditAmountInCents = 0;
  let entryHash = 0;

  for (const entry of batch.entries) {
    addendaCount += entry.addendas.length;
    entryHash += parseInteger(entry.detail.receivingDfiId);

    if (CREDIT_TRANSACTION_CODES.has(entry.detail.transactionCode)) {
      creditAmountInCents += entry.detail.amountInCents;
    }

    if (DEBIT_TRANSACTION_CODES.has(entry.detail.transactionCode)) {
      debitAmountInCents += entry.detail.amountInCents;
    }
  }

  return {
    entryCount: batch.entries.length,
    addendaCount,
    debitAmountInCents,
    creditAmountInCents,
    entryHash: formatEntryHash(entryHash),
  };
}

function validateBatch(batch: AchBatch) {
  const messages: ValidationMessage[] = [];

  if (!batch.control) {
    messages.push(
      createValidationMessage("error", `Batch ${batch.header.batchNumber} is missing a batch control record.`),
    );

    return messages;
  }

  const expectedEntryAddendaCount = batch.summary.entryCount + batch.summary.addendaCount;

  if (parseInteger(batch.control.entryAddendaCount) !== expectedEntryAddendaCount) {
    messages.push(
      createValidationMessage(
        "error",
        `Batch ${batch.header.batchNumber} entry/addenda count does not match the control record.`,
      ),
    );
  }

  if (batch.control.entryHash !== batch.summary.entryHash) {
    messages.push(
      createValidationMessage(
        "error",
        `Batch ${batch.header.batchNumber} entry hash does not match the control record.`,
      ),
    );
  }

  if (parseInteger(batch.control.totDebitDollarAmt) !== batch.summary.debitAmountInCents) {
    messages.push(
      createValidationMessage(
        "error",
        `Batch ${batch.header.batchNumber} debit total does not match the control record.`,
      ),
    );
  }

  if (parseInteger(batch.control.totCreditDollarAmt) !== batch.summary.creditAmountInCents) {
    messages.push(
      createValidationMessage(
        "error",
        `Batch ${batch.header.batchNumber} credit total does not match the control record.`,
      ),
    );
  }

  return messages;
}

function calculateFileSummary(file: ParsedAchFile) {
  const entryHash = file.batches.reduce(
    (total, batch) => total + parseInteger(batch.summary.entryHash),
    0,
  );

  const nonPaddingRecordCount =
    (file.fileHeader ? 1 : 0) +
    file.batches.reduce((total, batch) => {
      return total + 1 + batch.entries.length + batch.summary.addendaCount + (batch.control ? 1 : 0);
    }, 0) +
    (file.fileControl ? 1 : 0);

  const blockingFactor = file.fileHeader
    ? parseInteger(file.fileHeader.blockingFactor) || DEFAULT_BLOCKING_FACTOR
    : DEFAULT_BLOCKING_FACTOR;

  return {
    batchCount: file.batches.length,
    entryCount: file.batches.reduce((total, batch) => total + batch.summary.entryCount, 0),
    addendaCount: file.batches.reduce((total, batch) => total + batch.summary.addendaCount, 0),
    debitAmountInCents: file.batches.reduce(
      (total, batch) => total + batch.summary.debitAmountInCents,
      0,
    ),
    creditAmountInCents: file.batches.reduce(
      (total, batch) => total + batch.summary.creditAmountInCents,
      0,
    ),
    entryHash: formatEntryHash(entryHash),
    blockCount: Math.ceil(nonPaddingRecordCount / blockingFactor),
    recordCount: nonPaddingRecordCount,
    paddingCount: file.paddingRecords.length,
  };
}

function validateFile(file: ParsedAchFile) {
  const messages = [...file.validationMessages];

  if (!file.fileHeader) {
    messages.push(createValidationMessage("error", "The ACH file is missing a file header record."));
  }

  if (!file.fileControl) {
    messages.push(createValidationMessage("error", "The ACH file is missing a file control record."));
    return messages;
  }

  if (parseInteger(file.fileControl.batchCount) !== file.summary.batchCount) {
    messages.push(createValidationMessage("error", "The file batch count does not match the file control record."));
  }

  if (parseInteger(file.fileControl.entryAddendaCount) !== file.summary.entryCount + file.summary.addendaCount) {
    messages.push(
      createValidationMessage("error", "The file entry/addenda count does not match the file control record."),
    );
  }

  if (file.fileControl.entryHash !== file.summary.entryHash) {
    messages.push(createValidationMessage("error", "The file entry hash does not match the file control record."));
  }

  if (parseInteger(file.fileControl.totDebitDollarAmt) !== file.summary.debitAmountInCents) {
    messages.push(createValidationMessage("error", "The file debit total does not match the file control record."));
  }

  if (parseInteger(file.fileControl.totCreditDollarAmt) !== file.summary.creditAmountInCents) {
    messages.push(createValidationMessage("error", "The file credit total does not match the file control record."));
  }

  if (parseInteger(file.fileControl.blockCount) !== file.summary.blockCount) {
    messages.push(createValidationMessage("error", "The file block count does not match the file control record."));
  }

  return messages;
}

export function parseAchFile(source: string): ParsedAchFile {
  const records = splitRecords(source);
  const file: ParsedAchFile = {
    batches: [],
    paddingRecords: [],
    validationMessages: [],
    summary: {
      batchCount: 0,
      entryCount: 0,
      addendaCount: 0,
      debitAmountInCents: 0,
      creditAmountInCents: 0,
      entryHash: "0000000000",
      blockCount: 0,
      recordCount: 0,
      paddingCount: 0,
    },
  };

  let currentBatch: AchBatch | undefined;
  let currentEntry: AchBatch["entries"][number] | undefined;
  let fileControlSeen = false;

  for (const [index, record] of records.entries()) {
    const lineNumber = index + 1;
    const recordType = record.slice(0, 1);

    if (fileControlSeen) {
      if (/^9+$/.test(record)) {
        file.paddingRecords.push(record);
        continue;
      }

      file.validationMessages.push(
        createValidationMessage(
          "warning",
          `Line ${lineNumber} appears after the file control record and was ignored.`,
        ),
      );
      continue;
    }

    switch (recordType) {
      case "1": {
        file.fileHeader = parseFileHeader(record, lineNumber);
        currentBatch = undefined;
        currentEntry = undefined;
        break;
      }
      case "5": {
        const batch: AchBatch = {
          id: `batch-${lineNumber}`,
          header: parseBatchHeader(record, lineNumber),
          entries: [],
          summary: {
            entryCount: 0,
            addendaCount: 0,
            debitAmountInCents: 0,
            creditAmountInCents: 0,
            entryHash: "0000000000",
          },
          validationMessages: [],
        };

        file.batches.push(batch);
        currentBatch = batch;
        currentEntry = undefined;
        break;
      }
      case "6": {
        if (!currentBatch) {
          file.validationMessages.push(
            createValidationMessage(
              "error",
              `Line ${lineNumber} is an entry detail record outside of a batch.`,
            ),
          );
          break;
        }

        const entry = {
          id: `entry-${lineNumber}`,
          detail: parseEntryDetail(record, lineNumber),
          addendas: [],
        };

        currentBatch.entries.push(entry);
        currentEntry = entry;
        break;
      }
      case "7": {
        if (!currentEntry) {
          file.validationMessages.push(
            createValidationMessage("error", `Line ${lineNumber} is an addenda record without an entry detail.`),
          );
          break;
        }

        currentEntry.addendas.push(parseAddenda(record, lineNumber));
        break;
      }
      case "8": {
        if (!currentBatch) {
          file.validationMessages.push(
            createValidationMessage(
              "error",
              `Line ${lineNumber} is a batch control record without a batch header.`,
            ),
          );
          break;
        }

        currentBatch.control = parseBatchControl(record, lineNumber);
        currentBatch.summary = calculateBatchSummary(currentBatch);
        currentBatch.validationMessages = validateBatch(currentBatch);
        currentBatch = undefined;
        currentEntry = undefined;
        break;
      }
      case "9": {
        file.fileControl = parseFileControl(record, lineNumber);
        fileControlSeen = true;
        currentBatch = undefined;
        currentEntry = undefined;
        break;
      }
      default: {
        file.validationMessages.push(
          createValidationMessage("warning", `Line ${lineNumber} has an unsupported record type "${recordType}".`),
        );
      }
    }
  }

  for (const batch of file.batches) {
    if (batch.summary.entryHash === "0000000000" && batch.entries.length > 0) {
      batch.summary = calculateBatchSummary(batch);
      batch.validationMessages = validateBatch(batch);
    }
  }

  file.summary = calculateFileSummary(file);
  file.validationMessages = [
    ...file.validationMessages,
    ...file.batches.flatMap((batch) => batch.validationMessages),
  ];
  file.validationMessages = validateFile(file);

  return file;
}
