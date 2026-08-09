import { useState, type FormEvent } from "react";
import { AuthenticationError, updateProfile } from "./auth";
import type { UserProfile } from "./types";

type ProfileModalProps = {
  profile: UserProfile;
  onClose: () => void;
  onSaved: (profile: UserProfile) => void;
};

export function ProfileModal({ profile, onClose, onSaved }: ProfileModalProps) {
  const [name, setName] = useState(profile.displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const next = await updateProfile(name);
      onSaved(next);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof AuthenticationError
          ? reason.message
          : reason instanceof Error
            ? reason.message
            : "Couldn't save.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="profile-title"
        data-testid="profile-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="profile-title">Your name</h2>
        <p>This is how you show up in chat and rooms.</p>
        <form onSubmit={(event) => void handleSave(event)}>
          <label htmlFor="profile-name" className="sr-only">
            Display name
          </label>
          <input
            id="profile-name"
            data-testid="profile-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            autoComplete="nickname"
            autoFocus
          />
          {error ? (
            <p className="modal__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--green"
              data-testid="profile-save-button"
              disabled={saving || !name.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
