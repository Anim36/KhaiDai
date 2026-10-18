"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiClient";

/**
 * Feat 3 — wired-up contact form. Submits to POST /api/contact,
 * which:
 *
 *   • persists a `ContactMessage` row (visible to admins at
 *     /admin/messages),
 *   • fires a notification email to SMTP_USER (configured via env)
 *     via lib/mailer.
 *
 * On success we clear the form and show a confirmation banner.
 * On 4xx we surface the server error inline so the user can fix
 * the offending field (e.g. invalid email, too-short message).
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      submitting ||
      !name.trim() ||
      !email.trim() ||
      !message.trim()
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/contact", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setSubmitted(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network error — try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Contact form"
      className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6 md:p-8"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[20px] font-extrabold text-ink">
          Send us a message
        </h2>
        <p className="text-[13px] text-ink-muted">
          We typically reply within one working day.
        </p>
      </header>

      {submitted ? (
        <div
          role="status"
          className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] font-semibold text-brand"
        >
          Thanks! We&apos;ll get back to you soon.
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700"
        >
          {error}
        </div>
      ) : null}

      <Field
        id="contact-name"
        label="Your name"
        value={name}
        onChange={setName}
        placeholder="e.g. Name"
        required
      />
      <Field
        id="contact-email"
        label="Email address"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        required
      />

      <div className="flex flex-col gap-1">
        <label
          htmlFor="contact-message"
          className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          className="rounded-xl border border-line bg-white px-3 py-2 text-[14px] text-ink outline-none transition-colors focus:border-brand"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 items-center justify-center rounded-xl bg-brand px-5 font-display text-[14px] font-extrabold text-white transition-colors hover:bg-brand-accent disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-xl border border-line bg-white px-3 text-[14px] text-ink outline-none transition-colors focus:border-brand"
      />
    </div>
  );
}