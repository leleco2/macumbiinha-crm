# Publicação — Macumbiinha CRM + site integrado

**Arquitetura:** são DOIS deploys independentes. `macumbiinha-crm` é um Cloudflare **Worker com D1 e Assets**; `macumbiinha` é um Cloudflare **Pages estático**. Não envie o ZIP do CRM ao projeto Pages.

## Já configurado

- Conta Cloudflare: `macumbinhaa`, ID `0c4c6e226af971ccaf0490eff6b90d60`.
- Banco D1: `macumbiinha-crm-erp` (`4574df14-0b8a-4a1c-b8ca-fa659aa26c1f`), **ainda sem migrações**.
- Widget Cloudflare Turnstile: `Macumbiinha - Solicitação de orçamento CRM` para `macumbiinha.pages.dev`, site key pública já incluída na configuração do CRM.
- Worker previsto: `macumbiinha-crm`, URL após deploy `https://macumbiinha-crm.maodeouro-nexa.workers.dev`.
- O código do site atualizado está no GitHub e foi compilado para um ZIP próprio de Pages.

## 1. Publicar o CRM (primeiro)

No seu computador instale **Node.js 22+** e baixe o ZIP do CRM. Extraia o ZIP; entre na pasta `macumbiinha-crm-erp`.

**Windows:** abra o PowerShell nessa pasta, confira o conteúdo do script `INSTALAR-WINDOWS.ps1` e execute:

```powershell
Unblock-File .\INSTALAR-WINDOWS.ps1
.\INSTALAR-WINDOWS.ps1
```

Se a política da sua empresa bloquear scripts, execute os comandos do arquivo individualmente, não altere a política global do sistema.

**Mac / Linux:** execute `bash ./INSTALAR-LINUX-MAC.sh`.

O instalador executa os testes, autentica na Cloudflare, aplica as migrações ao D1, publica o Worker e registra segredos aleatórios de instalação e antispam. A chave de instalação **SETUP_KEY é exibida uma única vez ao final**: guarde em gerenciador de senhas, não envie no chat nem coloque em GitHub. Durante a instalação você pode informar um e-mail real para habilitar as chaves Web Push.

## 2. Ativar o formulário Turnstile

Abra <https://dash.cloudflare.com/> na conta `macumbinhaa`. Em **Turnstile** abra o widget **Macumbiinha - Solicitação de orçamento CRM**. Copie a **Secret Key** (não a Site Key pública). O instalador pergunta se deseja configurá-la; escolha `s` e cole somente no prompt do terminal. Se pulou essa etapa, depois execute no diretório do CRM:

```bash
npx wrangler secret put TURNSTILE_SECRET
```

O CRM só habilita o formulário de orçamento quando `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY` e `FORM_SALT` estão presentes. Não coloque a Secret Key no arquivo do site, no HTML ou no chat.

## 3. Criar o administrador

Abra `https://macumbiinha-crm.maodeouro-nexa.workers.dev/`, confirme que aparece a tela de configuração inicial e preencha seu próprio **e-mail**, uma senha única de **pelo menos 14 caracteres**, e a `SETUP_KEY` impressa no instalador. Entre na conta.

Após criar o primeiro administrador, remova `SETUP_KEY` dos segredos do Worker no painel Cloudflare (ou `npx wrangler secret delete SETUP_KEY`).

## 4. Alimentar o estoque REAL do CRM

No CRM, abra **Produtos e estoque → Importar CSV**. O arquivo `public/catalogo-modelo.csv` já possui os SKUs da loja, como `SEDA-SADHU-BLACK`. Antes de importar, preencha **custo**, **preço varejo**, **preço atacado**, **quantidade real** e **estoque mínimo**. Os valores `0` do modelo não são preços reais. A sincronização pública só inclui produtos ativos e com preço varejo maior que zero, evitando mostrar estoque incompleto.

Para fazer uma conferência, entre em `https://macumbiinha-crm.maodeouro-nexa.workers.dev/api/public/catalog` e verifique que os SKUs publicados correspondem aos IDs do site (convertidos em maiúsculas).

## 5. Publicar o site integrado (depois do CRM)

Baixe o ZIP **`MACUMBIINHA-SITE-INTEGRADO-CRM-DEPLOY.zip`**. No painel Cloudflare da mesma conta, entre em **Workers & Pages → `macumbiinha` (PAGES) → Deployments → Create deployment → Production**. Envie o ZIP de arquivos estáticos; se o painel exigir uma pasta, extraia o ZIP e envie **o conteúdo**, sem criar um nível extra de pasta. Não crie um projeto novo: publique no `macumbiinha` existente. Aguarde o deploy de produção constar como sucesso.

Na loja `https://macumbiinha.pages.dev`, monte uma seleção e abra **Solicitar orçamento**, ou vá a `/solicitar/` diretamente. Se o Worker e Turnstile estiverem ativos, o formulário aparecerá. Envie **um teste** com seus próprios dados: deve nascer um contato, uma oportunidade e um alerta no CRM. Isso **não é uma venda concluída** e não movimenta estoque. Se a integração estiver indisponível, o site oferece WhatsApp como alternativa.

## 6. Ativar notificações no celular

No CRM, vá a **Configurações → Ativar push no celular**, permita notificações no navegador. Para iPhone, use Safari e adicione o CRM à tela de início quando exigido. Para Android, use a opção **Instalar app**. Toques e sons em segundo plano dependem do SO/navegador; com o painel aberto é possível ativar aviso sonoro pelo botão do painel.

## Checklist de aceitação

- CRM abre no Worker sem mostrar erro de banco.
- Primeiro usuário consegue entrar e sair.
- Produtos importados aparecem com estoque e preço corretos.
- Na loja, página `/solicitar/` abre normalmente.
- Teste de solicitação gera **lead + oportunidade + alerta**, sem baixar estoque.
- Pedido criado no CRM e confirmado manualmente baixa estoque; cancelamento permitido repõe conforme as regras do ERP.
- Com app instalado, testes de notificações funcionam no navegador/aparelho que concedeu permissão.

## Segurança / limitações

Não registre cartões nem credenciais de clientes via formulário. Não ative APIs administrativas sem autenticação. A integração do WhatsApp **não é um webhook**: cliques no WhatsApp não representam vendas. Pix, gateways, emissão fiscal, transportadoras, reconciliação bancária, devoluções e outras operações de ERP avançado ainda exigem implementação e homologação adicionais. Faça backups periódicos do D1 e configure política LGPD antes de operar com dados reais.
