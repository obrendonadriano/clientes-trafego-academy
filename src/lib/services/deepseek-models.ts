// Lista de modelos usada também pelo formulário de configurações (client
// component), por isso fica fora de `deepseek.ts`, que é server-only.
export const DEEPSEEK_MODELS = [
  { value: "deepseek-chat", label: "DeepSeek Chat (recomendado)" },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
] as const;
