"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { AchReturnGenerator } from "@/components/ach-return-generator";
import styles from "@/components/ach-viewer.module.css";
import { formatCount, formatCurrencyFromCents } from "@/lib/ach/formatters";
import { parseAchFile } from "@/lib/ach/parser";
import type {
  AchBatch,
  AchEntry,
  AddendaRecord,
  BatchControlRecord,
  DetailField,
  FileControlRecord,
  FileHeaderRecord,
  ParsedAchFile,
  ValidationMessage,
} from "@/lib/ach/types";
import { defaultLocale, messages, type Locale } from "@/lib/i18n";

type ViewerSelection = {
  key: string;
  title: string;
  subtitle: string;
  fields: DetailField[];
  raw: string;
  lineNumber?: number;
};

type PaymentItem = {
  id: string;
  batch: AchBatch;
  batchNumber: string;
  companyName: string;
  secCode: string;
  effectiveEntryDate: string;
  receiverName: string;
  traceNumber: string;
  amountInCents: number;
  transactionCode: string;
  addendaCount: number;
  direction: string;
  entry: AchEntry;
};

type ViewerTab = "basic" | "advanced" | "return";
type ReturnScope = "all" | "selected";
type UiText = (typeof messages)[Locale];

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

function buildFileHeaderFields(record: FileHeaderRecord, text: UiText): DetailField[] {
  return [
    { label: text.priorityCodeLabel, value: record.priorityCode },
    { label: text.immediateDestinationLabel, value: record.immediateDestination },
    { label: text.immediateOriginLabel, value: record.immediateOrigin },
    { label: text.fileCreationDateLabel, value: record.fileCreationDate },
    { label: text.fileCreationTimeLabel, value: record.fileCreationTime },
    { label: text.fileIdModifierLabel, value: record.fileIdModifier },
    { label: text.recordSizeLabel, value: record.recordSize },
    { label: text.blockingFactorLabel, value: record.blockingFactor },
    { label: text.formatCodeLabel, value: record.formatCode },
    { label: text.destinationNameLabel, value: record.immediateDestinationName },
    { label: text.originNameLabel, value: record.immediateOriginName },
    { label: text.referenceCodeLabel, value: record.referenceCode || "-" },
  ];
}

function buildBatchHeaderFields(batch: AchBatch, text: UiText, locale: Locale): DetailField[] {
  return [
    { label: text.paymentBatchLabel, value: batch.header.batchNumber },
    { label: text.companyNameLabel, value: batch.header.companyName },
    { label: text.companyIdLabel, value: batch.header.companyId },
    { label: text.serviceClassCodeLabel, value: batch.header.serviceClassCode },
    { label: text.standardEntryClassLabel, value: batch.header.standardEntryClassCode },
    { label: text.entryDescriptionLabel, value: batch.header.companyEntryDescription },
    { label: text.effectiveDateLabel, value: batch.header.effectiveEntryDate },
    { label: text.settlementDateLabel, value: batch.header.settlementDate || "-" },
    { label: text.originatorStatusCodeLabel, value: batch.header.originatorStatusCode },
    { label: text.originationDfiIdLabel, value: batch.header.originationDfiId },
    { label: text.entryCountLabel, value: formatCount(batch.summary.entryCount, locale) },
    { label: text.addendaCountLabel, value: formatCount(batch.summary.addendaCount, locale) },
    { label: text.debitsLabel, value: formatCurrencyFromCents(batch.summary.debitAmountInCents, locale) },
    { label: text.creditsLabel, value: formatCurrencyFromCents(batch.summary.creditAmountInCents, locale) },
    { label: text.entryHashLabel, value: batch.summary.entryHash },
  ];
}

