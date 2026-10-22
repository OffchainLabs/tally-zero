#!/usr/bin/env bash
# A local Safe Transaction Service (safe-global/safe-transaction-service) following the governance
# testnode's L2, so the frontend's off-chain Safe flow (propose, confirm, execute) runs against the
# real service. Registers the testnode's SafeL2 singleton and proxy factory, which it cannot know
# about on a custom chain id, and serves the API on http://127.0.0.1:$SAFE_TXS_PORT.
#
#   e2e/l1-voting/safe-tx-service.sh up    # needs the testnode container running
#   e2e/l1-voting/safe-tx-service.sh down
set -euo pipefail

IMAGE="${SAFE_TXS_IMAGE:-safeglobal/safe-transaction-service:v6.11.0}"
NET=safe-txs
PORT="${SAFE_TXS_PORT:-28888}"
TESTNODE="${TESTNODE_CONTAINER:-arbitrum-testnode-l3-eth}"
L2_RPC_HOST="${ARBITRUM_TESTNODE_L2_RPC_URL:-http://127.0.0.1:28547}"
CONTAINERS=(safe-txs-db safe-txs-redis safe-txs-rabbitmq safe-txs-worker safe-txs-scheduler safe-txs-web)

down() {
  docker rm -f "${CONTAINERS[@]}" >/dev/null 2>&1 || true
  docker network disconnect "$NET" "$TESTNODE" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}

up() {
  down
  docker network create "$NET" >/dev/null
  docker network connect --alias testnode "$NET" "$TESTNODE"
  docker run -d --name safe-txs-db --network "$NET" -e POSTGRES_PASSWORD=postgres postgres:16-alpine >/dev/null
  docker run -d --name safe-txs-redis --network "$NET" redis:7-alpine >/dev/null
  docker run -d --name safe-txs-rabbitmq --network "$NET" rabbitmq:3-alpine >/dev/null
  until docker exec safe-txs-db pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
  until docker exec safe-txs-rabbitmq rabbitmq-diagnostics -q ping >/dev/null 2>&1; do sleep 2; done

  local env=(
    -e PYTHONPATH=/app/ -e DJANGO_SETTINGS_MODULE=config.settings.production
    -e DJANGO_SECRET_KEY=local-e2e-only -e DEBUG=0 -e DJANGO_ALLOWED_HOSTS='*'
    -e CSRF_TRUSTED_ORIGINS=http://localhost
    -e DATABASE_URL=psql://postgres:postgres@safe-txs-db:5432/postgres
    -e ETHEREUM_NODE_URL=http://testnode:8547 -e ETH_L2_NETWORK=1
    -e REDIS_URL=redis://safe-txs-redis:6379/0
    -e CELERY_BROKER_URL=amqp://guest:guest@safe-txs-rabbitmq/
    -e ETH_REORG_BLOCKS=1 -e ETH_EVENTS_BLOCK_PROCESS_LIMIT=500
  )
  # Migrations, then the testnode's Safe contracts (an unknown chain id has none preconfigured).
  docker run --rm --network "$NET" "${env[@]}" -w /app "$IMAGE" \
    bash -c 'python manage.py migrate --noinput >/dev/null && python manage.py setup_service' >/dev/null
  local singleton factory block
  singleton=$(cast storage "${SAFE:-0x8Df5b801aD8FD2F9589c284979e6795f418A5c9B}" 0 --rpc-url "$L2_RPC_HOST" | sed 's/^0x000000000000000000000000/0x/')
  read -r factory block < <(cast logs --from-block 0 --to-block latest \
    'ProxyCreation(address indexed proxy, address singleton)' --rpc-url "$L2_RPC_HOST" --json |
    jq -r '.[0] | "\(.address) \(.blockNumber)"')
  block=$((block - 10))
  docker run --rm --network "$NET" "${env[@]}" -w /app "$IMAGE" python manage.py shell -c "
from safe_transaction_service.history.models import SafeMasterCopy, ProxyFactory
SafeMasterCopy.objects.update_or_create(address='$singleton', defaults=dict(initial_block_number=$block, tx_block_number=$block, version='1.4.1', l2=True))
ProxyFactory.objects.update_or_create(address='$factory', defaults=dict(initial_block_number=$block, tx_block_number=$block))
print('registered', SafeMasterCopy.objects.count(), ProxyFactory.objects.count())
"
  docker run -d --name safe-txs-worker --network "$NET" "${env[@]}" -w /app \
    -e WORKER_QUEUES=default,indexing,processing,contracts,tokens "$IMAGE" docker/web/celery/worker/run.sh >/dev/null
  docker run -d --name safe-txs-scheduler --network "$NET" "${env[@]}" -w /app "$IMAGE" docker/web/celery/scheduler/run.sh >/dev/null
  docker run -d --name safe-txs-web --network "$NET" "${env[@]}" -w /app -p "127.0.0.1:$PORT:8888" \
    "$IMAGE" bash -c 'exec gunicorn --config gunicorn.conf.py --pythonpath /app -b 0.0.0.0:8888 config.wsgi:application' >/dev/null
  until curl -sf "http://127.0.0.1:$PORT/api/v1/about/" >/dev/null; do sleep 2; done
  echo "Safe Transaction Service on http://127.0.0.1:$PORT (singleton $singleton, factory $factory)"
}

"${1:-up}"
