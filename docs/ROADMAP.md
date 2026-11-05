# Roadmap de profissionalização do CRM/ERP

## Entregue nesta primeira versão de código
- Estrutura de banco, API, sessões seguras e papéis básicos.
- Gestão de clientes, oportunidades, tarefas, fornecedores.
- Produtos, estoque, ajustes e baixa no pedido, com triggers SQL atômicos.
- Vendas/pedidos, situação e pagamentos manuais; financeiro e margem bruta estimada.
- Alertas internos e Web Push VAPID configurável.
- App PWA responsivo instalável sem loja de aplicativos.
- Importação CSV e endpoints para integração segura.

## Preparação necessária para produção
- Publicar Worker, aplicar migrações, configurar segredos e criar primeiro admin.
- Conferir e cadastrar produtos, custo, preços, estoque e fornecedores reais.
- Testar permissões, recuperação de senha, exportação/backup, carga e restauro.
- Configurar domínio CRM e políticas LGPD / consentimento / privacidade.

## Desenvolvimentos que ainda faltam para um ERP abrangente
- Atendimento integrado omnichannel, WhatsApp Business API, resposta assistida, templates com consentimento.
- Checkout/pagamento automatizado, Webhooks idempotentes, antifraude, conciliação bancária e splits.
- NF-e/NFC-e e regras fiscais validadas com contador e provedor homologado.
- Frete: cotações, transportadoras, geração de etiquetas, rastreamento, entrega, devoluções/trocas.
- Compras e recebimento: cotação fornecedor, pedido de compra, lote, código de barras, múltiplos depósitos.
- Multiusuário avançado: permissões granulares, 2FA, log imutável, escalonamento.
- Relatórios avançados: DRE, CMV, ABC, cohorts, sazonalidade, comparativo varejo/atacado.
- Offline-first de estoque com sincronização confiável, backups e disaster recovery.
- Notificações com filas, retentativas e preferências por usuário; testes reais em iOS e Android.
- Aplicativos nativos APK/IPA se necessário; PWA já atende instalação pelo navegador.
