# Macumbiinha CRM & ERP — aplicação independente

**Versão técnica 1.1.0 — preparada para integração com o site.** Esta aplicação é independente do e-commerce Next.js estático. Tem API Cloudflare Workers, banco SQL D1, autenticação, painel administrativo responsivo, PWA instalável e sistema de notificações. A publicação e as credenciais ainda precisam ser configuradas. Não é um sistema fiscal/homologado, nem um gateway de pagamento.


**PUBLICAÇÃO EM DOIS PASSOS:** confira primeiro [`docs/PASSO-A-PASSO-CLOUDFLARE.md`](docs/PASSO-A-PASSO-CLOUDFLARE.md). O CRM usa Worker + D1 e o e-commerce usa Pages.

## Funcionalidades implementadas

| Módulo | O que funciona |
| --- | --- |
| Dashboard | Indicadores reais de pedidos, estoque, leads, funil, financeiro e atividades |
| Usuários | Admin inicial, operadores, senhas PBKDF2, sessões HttpOnly/SameSite, logout, papéis e auditoria |
| Clientes / leads | Criar, editar, buscar, perfis varejo/atacado e importação CSV (aceita somente telefone) |
| Produtos / estoque | Cadastro SKU, custo, preço varejo e atacado, fornecedor, quantidade, mínimo, ajuste e histórico |
| Pedidos | Itens múltiplos, totais, status, pagamento e vínculo com contato |
| Baixa de estoque | Trigger SQLite atômico: confirma pedido → baixa; cancela antes de enviar → repõe; sem saldo negativo |
| Financeiro | Receitas, despesas, contas a pagar/receber, recebido/pago, fluxo de caixa, valor de estoque e margem bruta **estimada** |
| Funil de vendas | Contato → negociação → ganho/perda, com valores e observações |
| Equipe | Tarefas, prazos, alertas e histórico de atividade |
| Fornecedores | Cadastro e associação a produtos |
| Aplicativo PWA | Instalação na tela inicial, ícones, layout responsivo, shell offline |
| Notificações | Central de alertas, polling de 25s, alerta sonoro com painel aberto e estrutura Web Push VAPID para segundo plano |
| Integração de site | `GET /api/public/catalog` (consulta de estoque / preços varejo) e `GET /api/public/config`, `POST /api/public/lead` protegido por Turnstile, com seleção de SKUs |

## O que ainda depende de integrações externas

- **Estoque sincronizado no site**: a versão do site integrada já consulta a API pública por SKU. É necessário publicar o ZIP integrado e importar estoque/preços reais. Produtos sem preço cadastrado permanecem apenas sob consulta.
- **Vendas concluídas via WhatsApp**: um link `wa.me` não informa ao CRM que o pagamento foi realizado. É necessário registrar o pedido no CRM ou conectar o fluxo oficial de WhatsApp Business / checkout.
- **Push em segundo plano**: requer 3 segredos VAPID, HTTPS, instalação/inscrição e permissão do dispositivo. O aviso sonoro personalizado funciona apenas com a aplicação aberta e habilitado após clique; com o app fechado, o áudio é responsabilidade do sistema operacional.
- **Pagamento automático, Pix, maquininha, antifraude, frete, nota fiscal, emissão NF-e/NFC-e, conciliação bancária, devoluções, relatórios fiscais, marketplaces**: são novas integrações ou módulos a implementar e homologar. Não estão habilitados.
- **Custos, taxas, juros, impostos, margem líquida e contabilidade** não são calculados automaticamente. Margem é estimativa baseada no custo registrado dos itens e desconto.

## Estrutura

```text
macumbiinha-crm-erp/
  src/worker.js            # API + autenticação + regras de negócio
  src/validators.js        # validação/estados
  src/push.js              # Web Push RFC8291 + VAPID
  public/index.html        # aplicação frontend
  public/app.js            # telas, formulários, gráficos, alertas
  public/app.css           # design system responsivo
  public/sw.js             # service worker
  public/manifest.webmanifest
  public/catalogo-modelo.csv
  public/contatos-modelo.csv
  migrations/*.sql         # esquema D1 e triggers de estoque
  tests/*.test.mjs         # testes unitários
  tests/test_database.py   # regras de estoque + financeiro SQLite
  wrangler.jsonc
  package.json
```

## Requisitos

- Node.js 22 ou superior; npm
- Cloudflare Workers e acesso à conta que contém o D1 `macumbiinha-crm-erp`
- Banco D1 criado na conta macumbinhaa, ID já presente no `wrangler.jsonc`
- Uma credencial **própria** do administrador, definida no primeiro acesso

### 1. Preparar o Worker

