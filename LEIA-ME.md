# Protocolo QR da Câmara — como colocar no ar

São 3 partes:

| Pasta | Para quem | Precisa de login? |
|---|---|---|
| `etiqueta/` | Página pública para gerar e imprimir a etiqueta com QR Code (não cita a Prefeitura) | Não (não guarda nada) |
| `camara/` | Recepção da Câmara lê o QR, registra e imprime o comprovante; consulta a lista | Sim |
| `supabase/schema.sql` | Banco de dados (Supabase) | — |

Custo: R$ 0 (GitHub Pages + Supabase no plano gratuito).

---

## Passo 1 — Banco de dados (Supabase)

1. Entre em **supabase.com** → *Start your project* → entre com sua conta do GitHub.
2. **New project**:
   - Name: `protocolo-camara`
   - Database password: crie uma senha forte e **guarde**
   - Region: **South America (São Paulo)**
3. Espere o projeto ficar pronto (1–2 min).
4. Menu lateral **SQL Editor** → **New query** → cole todo o conteúdo de `supabase/schema.sql` → **Run**.
   Deve aparecer *Success. No rows returned*.

## Passo 2 — Contas de quem vai usar na Câmara

1. Menu **Authentication** → **Sign In / Providers** (ou *Providers → Email*):
   - deixe **Email** ligado;
   - **desligue “Allow new users to sign up”** (só você cria as contas).
2. **Authentication → Users → Add user → Create new user**:
   - e-mail e senha da pessoa (ou um e-mail único da recepção);
   - marque **Auto Confirm User**.
3. Repita para cada pessoa. Para trocar uma senha esquecida, é aqui também (⋯ → *Reset password* / *Update user*).

## Passo 3 — Ligar o site ao banco

1. No Supabase: **Project Settings → API** (ou *Data API*). Copie:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **anon public** key (um texto longo começando com `eyJ...` ou `sb_publishable_...`)
2. Abra `assets/config.js` e cole nos lugares indicados.
   Aproveite e troque `NOME_CAMARA` (ex.: "Câmara Municipal de Arinos").

> A chave **anon** pode ficar pública: quem não tem login não vê nem grava nada.
> **Nunca** use a chave `service_role` no site.

## Passo 4 — Publicar no GitHub Pages

1. No GitHub: **New repository** → nome `protocolo-camara` → **Public** → *Create*.
2. Na página do repositório: **Add file → Upload files** → arraste **o conteúdo** da pasta
   (`index.html`, `LEIA-ME.md`, pastas `assets`, `camara`, `etiqueta`, `supabase`) → **Commit changes**.
3. **Settings → Pages** → *Source: Deploy from a branch* → Branch **main**, pasta **/(root)** → **Save**.
4. Em 1–2 minutos o site estará em:
   - Etiqueta (pública): `https://SEU-USUARIO.github.io/protocolo-camara/etiqueta/`
   - Câmara: `https://SEU-USUARIO.github.io/protocolo-camara/camara/`

Depois dá para usar domínio próprio (ex.: `protocolo.camaraarinos.mg.gov.br`) em *Settings → Pages → Custom domain*.

## Passo 5 — Testar

1. Abra o link da **etiqueta**, gere uma etiqueta e imprima.
2. Abra o link da **câmara**, entre com a conta criada, leia o QR (leitor ou foto), registre e imprima o comprovante.
3. Na aba **Protocolos**, confira se o registro apareceu.
4. Para limpar os testes antes de começar para valer: Supabase → **SQL Editor** →
   `truncate protocolos restart identity; delete from contador_protocolo;` → Run.
   (A numeração volta para 0001.)

---

## Atualizações do sistema

Quando receber uma versão nova: substitua os arquivos no GitHub (mantendo o seu `assets/config.js`)
e rode de novo o `supabase/schema.sql` no SQL Editor. Ele atualiza o banco sem apagar nada.