function buildEntryFields(entry: AchEntry, text: UiText, locale: Locale): DetailField[] {
  return [
    { label: text.paymentCodeLabel, value: entry.detail.transactionCode },
    { label: text.receivingDfiIdLabel, value: entry.detail.receivingDfiId },
    { label: text.checkDigitLabel, value: entry.detail.checkDigit },
    { label: text.dfiAccountNumberLabel, value: entry.detail.dfiAcctNbr },
    { label: text.amountLabel, value: formatCurrencyFromCents(entry.detail.amountInCents, locale) },
    { label: text.individualIdLabel, value: entry.detail.individualIdNbr || "-" },
    { label: text.individualNameLabel, value: entry.detail.individualName || "-" },
    { label: text.discretionaryDataLabel, value: entry.detail.discretionaryData || "-" },
    { label: text.addendaIndicatorLabel, value: entry.detail.addendaRecordInd },
    { label: text.paymentTraceLabel, value: entry.detail.traceNumber },
    { label: text.addendaCountLabel, value: formatCount(entry.addendas.length, locale) },
  ];
}

function buildAddendaFields(record: AddendaRecord, text: UiText): DetailField[] {
  return [
    { label: text.addendaTypeCodeLabel, value: record.addendaTypeCode },
    { label: text.paymentRelatedInfoFieldLabel, value: record.paymentRelatedInfo || "-" },
    { label: text.addendaSequenceNumberLabel, value: record.addendaSeqNbr },
    { label: text.entryDetailSequenceNumberLabel, value: record.entryDetailSeqNbr },
  ];
}

function buildBatchControlFields(record: BatchControlRecord, text: UiText, locale: Locale): DetailField[] {
  return [
    { label: text.serviceClassCodeLabel, value: record.serviceClassCode },
    { label: text.entryAddendaCountFieldLabel, value: record.entryAddendaCount },
    { label: text.entryHashLabel, value: record.entryHash },
    { label: text.debitsLabel, value: formatCurrencyFromCents(Number(record.totDebitDollarAmt), locale) },
    { label: text.creditsLabel, value: formatCurrencyFromCents(Number(record.totCreditDollarAmt), locale) },
    { label: text.companyIdLabel, value: record.companyId },
    { label: text.messageAuthenticationCodeLabel, value: record.messageAuthCode || "-" },
    { label: text.reservedLabel, value: record.reserved || "-" },
    { label: text.originationDfiIdLabel, value: record.originatingDfiId },
    { label: text.paymentBatchLabel, value: record.batchNumber },
  ];
}

function buildFileControlFields(record: FileControlRecord, text: UiText, locale: Locale): DetailField[] {
  return [
    { label: text.batchCountLabel, value: record.batchCount },
    { label: text.blockCountLabel, value: record.blockCount },
    { label: text.entryAddendaCountFieldLabel, value: record.entryAddendaCount },
    { label: text.entryHashLabel, value: record.entryHash },
    { label: text.debitsLabel, value: formatCurrencyFromCents(Number(record.totDebitDollarAmt), locale) },
    { label: text.creditsLabel, value: formatCurrencyFromCents(Number(record.totCreditDollarAmt), locale) },
    { label: text.reservedLabel, value: record.reserved || "-" },
  ];
}

function createFileHeaderSelection(record: FileHeaderRecord, text: UiText): ViewerSelection {
  return {
    key: "file-header",
    title: text.fileHeaderLabel,
    subtitle: text.achFileMetadataSubtitle,
    fields: buildFileHeaderFields(record, text),
    raw: record.raw,
    lineNumber: record.lineNumber,
  };
}

function createBatchSelection(batch: AchBatch, text: UiText, locale: Locale): ViewerSelection {
  return {
    key: batch.id,
    title: `${text.batchLabel} ${batch.header.batchNumber}`,
    subtitle: batch.header.companyName || batch.header.companyEntryDescription || text.achBatchSubtitle,
    fields: buildBatchHeaderFields(batch, text, locale),
    raw: batch.header.raw,
    lineNumber: batch.header.lineNumber,
  };
}

function createEntrySelection(entry: AchEntry, text: UiText, locale: Locale): ViewerSelection {
  return {
    key: entry.id,
    title: `${text.entryLabel} ${entry.detail.traceNumber}`,
    subtitle: entry.detail.individualName || text.entryDetailSubtitle,
    fields: buildEntryFields(entry, text, locale),
    raw: entry.detail.raw,
    lineNumber: entry.detail.lineNumber,
  };
}

