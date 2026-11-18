"use client";

import { useState } from "react";

export default function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed");
      window.location.replace("/login");
    } catch {
      setPending(false);
      setError("Could not sign out. Please try again.");
    }
  }
  return (
    <div className="text-right mb-4">
      <button type="button" onClick={signOut} disabled={pending}
        className="text-sm text-blue-700 underline disabled:opacity-50">
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
