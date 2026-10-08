import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, API_URL, ApiError, tokens } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePolling } from "@/lib/hooks";
import { NotebookViewer } from "@/components/notes/NotebookViewer";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Spinner,
  StatusPill,
} from "@/components/ui/kit";
import { NotebookDoodle } from "@/components/ui/doodles";
import { LANGUAGE_LABELS, modelLabel } from "@/lib/types";
import type { Generation } from "@/lib/types";

const STEPS = [
  "Queued",
  "Reading the captions",
  "Writing your notes",
  "Making the PDF",
];

type StepState = "done" | "current" | "todo";

/** Where the run is, in plain words the reader can follow. */
function stepState(index: number, status: Generation["status"]): StepState {
  if (status === "done") return "done";
  if (status === "failed") return index <= 1 ? "done" : "todo";

  const current = status === "pending" ? 0 : status === "processing" ? 2 : 3;
  if (index < current) return "done";
  return index === current ? "current" : "todo";
}

function Stepper({ status }: { status: Generation["status"] }) {
  return (
    <ol className="steps" aria-label="Progress">
      {STEPS.map((step, index) => {
        const state = stepState(index, status);

        return (
          <li key={step} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-badge">{index + 1}</span>
            <span>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function GenerationPage({
  onToast,
}: {
  onToast: (message: string, tone: "info" | "error" | "success") => void;
}) {
  const { id = "" } = useParams();
  const { refreshUser } = useAuth();

  const [elapsed, setElapsed] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const { data, error } = usePolling(() => api.generation(id), {
    stop: (value) =>
      value.generation.status === "done" || value.generation.status === "failed",
    enabled: Boolean(id),
  });

  const generation = data?.generation ?? null;
  const isRunning =
    generation?.status === "pending" || generation?.status === "processing";

  const isFatalError = error !== null && !notFound;

  // Ticking clock while the notes are being written.
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  // Credits are spent when the job finishes, so refresh the header sticker.
  useEffect(() => {
    if (generation?.status === "done") {
      void refreshUser().catch(() => undefined);
    }
  }, [generation?.status, refreshUser]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404) {
      setNotFound(true);
    }
  }, [error]);

  async function download() {
    if (!generation) return;
    setDownloading(true);

    try {
      await api.downloadPdf(generation.id, generation.title ?? "notes");
      onToast("PDF downloaded.", "success");
    } catch (caught) {
      onToast(
        caught instanceof Error
          ? caught.message
          : "The PDF could not be downloaded. Try again in a moment.",
        "error",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function openPreview() {
    if (!generation) return;

    try {
      const response = await fetch(`${API_URL}/generate/${generation.id}/preview`, {
        headers: {
          Authorization: `Bearer ${tokens.access() ?? ""}`,
        },
      });

      if (!response.ok) {
        throw new ApiError(
          response.status,
          "The printable page is not ready yet — wait for the notes to finish.",
        );
      }

      const html = await response.text();
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(url, "_blank", "noopener");
    } catch (caught) {
      onToast(
        caught instanceof Error
          ? caught.message
          : "The printable page could not be opened.",
        "error",
      );
    }
  }

  if (notFound) {
    return (
      <EmptyState
        title="Notebook not found"
        headingLevel="h1"
        doodle={<NotebookDoodle />}
        action={
          <ButtonLink href="/app/dashboard" variant="primary">
            Create a new notebook
          </ButtonLink>
        }
      >
        This notebook does not exist, or it belongs to another account.
      </EmptyState>
    );
  }

  if (isFatalError) {
    return (
      <ErrorState
        title="Could not load this notebook"
        headingLevel="h1"
        message={
          // A 5xx is our problem, not something the reader typed — never echo
          // the server's raw error string.
          error instanceof ApiError && error.status >= 500
            ? "Our side had a problem loading this notebook. Nothing you did caused it."
            : error instanceof Error
              ? error.message
              : "The notebook could not be loaded."
        }
      >
        <div className="empty-action">
          <ButtonLink href="/app/dashboard" variant="primary">
            Back to the dashboard
          </ButtonLink>
        </div>
      </ErrorState>
    );
  }

  return (
    <div className="stack stack-lg">
      <div className="row-between">
        <ButtonLink href="/app/dashboard" variant="white" className="btn-sm">
          ← New notes
        </ButtonLink>

        {generation ? <StatusPill status={generation.status} /> : null}
      </div>

      {generation ? (
        <Card className="stack">
          <div className="row-between">
            <div>
              <h1 className="notebook-title">
                {generation.title ?? "Writing your notebook…"}
              </h1>
              <p className="muted no-margin">
                {LANGUAGE_LABELS[generation.language] ?? generation.language} ·{" "}
                {modelLabel(generation.model)}
                {generation.pageCount > 0
                  ? ` · ${generation.pageCount} page${
                      generation.pageCount === 1 ? "" : "s"
                    }`
                  : ""}
              </p>
            </div>

            {isRunning ? (
              <Spinner label={`Working — ${elapsed}s`} />
            ) : null}
          </div>

          <Stepper status={generation.status} />

          {generation.status === "failed" ? (
            <Alert>
              {generation.errorMessage ??
                "This video could not be turned into notes."}{" "}
              The usual cause is a video without captions. Try another lecture —
              re-running this one does not cost a credit.
            </Alert>
          ) : null}

          {generation.status === "done" ? (
            <div className="row">
              <Button
                variant="primary"
                onClick={() => void download()}
                disabled={downloading}
              >
                {downloading ? "Preparing the PDF…" : "Download PDF"}
              </Button>

              <Button variant="white" onClick={() => void openPreview()}>
                Open printable page
              </Button>

              <a
                className="btn btn-cyan no-underline"
                href={generation.videoUrl}
                target="_blank"
                rel="noreferrer"
              >
                Watch the source video
              </a>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Spinner label="Loading the notebook" />
        </Card>
      )}

      {generation?.notes ? (
        <NotebookViewer notes={generation.notes} />
      ) : generation && generation.status !== "failed" ? (
        <EmptyState title="The notes are still being written" doodle={<NotebookDoodle />}>
          This page updates on its own. A full lecture usually takes a minute or
          two — long ones take longer.
        </EmptyState>
      ) : null}
    </div>
  );
}
