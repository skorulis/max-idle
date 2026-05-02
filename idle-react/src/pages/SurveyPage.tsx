import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getActiveSurvey, submitSurveyAnswer } from "../app/api";
import type { Survey, SurveyCurrencyType } from "../app/types";

export type SurveyCompletionReward = {
  currencyType: SurveyCurrencyType;
  reward: number;
};

type SurveyPageProps = {
  token: string | null;
  onSurveyCompleted: (granted?: SurveyCompletionReward) => Promise<void>;
};

export function SurveyPage({ token, onSurveyCompleted }: SurveyPageProps) {
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<Survey | null | undefined>(undefined);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      try {
        const active = await getActiveSurvey(token);
        if (cancelled) {
          return;
        }
        if (!active) {
          setSurvey(null);
          return;
        }
        setSurvey(active);
      } catch (e) {
        if (cancelled) {
          return;
        }
        if (e instanceof Error && e.message === "UNAUTHORIZED") {
          navigate("/", { replace: true });
          return;
        }
        setError(e instanceof Error ? e.message : "Failed to load survey");
        setSurvey(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  useEffect(() => {
    if (survey === null && !error) {
      navigate("/", { replace: true });
    }
  }, [survey, error, navigate]);

  const handleComplete = async () => {
    if (!survey || !selectedOptionId) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitSurveyAnswer(token, survey.id, selectedOptionId);
      await onSurveyCompleted({ currencyType: survey.currencyType, reward: survey.reward });
      setCompleted(true);
    } catch (e) {
      if (e instanceof Error && e.message === "SURVEY_ALREADY_ANSWERED") {
        await onSurveyCompleted();
        setCompleted(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Could not submit survey");
    } finally {
      setSubmitting(false);
    }
  };

  if (survey === undefined) {
    return (
      <section className="card">
        <p>Loading survey...</p>
      </section>
    );
  }

  if (error && survey === null) {
    return (
      <section className="card">
        <p className="error">{error}</p>
        <button type="button" className="secondary" onClick={() => navigate("/")}>
          Back to home
        </button>
      </section>
    );
  }

  if (!survey) {
    return null;
  }

  if (completed) {
    return (
      <section className="card">
        <h2>Thanks for helping out</h2>
        <button type="button" className="collect" onClick={() => navigate("/")}>
          Return home
        </button>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 id="survey-question-title">{survey.title}</h2>
      <fieldset
        className="survey-options"
        role="radiogroup"
        aria-labelledby="survey-question-title"
      >
        {survey.options.map((opt) => (
          <label key={opt.id} className="survey-option-label">
            <input
              type="radio"
              name="survey-option"
              value={opt.id}
              checked={selectedOptionId === opt.id}
              onChange={() => setSelectedOptionId(opt.id)}
            />
            <span className="survey-option-label__text">{opt.text}</span>
          </label>
        ))}
      </fieldset>
      {error ? <p className="error">{error}</p> : null}
      <button
        type="button"
        className="collect"
        style={{ marginTop: "1rem" }}
        disabled={!selectedOptionId || submitting}
        onClick={() => void handleComplete()}
      >
        {submitting ? "Submitting..." : "Complete"}
      </button>
    </section>
  );
}