No terminal dentro da pasta `macumbiinha-crm-erp` (no Windows, pode executar **`INSTALAR-WINDOWS.ps1`** pelo PowerShell após conferir o script):

```bash
npm install
npx wrangler login
# Confira que selecionou a conta Cloudflare macumbinhaa
npm run db:migrate:remote
npm run deploy
```

**Importante:** a pasta é o **código-fonte do CRM Worker**. Não envie esse ZIP para o projeto `macumbiinha` do Cloudflare Pages. Esse deploy é de um Worker separado, que requer executar as migrações D1. A loja continua independente.

### 2. Criar o primeiro administrador

Crie uma chave de instalação longa e exclusiva e armazene-a somente como segredo no Worker:

```bash
npx wrangler secret put SETUP_KEY
```

Cole uma sequência aleatória forte com pelo menos 32 caracteres. Não grave o valor no repositório.

Depois, abra o endereço mostrado pelo deploy (ex.: `https://macumbiinha-crm.<seu-subdominio>.workers.dev`). O painel de **primeira configuração** aparecerá automaticamente se as migrações tiverem sido executadas. Informe e-mail, senha própria (mínimo 14 caracteres) e a chave `SETUP_KEY`.

Após criar o primeiro admin, considere excluir a chave `SETUP_KEY` no painel Cloudflare. O endpoint de setup também fica inoperante após a criação do primeiro usuário.

### 3. Importar produtos da Macumbiinha

No CRM, vá a **Produtos e estoque → Modelo CSV** para baixar um CSV com os SKUs do catálogo que existiam em novembro de 2026. Preencha custo, preço de venda, preço de atacado, quantidade e mínimo antes de importar. Use **Importar CSV**. Itens com SKU já cadastrado serão ignorados, preservando quantidades e preços.

Em **Clientes e leads → Importar CSV**, pode usar apenas a coluna `telefone`; o sistema aceita contatos sem nome preenchido no CSV e usa o número como identificação inicial. Importações devem respeitar a LGPD e a base legal aplicável.

### 4. Ativar Web Push para o aplicativo

Gere suas chaves VAPID localmente, por exemplo com `npx web-push generate-vapid-keys`. No mesmo Worker configure os segredos:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

`VAPID_SUBJECT` deve ter formato `mailto:email-contato@seudominio.com` e apontar para um e-mail de contato verdadeiro. Após o deploy, no celular entre no CRM → Configurações → **Ativar push no celular** e conceda permissão. A entrega depende das políticas do navegador e do sistema operacional. Em iOS, use Safari e adicione à tela inicial quando o navegador exigir.

### 5. Integrar formulário seguro da loja (frontend já incluído na versão integrada)

Configure antes os segredos:

```bash
npx wrangler secret put TURNSTILE_SECRET
# FORM_SALT é gerado pelo instalador automaticamente
```

O instalador já define `SITE_ORIGIN` e a Site Key pública Turnstile em `wrangler.jsonc`. O widget de Turnstile já existe na sua Cloudflare; copie somente a **Secret Key** no painel para o segredo `TURNSTILE_SECRET`. O formulário deve usar Turnstile da Cloudflare e enviar um `POST` HTTPS para `/api/public/lead` com JSON:

```json
{
 "name": "Nome do contato", "phone": "21999999999", "email": "", "segment": "varejo",
 "message": "Gostaria de consultar o produto A", "consent": true,
 "turnstile_token": "TOKEN_GERADO_PELO_WIDGET"
}
```

O servidor valida hostname, token Turnstile, origem e limite por IP. Sem os segredos, o endpoint não aceita formulários. Consulte `docs/INTEGRACAO-LOJA.md`.

### 6. API de estoque para o site

`GET /api/public/catalog` retorna apenas produto ativo, SKU, nome, categoria, preço de varejo, disponibilidade e quantidade. Não publica custo nem preço atacadista. Para usar do domínio da loja, defina `SITE_ORIGIN`. Clientes de varejo não precisam acessar o painel CRM.

### 7. Atualizar o sistema

Execute `npm run check` para validar JavaScript e testes antes de `npm run deploy`. O Worker é independente dos deploys do site `macumbiinha.pages.dev`.

## Segurança e boas práticas

- Jamais compartilhe tokens/credenciais no chat ou suba `.dev.vars` e `.env` para GitHub.
- Use senhas únicas e 2FA na conta Cloudflare. Contas de colaboradores devem ter seus próprios acessos.
- Implante backup, monitoramento, exportação de dados e política LGPD antes de migrar uma operação comercial real.
- A aplicação não deve ser usada como único registro contábil ou fiscal.
- Planeje testes de carga, recuperação de desastres, reversões e auditoria de acessos antes da operação com alto volume.


