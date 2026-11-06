# Brasil Aberto

Painel de dados públicos para entender o orçamento dos municípios brasileiros. Projeto independente de portfólio com React, TypeScript, Node.js e APIs oficiais.

## Executar

Requer Node.js 22.12+ e npm.

```sh
npm install
npm run dev
```

Abra o endereço local impresso pelo Vite (normalmente http://127.0.0.1:5173). O servidor da API usa a porta 3001. Em desenvolvimento, o Vite encaminha `/api` para ele.

```sh
npm test
npm run build
npm start
```

Depois do build, `npm start` serve o painel e a API em http://127.0.0.1:3001. O endereço de escuta pode ser configurado por `HOST` e a porta por `PORT`. Para hospedar a API em um serviço público, configure `HOST=0.0.0.0`. A interface também pode ser publicada separadamente no GitHub Pages, conforme o passo a passo abaixo.

## Publicar no GitHub Pages com a API no Render

O projeto tem duas partes: a interface React, que é transformada em arquivos estáticos pelo Vite, e a API Node.js/Express, que consulta as fontes públicas. O GitHub Pages hospeda os arquivos da interface; o servidor precisa de uma hospedagem com Node.js. Essa separação segue o funcionamento descrito na [documentação do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

```text
Visitante → GitHub Pages (interface) → Render (API) → IBGE / Tesouro / Transparência
```

### 1. Enviar o código para um repositório

No GitHub, crie um repositório público vazio chamado `brasil-aberto`. Não adicione README, licença ou `.gitignore` na criação, pois estes arquivos serão enviados da sua pasta. No terminal, aberto na pasta do projeto, execute cada comando abaixo, substituindo `SEU_USUARIO` pelo seu nome de usuário:

```sh
git init
git branch -M main
git add .
git commit -m "Adiciona painel Brasil Aberto"
git remote add origin https://github.com/thiagopauluk200/brasil-aberto.git
git push -u origin main
```

Se o Git pedir autenticação ou configuração de nome e e-mail, conclua essa configuração antes de repetir o comando que falhou. O `.gitignore` já exclui `.env`, `dados_api.txt`, `node_modules` e `dist`. Antes do commit, confira `git status` para verificar os arquivos que serão enviados.

### 2. Hospedar a API no Render

No [painel do Render](https://dashboard.render.com/), escolha **New → Web Service**, conecte o repositório e use:

| Campo | Valor |
| --- | --- |
| Branch | `main` |
| Language / Runtime | `Node` |
| Root Directory | Raiz do repositório; deixe vazio |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

O serviço da API não precisa executar `npm run build`; o build da interface será feito pelo GitHub Actions. Escolha e confira o plano e os custos apresentados no painel antes de criar o serviço. Consulte também o [guia oficial para Express no Render](https://render.com/docs/deploy-node-express-app).

Configure estas variáveis de ambiente no serviço:

| Variável | Valor |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | `https://SEU_USUARIO.github.io` |
| `TRUST_PROXY` | `1` no Render |
| `TRANSPARENCIA_API_KEY` | Opcional: chave do Portal da Transparência |

`ALLOWED_ORIGINS` recebe apenas a origem: protocolo e domínio, sem `/brasil-aberto` e sem barra final. Ela permite que o navegador da interface consulte a API. `TRUST_PROXY=1` considera o proxy que fica na frente do Node.js no Render. A variável `PORT` é fornecida pela plataforma; não é necessário defini-la manualmente. O [Render exige escuta em `0.0.0.0`](https://render.com/docs/web-services#port-binding).

Depois da publicação, abra `https://NOME-DO-SEU-SERVICO.onrender.com/api/health` e confira a resposta JSON. A raiz do backend pode responder com JSON e status 404, pois o serviço não contém a pasta `dist`; isso é esperado. O endereço para o visitante será o GitHub Pages.

### 3. Informar à interface onde está a API

No repositório do GitHub, abra **Settings → Secrets and variables → Actions → Variables → New repository variable** e cadastre:

```text
Name:  VITE_API_BASE_URL
Value: https://NOME-DO-SEU-SERVICO.onrender.com
```

Use a URL HTTPS real do serviço, sem `/api` e sem barra final. Por exemplo, `https://brasil-aberto-api.onrender.com`. O código acrescenta `/api/dashboard`, `/api/municipalities` e os demais caminhos automaticamente.

Essa variável contém um endereço público. Nunca coloque a chave do Portal da Transparência nela ou em qualquer variável `VITE_`: o Vite incorpora esses valores no JavaScript que todo visitante pode baixar. A chave permanece apenas no ambiente do backend. Veja a [documentação de variáveis do Vite](https://vite.dev/guide/env-and-mode#env-variables).

### 4. Ativar o GitHub Pages

No repositório, abra **Settings → Pages → Build and deployment → Source** e selecione **GitHub Actions**. Depois abra a aba **Actions**, selecione o workflow de publicação e execute **Run workflow** na branch `main`.

O arquivo `.github/workflows/deploy-pages.yml` já prepara a publicação: instala as dependências com `npm ci`, executa `npm test`, gera o build e publica `dist`. O caminho `VITE_BASE_PATH` é ajustado automaticamente com os metadados de `configure-pages`, incluindo o prefixo `/brasil-aberto/`. Não é necessário editar esse caminho ao trocar o nome do repositório. O fluxo está baseado nos guias oficiais de [deploy do Vite no GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages) e de [workflows de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

O workflow falha se `VITE_API_BASE_URL` estiver ausente ou não tiver o formato HTTPS esperado, sem caminho, usuário, senha ou parâmetros. Essa validação confere o formato, não se o serviço está online. Depois de cadastrar ou alterar a variável, execute novamente o workflow: o valor é incorporado durante o build.

Quando o workflow terminar com sucesso, a URL aparecerá no resultado da publicação e em **Settings → Pages**. Para o repositório deste exemplo, o endereço esperado é:

```text
https://SEU_USUARIO.github.io/brasil-aberto/
```

Os exemplos de domínio e usuário deste guia são placeholders, não endereços de serviços já publicados. Apenas enviar a pasta `dist` ou selecionar uma branch no Pages não configura o servidor da API; neste projeto, o workflow realiza a publicação da interface e o Render executa o backend.

### 5. Atualizar e verificar

Depois de modificar o projeto, execute `npm test` e `npm run build` localmente. Envie as alterações com um novo commit e `git push`; a branch `main` dispara novamente a publicação da interface. O serviço conectado ao Render também pode publicar automaticamente a API conforme sua configuração de deploy.

Se o painel abrir, mas os dados não carregarem, confira a resposta de `/api/health`, o valor de `VITE_API_BASE_URL`, os logs do Render e se `ALLOWED_ORIGINS` contém exatamente a origem do Pages. Se usar um domínio próprio depois, atualize essa origem no backend.

## Funcionalidades

- Busca de municípios e UF com cadastro oficial do IBGE.
- Filtros de exercício e etapa: empenhado, liquidado e pago.
- População do Censo 2022, despesas de saúde e educação.
- Distribuição do orçamento por função e comparação entre etapas.
- Tabela ordenável, busca por área e exportação CSV com origem dos dados.
- Estados de carregamento, indisponibilidade parcial, ausência de dados e nova tentativa.
- Conector opcional de Bolsa Família pelo Portal da Transparência.
- Interface responsiva, guia de leitura, fontes e metodologia.

## Fontes e metodologia

**IBGE Localidades**: https://servicodados.ibge.gov.br/api/docs/localidades

**IBGE SIDRA**: tabela 4714, variável 93, população residente no Censo 2022. A população permanece identificada como 2022, independentemente do ano fiscal. O valor por habitante usa essa mesma base e não uma estimativa anual.

**Tesouro/Siconfi**: https://apidatalake.tesouro.gov.br/docs/siconfi/

Consulta DCA, anexo I-E, por código IBGE e exercício. O total vem de “Despesas Exceto Intraorçamentárias”. Apenas funções no formato `10 - Saúde` compõem o detalhamento; subfunções como `10.301 - Atenção Básica` são excluídas para evitar dupla contagem. Valores são nominais e não corrigidos pela inflação. A API é consultada em fila, com intervalo mínimo de 1,1 segundo; requisições têm timeout de 30 segundos, cache em memória de 15 minutos e paginação limitada a 10 páginas. Falha de paginação não produz total parcial.

Dados ausentes não são convertidos em zero. O município pode não ter enviado declaração em determinado exercício. Divergências de fechamento entre total e funções não são corrigidas artificialmente pelo painel. A data exibida é de consulta, não de publicação da fonte. Não há dados financeiros fictícios ou fallback silencioso para exemplos.

**Portal da Transparência**: https://portaldatransparencia.gov.br/api-de-dados

O endpoint de Bolsa Família está implementado, mas requer uma chave para validação em ambiente real. Cadastre seu e-mail em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email, copie `.env.example` para `.env` e preencha `TRANSPARENCIA_API_KEY`. Reinicie o servidor depois da configuração. A chave é enviada no header `chave-api-dados` apenas pelo backend. Nunca use prefixo `VITE_`, coloque chaves em `dados_api.txt` ou versione `.env`.

Benefícios federais possuem escopo distinto das despesas municipais e não são somados ao orçamento da prefeitura.

**dados.gov.br**: https://dados.gov.br/dados/conjuntos-dados

Disponível como link externo na seção de fontes. A API do catálogo **não está integrada** nesta versão.

## Estrutura

```text
src/main.tsx              Painel e componentes
src/styles.css           Identidade visual e responsividade
server/index.mjs         API, conectores, cache e fila do Tesouro
server/domain.mjs        Validação e normalização contábil
server/domain.test.mjs   Testes de dupla contagem, ausências e validação
```

## Próximas evoluções

Persistir consultas e cache, acrescentar séries históricas com correção pelo IPCA, implementar comparação entre municípios e integrar o catálogo dados.gov.br após definir autenticação e recorte dos conjuntos. O servidor já limita consultas a 60 por minuto por IP; para ampliar o uso público, evoluir observabilidade, cache e limites compartilhados entre instâncias.
#   b r a s i l - a b e r t o  
 #   b r a s i l - a b e r t o  
 