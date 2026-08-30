# Backend do Ritmo no Google Apps Script

Este Web App usa uma Planilha Google como armazenamento. O ID da planilha não
fica no código: ele deve ser salvo na propriedade de script `SPREADSHEET_ID`.

## Configuração

1. Crie uma Planilha Google vazia e copie apenas o ID presente na URL.
2. Crie um projeto no Google Apps Script e cole o conteúdo de `Code.gs`.
3. Abra **Configurações do projeto → Propriedades do script**.
4. Adicione a propriedade `SPREADSHEET_ID` com o ID copiado.
5. Execute manualmente a função `configurarPlanilha` e autorize o acesso.

A função cria as abas, os cabeçalhos e os sete hábitos iniciais quando a aba
`Configuracao` ainda estiver vazia.

## Colunas da planilha

### Aba `Configuracao`

| Coluna | Uso |
| --- | --- |
| `id` | ID único: `bed`, `phone`, `read`, `study`, `questions`, `run` ou `strength` |
| `title` | Nome exibido pelo frontend |
| `meta` | Descrição ou meta do hábito |
| `icon` | Símbolo visual |
| `color` | Nome da cor usada pelo frontend |
| `category` | `dopamina-limpa`, `foco` ou `recompensa` |
| `active` | `TRUE`/`FALSE`; vazio também é considerado ativo |

### Aba `Registros`

| Coluna | Uso |
| --- | --- |
| `date` | Data no formato `YYYY-MM-DD` |
| `habitId` | ID existente em `Configuracao` |
| `completed` | Conclusão (`TRUE`/`FALSE`) |
| `pages` | Páginas, com valor não negativo |
| `minutes` | Minutos, com valor não negativo |
| `quantity` | Quantidade genérica não negativa |
| `updatedAt` | Data e hora ISO da última alteração |

O backend mantém uma linha por combinação de `date` e `habitId`. Atualizações
de progresso preservam os campos quantitativos que não foram enviados.

## Publicar como Web App

1. Selecione **Implantar → Nova implantação**.
2. Escolha o tipo **App da Web**.
3. Em **Executar como**, selecione sua conta.
4. Em **Quem pode acessar**, escolha a opção adequada ao público do site.
5. Implante, autorize o script e copie a URL terminada em `/exec`.
6. Após mudanças futuras, publique uma nova versão da implantação.

Não inclua IDs reais de planilha, URLs privadas ou segredos no código.

## Contrato HTTP

### Consultar hábitos e progresso de uma data

```http
GET URL_DO_WEB_APP?date=2026-08-30
```

Resposta:

```json
{
  "date": "2026-08-30",
  "habits": [
    {
      "id": "read",
      "title": "Ler 10 páginas",
      "meta": "Leitura diária",
      "icon": "✦",
      "color": "peach",
      "category": "recompensa"
    }
  ],
  "completed": ["read"],
  "progress": {
    "read": { "pages": 10 }
  },
  "bookProgress": {
    "totalPages": 275,
    "totalPagesRead": 68,
    "remainingPages": 207
  }
}
```

`bookProgress` é global: aparece em todos os GETs e POSTs e soma `pages` de
todos os registros cujo `habitId` seja `read`, sem limitar a soma à data
solicitada. `remainingPages` nunca fica abaixo de zero.

### Alternar conclusão

```json
{
  "action": "toggle",
  "date": "2026-08-30",
  "habitId": "read"
}
```

### Salvar progresso quantitativo

```json
{
  "action": "progress",
  "date": "2026-08-30",
  "habitId": "read",
  "pages": 10,
  "minutes": 25,
  "quantity": 1
}
```

O POST devolve o mesmo payload diário do GET após persistir a alteração.
`pages`, `minutes` e `quantity` aceitam inteiros ou decimais maiores ou iguais
a zero. É obrigatório enviar pelo menos um desses campos na ação `progress`.

Datas inexistentes, datas fora de `YYYY-MM-DD`, hábitos desconhecidos, JSON
inválido e valores quantitativos negativos são rejeitados com JSON:

```json
{ "ok": false, "error": "Descrição do erro." }
```

O `ContentService` controla os cabeçalhos e o status HTTP do Web App. Para uma
chamada do frontend estático sem preflight, envie o corpo JSON como texto:

```js
fetch(URL_DO_WEB_APP, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(payload),
})
```

As respostas são sempre serializadas como `application/json`. O acesso entre
origens depende da implantação pública do Web App e dos cabeçalhos gerenciados
pelo Google Apps Script; o código não armazena credenciais nem tenta criar um
cabeçalho CORS manual que a plataforma não permite configurar.