## Melhorias de interface — Studio v2

- Painel financeiro com gráficos de entradas e despesas pagas nos últimos 3, 6 ou 12 meses, saldo realizado e despesas por categoria. Todos os valores vêm do D1; sem dados o gráfico mostra zero. O financeiro continua restrito a administradores.
- Tema claro/escuro acessível, com preferência salva no navegador e respeito ao tema do sistema.
- Convite dispensável de instalação PWA em telas móveis. Android compatível usa o prompt nativo; iPhone mostra o caminho Safari > Compartilhar > Adicionar à Tela de Início. Notificações push continuam dependentes de permissão e VAPID.
- Estilos premium responsivos em `public/studio.css`, sem dependências externas; exportação CSV dos lançamentos carregados; tabela acessível dos dados do gráfico.
- Testes: `npm run check`. Smoke visual manual: `python tests/visual_studio_smoke.py` (necessita Playwright com Chromium instalado).

Publicação: o código pode ser enviado ao GitHub sem secrets. O deploy do Cloudflare Worker precisa ser verificado separadamente; não confunda commit com publicação.


## Variações e fotos pela central de produtos

Em **Loja online → Variações**, um produto principal (por exemplo, uma seda) pode receber até 30 opções como King Size, Slim, cor ou edição. Cada opção recebe **SKU único**, custo, preço de varejo, preço de atacado, estoque inicial e limite mínimo. As opções aparecem juntas na mesma página da loja; a seleção envia o SKU exato da opção e o ERP usa esse SKU nas baixas automáticas por pedido confirmado. O estoque do produto principal não substitui o das variações.

Em **Loja online → Fotos**, faça upload de até 8 imagens JPG, PNG ou WEBP por produto/variação, reorganizando a capa e removendo fotos individuais. O formulário de produto também aceita várias fotos. Fotos grandes são redimensionadas no navegador para WebP de no máximo 850 KB cada. Imagens de produtos não publicados só podem ser pré-visualizadas por usuários autenticados do CRM. A API pública só serve as fotos quando o produto principal está publicado e ativo.

A migração aditiva é `migrations/0006_variants_gallery.sql` e mantém as notas, pedidos, contatos e imagens anteriores. Não se trata de geração automática de produtos novos a partir de fotos; nome, preço e estoque devem ser cadastrados no CRM.


## Equipe, cargos e permissões (RBAC)

Acesse **Usuários e permissões** no menu lateral usando uma conta administradora. Cada colaborador utiliza seu próprio e-mail e senha (mínimo de 14 caracteres). O administrador escolhe o cargo, pode personalizar cada permissão, redefinir senha e bloquear/reativar o acesso sem excluir o histórico.

| Cargo | Finalidade | Limitação principal |
| --- | --- | --- |
| Administrador | Todas as áreas e usuários | A conta administradora não pode ser a última a perder o acesso |
| Gerente | Operação, loja e acompanhamento financeiro | Não administra os usuários |
| Financeiro | Receitas, despesas, pagamentos, NF-e arquivadas, relatórios | Não altera estoque, produtos ou usuários |
| Estoque | Entradas/saídas, consulta de produtos, fotos e acompanhamento dos pedidos | Não vê custos internos, documentos financeiros ou pagamentos |
| Vendas | Pedidos, clientes, negociações e tarefas | Não registra pagamentos nem acessa o financeiro |
| Atendimento | Clientes, solicitações, pedidos novos e tarefas | Não confirma vendas nem acessa financeiro |
| Somente leitura | Consultas operacionais | Não altera estoque ou registros |

A seção **Personalizar permissões** permite conceder ou retirar funções individualmente. Permissões são **verificadas no Cloudflare Worker antes de cada operação**, independentemente do que esteja visível na interface; usuários bloqueados são recusados na autenticação. Troca de cargo, bloqueio ou redefinição de senha invalida as sessões anteriores.

O CRM continua usando a tabela original \`users\` e as credenciais existentes. A migração \`0007_user_access.sql\` cria apenas os perfis complementares e \`0008_last_admin_guard.sql\` impede que o banco fique sem administrador ativo. Somente administradores podem criar outros administradores. O sistema **não envia convites ou senhas automaticamente por e-mail**: compartilhe a senha inicial por um canal privado e peça que o colaborador a altere em **Configurações → Alterar senha**.

A aplicação nunca envia hashes ou sais de senha à interface e não armazena senhas em texto puro. O registro de auditoria mantém autoria de criação, mudanças de acesso e redefinições, sem anotar a senha.
