#!/usr/bin/env bash
# Проверка готовности бэкапов (без вывода секретов)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== booking-crm backup setup check ==="
echo "GitHub repo (origin): $(git remote get-url origin 2>/dev/null | sed 's/.*github.com[:/]//;s/.git$//')"
echo ""

check_env() {
  local name="$1"
  local file="${2:-.env}"
  if [ -f "$file" ] && grep -q "^${name}=" "$file" 2>/dev/null; then
    local val
    val=$(grep "^${name}=" "$file" | cut -d= -f2- | tr -d '"' | tr -d "'")
    if [ -n "$val" ] && [ "$val" != "your-service-role-key" ]; then
      echo "  [ok] $name"
      return 0
    fi
  fi
  echo "  [!!] $name — не задан"
  return 1
}

echo "Локальный .env:"
missing=0
for v in DATABASE_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY BACKUP_RESTORE_SECRET GITHUB_BACKUP_TOKEN GITHUB_REPO; do
  check_env "$v" || missing=$((missing + 1))
done
echo ""

if [ -f .env ]; then
  host=$(node -e "
    const fs=require('fs');
    const m=fs.readFileSync('.env','utf8').match(/^DATABASE_URL=(.*)$/m);
    const u=(m?m[1].replace(/^[\"']|[\"']$/g,''):'');
    try{console.log(new URL(u.replace(/^postgresql:/,'http:')).hostname)}catch{console.log('invalid')}
  ")
  echo "DATABASE_URL host: $host"
  if echo "$host" | grep -q pooler; then
    echo "  [!!] Используется pooler — для pg_dump нужен direct URL Neon"
  else
    echo "  [ok] Не pooler"
  fi
fi
echo ""

if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    repo=$(git remote get-url origin | sed 's/.*github.com[:/]//;s/.git$//')
    echo "GitHub secrets ($repo):"
    gh secret list -R "$repo" 2>/dev/null | grep -E 'DATABASE_URL|SUPABASE|BACKUP' || echo "  (нет backup secrets или нет доступа)"
  else
    echo "GitHub CLI: выполните gh auth login"
  fi
else
  echo "GitHub CLI не установлен"
fi
echo ""

echo "Workflow files:"
for f in .github/workflows/backup.yml .github/workflows/restore.yml; do
  [ -f "$f" ] && echo "  [ok] $f" || echo "  [!!] $f отсутствует"
done

if git status --porcelain .github/workflows/backup.yml 2>/dev/null | grep -q .; then
  echo ""
  echo "  [!!] backup.yml ещё не закоммичен — workflow не появится на GitHub до push"
fi

echo ""
echo "Рекомендуемый GITHUB_REPO: $(git remote get-url origin 2>/dev/null | sed 's/.*github.com[:/]//;s/.git$//')"
echo "=== done ==="
