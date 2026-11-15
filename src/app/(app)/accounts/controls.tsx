"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

import { Button } from "@/components/ui/button";
import {
  completeReconnectAction,
  createReconnectLinkTokenAction,
  disconnectConnectionAction,
  syncConnectionAction,
  type ActionCode,
} from "./actions";

function messageFor(code: ActionCode): string {
  switch (code) {
    case "SYNC_IN_PROGRESS":
      return "A sync is already running for this connection.";
    case "NEEDS_RECONNECT":
      return "This connection needs to be reconnected before it can sync.";
    case "ITEM_STILL_ERROR":
      return "The bank still reports a problem with this connection. Try reconnecting again.";
    case "PROVIDER_UNAVAILABLE":
      return "The bank connection is unavailable right now. Try again.";
    default:
      return "The action could not be finished. Try again.";
  }
}

// Mounts Link the moment the update mode token is ready, then unmounts.
// The public token Link returns is never exchanged: update mode returns
// no new item.
function LinkLauncher({
  token,
  onSuccess,
  onExit,
}: {
  token: string;
  onSuccess: () => void;
  onExit: () => void;
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: () => onSuccess(),
    onExit: () => onExit(),
  });
  useEffect(() => {
    if (ready) {
      open();
    }
  }, [ready, open]);
  return null;
}

export function SyncButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function sync() {
    setError(null);
    startTransition(async () => {
      const result = await syncConnectionAction(connectionId);
      if (result.ok) {
        router.refresh();
        return;
      }
      if (result.code === "SESSION") {
        router.push("/signin");
        return;
      }
      setError(messageFor(result.code));
    });
  }

  return (
    <span className="inline-flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={sync} isLoading={pending}>
        Sync now
      </Button>
      {error !== null ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function ReconnectButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setError(null);
    setBusy(true);
    const result = await createReconnectLinkTokenAction(connectionId);
    setBusy(false);
    if (!result.ok) {
      if (result.code === "SESSION") {
        router.push("/signin");
        return;
      }
      setError(messageFor(result.code));
      return;
    }
    setToken(result.linkToken);
  }

  async function finish() {
    setToken(null);
    setBusy(true);
    const result = await completeReconnectAction(connectionId);
    setBusy(false);
    if (result.ok) {
      router.refresh();
      return;
    }
    if (result.code === "SESSION") {
      router.push("/signin");
      return;
    }
    setError(messageFor(result.code));
  }

  return (
    <span className="inline-flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void start()}
        isLoading={busy}
      >
        Reconnect
      </Button>
      {token !== null ? (
        <LinkLauncher
          token={token}
          onSuccess={() => void finish()}
          onExit={() => {
            // Closing Link without finishing is a quiet no op.
            setToken(null);
          }}
        />
      ) : null}
      {error !== null ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function DisconnectButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectConnectionAction(connectionId);
      setConfirming(false);
      if (result.ok) {
        router.refresh();
        return;
      }
      if (result.code === "SESSION") {
        router.push("/signin");
        return;
      }
      setError(messageFor(result.code));
    });
  }

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        Disconnect
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="destructive"
        size="sm"
        onClick={disconnect}
        isLoading={pending}
      >
        Confirm disconnect
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        Keep connected
      </Button>
      {error !== null ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
