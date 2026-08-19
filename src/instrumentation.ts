// `register()` roda nos dois runtimes (Node e Edge). Os handlers de processo
// só existem no Node, então o módulo que os instala é importado sob demanda —
// se ele fosse importado no topo, o bundle do Edge (usado pelo proxy) quebraria
// com "A Node.js API is used (process.on)".
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
