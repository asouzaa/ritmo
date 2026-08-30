var PROPRIEDADE_ID_PLANILHA = 'SPREADSHEET_ID';
var NOME_ABA_CONFIGURACAO = 'Configuracao';
var NOME_ABA_REGISTROS = 'Registros';

var COLUNAS_CONFIGURACAO = [
  'id',
  'title',
  'meta',
  'icon',
  'color',
  'category',
  'active',
];

var COLUNAS_REGISTROS = [
  'date',
  'habitId',
  'completed',
  'pages',
  'minutes',
  'quantity',
  'updatedAt',
];

var CAMPOS_PROGRESSO = ['pages', 'minutes', 'quantity'];
var TOTAL_PAGINAS_LIVRO = 275;

var HABITOS_INICIAIS = [
  ['bed', 'Arrumar a cama', 'Começar o dia com intenção', '◒', 'sage', 'dopamina-limpa', true],
  ['phone', 'Manhã sem celular', 'Primeiros 30 min protegidos', '◌', 'lavender', 'dopamina-limpa', true],
  ['read', 'Ler 10 páginas', 'Leitura diária', '✦', 'peach', 'recompensa', true],
  ['study', 'Estudar por 1h', 'Uma sessão de foco', '⌁', 'blue', 'foco', true],
  ['questions', 'Resolver 20 questões', 'Praticar para fixar', '⊹', 'yellow', 'foco', true],
  ['run', 'Corrida', 'Movimento no seu ritmo', '↗', 'mint', 'dopamina-limpa', true],
  ['strength', 'Musculação', 'Treino de força com presença', '◆', 'rose', 'dopamina-limpa', true],
];


function doGet(evento) {
  try {
    var data = validarData_(evento && evento.parameter && evento.parameter.date);
    return responderJson_(montarPayloadDaData_(data));
  } catch (erro) {
    return responderErro_(erro);
  }
}


function doPost(evento) {
  try {
    var requisicao = lerCorpoJson_(evento);
    var acao = String(requisicao.action || '');
    var data = validarData_(requisicao.date);
    var habitId = validarHabitId_(requisicao.habitId);
    validarHabitoExistente_(habitId);

    var progresso = null;
    if (acao === 'progress') {
      progresso = validarProgresso_(requisicao);
    } else if (acao !== 'toggle') {
      throw new Error('A action deve ser "toggle" ou "progress".');
    }

    var trava = LockService.getScriptLock();
    trava.waitLock(10000);
    try {
      if (acao === 'toggle') {
        alternarConclusao_(data, habitId);
      } else {
        salvarProgresso_(data, habitId, progresso);
      }
      SpreadsheetApp.flush();
    } finally {
      trava.releaseLock();
    }

    return responderJson_(montarPayloadDaData_(data));
  } catch (erro) {
    return responderErro_(erro);
  }
}


function configurarPlanilha() {
  var planilha = obterPlanilha_();
  var abaConfiguracao = garantirAba_(
    planilha,
    NOME_ABA_CONFIGURACAO,
    COLUNAS_CONFIGURACAO,
  );
  garantirAba_(planilha, NOME_ABA_REGISTROS, COLUNAS_REGISTROS);

  if (abaConfiguracao.getLastRow() === 1) {
    abaConfiguracao
      .getRange(2, 1, HABITOS_INICIAIS.length, COLUNAS_CONFIGURACAO.length)
      .setValues(HABITOS_INICIAIS);
  }
}


function montarPayloadDaData_(data) {
  var habitos = listarHabitos_();
  var registros = listarRegistrosDaData_(data);
  var progressoLivro = calcularProgressoLivro_();
  var sequencia = calcularSequencia_();
  var concluidos = [];
  var progresso = {};

  registros.forEach(function (registro) {
    if (registro.completed) {
      concluidos.push(registro.habitId);
    }

    var valores = {};
    CAMPOS_PROGRESSO.forEach(function (campo) {
      if (registro[campo] !== null) {
        valores[campo] = registro[campo];
      }
    });
    if (Object.keys(valores).length > 0) {
      progresso[registro.habitId] = valores;
    }
  });

  concluidos.sort();
  return {
    date: data,
    habits: habitos,
    completed: concluidos,
    progress: progresso,
    bookProgress: progressoLivro,
    streak: sequencia,
  };
}


