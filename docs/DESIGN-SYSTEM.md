# Design System — Macumbiinha CRM

## Princípios

O CRM é uma ferramenta de operação, não uma landing page. A interface privilegia informação legível, densidade útil, hierarquia visual e poucas distrações. A marca é preservada em verde-escuro com uma única cor de ênfase suave.

**Fonte:** Instrument Sans, com fallback de sistema em caso de indisponibilidade. **Ícones:** SVG com traço uniforme, sem fonte de ícones, emojis ou bibliotecas externas. **Monograma:** `public/icon.svg`, fonte de verdade para o favicon e os ícones PWA.

## Arquitetura de apresentação

- `public/app.css`: estrutura do produto e componentes originais.
- `public/studio.css`: gráficos, temas claro/escuro e instalação PWA.
- `public/refined.css`: tokens, refinamentos, hierarquia e responsividade do novo sistema.
- `public/app.js`: navegação, telas, formulários e ações existentes; a lógica comercial e as chamadas à API são preservadas.
- `public/interface.js`: navegação rápida com **Ctrl+K / ⌘+K** ou `/`. É local e não envia a consulta a servidores.
- `public/experience.js`: preferência visual persistida localmente, ícones de tema e banner de instalação.
- `public/sw.js`: cache **apenas de arquivos estáticos**; rotas `/api/*` nunca são armazenadas.
- `scripts/build-icons.mjs`: gera `icon-192.png` e `icon-512.png` a partir do SVG usando Sharp.

## Como usar

Com as dependências instaladas:

```sh
npm run check
npm run build:icons
npm run dev
```

O deploy pelo GitHub Actions já executa os testes e gera os ícones antes de publicar no Worker. Deploy local pelo comando `npm run deploy` gera os ícones automaticamente via `predeploy`.

## Acessibilidade e responsividade

- Diálogos de busca com `role="dialog"`, `aria-modal`, Escape e foco inicial.
- SVGs decorativos com `aria-hidden`; controles com rótulos acessíveis.
- Respeito a `prefers-reduced-motion`.
- Tabelas com rolagem horizontal em telas estreitas, sem cortar dados.
- Cabeçalho compacto em celular; busca e menu continuam acessíveis.
- Tema claro e escuro com contraste revisado visualmente; uma auditoria WCAG formal ainda não foi realizada.

## Cuidados de produção

Nenhuma migração de banco é necessária para este redesign. Não altere nomes de bindings do Worker, segredos, rotas públicas ou estrutura das tabelas ao aplicar estas melhorias.
