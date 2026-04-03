"use client";

import { useMemo, useState } from "react";
import styles from "@/components/ach-viewer.module.css";
import { formatCount, formatCurrencyFromCents } from "@/lib/ach/formatters";
import {
  createDefaultReturnFormValues,
  createReturnAchFile,
  type AchReturnFormValues,
  type AchReturnSource,
} from "@/lib/ach/return-generator";
import { messages, type Locale } from "@/lib/i18n";

interface AchReturnGeneratorProps {
  sources: AchReturnSource[];
  locale: Locale;
}

export function AchReturnGenerator({ sources, locale }: AchReturnGeneratorProps) {
  const text = messages[locale];
  const [formValues, setFormValues] = useState<AchReturnFormValues | null>(() =>
    sources.length > 0 ? createDefaultReturnFormValues(sources) : null,
  );
  const [errorMessage, setErrorMessage] = useState("");

  const preview = useMemo(() => {
    if (sources.length === 0 || !formValues) {
      return "";
    }

    try {
      return createReturnAchFile(sources, formValues).content;
    } catch {
      return "";
    }
  }, [formValues, sources]);

  const totalAmountInCents = useMemo(() => {
    return sources.reduce((total, source) => total + source.entry.detail.amountInCents, 0);
  }, [sources]);

  function updateField<K extends keyof AchReturnFormValues>(field: K, value: AchReturnFormValues[K]) {
    setFormValues((current) => (current ? { ...current, [field]: value } : current));
  }

  function handleDownloadClick() {
    if (sources.length === 0 || !formValues) {
      return;
    }

    try {
      const generatedFile = createReturnAchFile(sources, formValues);
      const blob = new Blob([generatedFile.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = generatedFile.fileName;
      link.click();
      URL.revokeObjectURL(url);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to generate return file.");
    }
  }

  if (sources.length === 0 || !formValues) {
    return (
      <section className={styles.returnSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h3>{text.returnModuleTitle}</h3>
            <p>{text.noPaymentSelected}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.returnSection}>
      <div className={styles.sectionHeader}>
        <div>
          <h3>{text.returnModuleTitle}</h3>
          <p>{text.returnModuleDescription}</p>
        </div>
      </div>

      <div className={styles.returnSummary}>
        <div className={styles.summaryCard}>
          <span>{text.selectedPaymentTitle}</span>
          <strong>{formatCount(sources.length, locale)}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>{text.paymentAmountLabel}</span>
          <strong>{formatCurrencyFromCents(totalAmountInCents, locale)}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>{text.companyNameLabel}</span>
          <strong>{formValues.companyName || "-"}</strong>
        </div>
      </div>

      <div className={styles.returnFormGrid}>
        <label className={styles.formField}>
          <span>{text.returnKindLabel}</span>
          <select
            value={formValues.returnKind}
            onChange={(event) => updateField("returnKind", event.target.value as AchReturnFormValues["returnKind"])}
          >
            <option value="return">{text.standardReturnOption}</option>
            <option value="noc">{text.nocOption}</option>
          </select>
        </label>

        <label className={styles.formField}>
          <span>{text.returnCodeLabel}</span>
          <input
            value={formValues.returnCode}
            onChange={(event) => updateField("returnCode", event.target.value.toUpperCase())}
          />
        </label>

        <label className={styles.formField}>
          <span>{text.returnFileNameLabel}</span>
          <input
            value={formValues.fileName}
            onChange={(event) => updateField("fileName", event.target.value)}
          />
        </label>

        <label className={styles.formField}>
          <span>{text.returnDateLabel}</span>
          <input
            value={formValues.returnDate}
            onChange={(event) => updateField("returnDate", event.target.value)}
          />
        </label>

        <label className={styles.formField}>
          <span>{text.effectiveDateLabel}</span>
          <input
            value={formValues.effectiveEntryDate}
            onChange={(event) => updateField("effectiveEntryDate", event.target.value)}
          />
        </label>

        <label className={styles.formField}>
          <span>{text.entryClassLabel}</span>
          <input
            value={formValues.entryClass}
            onChange={(event) => updateField("entryClass", event.target.value.toUpperCase())}
          />
        </label>

        <label className={styles.formField}>
          <span>{text.companyIdLabel}</span>
          <input
            value={formValues.companyId}
            onChange={(event) => updateField("companyId", event.target.value)}
          />
        </label>

        <label className={styles.formField}>
          <span>{text.companyNameLabel}</span>
          <input
            value={formValues.companyName}
            onChange={(event) => updateField("companyName", event.target.value)}
          />
        </label>

        <label className={styles.formField}>
          <span>{text.companyEntryDescriptionLabel}</span>
          <input
            value={formValues.companyEntryDescription}
            onChange={(event) => updateField("companyEntryDescription", event.target.value)}
          />
        </label>

      </div>

      <label className={styles.textAreaGroup}>
        <span>{text.paymentRelatedInfoLabel}</span>
        <textarea
          value={formValues.paymentRelatedInfo}
          onChange={(event) => updateField("paymentRelatedInfo", event.target.value)}
          placeholder={text.paymentRelatedInfoPlaceholder}
        />
      </label>

      {errorMessage ? <p className={styles.parseError}>{errorMessage}</p> : null}

      <div className={styles.actions}>
        <button className={styles.primaryButton} type="button" onClick={handleDownloadClick}>
          {text.downloadReturnAction}
        </button>
      </div>

      <div className={styles.rawPanel}>
        <div className={styles.sectionHeader}>
          <h3>{text.returnPreviewTitle}</h3>
        </div>
        <code>{preview || " "}</code>
      </div>
    </section>
  );
}