function calcularSequencia_() {
  var habitos = listarHabitos_();
  var aba = obterAbaValidada_(NOME_ABA_REGISTROS, COLUNAS_REGISTROS);
  var porData = {};
  if (aba.getLastRow() >= 2) {
    var linhas = aba.getRange(2, 1, aba.getLastRow() - 1, COLUNAS_REGISTROS.length).getValues();
    linhas.forEach(function (linha) {
      var data = normalizarDataDaCelula_(linha[0]);
      if (!data) return;
      if (!porData[data]) porData[data] = {};
      porData[data][String(linha[1]).trim()] = {
        completed: paraBooleano_(linha[2]),
        pages: lerNumeroDaCelula_(linha[3], 'pages') || 0,
        minutes: lerNumeroDaCelula_(linha[4], 'minutes') || 0,
        quantity: lerNumeroDaCelula_(linha[5], 'quantity') || 0,
      };
    });
  }

  var hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var sequencia = 0;
  var dataAtual = new Date(hoje + 'T12:00:00Z');
  while (true) {
    var chave = Utilities.formatDate(dataAtual, 'UTC', 'yyyy-MM-dd');
    if (!diaCompleto_(habitos, porData[chave])) break;
    sequencia += 1;
    dataAtual.setUTCDate(dataAtual.getUTCDate() - 1);
  }
  return sequencia;
}


function diaCompleto_(habitos, registros) {
  if (!registros) return false;
  var exercicioConcluido = false;
  return habitos.every(function (habito) {
    var registro = registros[habito.id];
    if (habito.id === 'run' || habito.id === 'strength') {
      exercicioConcluido = exercicioConcluido || Boolean(registro && registro.completed);
      return true;
    }
    if (!registro || !registro.completed) return false;
    if (habito.id === 'read') return registro.pages >= 10;
    if (habito.id === 'study') return registro.minutes >= 60;
    if (habito.id === 'questions') return registro.quantity >= 20;
    return true;
  }) && exercicioConcluido;
}


function listarHabitos_() {
  var aba = obterAbaValidada_(NOME_ABA_CONFIGURACAO, COLUNAS_CONFIGURACAO);
  if (aba.getLastRow() < 2) {
    return [];
  }

  var linhas = aba
    .getRange(2, 1, aba.getLastRow() - 1, COLUNAS_CONFIGURACAO.length)
    .getValues();

  return linhas
    .filter(function (linha) {
      return String(linha[0]).trim() && estaAtivo_(linha[6]);
    })
    .map(function (linha) {
      return {
        id: String(linha[0]).trim(),
        title: String(linha[1] || ''),
        meta: String(linha[2] || ''),
        icon: String(linha[3] || ''),
        color: String(linha[4] || ''),
        category: String(linha[5] || ''),
      };
    });
}


function listarRegistrosDaData_(data) {
  var aba = obterAbaValidada_(NOME_ABA_REGISTROS, COLUNAS_REGISTROS);
  if (aba.getLastRow() < 2) {
    return [];
  }

  var linhas = aba
    .getRange(2, 1, aba.getLastRow() - 1, COLUNAS_REGISTROS.length)
    .getValues();

  return linhas
    .filter(function (linha) {
      return normalizarDataDaCelula_(linha[0]) === data;
    })
    .map(function (linha) {
      return {
        date: data,
        habitId: String(linha[1]).trim(),
        completed: paraBooleano_(linha[2]),
        pages: lerNumeroDaCelula_(linha[3], 'pages'),
        minutes: lerNumeroDaCelula_(linha[4], 'minutes'),
        quantity: lerNumeroDaCelula_(linha[5], 'quantity'),
      };
    });
}


function calcularProgressoLivro_() {
  var aba = obterAbaValidada_(NOME_ABA_REGISTROS, COLUNAS_REGISTROS);
  var totalPaginasLidas = 0;

  if (aba.getLastRow() >= 2) {
    var linhas = aba
      .getRange(2, 1, aba.getLastRow() - 1, COLUNAS_REGISTROS.length)
      .getValues();

    linhas.forEach(function (linha) {
      if (String(linha[1]).trim() !== 'read') {
        return;
      }
      var paginas = lerNumeroDaCelula_(linha[3], 'pages');
      if (paginas !== null) {
        totalPaginasLidas += paginas;
      }
    });
  }

  return {
    totalPages: TOTAL_PAGINAS_LIVRO,
    totalPagesRead: totalPaginasLidas,
    remainingPages: Math.max(TOTAL_PAGINAS_LIVRO - totalPaginasLidas, 0),
  };
}


function alternarConclusao_(data, habitId) {
  var registro = obterOuCriarRegistro_(data, habitId);
  registro.valores[2] = !paraBooleano_(registro.valores[2]);
  registro.valores[6] = new Date().toISOString();
  salvarRegistro_(registro);
}


function salvarProgresso_(data, habitId, progresso) {
  var registro = obterOuCriarRegistro_(data, habitId);
  var indicePorCampo = { pages: 3, minutes: 4, quantity: 5 };

  Object.keys(progresso).forEach(function (campo) {
    registro.valores[indicePorCampo[campo]] = progresso[campo];
  });
  registro.valores[6] = new Date().toISOString();
  salvarRegistro_(registro);
}


