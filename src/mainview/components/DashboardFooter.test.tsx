import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DashboardFooter, { getImportAlertState } from "./DashboardFooter";

describe("DashboardFooter", () => {
  test("renders imported backup metadata", () => {
    const html = renderToStaticMarkup(
      <DashboardFooter
        importedBackups={[
          {
            backupId: "backup-1",
            exportId: "export-1",
            originInstallId: "origin-12345678",
            originalFilename: "wrapped.csv",
            checksum: "abcdef1234567890",
            importedAtUtc: "2026-03-05T00:00:00.000Z",
            coverageStartDateUtc: "2026-03-01",
            coverageEndDateUtc: "2026-03-04",
            earliestKnownUsageDateUtc: "2026-03-01",
            exportTimeZone: "UTC",
            schemaVersion: 1,
            factCount: 12,
            isActive: true,
            contributesData: true,
          },
        ]}
        importResult={{
          recognized: true,
          duplicate: false,
          backup: null,
          activeCoverageStartDateUtc: "2026-03-01",
          activeCoverageEndDateUtc: "2026-03-05",
          newDateCount: 1,
          overlappingDateCount: 1,
          skippedOverlappingDates: ["2026-03-04"],
          message: "Imported wrapped.csv and added 1 new day.",
        }}
        isImporting={false}
        isExporting={false}
        deletingBackupId={null}
        onImportFile={() => {}}
        onExport={() => {}}
        onDeleteBackup={() => {}}
      />,
    );

    expect(html).toContain("wrapped.csv");
    expect(html).toContain("Checksum abcdef1234");
    expect(html).toContain("Contributing");
  });

  test("returns success import alert payload with backend message", () => {
    const alert = getImportAlertState({
      recognized: true,
      duplicate: false,
      backup: null,
      activeCoverageStartDateUtc: "2026-03-01",
      activeCoverageEndDateUtc: "2026-03-05",
      newDateCount: 1,
      overlappingDateCount: 1,
      skippedOverlappingDates: ["2026-03-04"],
      message: "Imported wrapped.csv and added 1 new day.",
    });

    expect(alert.title).toBe("Backup imported");
    expect(alert.variant).toBe("success");
    expect(alert.description).toContain("Imported wrapped.csv and added 1 new day.");
    expect(alert.description).toContain("1 overlapping day were skipped");
    expect(alert.description).toContain("Active coverage is 2026-03-01 to 2026-03-05.");
  });

  test("returns rejected import alert payload with backend reason", () => {
    const alert = getImportAlertState({
      recognized: true,
      duplicate: false,
      backup: null,
      activeCoverageStartDateUtc: "2026-03-01",
      activeCoverageEndDateUtc: "2026-03-05",
      newDateCount: 0,
      overlappingDateCount: 0,
      skippedOverlappingDates: [],
      message: "This backup is very similar to the existing logs, so no changes were made.",
    });

    expect(alert.title).toBe("Import rejected");
    expect(alert.variant).toBe("destructive");
    expect(alert.description).toContain("very similar to the existing logs");
  });

  test("renders busy button labels during import, export, and delete", () => {
    const html = renderToStaticMarkup(
      <DashboardFooter
        importedBackups={[
          {
            backupId: "backup-2",
            exportId: "export-2",
            originInstallId: "origin-87654321",
            originalFilename: "older.csv",
            checksum: "1234567890abcdef",
            importedAtUtc: "2026-03-06T00:00:00.000Z",
            coverageStartDateUtc: "2026-03-01",
            coverageEndDateUtc: "2026-03-02",
            earliestKnownUsageDateUtc: "2026-03-01",
            exportTimeZone: "UTC",
            schemaVersion: 1,
            factCount: 8,
            isActive: false,
            contributesData: false,
          },
        ]}
        importResult={null}
        isImporting={true}
        isExporting={true}
        deletingBackupId="backup-2"
        onImportFile={() => {}}
        onExport={() => {}}
        onDeleteBackup={() => {}}
      />,
    );

    expect(html).toContain("Importing...");
    expect(html).toContain("Exporting...");
    expect(html).toContain("Deleting...");
  });
});
