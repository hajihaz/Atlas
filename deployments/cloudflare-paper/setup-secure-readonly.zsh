#!/bin/zsh
# Run in the OWNER'S Mac Terminal only. No ChatGPT/chat/repository/token output.
# Installs read-only Upstox Analytics and generates a private Atlas desk key.
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -t 0 ]]; then
  echo 'Run this command interactively from Mac Terminal so Wrangler can privately prompt for the Analytics Token.' >&2
  exit 2
fi
npx --yes wrangler whoami >/dev/null
printf '\nAtlas PAPER-ONLY secure setup (Cloudflare Free).\n'
printf 'In Upstox Developer Apps > Analytics, click the small copy icon next to Analytics Token.\n'
printf 'Then paste into Wrangler\x27s private secret prompt below. Do NOT paste into chat, commands or a Git file.\n'
npx --yes wrangler secret put UPSTOX_ANALYTICS_TOKEN
printf '\nCreating a separate random Atlas owner key and storing in your macOS Keychain.\n'
service='atlas-free-cloud-paper-owner'
account='atlas-private-desk'
if security find-generic-password -a "$account" -s "$service" >/dev/null 2>&1; then
  owner="$(security find-generic-password -a "$account" -s "$service" -w)"
else
  owner="$(openssl rand -hex 32)"
  security add-generic-password -a "$account" -s "$service" -w "$owner" >/dev/null
fi
if [[ ${#owner} -lt 32 ]]; then
  echo 'Owner credential is invalid; refusing to provision.' >&2
  exit 2
fi
print -rn -- "$owner" | npx --yes wrangler secret put OWNER_TOKEN >/dev/null
unset owner
printf '\nCloudflare secret names installed (values are never displayed):\n'
npx --yes wrangler secret list --name atlas-free-cloud-paper
printf '\nDone. The strategy remains DISABLED until you explicitly arm it in Atlas Preview.\n'
printf 'To retrieve the Atlas owner key locally for the private paper desk, run:\n'
printf "  security find-generic-password -a '%s' -s '%s' -w\n" "$account" "$service"
printf 'Never send either key to anyone. Read-only Upstox token cannot place real orders.\n'
