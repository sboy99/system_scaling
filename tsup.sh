#!/usr/bin/env bash
# Bootstrap a TypeScript (Node) project.
# Usage: ./bootstrap-ts.sh my-project [npm|pnpm|yarn]
set -euo pipefail

NAME="${1:-}"
PM="${2:-npm}"

if [[ -z "$NAME" ]]; then
  echo "Usage: $0 <project-name> [npm|pnpm|yarn]" >&2
  exit 1
fi
if [[ -e "$NAME" ]]; then
  echo "Error: '$NAME' already exists." >&2
  exit 1
fi
command -v node >/dev/null || { echo "Error: Node.js is not installed." >&2; exit 1; }
command -v "$PM" >/dev/null || { echo "Error: $PM is not installed." >&2; exit 1; }

case "$PM" in
  npm)  ADD_DEV="npm install -D" ;;
  pnpm) ADD_DEV="pnpm add -D" ;;
  yarn) ADD_DEV="yarn add -D" ;;
  *) echo "Error: package manager must be npm, pnpm or yarn." >&2; exit 1 ;;
esac

echo "==> Creating $NAME"
mkdir -p "$NAME/src"
cd "$NAME"

npm init -y >/dev/null
npm pkg set type="module"
npm pkg set main="dist/index.js"
npm pkg set engines.node=">=20"
npm pkg set scripts.dev="tsx watch src/index.ts"
npm pkg set scripts.build="tsc"
npm pkg set scripts.start="node dist/index.js"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.lint="eslint ."
npm pkg set scripts.format="prettier --write ."

echo "==> Writing config files"
cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
EOF

cat > eslint.config.mjs <<'EOF'
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  eslint.configs.recommended,
  tseslint.configs.recommended
);
EOF

cat > .prettierrc <<'EOF'
{
  "singleQuote": false,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100
}
EOF

cat > .gitignore <<'EOF'
node_modules
dist
coverage
.env
*.log
EOF

cat > .env.example <<'EOF'
PORT=3000
EOF

echo "==> Writing starter source"
cat > src/index.ts <<'EOF'
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("TypeScript"));
EOF

cat > src/index.test.ts <<'EOF'
import { describe, it, expect } from "vitest";
import { greet } from "./index.js";

describe("greet", () => {
  it("greets by name", () => {
    expect(greet("Ada")).toBe("Hello, Ada!");
  });
});
EOF

echo "==> Installing dev dependencies with $PM"
$ADD_DEV typescript tsx @types/node vitest eslint @eslint/js typescript-eslint prettier

# if command -v git >/dev/null && [[ ! -d .git ]]; then
#   echo "==> Initialising git"
#   git init -q
#   git add .
#   git commit -qm "Initial TypeScript setup" || true
# fi

echo
echo "Done. Next steps:"
echo "  cd $NAME"
echo "  $PM run dev     # run with hot reload"
echo "  $PM test        # run tests"
echo "  $PM run build   # compile to dist/"
