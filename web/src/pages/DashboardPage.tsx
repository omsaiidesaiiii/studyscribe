import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { GenerateForm } from "@/components/GenerateForm";
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
import { LANGUAGE_LABELS, modelLabel } from "@/lib/types";
import type { GenerationSummary } from "@/lib/types";
import { NotebookDoodle } from "@/components/ui/doodles";

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Dashboard: the generate form on a notebook sheet, then the last three
 * notebooks as book cards. The credit balance lives in the header sticker only,
 * so it is never shown twice.
 */
export function DashboardPage({
  onToast,
}: {
  onToast: (message: string, tone: "info" | "error" | "success") => void;
}) {
  const { user } = useAuth();
  const [recent, setRecent] = useState<GenerationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .history(1, 3)
      .then((response) => {
        if (!cancelled) setRecent(response.generations);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load your recent notebooks.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function focusUrlField() {
    const field = document.getElementById("video-url");
    field?.scrollIntoView({ block: "center" });
    field?.focus();
  }

  return (
    <div className="stack stack-lg">
      <header className="page-head">
        <div>
          <h1>Hey {user?.name?.split(" ")[0] ?? "there"}, what are we studying?</h1>
          <p className="muted no-margin">
            Paste a lecture link, choose the language and the model — the notes
            come back on notebook pages.
          </p>
        </div>
      </header>

      <GenerateForm
        onError={(message) => onToast(message, "error")}
        onSuccess={(message) => onToast(message, "success")}
      />

      <section>
        <div className="page-head">
          <h2>Recent notebooks</h2>
          <ButtonLink href="/app/history" variant="white" className="btn-sm">
            View all
          </ButtonLink>
        </div>

        {loading ? (
          <Skeleton count={3} />
        ) : error ? (
          <ErrorState title="Your notebooks could not be loaded" message={error} />
        ) : recent.length === 0 ? (
          <EmptyState
            title="No notebooks yet"
            doodle={<NotebookDoodle />}
            action={
              <Button variant="primary" onClick={focusUrlField}>
                Paste a link to start
              </Button>
            }
          >
            Your first notebook appears here as soon as a link is generated.
          </EmptyState>
        ) : (
          <div className="notes-grid">
            {recent.map((item) => (
              <BookCard
                key={item.id}
                to={`/app/generation/${item.id}`}
                cover={coverToneFor(item.id)}
                eyebrow={LANGUAGE_LABELS[item.language] ?? item.language}
                title={item.title ?? "Untitled notebook"}
                status={<StatusPill status={item.status} />}
                meta={`${modelLabel(item.model)} · ${formatDate(item.createdAt)}`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
