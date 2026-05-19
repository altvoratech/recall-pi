# Contribuindo com o pi

Este guia existe para economizar tempo de ambos os lados.

## A Regra Principal

**Você deve entender seu código.** Se você não consegue explicar o que suas alterações fazem e como elas interagem com o restante do sistema, seu PR será fechado.

Usar IA para escrever código é aceitável. Submeter código gerado por IA sem entendê-lo não é.

Se você usar um agente, execute-o a partir do diretório raiz do `pi-mono` para que ele carregue o `AGENTS.md` automaticamente. Seu agente deve seguir as regras e diretrizes nesse arquivo.

## Portão de Contribuição

Todas as issues e PRs de novos colaboradores são fechados automaticamente por padrão.

Issues submetidas de sexta a domingo não são revisadas. Se algo for urgente, pergunte no Discord: https://discord.com/invite/3cU7Bz4UPx

Os mantenedores revisam issues fechadas automaticamente diariamente e reabrem as que valem a pena. Issues que não atendem ao padrão de qualidade abaixo não serão reabertas ou receberão resposta.

A aprovação acontece através de respostas dos mantenedores nas issues:

- `lgtmi`: suas issues futuras não serão fechadas automaticamente
- `lgtm`: suas issues e PRs futuros não serão fechados automaticamente

`lgtmi` não concede direitos para submeter PRs. Somente `lgtm` concede direitos para submeter PRs.

## Padrão de Qualidade para Issues

Se você abrir uma issue, deve usar um dos dois templates de issue do GitHub.

Se você abrir uma issue, mantenha-a curta, concreta e que valha a leitura.

- Seja conciso. Se não couber em uma tela, está longa demais.
- Escreva com sua própria voz.
- Declare o bug ou solicitação claramente.
- Explique por que isso importa.
- Se você quiser implementar a mudança você mesmo, diga isso.

Se a issue for real e bem escrita, um mantenedor pode reabri-la, responder `lgtmi`, ou responder `lgtm`.

## Bloqueio

Se você ignorar este documento duas vezes, ou se você enviar spam no rastreador com issues geradas por agente, sua conta do GitHub será bloqueada permanentemente.

Se você enviar um grande volume de issues por automação, sua conta do GitHub será bloqueada permanentemente. Sem volta atrás.

## Antes de Submeter um PR

Não abra um PR a menos que você já tenha sido aprovado com `lgtm`.

Antes de submeter um PR:

```bash
npm run check
./test.sh
```

Ambos devem passar.

Não edite `CHANGELOG.md`. Entradas de changelog são adicionadas pelos mantenedores.

Se você estiver adicionando um novo provedor ao `packages/ai`, veja `AGENTS.md` para os testes necessários.

## Filosofia

O núcleo do pi é minimalista. Se sua funcionalidade não pertence ao núcleo, deve ser uma extensão. PRs que incham o núcleo provavelmente serão rejeitados.

## Dúvidas?

Pergunte no [Discord](https://discord.com/invite/nKXTsAcmbT).

## Perguntas Frequentes

### Por que novas issues e PRs são fechados automaticamente?

O pi recebe mais issues do que os mantenedores conseguem revisar responsavelmente em tempo real. Muitos relatórios não atendem ao padrão de qualidade neste guia ou não seguem o CONTRIBUTING.md. Alguns são enviados ao repositório de forma descuidada via um agente em vez de serem revisados e moldados pela pessoa que os submete. O fechamento automático cria um buffer para que os mantenedores possam revisar o rastreador em seu próprio horário e reabrir as issues que atendem ao padrão de qualidade.

### Por que issues de fim de semana não são revisadas?

Os mantenedores precisam de tempo ininterrupto longe do rastreador de issues. Issues submetidas de sexta a domingo são fechadas automaticamente e não fazem parte da fila de revisão de segunda-feira. Se um problema for urgente, pergunte no Discord e inclua a versão curta, uma reprodução e os logs relevantes.

### Por que algumas issues não recebem resposta?

Uma resposta também é trabalho de manutenção. Issues de baixo sinal, relatórios pouco claros, duplicatas e issues que não seguem este guia podem ser fechadas sem discussão. Isso mantém o tempo disponível para bugs reproduzíveis, solicitações ponderadas e colaboradores que fizeram o trabalho para tornar seu relatório acionável.

### Por que não deixar a IA triar tudo?

A IA pode ajudar a agrupar duplicatas, resumir relatórios e identificar informações ausentes. Ela não é confiável para tomar decisões finais de mantenedor. Issues polidas geradas por IA ainda podem estar erradas, enganosas ou caras de investigar. A revisão humana permanece como portão final.

### Isso é hostil aos colaboradores?

Não. É uma barreira contra esgotamento e spam no rastreador. Issues curtas, concretas e reproduzíveis são bem-vindas. Contribuições ponderadas são bem-vindas. Lixo automatizado, direito adquirido e grandes volumes de relatórios de baixo esforço não são.
