import { useRef } from "react";

const GITHUB_REPO_URL = "https://github.com/premsathisha/codex-wrapped";
const MIT_LICENSE_URL = "https://opensource.org/license/mit";

const DashboardFooter = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentYear = new Date().getFullYear();

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
              <input ref={fileInputRef} id="csv-import" type="file" accept=".csv" className="sr-only" />
              <label className="file-btn" htmlFor="csv-import" onClick={() => fileInputRef.current?.click()}>
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
                Choose file
              </label>
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
              <button type="button" className="export-btn">
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
                Export
              </button>
              <span className="file-tag">CSV</span>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="footer-copy">© {currentYear} Codex Wrapped</span>
          <div className="footer-links">
            <a href={MIT_LICENSE_URL} target="_blank" rel="noreferrer">
              MIT License
            </a>
            <span className="footer-sep">•</span>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default DashboardFooter;