function createAddendaSelection(record: AddendaRecord, index: number, text: UiText): ViewerSelection {
  return {
    key: `addenda-${record.lineNumber}`,
    title: `${text.addendaItemLabel} ${index + 1}`,
    subtitle: record.paymentRelatedInfo || text.addendaDetailSubtitle,
    fields: buildAddendaFields(record, text),
    raw: record.raw,
    lineNumber: record.lineNumber,
  };
}

function createBatchControlSelection(record: BatchControlRecord, text: UiText, locale: Locale): ViewerSelection {
  return {
    key: `batch-control-${record.lineNumber}`,
    title: `${text.controlLabel} ${record.batchNumber}`,
    subtitle: text.batchControlSubtitle,
    fields: buildBatchControlFields(record, text, locale),
    raw: record.raw,
    lineNumber: record.lineNumber,
  };
}

function createFileControlSelection(record: FileControlRecord, text: UiText, locale: Locale): ViewerSelection {
  return {
    key: "file-control",
    title: text.fileControlLabel,
    subtitle: text.fileControlSubtitle,
    fields: buildFileControlFields(record, text, locale),
    raw: record.raw,
    lineNumber: record.lineNumber,
  };
}

function getInitialSelection(parsedFile: ParsedAchFile, text: UiText, locale: Locale): ViewerSelection | null {
  if (parsedFile.fileHeader) {
    return createFileHeaderSelection(parsedFile.fileHeader, text);
  }

  if (parsedFile.batches[0]) {
    return createBatchSelection(parsedFile.batches[0], text, locale);
  }

  if (parsedFile.fileControl) {
    return createFileControlSelection(parsedFile.fileControl, text, locale);
  }

  return null;
}

function getSelectionByKey(
  parsedFile: ParsedAchFile,
  selectionKey: string | undefined,
  text: UiText,
  locale: Locale,
): ViewerSelection | null {
  if (!selectionKey) {
    return getInitialSelection(parsedFile, text, locale);
  }

  if (selectionKey === "file-header" && parsedFile.fileHeader) {
    return createFileHeaderSelection(parsedFile.fileHeader, text);
  }

  if (selectionKey === "file-control" && parsedFile.fileControl) {
    return createFileControlSelection(parsedFile.fileControl, text, locale);
  }

  for (const batch of parsedFile.batches) {
    if (selectionKey === batch.id) {
      return createBatchSelection(batch, text, locale);
    }

    if (batch.control && selectionKey === `batch-control-${batch.control.lineNumber}`) {
      return createBatchControlSelection(batch.control, text, locale);
    }

    for (const entry of batch.entries) {
      if (selectionKey === entry.id) {
        return createEntrySelection(entry, text, locale);
      }

      for (const [index, addenda] of entry.addendas.entries()) {
        if (selectionKey === `addenda-${addenda.lineNumber}`) {
          return createAddendaSelection(addenda, index, text);
        }
      }
    }
  }

  return getInitialSelection(parsedFile, text, locale);
}

