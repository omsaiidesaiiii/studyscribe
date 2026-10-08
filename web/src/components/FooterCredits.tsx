import { APP_NAME } from "./Layout";

export function GitHubIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      width="14"
      height="14"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export function LinkedInIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      width="14"
      height="14"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.69 1.69 0 0 0 1.7-1.68 1.7 1.7 0 0 0-1.7-1.7 1.7 1.7 0 0 0-1.69 1.7 1.69 1.69 0 0 0 1.69 1.68m1.39 9.74v-8.37H5.07v8.37h2.78z" />
    </svg>
  );
}

/**
 * Standard neo-brutalist footer matching user specification:
 * [STUDYSCRIBE]  Learn • Revise • Grow                [GitHub] [LinkedIn]
 * ─────────────────────────────────────────────────────────────────────
 * © 2026 StudyScribe · Made with ♥ by Omsai Desai
 */
export function AppFooter() {
  return (
    <footer className="footer border-t-2 border-black bg-[#fffdf7] mt-16">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="sticker sticker-lime">{APP_NAME}</span>
            <span className="text-sm text-neutral-700 font-semibold">
              Learn • Revise • Grow
            </span>
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            <a
              href="https://github.com/omsaiidesaiiii"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-pill footer-pill-github inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-black bg-white border-2 border-black rounded-full shadow-[2px_2px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#000] hover:bg-[#ece9ff] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#000] transition-all no-underline"
              title="GitHub - omsaiidesaiiii"
            >
              <GitHubIcon />
              <span>GitHub</span>
            </a>
            <a
              href="https://www.linkedin.com/in/omsai-desai/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-pill footer-pill-linkedin inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-black bg-white border-2 border-black rounded-full shadow-[2px_2px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#000] hover:bg-[#dbeafe] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#000] transition-all no-underline"
              title="LinkedIn - Omsai Desai"
            >
              <LinkedInIcon />
              <span>LinkedIn</span>
            </a>
          </div>
        </div>

        <div className="border-t-2 border-black pt-5 text-sm text-neutral-700 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
          <span>·</span>
          <span>
            Made with <span className="text-pink-500 font-bold">♥</span> by{" "}
            <b>Omsai Desai</b>
          </span>
        </div>
      </div>
    </footer>
  );
}