> Nesta versão a pasta `prefeitura/` virou `etiqueta/`: apague a pasta antiga no GitHub e passe o link novo
> (`.../protocolo-camara/etiqueta/`) para quem gera as etiquetas.

## Documentos de outros (não da prefeitura)

Em **Receber**, escolha **Outros** para protocolar o que chega de pessoas, Ministério Público,
entidades, associações etc. Basta o tipo (Ofício, Requerimento ou Outro pedido), a origem e o assunto.
Data e ano entram sozinhos. Na lista, a coluna **Origem** mostra se veio da Prefeitura ou de Outros.

## Retificação (documento que volta alterado, com o mesmo número)

Quando um projeto, decreto etc. volta corrigido, ele é protocolado de novo **com o mesmo número**:
`2026/0005` vira `2026/0005 · Retificação 1` (depois Retificação 2, 3…). Dá para fazer de dois jeitos:

- **Lendo a etiqueta nova:** se o documento (tipo + número + ano) já foi protocolado, o sistema pergunta
  *“É o mesmo documento que voltou corrigido?”*. Escolha **Sim, é retificação**, escreva **o que mudou** e registre.
  Se for outra entrega sem relação, escolha **Não, é nova entrega** (gera número novo).
- **Pela lista:** na aba **Protocolos**, clique em **Retificar** na linha do documento. Os dados aparecem
  preenchidos; leia a etiqueta nova ou ajuste à mão, escreva o que mudou e registre.

O protocolo original **não é alterado nem apagado**: os dois ficam na lista (o original com a marca
“Retificado”, o novo com “Retificação 1”). A retificação tem data e hora próprias, não gasta número novo
e o comprovante sai como **Comprovante de retificação**, mostrando a data do protocolo original.
Funciona para documentos da Prefeitura e de Outros.

## Enviar (ofícios e pedidos dos vereadores)

A aba **Enviar** registra o que sai da Câmara: ofícios, requerimentos e outros pedidos dos vereadores
para prefeito, secretários, deputados, senadores etc.
- Se o tipo for **Ofício**, aparece o campo **Número do ofício** (a sequência manual que os vereadores já usam).
  O sistema mostra o último ofício registrado no ano e oferece o próximo número com um clique.
  Se o número já tiver sido usado no ano, ele avisa antes de registrar.
- Data e ano entram sozinhos. O comprovante sai em 2 vias (destinatário e Câmara), com espaço para
  o destinatário assinar o recebimento.
- O nome do vereador ou da vereadora é digitado livremente, sem lista de opções.
- Destinatário: escolha o cargo (Prefeito, Secretário, Deputado Federal...) e aparece o campo para digitar o nome.
- Recebidos e enviados usam a **mesma numeração de protocolo** (2026/0001, 2026/0002...).
  Na aba Protocolos, use **Mostrar: Recebidos / Enviados** para separar.

## Leitor de QR Code USB

- Funciona como um teclado: clique no campo “Aponte o leitor…” e leia.
- Configure o leitor para **teclado ABNT2 / Português (Brasil)** e **sufixo Enter** (vem no manual, lendo códigos de configuração).
- Sem leitor: use **“Ler QR de uma foto”** (no celular, abre a câmera).

## Regras que o sistema garante

- Número do protocolo (`2026/0001`) e data/hora vêm do **servidor**: ninguém consegue escolher nem alterar.
- Protocolos registrados **não podem ser editados nem apagados** pelo site. Correção de documento = retificação (novo registro com o mesmo número).
- Se o mesmo documento (tipo + número + ano) já foi protocolado, o sistema **avisa** antes de registrar de novo.
- A busca procura em **todos os meses** (número, assunto, origem ou nome de quem recebeu).

## Cuidados no plano gratuito do Supabase

- Projeto **sem nenhum acesso por 7 dias é pausado** (ex.: recesso). Os dados não se perdem: entre no Supabase e clique em **Restore project**. Uso diário evita isso.
- Faça uma **cópia mensal**: *Table Editor → protocolos → Export → CSV*.
