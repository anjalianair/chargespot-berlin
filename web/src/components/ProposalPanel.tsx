import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  createProposal,
  type ProposalFeature,
} from "../api";

type CandidateLocation = {
  longitude: number;
  latitude: number;
};

type ProposalPanelProps = {
  candidate: CandidateLocation | null;
  accessToken: string | null;
  onProposalCreated: (
    proposal: ProposalFeature,
  ) => void;
};

export default function ProposalPanel({
  candidate,
  accessToken,
  onProposalCreated,
}: ProposalPanelProps) {
  const [title, setTitle] = useState("");
  const [justification, setJustification] =
    useState("");

  const [chargerType, setChargerType] =
    useState("Type 2");

  const [powerKw, setPowerKw] =
    useState("22");

  const [isSaving, setIsSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [messageType, setMessageType] =
    useState<"success" | "error" | "">("");

  useEffect(() => {
    setMessage("");
    setMessageType("");
  }, [candidate]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!candidate) {
      setMessageType("error");
      setMessage(
        "Select a candidate location on the map first.",
      );
      return;
    }

    if (!accessToken) {
      setMessageType("error");
      setMessage(
        "Log in before saving a proposal.",
      );
      return;
    }

    const parsedPower = Number(powerKw);

    if (
      !Number.isFinite(parsedPower) ||
      parsedPower <= 0
    ) {
      setMessageType("error");
      setMessage(
        "Enter a valid charging power.",
      );
      return;
    }

    setIsSaving(true);
    setMessage("");
    setMessageType("");

    try {
      const newProposal = await createProposal(
        {
          longitude: candidate.longitude,
          latitude: candidate.latitude,
          title: title.trim(),
          justification: justification.trim(),
          suggested_charger_type: chargerType,
          suggested_power_kw: parsedPower,
        },
        accessToken,
      );

      onProposalCreated(newProposal);

      setTitle("");
      setJustification("");
      setChargerType("Type 2");
      setPowerKw("22");
      setMessageType("success");
      setMessage(
        "Proposal saved permanently in PostGIS.",
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The proposal could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="proposal-panel">
      <p className="section-label">
        SAVE CANDIDATE
      </p>

      {!accessToken ? (
        <>
          <h3>Login required</h3>

          <p>
            Log in to save and manage candidate
            charging locations.
          </p>
        </>
      ) : !candidate ? (
        <>
          <h3>Select a location</h3>

          <p>
            Click inside Berlin and review the
            analysis before creating a proposal.
          </p>
        </>
      ) : (
        <>
          <h3>Create site proposal</h3>

          <p className="coordinate-text">
            Location:{" "}
            {candidate.longitude.toFixed(5)},{" "}
            {candidate.latitude.toFixed(5)}
          </p>

          <form
            className="proposal-form"
            onSubmit={handleSubmit}
          >
            <label>
              Proposal title

              <input
                type="text"
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                placeholder="Example: Charger near station"
                minLength={3}
                maxLength={150}
                required
              />
            </label>

            <label>
              Justification

              <textarea
                value={justification}
                onChange={(event) =>
                  setJustification(
                    event.target.value,
                  )
                }
                placeholder="Explain why this location should be considered"
                minLength={10}
                maxLength={1000}
                rows={4}
                required
              />
            </label>

            <label>
              Suggested charger type

              <select
                value={chargerType}
                onChange={(event) =>
                  setChargerType(
                    event.target.value,
                  )
                }
              >
                <option value="Type 2">
                  Type 2
                </option>

                <option value="CCS">
                  CCS
                </option>

                <option value="CHAdeMO">
                  CHAdeMO
                </option>

                <option value="Other">
                  Other
                </option>
              </select>
            </label>

            <label>
              Suggested power (kW)

              <input
                type="number"
                value={powerKw}
                onChange={(event) =>
                  setPowerKw(event.target.value)
                }
                min="1"
                max="500"
                step="1"
                required
              />
            </label>

            <button
              className="primary-button"
              type="submit"
              disabled={isSaving}
            >
              {isSaving
                ? "Saving…"
                : "Save proposal"}
            </button>
          </form>
        </>
      )}

      {message && (
        <p
          className={`form-message ${messageType}`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
