import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LANGUAGE_LABELS, modelLabel } from "@/lib/types";
import {
  BookCard,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
  coverToneFor,
} from "@/components/ui/kit";
import { NotebookDoodle } from "@/components/ui/doodles";
import type { HistoryResponse } from "@/lib/types";

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * History: every notebook as a book card, newest first, with the PDF download
 * on the card itself.
 */
export function HistoryPage({
  onToast,
}: {
  onToast: (message: string, tone: "info" | "error" | "success") => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);

    try {
      setData(await api.history(targetPage, 9));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load your notebooks.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  async function download(id: string, title: string | null) {
    setDownloading(id);

    try {
      await api.downloadPdf(id, title ?? "notes");
      onToast("PDF downloaded.", "success");
    } catch (caught) {
      onToast(
        caught instanceof Error
          ? caught.message
          : "The PDF could not be downloaded. Try again in a moment.",
        "error",
      );
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="stack stack-lg">
      <header className="page-head">
        <div>
          <h1>Your notebooks</h1>
          <p className="muted no-margin">
            {data
              ? `${data.total} notebook${data.total === 1 ? "" : "s"} so far`
              : "Loading your notebooks…"}
          </p>
        </div>

        <ButtonLink href="/app/dashboard" variant="primary">
          + New notes
        </ButtonLink>
      </header>

      {error ? (
        <ErrorState title="Your notebooks could not be loaded" message={error}>
          <Button onClick={() => void load(page)}>Try again</Button>
        </ErrorState>
      ) : loading && !data ? (
        <Skeleton count={3} />
      ) : !data || data.generations.length === 0 ? (
        <EmptyState
          title="No notebooks yet"
          doodle={<NotebookDoodle />}
          action={
            <ButtonLink href="/app/dashboard" variant="primary">
              Create your first notebook
            </ButtonLink>
          }
        >
          Generate notes from a YouTube lecture and they will show up here.
        </EmptyState>
      ) : (
        <div className="notes-grid">
          {data.generations.map((item) => (
            <BookCard
              key={item.id}
              to={`/app/generation/${item.id}`}
              cover={coverToneFor(item.id)}
              eyebrow={LANGUAGE_LABELS[item.language] ?? item.language}
              title={item.title ?? "Untitled notebook"}
              status={<StatusPill status={item.status} />}
              meta={`${modelLabel(item.model)} · ${formatDate(item.createdAt)}`}
              action={
                item.status === "done" ? (
                  <Button
                    size="sm"
                    variant="white"
                    onClick={() => void download(item.id, item.title)}
                    disabled={downloading === item.id}
                  >
                    {downloading === item.id ? "Preparing…" : "Download PDF"}
                  </Button>
                ) : null
              }
            />
          ))}
        </div>
      )}

      {data && data.totalPages > 1 ? (
        <div className="row-between">
          <Button
            variant="white"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            ← Previous
          </Button>

          <span className="muted no-margin">
            Page {data.page} of {data.totalPages}
          </span>

          <Button
            variant="white"
            disabled={page >= data.totalPages}
            onClick={() =>
              setPage((current) => Math.min(data.totalPages, current + 1))
            }
          >
            Next →
          </Button>
        </div>
      ) : null}
    </div>
  );
}
