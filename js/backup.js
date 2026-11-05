// Inventário das coleções usadas pelo projeto. Atualize ao criar uma nova área.
export const COLECOES_BACKUP = [
  'pf_os', 'pf_os_controle', 'pf_os_eventos', 'pf_os_painel',
  'pf_caixa_controle', 'pf_caixa_operadores', 'pf_caixa_movimentos', 'pf_caixa_ajustes', 'pf_caixa_fechamentos',
  'pf_comissao_vendedores', 'pf_comissao_config', 'pf_comissoes_vendas', 'pf_comissao_pagamentos', 'pf_comissao_auditoria',
  'cotacoes', 'comissoes', 'usuarios', 'config', 'clientes_cadastro',
  'pf_vendas', 'pf_caixa_sessoes', 'pf_produtos', 'pf_marcas',
  'pf_estoque_historico', 'pf_custo_historico', 'pf_servicos', 'pf_entregas',
  'prom_clientes', 'prom_compras', 'prom_pagamentos', 'prom_historico',
  'prom_cartas_anuencia'
];
export const SUBCOLECOES_BACKUP = {
  cotacoes: ['lembretes'], comissoes: ['registros'], prom_cartas_anuencia: ['versoes']
};
export const COLECOES_INATIVAS = [
  'pf_produtos', 'pf_marcas', 'pf_estoque_historico', 'pf_custo_historico',
  'prom_clientes', 'prom_compras', 'prom_pagamentos', 'prom_historico',
  'prom_cartas_anuencia'
];
export const CHAVES_LOCAIS_BACKUP = [
  'cotacao_sugestoes_descricao', 'cotacao_sugestoes_marca',
  'comissao_sugestoes_descricao', 'comissao_autosave'
];

// Cada valor recebe um tipo, evitando colisão com campos do próprio documento.
export function codificarValor(valor) {
  if (valor === null) return { tipo: 'null' };
  if (Array.isArray(valor)) return { tipo: 'array', valor: valor.map(codificarValor) };
  if (typeof valor === 'number') return { tipo: 'number', valor: String(valor) };
  if (typeof valor === 'string' || typeof valor === 'boolean') return { tipo: typeof valor, valor };
  if (valor instanceof Date) return { tipo: 'date', valor: valor.toISOString() };
  if (valor && typeof valor.toDate === 'function' && Number.isInteger(valor.seconds)) {
    return { tipo: 'timestamp', seconds: valor.seconds, nanoseconds: valor.nanoseconds };
  }
  if (valor && typeof valor.toBase64 === 'function') return { tipo: 'bytes', valor: valor.toBase64() };
  if (valor && Object.getPrototypeOf(valor) !== Object.prototype && typeof valor.latitude === 'number' && typeof valor.longitude === 'number') {
    return { tipo: 'geopoint', latitude: valor.latitude, longitude: valor.longitude };
  }
  if (valor && Object.getPrototypeOf(valor) !== Object.prototype && valor.type === 'document' && typeof valor.path === 'string') return { tipo: 'reference', valor: valor.path };
  if (valor && Object.getPrototypeOf(valor) === Object.prototype) {
    return { tipo: 'map', valor: Object.entries(valor).map(([k, v]) => [k, codificarValor(v)]) };
  }
  throw new Error('Tipo de dado não reconhecido. Backup interrompido para evitar perda de informações.');
}

export function decodificarValor(no, tipos) {
  switch (no.tipo) {
    case 'null': return null;
    case 'string': case 'boolean': return no.valor;
    case 'number': return Number(no.valor);
    case 'date': return new Date(no.valor);
    case 'timestamp': return tipos.timestamp(no.seconds, no.nanoseconds);
    case 'bytes': return tipos.bytes(no.valor);
    case 'geopoint': return tipos.geopoint(no.latitude, no.longitude);
    case 'reference': return tipos.reference(no.valor);
    case 'array': return no.valor.map(v => decodificarValor(v, tipos));
    case 'map': return Object.fromEntries(no.valor.map(([k,v]) => [k, decodificarValor(v, tipos)]));
    default: throw new Error('Tipo inválido no backup: ' + no.tipo);
  }
}

export async function coletarBackup({ lerColecao, lerGrupo, projectId, storage, progresso = () => {}, excluirColecoes = [] }) {
  const inicio = new Date().toISOString();
  const documentos = [];
  const contagens = {};
  const excluidas = new Set(excluirColecoes);
  async function coletar(caminho, subcolecoes = []) {
    progresso(caminho);
    const registros = await lerColecao(caminho);
    contagens[caminho] = registros.length;
    for (const registro of registros) {
      const path = caminho + '/' + registro.id;
      documentos.push({ path, dados: codificarValor(registro.dados) });
      for (const sub of subcolecoes) await coletar(path + '/' + sub);
    }
  }
  for (const raiz of COLECOES_BACKUP) {
    if (!excluidas.has(raiz)) await coletar(raiz);
  }
  // Collection groups incluem também registros cujo documento pai foi excluído.
  for (const [raiz, grupos] of Object.entries(SUBCOLECOES_BACKUP)) {
    if (excluidas.has(raiz)) continue;
    for (const grupo of grupos) {
      progresso(grupo);
      const registros = await lerGrupo(grupo);
      const permitidos = registros.filter(r => r.path.split('/')[0] === raiz);
      contagens[raiz + '/**/' + grupo] = permitidos.length;
      for (const registro of permitidos) documentos.push({ path: registro.path, dados: codificarValor(registro.dados) });
    }
  }
  const preferencias = {};
  for (const chave of CHAVES_LOCAIS_BACKUP) {
    const valor = storage.getItem(chave);
    if (valor !== null) preferencias[chave] = valor;
  }
  return {
    formato: 'papelaria-futura-backup', versao: 1, projectId,
    iniciadoEm: inicio, concluidoEm: new Date().toISOString(),
    totalDocumentos: documentos.length, contagens, documentos, preferencias,
    colecoesExcluidas: [...excluidas],
    observacoes: [
      'Inclui todos os campos das coleções selecionadas e suas subcoleções conhecidas.',
      ...(excluidas.size ? ['As coleções listadas em colecoesExcluidas ficaram fora da coleta.'] : []),
      'Inclui anexos armazenados nos documentos. Não inclui contas/senhas do Firebase Authentication, regras, índices, código ou arquivos externos.',
      'Preferências locais são apenas as deste navegador. A coleta não é uma transação: evite alterações durante o backup.',
      'Inclui subcoleções conhecidas mesmo sem documento pai. Coleções criadas fora do projeto exigem exportação administrativa separada.'
    ]
  };
}
