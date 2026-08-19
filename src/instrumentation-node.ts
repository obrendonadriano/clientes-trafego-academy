// Rede de segurança do processo do servidor (só runtime Node).
//
// No Node 22, uma promise rejeitada sem tratamento ENCERRA o processo. Num
// servidor isso derruba o site inteiro por causa de uma falha isolada — foi o
// que aconteceu quando o cache de dados recusou um item grande e a gravação
// falhou em segundo plano: o servidor morria e as páginas passavam a carregar
// sem CSS (ou nem carregavam).
//
// Aqui a rejeição é registrada no log e o processo continua de pé. Não serve
// para esconder erro: o log sai completo para ser investigado.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] o servidor seguiu de pé:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException] o servidor seguiu de pé:", error);
});

// Marca o arquivo como módulo (ele só tem efeitos colaterais).
export {};
