"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

import { Button } from "@/components/ui/button";
import {
  completeConnectionAction,
  createLinkTokenAction,
  retryInitialSyncAction,
  type ActionCode,
} from "./actions";

type Phase =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "failed"; message: string; connectionId?: string };

function messageFor(code: ActionCode): string {
  switch (code) {
    case "CONFIG_INVALID":
      return "Ledger is not configured for the bank connection yet.";
    case "PROVIDER_UNAVAILABLE":
      return "The bank connection is unavailable right now. Try again.";
    default:
      return "The connection could not be finished. Connect again to retry.";
  }
}

// Mounts Link the moment the token is ready, then unmounts. Plaid loads
// its own script client side; no tokens touch the DOM directly.
function LinkLauncher({
  token,
  onSuccess,
  onExit,
}: {
  token: string;
  onSuccess: (publicToken: string) => void;
  onExit: () => void;
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: () => onExit(),
  });
  useEffect(() => {
    if (ready) {
      open();
    }
  }, [ready, open]);
  return null;
}

export function ConnectButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [token, setToken] = useState<string | null>(null);
  const [retrying, startRetry] = useTransition();

  async function start() {
    setPhase({ kind: "busy" });
    const result = await createLinkTokenAction();
    if (!result.ok) {
      if (result.code === "SESSION") {
        router.push("/signin");
        return;
      }
      setPhase({ kind: "failed", message: messageFor(result.code) });
      return;
    }
    setToken(result.linkToken);
  }

  async function handleSuccess(publicToken: string) {
    setToken(null);
    setPhase({ kind: "busy" });
    const result = await completeConnectionAction(publicToken);
    if (result.ok) {
      setPhase({ kind: "idle" });
      router.refresh();
      return;
    }
    if (result.code === "SESSION") {
      router.push("/signin");
      return;
    }
    if (result.stage === "sync") {
      setPhase({
        kind: "failed",
        message: "The connection saved, but the first import failed.",
        connectionId: result.connectionId,
      });
      return;
    }
    // Exchange, institution, or connection failures consumed the single
    // use public token; the only recovery is reopening Link.
    setPhase({ kind: "failed", message: messageFor(result.code) });
  }

  function retryImport(connectionId: string) {
    startRetry(async () => {
      const result = await retryInitialSyncAction(connectionId);
      if (result.ok) {
        setPhase({ kind: "idle" });
        router.refresh();
        return;
      }
      if (result.code === "SESSION") {
        router.push("/signin");
        return;
      }
      setPhase({
        kind: "failed",
        message: messageFor(result.code),
        connectionId,
      });
    });
  }

  return (
    <span className="inline-flex flex-col items-center gap-3">
      <Button
        onClick={() => void start()}
        isLoading={phase.kind === "busy" && token === null}
        disabled={retrying}
      >
        Connect your bank
      </Button>
      {token !== null ? (
        <LinkLauncher
          token={token}
          onSuccess={(publicToken) => void handleSuccess(publicToken)}
          onExit={() => {
            // Closing Link without finishing is a quiet no op.
            setToken(null);
            setPhase({ kind: "idle" });
          }}
        />
      ) : null}
      {phase.kind === "failed" ? (
        <span role="alert" className="max-w-sm text-sm text-destructive">
          {phase.message}{" "}
          {phase.connectionId !== undefined ? (
            <Button
              variant="outline"
              size="sm"
              isLoading={retrying}
              onClick={() => {
                if (phase.kind === "failed" && phase.connectionId) {
                  retryImport(phase.connectionId);
                }
              }}
            >
              Retry the import
            </Button>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

// Resume an initial sync that never committed a page, for example after
// a provider outage during connect.
export function RetrySyncButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const result = await retryInitialSyncAction(connectionId);
      if (result.ok) {
        setFailed(false);
        router.refresh();
        return;
      }
      if (result.code === "SESSION") {
        router.push("/signin");
        return;
      }
      setFailed(true);
    });
  }

  return (
    <span className="inline-flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={retry} isLoading={pending}>
        Retry the first import
      </Button>
      {failed ? (
        <span role="alert" className="text-sm text-destructive">
          The import failed again. Try later.
        </span>
      ) : null}
    </span>
  );
}
