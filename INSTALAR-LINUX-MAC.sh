#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export CLOUDFLARE_ACCOUNT_ID=0c4c6e226af971ccaf0490eff6b90d60
printf '%s\n' 'CRM Macumbiinha: instale Node.js 22+ e conecte a conta Cloudflare macumbinhaa.'
npm install
npm run check
npx wrangler login
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
SETUP_KEY="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
FORM_SALT="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
printf '%s' "$SETUP_KEY" | npx wrangler secret put SETUP_KEY
printf '%s' "$FORM_SALT" | npx wrangler secret put FORM_SALT
unset FORM_SALT
read -r -p 'Email real de contato para ativar notificações push (Enter para pular): ' PUSH_EMAIL
if [[ "$PUSH_EMAIL" == *'@'*.* ]]; then
  VAPID_JSON="$(node scripts/generate-vapid.mjs)"
  printf '%s' "$VAPID_JSON" | node -e "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>process.stdout.write(JSON.parse(s).public))" | npx wrangler secret put VAPID_PUBLIC_KEY
  printf '%s' "$VAPID_JSON" | node -e "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>process.stdout.write(JSON.parse(s).private))" | npx wrangler secret put VAPID_PRIVATE_KEY
  printf 'mailto:%s' "$PUSH_EMAIL" | npx wrangler secret put VAPID_SUBJECT
  unset VAPID_JSON
fi
printf '\n%s\n' 'Para habilitar formulário: Cloudflare Turnstile > widget Macumbiinha > SECRET KEY; depois npx wrangler secret put TURNSTILE_SECRET'
printf 'CHAVE DE INSTALAÇÃO (guarde; não compartilhe): %s\n' "$SETUP_KEY"
printf '%s\n' 'Acesse https://macumbiinha-crm.maodeouro-nexa.workers.dev/'
