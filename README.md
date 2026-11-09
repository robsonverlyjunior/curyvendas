# Relatório dos Feirões — Cury Vendas RJ

Página pública (por link, fora de buscadores) que cruza o investimento no Meta Ads
com os leads que chegam ao CV CRM nos feirões. Os dados são buscados ao vivo e
ficam em cache por 10 minutos. Só números agregados aparecem na página: nome,
e-mail e telefone dos leads são usados apenas no servidor.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | O que é |
| --- | --- |
| `CV_URL` | `https://cury.cvcrm.com.br` |
| `CV_EMAIL` | e-mail do usuário vinculado à integração no CV |
| `CV_TOKEN` | token gerado no CV em Configurações → Integrações → APIs |
| `ADS_EDITOR_TOKEN` | token pessoal do Ads Editor (app.adseditor.com.br/mcp) |
| `DIAG_CHAVE` | senha longa (16+ caracteres) para abrir `/api/diagnostico?chave=...` |
| `RELATORIO_INICIO` | opcional, início do período (padrão `2026-09-21`) |
| `ADS_EDITOR_ACCOUNT_ID` | opcional, conta Meta (padrão `act_403396935310580`) |

## Onde mexer

- `lib/config.ts` — produtos (como cada campanha do Meta é agrupada pelo nome),
  regras do CRM (que textos identificam os leads de cada feirão) e o período.
- `/api/diagnostico?chave=...` — mostra os valores que aparecem nos campos de
  origem dos leads do CV (só valores repetidos, sem dados pessoais), para
  ajustar as regras.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha os valores
npm run dev
```
