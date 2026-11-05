# Contrato implementado — ativação após os dois deploys — e-commerce Macumbiinha ↔ CRM

## Arquitetura

```text
Site Next.js estático (Cloudflare Pages)
  ├─ Catálogo público (IDs de produto no site)
  ├─ Botões WhatsApp (atendimento; NÃO confirmam pagamento)
  ├─ /solicitar (Turnstile + consentimento)         ──► CRM Worker /api/public/lead
  ├─ GET configuração pública                     ◄── CRM Worker /api/public/config
  └─ Consulta estoque varejo por SKU (read-only)   ◄── CRM Worker /api/public/catalog

CRM Worker, domínio próprio / workers.dev
  ├─ Cookies de sessão / papéis admin e operador
  ├─ APIs privadas (pedidos, estoque, financeiro, funil)
  ├─ D1 SQLite / triggers atômicos de estoque
  └─ Push (VAPID) + alertas na interface
```

## SKU

A versão inicial do site usa slugs como `seda-sadhu-black`. O CRM normaliza a chave pública para `SEDA-SADHU-BLACK` em `products.sku`. A busca do produto deve casar `siteProduct.id.toUpperCase()` com `crmProduct.sku`. Assim, os arquivos estáticos não precisam carregar credenciais de administrador.

## Fluxo ideal de venda

1. Consumidor consulta o produto / preço de varejo e adiciona itens à seleção.
2. Consumidor preenche um formulário com consentimento e verificação Turnstile; CRM cria lead e oportunidade.
3. Equipe confirma estoque, frete e condições, e registra pedido com itens.
4. Ao confirmar o pedido, D1 baixa estoque em transação; o CRM gera receita pendente e alerta de venda.
5. Ao receber pagamento, a equipe registra pagamento (ou futuramente a integração de gateway registra webhook autenticado).
6. Ao cancelar pedido não enviado, D1 repõe quantidade; devoluções após envio requerem fluxo próprio.

## Limites atuais

- O site integrado já usa a API. É necessário publicar o CRM Worker e depois o ZIP atualizado do Pages; teste antes de atender clientes reais.
- O endpoint público registra **solicitação**, não venda paga, e não diminui estoque automaticamente.
- Pedidos via WhatsApp sem integração oficial não são capturados.
- Preços e estoque só ficam corretos após preenchimento real no CRM; os valores 0 dos modelos CSV são apenas espaços a preencher.
- O CRM não permite expor custos e margens a compradores.
- Não use chave API de administração embutida no JavaScript público.

## Próxima fase recomendada

- Um único ID/SKU de catálogo, com sincronização online e fallback quando API estiver offline.
- Carrinho com endereço, taxas, consentimento, checkout e webhook do provedor escolhido.
- Estoque reservado com prazo de expiração, compensação de pagamento, devoluções e frete.
- Trilhas de auditoria por usuário, permissões detalhadas, relatórios DRE, NF-e/NFC-e via integrador fiscal homologado.
- Testes ponta-a-ponta antes de ativar automações sobre vendas reais.

## Estado da conexão

A versão compilada da loja usa `https://macumbiinha-crm.maodeouro-nexa.workers.dev` sem credenciais. O CRM habilita o formulário apenas depois que `TURNSTILE_SECRET`, `FORM_SALT` e a site key pública estiverem configurados. O formulário envia `request_id`, `name`, `phone`, `email`, `segment`, `items: [{sku,quantity}]`, `message`, `consent:true`, `turnstile_token` com ação `crm_request`. No D1 isso cria contato, oportunidade e alerta; não cria pedido pago, não reserva nem movimenta estoque.
