import {
  useState,
  type FormEvent,
} from "react";

import {
  deleteProposal,
  updateProposal,
  type ProposalFeature,
} from "../api";

type ProposalManagerProps = {
  proposals: ProposalFeature[];
  accessToken: string | null;
  onProposalUpdated: (
    proposal: ProposalFeature,
  ) => void;
  onProposalDeleted: (
    proposalId: string,
  ) => void;
};

export default function ProposalManager({
  proposals,
  accessToken,
  onProposalUpdated,
  onProposalDeleted,
}: ProposalManagerProps) {
  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [justification, setJustification] =
    useState("");

  const [chargerType, setChargerType] =
    useState("Type 2");

  const [powerKw, setPowerKw] =
    useState("22");

  const [proposalStatus, setProposalStatus] =
    useState("draft");

  const [busyId, setBusyId] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState("");

  function startEditing(
    proposal: ProposalFeature,
  ) {
    setEditingId(proposal.id);
    setTitle(proposal.properties.title);

    setJustification(
      proposal.properties.justification,
    );

    setChargerType(
      proposal.properties
        .suggested_charger_type ?? "Type 2",
    );

    setPowerKw(
      String(
        proposal.properties
          .suggested_power_kw ?? 22,
      ),
    );

    setProposalStatus(
      proposal.properties.status,
    );

    setMessage("");
  }

  function cancelEditing() {
    setEditingId(null);
    setMessage("");
  }

  async function saveChanges(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!editingId || !accessToken) {
      return;
    }

    const parsedPower = Number(powerKw);

    if (
      !Number.isFinite(parsedPower) ||
      parsedPower <= 0
    ) {
      setMessage(
        "Enter a valid charging power.",
      );
      return;
    }

    setBusyId(editingId);
    setMessage("");

    try {
      const updatedProposal =
        await updateProposal(
          editingId,
          {
            title: title.trim(),
            justification:
              justification.trim(),
            suggested_charger_type:
              chargerType,
            suggested_power_kw:
              parsedPower,
            proposal_status:
              proposalStatus,
          },
          accessToken,
        );

      onProposalUpdated(updatedProposal);
      setEditingId(null);
      setMessage("Proposal updated.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The proposal could not be updated.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeProposal(
    proposal: ProposalFeature,
  ) {
    if (!accessToken) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${proposal.properties.title}"?`,
    );

    if (!confirmed) {
      return;
    }

    setBusyId(proposal.id);
    setMessage("");

    try {
      await deleteProposal(
        proposal.id,
        accessToken,
      );

      onProposalDeleted(proposal.id);

      if (editingId === proposal.id) {
        setEditingId(null);
      }

      setMessage("Proposal deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The proposal could not be deleted.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!accessToken) {
    return null;
  }

  return (
    <section className="proposal-manager">
      <p className="section-label">
        MY PROPOSALS
      </p>

      <h3>
        Saved locations ({proposals.length})
      </h3>

      {proposals.length === 0 ? (
        <p>
          You have not saved any proposals yet.
        </p>
      ) : (
        <div className="proposal-list">
          {proposals.map((proposal) => (
            <article
              className="proposal-card"
              key={proposal.id}
            >
              {editingId === proposal.id ? (
                <form
                  className="proposal-form"
                  onSubmit={saveChanges}
                >
                  <label>
                    Title

                    <input
                      type="text"
                      value={title}
                      onChange={(event) =>
                        setTitle(
                          event.target.value,
                        )
                      }
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
                      minLength={10}
                      maxLength={1000}
                      rows={4}
                      required
                    />
                  </label>

                  <label>
                    Charger type

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
                    Power (kW)

                    <input
                      type="number"
                      value={powerKw}
                      onChange={(event) =>
                        setPowerKw(
                          event.target.value,
                        )
                      }
                      min="1"
                      max="500"
                      required
                    />
                  </label>

                  <label>
                    Status

                    <select
                      value={proposalStatus}
                      onChange={(event) =>
                        setProposalStatus(
                          event.target.value,
                        )
                      }
                    >
                      <option value="draft">
                        Draft
                      </option>

                      <option value="submitted">
                        Submitted
                      </option>
                    </select>
                  </label>

                  <div className="proposal-actions">
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={
                        busyId === proposal.id
                      }
                    >
                      Save changes
                    </button>

                    <button
                      className="secondary-button"
                      type="button"
                      onClick={cancelEditing}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <strong>
                    {proposal.properties.title}
                  </strong>

                  <span className="proposal-status">
                    {proposal.properties.status}
                  </span>

                  <p>
                    {
                      proposal.properties
                        .justification
                    }
                  </p>

                  <div className="proposal-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        startEditing(proposal)
                      }
                    >
                      Edit
                    </button>

                    <button
                      className="danger-button"
                      type="button"
                      disabled={
                        busyId === proposal.id
                      }
                      onClick={() =>
                        void removeProposal(
                          proposal,
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}

      {message && (
        <p className="form-message">
          {message}
        </p>
      )}
    </section>
  );
}