function obterOuCriarRegistro_(data, habitId) {
  var aba = obterAbaValidada_(NOME_ABA_REGISTROS, COLUNAS_REGISTROS);
  var ultimaLinha = aba.getLastRow();

  if (ultimaLinha >= 2) {
    var linhas = aba
      .getRange(2, 1, ultimaLinha - 1, COLUNAS_REGISTROS.length)
      .getValues();
    for (var indice = 0; indice < linhas.length; indice += 1) {
      if (
        normalizarDataDaCelula_(linhas[indice][0]) === data &&
        String(linhas[indice][1]).trim() === habitId
      ) {
        return { aba: aba, linha: indice + 2, valores: linhas[indice] };
      }
    }
  }

  return {
    aba: aba,
    linha: ultimaLinha + 1,
    valores: [data, habitId, false, '', '', '', ''],
  };
}


function salvarRegistro_(registro) {
  registro.aba
    .getRange(registro.linha, 1, 1, COLUNAS_REGISTROS.length)
    .setValues([registro.valores]);
}


function validarHabitoExistente_(habitId) {
  var existe = listarHabitos_().some(function (habito) {
    return habito.id === habitId;
  });
  if (!existe) {
    throw new Error('Hábito não encontrado.');
  }
}


function validarData_(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error('A data deve usar o formato YYYY-MM-DD.');
  }

  var partes = valor.split('-').map(Number);
  var data = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
  if (
    data.getUTCFullYear() !== partes[0] ||
    data.getUTCMonth() !== partes[1] - 1 ||
    data.getUTCDate() !== partes[2]
  ) {
    throw new Error('A data informada não é válida.');
  }
  return valor;
}


function validarHabitId_(valor) {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new Error('habitId é obrigatório.');
  }
  return valor.trim();
}


function validarProgresso_(requisicao) {
  var resultado = {};
  CAMPOS_PROGRESSO.forEach(function (campo) {
    if (!Object.prototype.hasOwnProperty.call(requisicao, campo)) {
      return;
    }
    var valor = requisicao[campo];
    if (typeof valor !== 'number' || !isFinite(valor) || valor < 0) {
      throw new Error(campo + ' deve ser um número não negativo.');
    }
    resultado[campo] = valor;
  });

  if (Object.keys(resultado).length === 0) {
    throw new Error('Informe pages, minutes ou quantity.');
  }
  return resultado;
}


function lerCorpoJson_(evento) {
  var conteudo = evento && evento.postData && evento.postData.contents;
  if (!conteudo) {
    throw new Error('O corpo JSON é obrigatório.');
  }
  try {
    return JSON.parse(conteudo);
  } catch (erro) {
    throw new Error('O corpo da requisição contém JSON inválido.');
  }
}


function obterPlanilha_() {
  var idPlanilha = PropertiesService.getScriptProperties().getProperty(
    PROPRIEDADE_ID_PLANILHA,
  );
  if (!idPlanilha) {
    throw new Error('Configure a Script Property SPREADSHEET_ID.');
  }
  return SpreadsheetApp.openById(idPlanilha);
}


function obterAbaValidada_(nome, colunas) {
  var aba = obterPlanilha_().getSheetByName(nome);
  if (!aba) {
    throw new Error('A aba ' + nome + ' não foi encontrada.');
  }
  if (aba.getLastRow() < 1) {
    throw new Error('A aba ' + nome + ' não possui cabeçalho.');
  }

  var cabecalho = aba.getRange(1, 1, 1, colunas.length).getValues()[0];
  colunas.forEach(function (coluna, indice) {
    if (String(cabecalho[indice]).trim() !== coluna) {
      throw new Error(
        'Cabeçalho inválido na aba ' + nome + ': esperado ' + coluna + '.',
      );
    }
  });
  return aba;
}


function garantirAba_(planilha, nome, colunas) {
  var aba = planilha.getSheetByName(nome) || planilha.insertSheet(nome);
  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, colunas.length).setValues([colunas]);
    aba.setFrozenRows(1);
  }
  return aba;
}


function estaAtivo_(valor) {
  if (valor === false) {
    return false;
  }
  var texto = String(valor).trim().toLowerCase();
  return texto !== 'false' && texto !== 'não' && texto !== 'nao' && texto !== '0';
}


function paraBooleano_(valor) {
  if (valor === true || valor === false) {
    return valor;
  }
  var texto = String(valor).trim().toLowerCase();
  return texto === 'true' || texto === 'sim' || texto === '1';
}


function lerNumeroDaCelula_(valor, campo) {
  if (valor === '' || valor === null) {
    return null;
  }
  var numero = Number(valor);
  if (!isFinite(numero) || numero < 0) {
    throw new Error('Valor inválido em ' + campo + ' na aba Registros.');
  }
  return numero;
}


function normalizarDataDaCelula_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(valor, 'UTC', 'yyyy-MM-dd');
  }
  return String(valor).trim();
}


function responderJson_(dados) {
  return ContentService.createTextOutput(JSON.stringify(dados)).setMimeType(
    ContentService.MimeType.JSON,
  );
}


function responderErro_(erro) {
  return responderJson_({ ok: false, error: String(erro.message || erro) });
}
