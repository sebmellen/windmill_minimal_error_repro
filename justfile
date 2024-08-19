### VARIABLES
WINDMILL_TOKEN := `exec wmill user create-token | sed -e 's/\x1b\[[0-9;]*m//g' | awk '{print $2}'`

### CONFIG ITEMS
config-deno:
  export DENO_TLS_CA_STORE=system

config-wmill:
  sed -i '' '3s|.*|exec deno run --unsafely-ignore-certificate-errors --allow-all --quiet --no-config "https://deno.land/x/wmill@v1.381.0/main.ts" "$@"|' ~/.deno/bin/wmill

install-deps:
  brew install deno mkcert fswatch oven-sh/bun/bun

setup:
  mkcert -install
  chmod +x ./scripts/add-host.sh
  chmod +x ./scripts/lockfile-generation-file-renamer.sh
  ./scripts/add-host.sh windmill
  deno install -q -A https://deno.land/x/wmill/main.ts -f
  sed -i '' '3s|.*|exec deno run --unsafely-ignore-certificate-errors --allow-all --quiet --no-config "https://deno.land/x/wmill/main.ts" "$@"|' ~/.deno/bin/wmill
  cd scripts && bun install
  cd f && bun install

### UTILITIES
format:
  bun run format

delete-lockfiles:
  find ./f/ -name "*.lock" -type f -not -path "*/node_modules/*" -delete

### CI
sops-sync:
  INPUT_FILE_PATH="./sops/development.yml" WORKSPACE_NAME="integrations" WINDMILL_TOKEN={{WINDMILL_TOKEN}} WINDMILL_API_URL="https://windmill.local.cerebrum.com" NODE_TLS_REJECT_UNAUTHORIZED=0 bun ./scripts/windmill-sops-sync.cjs --trace-warnings

push-ci: config-deno
  bun run ./scripts/update-version-pins.ts
  rm package.json && rm bun.lockb
  wmill sync push --yes --raw --skip-pull --skip-variables --skip-secrets --skip-resources --include-schedules

pin-versions:
  bun run ./scripts/update-version-pins.ts

### LOCAL DEVELOPMENT
windmill-up: config-deno config-wmill
  chmod +x ./scripts/setup-mkcert.sh
  ./scripts/setup-mkcert.sh
  bash -c "docker compose up -d"
  NODE_TLS_REJECT_UNAUTHORIZED=0 bun ./scripts/windmill-setup --trace-warnings
  @mkdir -p ./.vscode
  @echo '{ "windmill.remote": "https://windmill.local.cerebrum.com", "windmill.workspaceId": "integrations", "windmill.token": "{{WINDMILL_TOKEN}}", "files.exclude": { "**/*.lock": true }, "search.exclude": { "**/*.lock": true },	"editor.codeActionsOnSave": { "quickfix.biome": "explicit" } }' > ./.vscode/settings.json
  @echo "settings.json has been created with the dynamic token."

push: config-deno config-wmill
  wmill sync push --yes --skip-variables --skip-secrets --skip-resources
  just sops-sync

pull:
  wmill sync pull --yes --skip-variables --skip-secrets --skip-resources --include-schedules
  rm -rf ./f/sops/ && rm -rf ./f/app_custom/ && rm -rf ./f/app_groups/ && rm -rf ./f/app_themes
  bun run ./scripts/update-version-pins.ts --unpin
  bun run format

windmill-down:
  rm -rf ./.temp
  wmill workspace remove integrations
  docker compose down --volumes

### LOCKFILE GENERATION
metadata-no-push: pin-versions config-deno config-wmill
  @if [ -f package.json ]; then mv package.json package.json.bkp; fi
  @if [ -f bun.lockb ]; then mv bun.lockb bun.lockb.bkp; fi
  wmill script generate-metadata --token={{WINDMILL_TOKEN}} --yes
  wmill flow generate-locks --token={{WINDMILL_TOKEN}} --yes
  just post-metadata

post-metadata:
  @if [ -f package.json.bkp ]; then mv package.json.bkp package.json; fi
  @if [ -f bun.lockb.bkp ]; then mv bun.lockb.bkp bun.lockb; fi
  bun run ./scripts/update-version-pins.ts --unpin
  just format

metadata: config-deno config-wmill
  just pin-versions
  just push
  just metadata-no-push
