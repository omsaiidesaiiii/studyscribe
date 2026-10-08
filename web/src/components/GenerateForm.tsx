import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { NOTES_LANGUAGES, LANGUAGE_LABELS, DEFAULT_MODEL } from "@/lib/types";
import type { NotesLanguage, ModelOption } from "@/lib/types";
import {
  Alert,
  Button,
  Chip,
  Field,
  Select,
  Sheet,
  TextInput,
} from "./ui/kit";

const LANGUAGE_BLURBS: Record<NotesLanguage, string> = {
  english: "Plain English, exam-ready",
  hindi: "Devanagari script",
  hinglish: "Hindi in Latin script",
};

/**
 * The one form that starts a notebook. Everything the user can choose is on
 * one sheet: the link, the note language, the model — then Generate notes.
 */
export function GenerateForm({
  onError,
  onSuccess,
}: {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState<NotesLanguage>("hinglish");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .models()
      .then((response) => {
        if (!cancelled) setModels(response.models);
      })
      .catch(() => {
        // The picker still works with the built-in default list.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const credits = user?.credits ?? 0;
  const outOfCredits = user !== null && credits <= 0;

  const selectedModel = models.find((option) => option.id === model);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (!url.trim()) {
      onError("Paste a YouTube link first — then StudyScribe can start.");
      return;
    }

    setSubmitting(true);

    try {
      const { generationId } = await api.generate({
        url: url.trim(),
        language,
        model,
      });

      onSuccess("Queued — your notes are being written.");
      await refreshUser().catch(() => undefined);
      navigate(`/app/generation/${generationId}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        onError(
          "You are out of credits. Buy more credits from the Credits page to keep generating.",
        );
      } else {
        onError(
          error instanceof Error
            ? error.message
            : "The video could not be queued. Check the link and try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet>
      <form className="stack" onSubmit={submit}>
        <Field
          label="YouTube video link"
          htmlFor="video-url"
          hint="The video needs captions — auto-generated captions are fine."
        >
          <TextInput
            id="video-url"
            name="url"
            type="url"
            required
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </Field>

        <fieldset className="field language-field">
          <legend className="field-label">Notes language</legend>

          <div className="row">
            {NOTES_LANGUAGES.map((option) => (
              <Chip
                key={option}
                active={language === option}
                onClick={() => setLanguage(option)}
                title={LANGUAGE_BLURBS[option]}
              >
                {LANGUAGE_LABELS[option]}
              </Chip>
            ))}
          </div>

          <span className="field-hint">
            {LANGUAGE_BLURBS[language]} — the notes are written in this language.
          </span>
        </fieldset>

        <Field
          label="Model"
          htmlFor="model"
          hint={
            selectedModel?.blurb ??
            "The default model is the fastest. Pick a stronger one for dense topics."
          }
        >
          <Select
            id="model"
            name="model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            {(models.length > 0
              ? models
              : [{ id: DEFAULT_MODEL, label: DEFAULT_MODEL, blurb: "" }]
            ).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {outOfCredits ? (
          <Alert tone="info">
            No credits left. <Link to="/app/payments">Buy more credits</Link> to
            generate another notebook — re-running a video you already have is
            always free.
          </Alert>
        ) : null}

        <div className="row-between">
          <p className="muted no-margin">
            1 credit per new video · generating the same video again is free
          </p>

          <Button
            type="submit"
            variant="primary"
            disabled={submitting || outOfCredits}
          >
            {submitting
              ? "Starting…"
              : outOfCredits
                ? "No credits left"
                : "Generate notes"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
