#!/usr/bin/env bash
# The worst-case L1 voting run, fully orchestrated: a fresh governance testnode, Postgres, the
# indexer (its Ethereum RPC behind a proxy the spec can take down), this frontend, then the
# Playwright spec that drives the scenario (e2e/l1-voting/worst-case.spec.ts).
#
#   WORST_CASE_INDEXER_REPO=../oc/agi-l1-voting e2e/l1-voting/run-worst-case.sh
#
# Host ports default to 285xx (L1 28545, L2 28547, RPC proxy 28645/28646), Postgres 5434,
# indexer 42069, frontend 3100, so it can run next to a stock testnode on 8545/8547.
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
INDEXER_REPO="$(cd "${WORST_CASE_INDEXER_REPO:?set WORST_CASE_INDEXER_REPO}" && pwd)"
IMAGE_REF="${TESTNODE_IMAGE_REF:-ghcr.io/offchainlabs/arbitrum-governance-indexer/testnode:v0.2.0}"
L1_PORT="${L1_PORT:-28545}" L2_PORT="${L2_PORT:-28547}"
PROXY_PORT="${PROXY_PORT:-28645}" PROXY_CONTROL="${PROXY_CONTROL:-28646}"
PG_PORT="${PG_PORT:-5434}" INDEXER_PORT="${INDEXER_PORT:-42069}" WEB_PORT="${WEB_PORT:-3100}"
ART="$FRONTEND_DIR/e2e/l1-voting/.artifacts/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ART"

export ARBITRUM_TESTNODE_L1_RPC_URL="http://127.0.0.1:$L1_PORT"
export ARBITRUM_TESTNODE_L2_RPC_URL="http://127.0.0.1:$L2_PORT"
export PONDER_RPC_URL_LOCAL="$ARBITRUM_TESTNODE_L2_RPC_URL"
export DATABASE_URL="postgres://postgres:postgres@localhost:$PG_PORT/postgres"
export GOVERNANCE_ADDRESSES_FILE="$INDEXER_REPO/.testnode/config/governance.json"
export ARBITRUM_TESTNODE_CONFIG_DIR="$INDEXER_REPO/.testnode/config"
export ARBITRUM_TESTNODE_DEPLOYMENT_JSON="$INDEXER_REPO/.testnode/config/deployment.json"
export E2E_INDEXER_URL="http://127.0.0.1:$INDEXER_PORT"
export SCENARIO_STATE="$ART/scenario-state.json"

PIDS=()
cleanup() { for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT

step() { echo "▸ $*" | tee -a "$ART/run.log"; }

step "boot testnode ($IMAGE_REF) and Postgres"
docker rm -f arbitrum-testnode-l3-eth gov-local-pg >/dev/null 2>&1 || true
docker run -d --name gov-local-pg -p "$PG_PORT:5432" -e POSTGRES_PASSWORD=postgres postgres:16-alpine >/dev/null
docker run -d --platform linux/amd64 --name arbitrum-testnode-l3-eth -e TESTNODE_VARIANT=l3-eth \
  -p "127.0.0.1:$L1_PORT:8545" -p "127.0.0.1:$L2_PORT:8547" -p "127.0.0.1:$((L2_PORT + 1)):8548" \
  "$IMAGE_REF" >/dev/null
until cast block-number --rpc-url "$ARBITRUM_TESTNODE_L2_RPC_URL" >/dev/null 2>&1; do sleep 3; done
until docker exec gov-local-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
# The image's exported config (addresses, rollup deployment) is fixed at bake time; one
# `pnpm testnode:up` of this image in the indexer repo exports it.
[ -f "$GOVERNANCE_ADDRESSES_FILE" ] || { echo "no $GOVERNANCE_ADDRESSES_FILE: run pnpm testnode:up once"; exit 1; }
(cd "$INDEXER_REPO" && pnpm -s testnode:prepare && pnpm -s testnode:verify "$GOVERNANCE_ADDRESSES_FILE") 2>&1 | tee -a "$ART/run.log"

step "Ethereum RPC proxy for the indexer (:$PROXY_PORT, control :$PROXY_CONTROL)"
(cd "$INDEXER_REPO/packages/e2e" && exec pnpm -s scenario rpc-proxy "$PROXY_PORT" "$PROXY_CONTROL") >"$ART/rpc-proxy.log" 2>&1 &
PIDS+=($!)
until curl -s "http://127.0.0.1:$PROXY_CONTROL/up" >/dev/null; do sleep 1; done

step "indexer (:$INDEXER_PORT)"
(cd "$INDEXER_REPO/packages/indexer" && \
  PONDER_RPC_URL_LOCAL_L1="http://127.0.0.1:$PROXY_PORT" SIWE_CHAIN_ID=412346 L1_VOTING_PROOF_POLL_MS=5000 \
  SIWE_DOMAINS="localhost:$WEB_PORT" \
  exec ./node_modules/.bin/ponder start --schema "worst_case_$(date +%s)" --port "$INDEXER_PORT") \
  >"$ART/indexer.log" 2>&1 &
PIDS+=($!)
until [ "$(curl -s -o /dev/null -w '%{http_code}' "$E2E_INDEXER_URL/ready")" = 200 ]; do sleep 5; done

step "frontend + worst-case spec"
cd "$FRONTEND_DIR"
WORST_CASE_INDEXER_REPO="$INDEXER_REPO" \
WORST_CASE_RPC_CONTROL="http://127.0.0.1:$PROXY_CONTROL" \
GOVERNANCE_INDEXER_URL="$E2E_INDEXER_URL" \
NEXT_PUBLIC_LOCAL_CHAINS=1 \
NEXT_PUBLIC_LOCAL_L1_RPC="$ARBITRUM_TESTNODE_L1_RPC_URL" \
NEXT_PUBLIC_LOCAL_L2_RPC="$ARBITRUM_TESTNODE_L2_RPC_URL" \
NEXT_PUBLIC_STAGES_SOURCE=indexer \
PORT="$WEB_PORT" CI=1 \
  pnpm exec playwright test e2e/l1-voting/worst-case.spec.ts --project=chromium --reporter=list \
  2>&1 | tee "$ART/playwright.log"
status=${PIPESTATUS[0]}
step "artifacts in $ART (exit $status)"
exit "$status"
