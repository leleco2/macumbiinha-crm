# Macumbiinha CRM - instalador oficial. Windows PowerShell ou PowerShell 7.
# Abra um terminal nesta pasta e execute: powershell -ExecutionPolicy Bypass -File .\INSTALAR-WINDOWS.ps1
# Leia o script antes de executar. Nenhuma senha padrao e criada.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:CLOUDFLARE_ACCOUNT_ID = '0c4c6e226af971ccaf0490eff6b90d60'
function Check-Step { param([string]$label)
    if ($LASTEXITCODE -ne 0) { throw "$label falhou. Nenhum passo posterior foi executado." }
}
function New-SecureValue {
    $value = & node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
    Check-Step 'Geração de chave'
    return $value
}
Write-Host 'MACUMBIINHA CRM - instalação do Worker separado da loja' -ForegroundColor Green
Write-Host 'Conta Cloudflare selecionada: macumbinhaa (0c4c6e226af971ccaf0490eff6b90d60)' -ForegroundColor Yellow
Write-Host 'Requisitos: Node.js 22+, npm e login autorizado na conta acima.'
npm install
Check-Step 'Instalação npm'
npm run check
Check-Step 'Testes locais'
Write-Host 'Entre no Cloudflare em sua conta macumbinhaa...' -ForegroundColor Cyan
npx wrangler login
Check-Step 'Login Cloudflare'
Write-Host 'Aplicando as migrações do banco D1 macumbiinha-crm-erp...' -ForegroundColor Cyan
npx wrangler d1 migrations apply DB --remote
Check-Step 'Migrações D1'
Write-Host 'Publicando um Worker novo macumbiinha-crm, independente do Pages...' -ForegroundColor Cyan
npx wrangler deploy
Check-Step 'Deploy'
Write-Host 'Gerando chave única de instalação e configurando o servidor...' -ForegroundColor Cyan
$setupKey = New-SecureValue
$setupKey | npx wrangler secret put SETUP_KEY
Check-Step 'SETUP_KEY'
$formSalt = New-SecureValue
$formSalt | npx wrangler secret put FORM_SALT
Check-Step 'FORM_SALT'
Remove-Variable formSalt
Write-Host 'Notificações push: configure já as chaves VAPID (opcional).' -ForegroundColor Cyan
$pushMail = Read-Host 'Seu e-mail real para contato de notificações (Enter para configurar push depois)'
if ($pushMail -match '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
    $keys = & node ./scripts/generate-vapid.mjs | ConvertFrom-Json
    Check-Step 'Geração VAPID'
    $keys.public | npx wrangler secret put VAPID_PUBLIC_KEY
    Check-Step 'VAPID_PUBLIC_KEY'
    $keys.private | npx wrangler secret put VAPID_PRIVATE_KEY
    Check-Step 'VAPID_PRIVATE_KEY'
    ('mailto:' + $pushMail) | npx wrangler secret put VAPID_SUBJECT
    Check-Step 'VAPID_SUBJECT'
    Remove-Variable keys
    Write-Host 'Push preparado. Após o login, ative as notificações no CRM no aparelho.' -ForegroundColor Green
} else {
    Write-Host 'Push em segundo plano não ativado; alertas internos continuam disponíveis.' -ForegroundColor Yellow
}
Write-Host 'Turnstile já foi criado para macumbiinha.pages.dev na conta Cloudflare.' -ForegroundColor Cyan
Write-Host 'Para habilitar o formulário, copie a SECRET KEY do widget Macumbiinha no painel Cloudflare.'
$enable = Read-Host 'Configurar TURNSTILE_SECRET agora? (s/N)'
if ($enable -match '^[Ss]$') {
    npx wrangler secret put TURNSTILE_SECRET
    Check-Step 'TURNSTILE_SECRET'
}
Write-Host ''
Write-Host '================ CHAVE DE INSTALAÇÃO (GUARDE EM LOCAL SEGURO) ================' -ForegroundColor Yellow
Write-Host $setupKey -ForegroundColor Yellow
Write-Host '==========================================================================' -ForegroundColor Yellow
Write-Host 'Use essa chave uma única vez para criar seu admin no CRM. NÃO a envie no chat.' -ForegroundColor Yellow
Write-Host 'CRM: https://macumbiinha-crm.maodeouro-nexa.workers.dev/' -ForegroundColor Green
Write-Host 'Após criar o administrador, remova SETUP_KEY dos segredos do Worker.' -ForegroundColor Cyan
