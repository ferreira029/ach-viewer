export type AchRecordKind =
  | "fileHeader"
  | "batchHeader"
  | "entryDetail"
  | "addenda"
  | "batchControl"
  | "fileControl";

export type ValidationLevel = "error" | "warning";

export interface ValidationMessage {
  id: string;
  level: ValidationLevel;
  message: string;
}

export interface DetailField {
  label: string;
  value: string;
}

export interface BaseAchRecord {
  kind: AchRecordKind;
  lineNumber: number;
  raw: string;
}

export interface FileHeaderRecord extends BaseAchRecord {
  kind: "fileHeader";
  priorityCode: string;
  immediateDestination: string;
  immediateOrigin: string;
  fileCreationDate: string;
  fileCreationTime: string;
  fileIdModifier: string;
  recordSize: string;
  blockingFactor: string;
  formatCode: string;
  immediateDestinationName: string;
  immediateOriginName: string;
  referenceCode: string;
}

export interface BatchHeaderRecord extends BaseAchRecord {
  kind: "batchHeader";
  serviceClassCode: string;
  companyName: string;
  companyDiscretionaryData: string;
  companyId: string;
  standardEntryClassCode: string;
  companyEntryDescription: string;
  companyDescriptiveDate: string;
  effectiveEntryDate: string;
  settlementDate: string;
  originatorStatusCode: string;
  originationDfiId: string;
  batchNumber: string;
}

export interface EntryDetailRecord extends BaseAchRecord {
  kind: "entryDetail";
  transactionCode: string;
  receivingDfiId: string;
  checkDigit: string;
  dfiAcctNbr: string;
  amount: string;
  amountInCents: number;
  individualIdNbr: string;
  individualName: string;
  discretionaryData: string;
  addendaRecordInd: string;
  traceNumber: string;
}

export interface AddendaRecord extends BaseAchRecord {
  kind: "addenda";
  addendaTypeCode: string;
  paymentRelatedInfo: string;
  addendaSeqNbr: string;
  entryDetailSeqNbr: string;
}

export interface BatchControlRecord extends BaseAchRecord {
  kind: "batchControl";
  serviceClassCode: string;
  entryAddendaCount: string;
  entryHash: string;
  totDebitDollarAmt: string;
  totCreditDollarAmt: string;
  companyId: string;
  messageAuthCode: string;
  reserved: string;
  originatingDfiId: string;
  batchNumber: string;
}

export interface FileControlRecord extends BaseAchRecord {
  kind: "fileControl";
  batchCount: string;
  blockCount: string;
  entryAddendaCount: string;
  entryHash: string;
  totDebitDollarAmt: string;
  totCreditDollarAmt: string;
  reserved: string;
}

export interface AchEntry {
  id: string;
  detail: EntryDetailRecord;
  addendas: AddendaRecord[];
}

export interface AchBatchSummary {
  entryCount: number;
  addendaCount: number;
  debitAmountInCents: number;
  creditAmountInCents: number;
  entryHash: string;
}

export interface AchBatch {
  id: string;
  header: BatchHeaderRecord;
  entries: AchEntry[];
  control?: BatchControlRecord;
  summary: AchBatchSummary;
  validationMessages: ValidationMessage[];
}

export interface AchFileSummary {
  batchCount: number;
  entryCount: number;
  addendaCount: number;
  debitAmountInCents: number;
  creditAmountInCents: number;
  entryHash: string;
  blockCount: number;
  recordCount: number;
  paddingCount: number;
}

export interface ParsedAchFile {
  fileHeader?: FileHeaderRecord;
  batches: AchBatch[];
  fileControl?: FileControlRecord;
  paddingRecords: string[];
  validationMessages: ValidationMessage[];
  summary: AchFileSummary;
}
