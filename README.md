# EstuLanches

Sistema independente para cardápio e pedidos de uma cantina escolar. A aplicação usa Node.js, Express e PostgreSQL; a implantação e as verificações usam perfis separados do Docker Compose.

## Inicialização

Na pasta do projeto, copie `.env.example` para `.env` e substitua os valores de exemplo por credenciais próprias. A instalação local já possui um `.env` com segredos aleatórios. A senha de acesso da cantina está no campo `ADMIN_PASSWORD` desse arquivo.

```powershell
Copy-Item .env.example .env
```

Depois, configure os campos `POSTGRES_PASSWORD`, `JWT_SECRET` e `ADMIN_PASSWORD` antes de iniciar. Suba a aplicação e confira os dois serviços:

```bash
docker compose up -d --build
docker compose ps
docker compose logs cantina cofre-dados
```

A página fica em <http://localhost:3010>. Apenas a aplicação publica uma porta, vinculada ao endereço local. O banco fica sem porta publicada, conectado à aplicação por uma rede Docker interna. O volume `estulanches_dados_escolares` preserva os dados entre reinicializações. O serviço administrativo só inicia depois que o PostgreSQL passa na verificação de saúde.

O Compose publica o serviço `validacao` apenas no perfil `testes`, separado do conjunto usado pela aplicação. A inicialização executa `db/schema.sql` na primeira criação do volume.

## Verificação do ambiente

`docker compose ps` mostra estado e porta da aplicação. O healthcheck consulta `GET /api/saude`, que também executa `SELECT 1` no banco.

```bash
docker compose logs --since=10m cantina cofre-dados
docker compose exec cantina node -e "fetch('http://127.0.0.1:3000/api/saude').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
```

Para parar os serviços e preservar os pedidos, use `docker compose down`. O volume permanece no Docker.

## Funcionalidades

- Cadastro de estudantes e autenticação com senhas protegidas por bcrypt e sessões JWT.
- Cardápio público e gestão administrativa de produtos.
- Criação de pedidos, cálculo de totais e consulta de pedidos.
- Atualização administrativa do andamento: recebido, em preparação, pronto ou cancelado.
- Persistência PostgreSQL com inicialização por schema e volume dedicado.

## Rotas da API

Rotas autenticadas recebem `Authorization: Bearer <token>`.

| Método | Caminho | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/saude` | Público | Confere aplicação e conexão com o banco |
| POST | `/api/estudantes` | Público | Cria cadastro de estudante |
| POST | `/api/sessoes` | Público | Autentica e retorna token |
| GET | `/api/cardapio` | Público | Lista produtos disponíveis |
| POST | `/api/cardapio` | Administrador | Inclui produto |
| PUT | `/api/cardapio/:id` | Administrador | Atualiza produto |
| DELETE | `/api/cardapio/:id` | Administrador | Desativa produto |
| POST | `/api/encomendas` | Estudante autenticado | Registra pedido |
| GET | `/api/encomendas` | Autenticado | Consulta pedidos autorizados |
| PATCH | `/api/encomendas/:id/andamento` | Administrador | Atualiza andamento do pedido |

## Testes

Os testes de regra de negócio rodam com Node.js:

```bash
npm test
```

O teste de integração usa o PostgreSQL do Compose e remove os registros que cria:

```bash
docker compose --profile testes run --rm validacao
```

## Estrutura visual

Os estilos da página ficam separados por responsabilidade em `public/css/paleta.css`, `estrutura.css` e `componentes.css`. O HTML carrega essas três folhas de estilo em ordem.

Para uso real na escola, mantenha os segredos fora do repositório e configure HTTPS, backups e monitoramento no ambiente de produção.
