export class ErroEscala extends Error {
  constructor(mensagem, status = 400, detalhes = null) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}
export function ehGestorEscalas(perfil) {
  return (Array.isArray(perfil?.roles) ? perfil.roles : [perfil?.role]).some(
    (cargo) => ["admin", "gestor_escalas"].includes(cargo),
  );
}