function ValidationList({ items, text }: { items: ValidationMessage[]; text: UiText }) {
  if (items.length === 0) {
    return <p className={styles.validationSuccess}>{text.successValidation}</p>;
  }

  return (
    <div className={styles.validationList}>
      {items.map((item) => (
        <div
          key={item.id}
          className={item.level === "error" ? styles.validationError : styles.validationWarning}
        >
          <strong>{item.level === "error" ? text.errorLabel : text.warningLabel}</strong>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}

function getPaymentDirection(transactionCode: string, text: UiText) {
  return CREDIT_TRANSACTION_CODES.has(transactionCode) ? text.creditDirection : text.debitDirection;
}

export function AchViewer() {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [sourceText, setSourceText] = useState("");
  const [parsedFile, setParsedFile] = useState<ParsedAchFile | null>(null);
  const [selectedItem, setSelectedItem] = useState<ViewerSelection | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<ViewerTab>("basic");
  const [returnScope, setReturnScope] = useState<ReturnScope>("all");
  const [selectedReturnPaymentIds, setSelectedReturnPaymentIds] = useState<string[]>([]);
  const text = messages[locale];

  const summaryItems = useMemo(() => {
    if (!parsedFile) {
      return [];
    }

    return [
      { label: text.batchCountLabel, value: formatCount(parsedFile.summary.batchCount, locale) },
      { label: text.entryCountLabel, value: formatCount(parsedFile.summary.entryCount, locale) },
      { label: text.addendaCountLabel, value: formatCount(parsedFile.summary.addendaCount, locale) },
      { label: text.debitsLabel, value: formatCurrencyFromCents(parsedFile.summary.debitAmountInCents, locale) },
      { label: text.creditsLabel, value: formatCurrencyFromCents(parsedFile.summary.creditAmountInCents, locale) },
      { label: text.entryHashLabel, value: parsedFile.summary.entryHash },
      { label: text.recordCountLabel, value: formatCount(parsedFile.summary.recordCount, locale) },
      { label: text.blockCountLabel, value: formatCount(parsedFile.summary.blockCount, locale) },
      { label: text.paddingCountLabel, value: formatCount(parsedFile.summary.paddingCount, locale) },
    ];
  }, [locale, parsedFile, text]);

  const paymentItems = useMemo<PaymentItem[]>(() => {
    if (!parsedFile) {
      return [];
    }

    return parsedFile.batches.flatMap((batch) =>
      batch.entries.map((entry) => ({
        id: entry.id,
        batch,
        batchNumber: batch.header.batchNumber,
        companyName: batch.header.companyName,
        secCode: batch.header.standardEntryClassCode,
        effectiveEntryDate: batch.header.effectiveEntryDate,
        receiverName: entry.detail.individualName || "-",
        traceNumber: entry.detail.traceNumber,
        amountInCents: entry.detail.amountInCents,
        transactionCode: entry.detail.transactionCode,
        addendaCount: entry.addendas.length,
        direction: getPaymentDirection(entry.detail.transactionCode, text),
        entry,
      })),
    );
  }, [parsedFile, text]);

  const activePayment = useMemo(() => {
    return paymentItems.find((payment) => payment.id === selectedItem?.key) ?? paymentItems[0] ?? null;
  }, [paymentItems, selectedItem?.key]);

  const displayedSelectedItem = useMemo(() => {
    if (!parsedFile) {
      return null;
    }

    return getSelectionByKey(parsedFile, selectedItem?.key, text, locale);
  }, [locale, parsedFile, selectedItem?.key, text]);

  const returnPaymentItems = useMemo(() => {
    if (returnScope === "all") {
      return paymentItems;
    }

    return paymentItems.filter((payment) => selectedReturnPaymentIds.includes(payment.id));
  }, [paymentItems, returnScope, selectedReturnPaymentIds]);

  function handleParseClick() {
    try {
      const nextParsedFile = parseAchFile(sourceText);
      const nextPaymentIds = nextParsedFile.batches.flatMap((batch) => batch.entries.map((entry) => entry.id));

      setParsedFile(nextParsedFile);
      setSelectedItem(getInitialSelection(nextParsedFile, text, locale));
      setActiveTab("basic");
      setReturnScope("all");
      setSelectedReturnPaymentIds(nextPaymentIds);
      setErrorMessage("");
    } catch (error) {
      setParsedFile(null);
      setSelectedItem(null);
      setErrorMessage(error instanceof Error ? `${text.errorPrefix} ${error.message}` : text.errorPrefix);
    }
  }

  function handleClearClick() {
    setSourceText("");
    setParsedFile(null);
    setSelectedItem(null);
    setActiveTab("basic");
    setReturnScope("all");
    setSelectedReturnPaymentIds([]);
    setErrorMessage("");
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const fileText = await file.text();
    setSourceText(fileText);

    try {
      const nextParsedFile = parseAchFile(fileText);
      const nextPaymentIds = nextParsedFile.batches.flatMap((batch) => batch.entries.map((entry) => entry.id));

      setParsedFile(nextParsedFile);
      setSelectedItem(getInitialSelection(nextParsedFile, text, locale));
      setActiveTab("basic");
      setReturnScope("all");
      setSelectedReturnPaymentIds(nextPaymentIds);
      setErrorMessage("");
    } catch (error) {
      setParsedFile(null);
      setSelectedItem(null);
      setErrorMessage(error instanceof Error ? `${text.errorPrefix} ${error.message}` : text.errorPrefix);
    }
  }

  function toggleReturnPayment(paymentId: string) {
    setSelectedReturnPaymentIds((current) =>
      current.includes(paymentId)
        ? current.filter((id) => id !== paymentId)
        : [...current, paymentId],
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroHeader}>
          <div>
            <p className={styles.eyebrow}>Next.js ACH explorer</p>
            <h1>{text.appTitle}</h1>
            <p className={styles.heroText}>{text.appSubtitle}</p>
          </div>

          <div className={styles.localeSwitch}>
            <span>{text.languageLabel}</span>
            <div className={styles.localeButtons}>
              <button
                className={locale === "pt" ? styles.localeButtonActive : styles.localeButton}
                type="button"
                onClick={() => setLocale("pt")}
              >
                PT-BR
              </button>
              <button
                className={locale === "en" ? styles.localeButtonActive : styles.localeButton}
                type="button"
                onClick={() => setLocale("en")}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{text.inputTitle}</h2>
            <p>{text.inputDescription}</p>
          </div>

          <div className={styles.actions}>
            <button className={styles.primaryButton} type="button" onClick={handleParseClick}>
              {text.parseAction}
            </button>
            <button className={styles.secondaryButton} type="button" onClick={handleClearClick}>
              {text.clearAction}
            </button>
          </div>
        </div>

        <div className={styles.inputGrid}>
          <label className={styles.fileInput}>
            <span>{text.uploadLabel}</span>
            <input type="file" accept=".ach,.txt,.dat" onChange={handleFileChange} />
          </label>

          <label className={styles.textAreaGroup}>
            <span>{text.pasteLabel}</span>
            <textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder="101 076401251 123456789..."
            />
          </label>
        </div>

        {errorMessage ? <p className={styles.parseError}>{errorMessage}</p> : null}
      </section>

      {!parsedFile ? (
        <section className={styles.emptyState}>
          <h2>{text.emptyStateTitle}</h2>
          <p>{text.emptyStateDescription}</p>
        </section>
      ) : (
        <>
          <section className={styles.tabsSection}>
            <div className={styles.tabs}>
              <button className={activeTab === "basic" ? styles.tabActive : styles.tab} type="button" onClick={() => setActiveTab("basic")}>
                {text.basicViewTitle}
              </button>
              <button
                className={activeTab === "advanced" ? styles.tabActive : styles.tab}
                type="button"
                onClick={() => {
                  setActiveTab("advanced");

                  if (activePayment) {
                    setSelectedItem(createEntrySelection(activePayment.entry, text, locale));
                  }
                }}
              >
                {text.advancedViewTitle}
              </button>
              <button className={activeTab === "return" ? styles.tabActive : styles.tab} type="button" onClick={() => setActiveTab("return")}>
                {text.returnViewTitle}
              </button>
            </div>
          </section>

          {activeTab === "basic" ? (
            <>
              <section className={styles.summarySection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2>{text.basicViewTitle}</h2>
                    <p>{text.basicViewDescription}</p>
                  </div>
                </div>

                <div className={styles.summaryGrid}>
                  {summaryItems.map((item) => (
                    <div key={item.label} className={styles.summaryCard}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <div className={styles.basicGrid}>
                  {parsedFile.fileHeader ? (
                    <article className={styles.infoPanel}>
                      <div className={styles.sectionHeader}>
                        <h3>{text.fileHeaderLabel}</h3>
                      </div>
                      <div className={styles.infoList}>
                        <div className={styles.infoRow}>
                          <span>{text.originLabel}</span>
                          <strong>{parsedFile.fileHeader.immediateOriginName || "-"}</strong>
                        </div>
                        <div className={styles.infoRow}>
                          <span>{text.destinationLabel}</span>
                          <strong>{parsedFile.fileHeader.immediateDestinationName || "-"}</strong>
                        </div>
                        <div className={styles.infoRow}>
                          <span>{text.creationDateLabel}</span>
                          <strong>{parsedFile.fileHeader.fileCreationDate || "-"}</strong>
                        </div>
                        <div className={styles.infoRow}>
                          <span>{text.creationTimeLabel}</span>
                          <strong>{parsedFile.fileHeader.fileCreationTime || "-"}</strong>
                        </div>
                      </div>
                    </article>
                  ) : null}

                  <article className={styles.infoPanel}>
                    <div className={styles.sectionHeader}>
                      <h3>{text.batchesLabel}</h3>
                    </div>
                    <div className={styles.batchCardList}>
                      {parsedFile.batches.map((batch) => (
                        <button
                          key={batch.id}
                          className={styles.batchCard}
                          type="button"
                          onClick={() => setSelectedItem(createBatchSelection(batch, text, locale))}
                        >
                          <div className={styles.batchCardHeader}>
                            <strong>
                              {text.batchLabel} {batch.header.batchNumber}
                            </strong>
                            <span>{batch.header.companyName || "-"}</span>
                          </div>
                          <div className={styles.batchCardMetrics}>
                            <span>{text.entryCountLabel}: {formatCount(batch.summary.entryCount, locale)}</span>
                            <span>{text.addendaCountLabel}: {formatCount(batch.summary.addendaCount, locale)}</span>
                            <span>{text.creditsLabel}: {formatCurrencyFromCents(batch.summary.creditAmountInCents, locale)}</span>
                            <span>{text.debitsLabel}: {formatCurrencyFromCents(batch.summary.debitAmountInCents, locale)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </article>
                </div>
              </section>

              <section className={styles.validationSection}>
                <div className={styles.sectionHeader}>
                  <h2>{text.validationTitle}</h2>
                </div>
                <ValidationList items={parsedFile.validationMessages} text={text} />
              </section>
            </>
          ) : activeTab === "advanced" ? (
            <>
              <section className={styles.advancedSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2>{text.advancedViewTitle}</h2>
                    <p>{text.advancedViewDescription}</p>
                  </div>
                </div>

                <div className={styles.sectionHeader}>
                  <div>
                    <h3>{text.paymentsTitle}</h3>
                    <p>{text.paymentsDescription}</p>
                  </div>
                </div>

                <div className={styles.paymentTable}>
                  <div className={styles.paymentTableHeader}>
                    <span>{text.paymentBatchLabel}</span>
                    <span>{text.paymentCompanyLabel}</span>
                    <span>{text.paymentReceiverLabel}</span>
                    <span>{text.paymentSecCodeLabel}</span>
                    <span>{text.paymentDateLabel}</span>
                    <span>{text.paymentDirectionLabel}</span>
                    <span>{text.paymentAmountLabel}</span>
                    <span>{text.paymentCodeLabel}</span>
                    <span>{text.paymentTraceLabel}</span>
                    <span>{text.addendaCountLabel}</span>
                    <span>{text.paymentDetailsAction}</span>
                  </div>

                  {paymentItems.map((payment) => (
                    <button
                      key={payment.id}
                      className={selectedItem?.key === payment.id ? styles.paymentRowActive : styles.paymentRow}
                      type="button"
                      onClick={() => setSelectedItem(createEntrySelection(payment.entry, text, locale))}
                    >
                      <span>{payment.batchNumber}</span>
                      <span>{payment.companyName || "-"}</span>
                      <span>{payment.receiverName}</span>
                      <span>{payment.secCode || "-"}</span>
                      <span>{payment.effectiveEntryDate || "-"}</span>
                      <span>{payment.direction}</span>
                      <strong>{formatCurrencyFromCents(payment.amountInCents, locale)}</strong>
                      <span>{payment.transactionCode}</span>
                      <span>{payment.traceNumber}</span>
                      <span>{formatCount(payment.addendaCount, locale)}</span>
                      <span className={styles.paymentAction}>{text.paymentDetailsAction}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className={styles.viewerGrid}>
                <div className={styles.treePanel}>
                  <div className={styles.sectionHeader}>
                    <h2>{text.structureTitle}</h2>
                  </div>

                  <div className={styles.tree}>
                    {parsedFile.fileHeader ? (
                      <button
                        className={selectedItem?.key === "file-header" ? styles.treeItemActive : styles.treeItem}
                        type="button"
                        onClick={() => setSelectedItem(createFileHeaderSelection(parsedFile.fileHeader!, text))}
                      >
                        {text.fileHeaderLabel}
                      </button>
                    ) : null}

                    {parsedFile.batches.map((batch) => (
                      <div key={batch.id} className={styles.treeGroup}>
                        <button
                          className={selectedItem?.key === batch.id ? styles.treeItemActive : styles.treeItem}
                          type="button"
                          onClick={() => setSelectedItem(createBatchSelection(batch, text, locale))}
                        >
                          {text.batchLabel} {batch.header.batchNumber}: {batch.header.companyName}
                        </button>

                        {batch.entries.map((entry, entryIndex) => (
                          <div key={entry.id} className={styles.treeNested}>
                            <button
                              className={selectedItem?.key === entry.id ? styles.treeItemActive : styles.treeItemSecondary}
                              type="button"
                              onClick={() => setSelectedItem(createEntrySelection(entry, text, locale))}
                            >
                              {text.entryLabel} {entryIndex + 1}: {entry.detail.individualName || entry.detail.traceNumber}
                            </button>

                            {entry.addendas.map((addenda, addendaIndex) => (
                              <button
                                key={`addenda-${addenda.lineNumber}`}
                                className={
                                  selectedItem?.key === `addenda-${addenda.lineNumber}`
                                    ? styles.treeItemActive
                                    : styles.treeItemTertiary
                                }
                                type="button"
                                onClick={() => setSelectedItem(createAddendaSelection(addenda, addendaIndex, text))}
                              >
                                {text.addendaItemLabel} {addendaIndex + 1}
                              </button>
                            ))}
                          </div>
                        ))}

                        {batch.control ? (
                          <button
                            className={
                              selectedItem?.key === `batch-control-${batch.control.lineNumber}`
                                ? styles.treeItemActive
                                : styles.treeItemSecondary
                            }
                            type="button"
                            onClick={() => setSelectedItem(createBatchControlSelection(batch.control!, text, locale))}
                          >
                            {text.controlLabel}
                          </button>
                        ) : null}
                      </div>
                    ))}

                    {parsedFile.fileControl ? (
                      <button
                        className={selectedItem?.key === "file-control" ? styles.treeItemActive : styles.treeItem}
                        type="button"
                        onClick={() => setSelectedItem(createFileControlSelection(parsedFile.fileControl!, text, locale))}
                      >
                        {text.fileControlLabel}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className={styles.detailPanel}>
                  <div className={styles.sectionHeader}>
                    <h2>{text.detailsTitle}</h2>
                  </div>

                  {!displayedSelectedItem ? (
                    <div className={styles.emptyDetails}>
                      <h3>{text.noSelectionTitle}</h3>
                      <p>{text.noSelectionDescription}</p>
                    </div>
                  ) : (
                    <div className={styles.detailsContent}>
                      <div className={styles.selectionHeader}>
                        <h3>{displayedSelectedItem.title}</h3>
                        <p>{displayedSelectedItem.subtitle}</p>
                      </div>

                      <div className={styles.detailsGrid}>
                        {displayedSelectedItem.lineNumber ? (
                          <div className={styles.detailCard}>
                            <span>{text.lineNumberLabel}</span>
                            <strong>{displayedSelectedItem.lineNumber}</strong>
                          </div>
                        ) : null}

                        {displayedSelectedItem.fields.map((field) => (
                          <div key={`${displayedSelectedItem.key}-${field.label}`} className={styles.detailCard}>
                            <span>{field.label}</span>
                            <strong>{field.value || "-"}</strong>
                          </div>
                        ))}
                      </div>

                      <div className={styles.rawPanel}>
                        <div className={styles.sectionHeader}>
                          <h3>{text.rawRecordTitle}</h3>
                        </div>
                        <code>{displayedSelectedItem.raw}</code>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className={styles.returnSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2>{text.returnViewTitle}</h2>
                    <p>{text.returnViewDescription}</p>
                  </div>
                </div>

                <div className={styles.returnScopeBar}>
                  <div className={styles.returnScopeGroup}>
                    <span className={styles.returnScopeLabel}>{text.returnScopeTitle}</span>
                    <label className={styles.scopeOption}>
                      <input checked={returnScope === "all"} name="return-scope" type="radio" onChange={() => setReturnScope("all")} />
                      <span>{text.returnAllOption}</span>
                    </label>
                    <label className={styles.scopeOption}>
                      <input checked={returnScope === "selected"} name="return-scope" type="radio" onChange={() => setReturnScope("selected")} />
                      <span>{text.returnSelectedOption}</span>
                    </label>
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() => setSelectedReturnPaymentIds(paymentItems.map((payment) => payment.id))}
                    >
                      {text.selectAllPaymentsAction}
                    </button>
                    <button className={styles.secondaryButton} type="button" onClick={() => setSelectedReturnPaymentIds([])}>
                      {text.clearSelectedPaymentsAction}
                    </button>
                  </div>
                </div>

                <div className={styles.returnSummary}>
                  <div className={styles.summaryCard}>
                    <span>{text.totalPaymentsLabel}</span>
                    <strong>{formatCount(paymentItems.length, locale)}</strong>
                  </div>
                  <div className={styles.summaryCard}>
                    <span>{text.selectedPaymentsCountLabel}</span>
                    <strong>{formatCount(selectedReturnPaymentIds.length, locale)}</strong>
                  </div>
                  <div className={styles.summaryCard}>
                    <span>{text.paymentAmountLabel}</span>
                    <strong>
                      {formatCurrencyFromCents(
                        returnPaymentItems.reduce((total, payment) => total + payment.amountInCents, 0),
                        locale,
                      )}
                    </strong>
                  </div>
                </div>

                <div className={styles.paymentTable}>
                  <div className={styles.returnPaymentTableHeader}>
                    <span>{text.includePaymentLabel}</span>
                    <span>{text.paymentBatchLabel}</span>
                    <span>{text.paymentCompanyLabel}</span>
                    <span>{text.paymentReceiverLabel}</span>
                    <span>{text.paymentDateLabel}</span>
                    <span>{text.paymentDirectionLabel}</span>
                    <span>{text.paymentAmountLabel}</span>
                    <span>{text.paymentTraceLabel}</span>
                  </div>

                  {paymentItems.map((payment) => (
                    <label key={`return-${payment.id}`} className={styles.returnPaymentRow}>
                      <span>
                        <input
                          checked={selectedReturnPaymentIds.includes(payment.id)}
                          type="checkbox"
                          onChange={() => toggleReturnPayment(payment.id)}
                        />
                      </span>
                      <span>{payment.batchNumber}</span>
                      <span>{payment.companyName || "-"}</span>
                      <span>{payment.receiverName}</span>
                      <span>{payment.effectiveEntryDate || "-"}</span>
                      <span>{payment.direction}</span>
                      <strong>{formatCurrencyFromCents(payment.amountInCents, locale)}</strong>
                      <span>{payment.traceNumber}</span>
                    </label>
                  ))}
                </div>
              </section>

              <AchReturnGenerator
                key={`${locale}-${returnScope}-${selectedReturnPaymentIds.join(",")}-${paymentItems.length}`}
                locale={locale}
                sources={returnPaymentItems.map((payment) => ({
                  fileHeader: parsedFile.fileHeader,
                  batch: payment.batch,
                  entry: payment.entry,
                }))}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
