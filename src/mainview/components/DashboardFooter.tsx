import { useEffect, useRef } from "react";
import type { ImportBackupResult, ImportedBackupSummary } from "@shared/types";
import { toast } from "sonner";

const GITHUB_REPO_URL = import.meta.env.VITE_PROJECT_REPO_URL?.trim() || null;
const MIT_LICENSE_URL = "https://opensource.org/license/mit";

interface DashboardFooterProps {
	importedBackups: ImportedBackupSummary[];
	importResult: ImportBackupResult | null;
	isImporting: boolean;
	isExporting: boolean;
	deletingBackupId: string | null;
	onImportFile: (file: File) => void;
	onExport: () => void;
	onDeleteBackup: (backupId: string) => void;
}

const formatCoverage = (backup: ImportedBackupSummary): string => {
	if (backup.coverageStartDateUtc && backup.coverageEndDateUtc) {
		return `${backup.coverageStartDateUtc} to ${backup.coverageEndDateUtc}`;
	}

	if (backup.coverageStartDateUtc) {
		return `Since ${backup.coverageStartDateUtc}`;
	}

	return "Unknown coverage";
};

export const getImportAlertState = (
	importResult: ImportBackupResult,
): {
	title: string;
	variant: "success" | "destructive";
	description: string;
} => {
	const skippedMessage =
		importResult.overlappingDateCount > 0
			? ` ${importResult.overlappingDateCount} overlapping day${importResult.overlappingDateCount === 1 ? " was" : "s were"} skipped because local data already covers them.`
			: "";
	const coverageMessage =
		importResult.activeCoverageStartDateUtc && importResult.activeCoverageEndDateUtc
			? ` Active coverage is ${importResult.activeCoverageStartDateUtc} to ${importResult.activeCoverageEndDateUtc}.`
			: "";

	if (importResult.recognized && !importResult.duplicate && importResult.backup) {
		return {
			title: "Backup imported",
			variant: "success",
			description: `${importResult.message}${skippedMessage}${coverageMessage}`,
		};
	}

	return {
		title: "Import rejected",
		variant: "destructive",
		description: `${importResult.message}${skippedMessage}${coverageMessage}`,
	};
};

const DashboardFooter = ({
	importedBackups,
	importResult,
	isImporting,
	isExporting,
	deletingBackupId,
	onImportFile,
	onExport,
	onDeleteBackup,
}: DashboardFooterProps) => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const lastImportResultRef = useRef<ImportBackupResult | null>(null);
	const currentYear = new Date().getFullYear();

	useEffect(() => {
		if (!importResult) return;
		if (lastImportResultRef.current === importResult) return;
		lastImportResultRef.current = importResult;

		const importAlert = getImportAlertState(importResult);

		if (importAlert.variant === "success") {
			toast.success(importAlert.title, { description: importAlert.description });
			return;
		}

		toast.error(importAlert.title, { description: importAlert.description });
	}, [importResult]);

	return (
		<footer className="wrapped-footer">
			<div className="wrapped-footer-inner">
				<div className="footer-top">
					<div className="data-block">
						<p className="footer-section-label">Data</p>
						<h4>Import</h4>
						<p className="desc">
							Load wrapped backup data from a <code>.csv</code> file.
						</p>
						<div className="file-input-row">
							<input
								ref={fileInputRef}
								id="csv-import"
								type="file"
								accept=".csv,text/csv"
								className="sr-only"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (!file) return;
									onImportFile(file);
									event.currentTarget.value = "";
								}}
							/>
							<button
								type="button"
								className="file-btn"
								onClick={() => {
									if (!isImporting) {
										fileInputRef.current?.click();
									}
								}}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.8"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
									<polyline points="17 8 12 3 7 8" />
									<line x1="12" y1="3" x2="12" y2="15" />
								</svg>
								{isImporting ? "Importing..." : "Choose file"}
							</button>
							<span className="file-tag">CSV</span>
						</div>
					</div>

					<div className="data-block">
						<p className="footer-section-label">&nbsp;</p>
						<h4>Export</h4>
						<p className="desc">
							Download your wrapped backup as a <code>.csv</code> file.
						</p>
						<div className="file-input-row">
							<button type="button" className="export-btn" onClick={onExport} disabled={isExporting}>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.8"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
									<polyline points="7 10 12 15 17 10" />
									<line x1="12" y1="15" x2="12" y2="3" />
								</svg>
								{isExporting ? "Exporting..." : "Export"}
							</button>
							<span className="file-tag">CSV</span>
						</div>
					</div>
				</div>

				{importedBackups.length > 0 ? (
					<div className="mt-6">
						<p className="footer-section-label">Imported Backups</p>
						<div className="mt-3 grid gap-3">
							{importedBackups.map((backup) => (
								<article key={backup.backupId} className="wrapped-tile">
									<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
										<div className="min-w-0">
											<p className="text-sm font-semibold text-[#FAFAFA]">{backup.originalFilename}</p>
											<p className="mt-1 text-xs text-[#A1A1A1]">
												Imported {backup.importedAtUtc.slice(0, 10)} • {formatCoverage(backup)}
											</p>
											<p className="mt-1 text-xs text-[#A1A1A1]">
												Origin {backup.originInstallId.slice(0, 8)} • {backup.isActive ? "Active" : "Replaced"}
												{backup.contributesData ? " • Contributing" : " • Not contributing"}
											</p>
											<p className="mt-1 text-xs text-[#A1A1A1]">
												Checksum {backup.checksum.slice(0, 10)}… • Export {backup.exportId.slice(0, 8)}
											</p>
										</div>
										<button
											type="button"
											className="export-btn"
											onClick={() => onDeleteBackup(backup.backupId)}
											disabled={deletingBackupId === backup.backupId}
										>
											{deletingBackupId === backup.backupId ? "Deleting..." : "Delete"}
										</button>
									</div>
								</article>
							))}
						</div>
					</div>
				) : null}

				<div className="footer-bottom">
					<span className="footer-copy">© {currentYear} Codex Wrapped</span>
					<div className="footer-links">
						<a href={MIT_LICENSE_URL} target="_blank" rel="noreferrer">
							MIT License
						</a>
						{GITHUB_REPO_URL ? (
							<>
								<span className="footer-sep">•</span>
								<a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
									GitHub
								</a>
							</>
						) : null}
					</div>
				</div>
			</div>
		</footer>
	);
};

export default DashboardFooter;
