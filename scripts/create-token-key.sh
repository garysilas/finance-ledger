#!/bin/sh
# Create the owner token key file. Explicit and owner initiated only:
# refuses to overwrite an existing file and never runs automatically.
# The key encrypts provider tokens at rest; keep a separate secure backup
# of the file and its LEDGER_TOKEN_KEY_ID. Losing it strands existing
# connection tokens until an explicit provider reconnect.
set -eu

: "${LEDGER_TOKEN_KEY_PATH:?LEDGER_TOKEN_KEY_PATH is required}"

case "$LEDGER_TOKEN_KEY_PATH" in
  /*) ;;
  *)
    echo "create-token-key: path must be absolute" >&2
    exit 1
    ;;
esac

if [ -e "$LEDGER_TOKEN_KEY_PATH" ] || [ -L "$LEDGER_TOKEN_KEY_PATH" ]; then
  echo "create-token-key: refusing to overwrite existing key file" >&2
  exit 1
fi

mkdir -p "$(dirname "$LEDGER_TOKEN_KEY_PATH")"
umask 077
openssl rand -base64 32 > "$LEDGER_TOKEN_KEY_PATH"
chmod 600 "$LEDGER_TOKEN_KEY_PATH"
echo "create-token-key: wrote a new key file" >&2
