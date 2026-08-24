import type { Role } from "@/lib/types";

// Chaves de ícone resolvidas para componentes lucide em `icon-map.tsx`.
// O config fica sem JSX para poder ser importado por server components.
export type NavIconKey =
  | "visao"
  | "clientes"
  | "campanhas"
  | "relatorios"
  | "config"
  | "perfil"
  | "fechamento"
  | "conversoes"
  | "mais";

export type NavSubTab = {
  label: string;
  href: string;
  // Só marca ativo quando o pathname bate exatamente (abas irmãs aninhadas).
  exact?: boolean;
};

export type NavSection = {
  key: string;
  label: string;
  href: string;
  icon: NavIconKey;
  // Rótulo do grupo no trilho ("Oper", "IA", "Sist", "Conta").
  group: string;
  subTabs: NavSubTab[];
  // Rótulo do cabeçalho da página; cai para `label` quando ausente.
  title?: string;
  // Seções sem métricas (cadastros, configurações, perfil) escondem o seletor
  // de período da topbar — um controle que não muda nada só atrapalha.
  usesPeriod?: boolean;
};

export const ADMIN_CAMPAIGN_TABS: NavSubTab[] = [
  { label: "Campanhas", href: "/admin/campanhas", exact: true },
  { label: "Conjuntos de anúncios", href: "/admin/campanhas/conjuntos" },
  { label: "Anúncios", href: "/admin/campanhas/anuncios" },
];

export const CLIENT_CAMPAIGN_TABS: NavSubTab[] = [
  { label: "Campanhas", href: "/dashboard/campanhas", exact: true },
  {
    label: "Conjuntos de anúncios",
    href: "/dashboard/campanhas/conjuntos",
  },
  { label: "Anúncios", href: "/dashboard/campanhas/anuncios" },
];

const ADMIN_SECTIONS: NavSection[] = [
  {
    key: "visao",
    usesPeriod: true,
    label: "Dashboard",
    title: "Dashboard geral",
    href: "/admin",
    icon: "visao",
    group: "Oper",
    subTabs: [
      { label: "Visão geral", href: "/admin", exact: true },
      { label: "Comparativo", href: "/admin/comparativo" },
      { label: "Sincronização", href: "/admin/sincronizacao" },
    ],
  },
  {
    key: "clientes",
    label: "Clientes",
    title: "Clientes",
    href: "/admin/clientes",
    icon: "clientes",
    group: "Oper",
    subTabs: [
      { label: "Todos", href: "/admin/clientes", exact: true },
      { label: "Sem acesso", href: "/admin/clientes?filtro=sem-acesso" },
      { label: "Novo cliente", href: "/admin/clientes/novo" },
    ],
  },
  {
    key: "campanhas",
    usesPeriod: true,
    label: "Campanhas",
    title: "Campanhas",
    href: "/admin/campanhas",
    icon: "campanhas",
    group: "Oper",
    subTabs: ADMIN_CAMPAIGN_TABS,
  },
  {
    key: "conversoes",
    label: "Conversões",
    title: "Conversões",
    href: "/admin/conversoes",
    icon: "conversoes",
    group: "Oper",
    subTabs: [
      { label: "Leads", href: "/admin/conversoes", exact: true },
      { label: "Integração com o Meta", href: "/admin/conversoes/integracao" },
    ],
  },
  {
    key: "fechamento",
    label: "Fechamento",
    title: "Fechamento",
    href: "/admin/fechamento",
    icon: "fechamento",
    group: "Oper",
    subTabs: [{ label: "Do período", href: "/admin/fechamento", exact: true }],
  },
  {
    key: "relatorios",
    label: "Relatórios",
    title: "Relatórios IA",
    href: "/admin/relatorios-ia",
    icon: "relatorios",
    group: "IA",
    subTabs: [
      { label: "Gerar", href: "/admin/relatorios-ia", exact: true },
      { label: "Histórico", href: "/admin/relatorios-ia/historico" },
    ],
  },
  {
    key: "config",
    label: "Config",
    title: "Conexões e integrações",
    href: "/admin/configuracoes",
    icon: "config",
    group: "Sist",
    subTabs: [
      { label: "Integrações", href: "/admin/configuracoes", exact: true },
      { label: "Contas Meta", href: "/admin/configuracoes/contas" },
      { label: "Sincronização", href: "/admin/configuracoes/sincronizacao" },
    ],
  },
];

const CLIENT_SECTIONS: NavSection[] = [
  {
    key: "visao",
    usesPeriod: true,
    label: "Dashboard",
    title: "Dashboard",
    href: "/dashboard",
    icon: "visao",
    group: "Oper",
    subTabs: [{ label: "Visão geral", href: "/dashboard", exact: true }],
  },
  {
    key: "campanhas",
    usesPeriod: true,
    label: "Campanhas",
    title: "Campanhas",
    href: "/dashboard/campanhas",
    icon: "campanhas",
    group: "Oper",
    subTabs: CLIENT_CAMPAIGN_TABS,
  },
  {
    key: "conversoes",
    label: "Conversões",
    title: "Conversões",
    href: "/dashboard/conversoes",
    icon: "conversoes",
    group: "Oper",
    subTabs: [{ label: "Leads", href: "/dashboard/conversoes", exact: true }],
  },
  {
    key: "fechamento",
    label: "Fechamento",
    title: "Fechamento",
    href: "/dashboard/fechamento",
    icon: "fechamento",
    group: "Oper",
    subTabs: [{ label: "Do período", href: "/dashboard/fechamento", exact: true }],
  },
  {
    key: "perfil",
    label: "Perfil",
    title: "Meu perfil",
    href: "/dashboard/perfil",
    icon: "perfil",
    group: "Conta",
    subTabs: [{ label: "Meus dados", href: "/dashboard/perfil", exact: true }],
  },
];

export function getSections(role: Role): NavSection[] {
  return role === "admin" ? ADMIN_SECTIONS : CLIENT_SECTIONS;
}

// Agrupa as seções na ordem em que os grupos aparecem, para o trilho lateral.
export function getSectionGroups(role: Role) {
  const groups: { label: string; sections: NavSection[] }[] = [];

  for (const section of getSections(role)) {
    const current = groups.at(-1);

    if (current && current.label === section.group) {
      current.sections.push(section);
      continue;
    }

    groups.push({ label: section.group, sections: [section] });
  }

  return groups;
}

// Seção correspondente ao pathname atual: vence o href mais específico.
export function findActiveSection(role: Role, pathname: string) {
  const sections = getSections(role);

  return (
    sections
      .filter(
        (section) =>
          pathname === section.href || pathname.startsWith(`${section.href}/`),
      )
      .sort((a, b) => b.href.length - a.href.length)
      .at(0) ?? sections[0]
  );
}

export function isSubTabActive(
  tab: NavSubTab,
  pathname: string,
  searchParams?: URLSearchParams,
) {
  const [tabPath, tabQuery] = tab.href.split("?");

  if (tabQuery) {
    // Aba com filtro proprio (ex.: ?filtro=sem-acesso): so fica ativa quando
    // o pathname bate E todos os parametros dela estao na URL.
    if (pathname !== tabPath) {
      return false;
    }

    const expected = new URLSearchParams(tabQuery);
    for (const [key, value] of expected) {
      if (searchParams?.get(key) !== value) {
        return false;
      }
    }

    return true;
  }

  if (tab.exact) {
    // A aba "padrao" perde para a aba irma quando o filtro dela esta ativo.
    if (pathname !== tabPath) {
      return false;
    }

    return !hasSiblingFilter(tab, searchParams);
  }

  return pathname === tabPath || pathname.startsWith(`${tabPath}/`);
}

// Descobre se algum filtro de aba irma esta ativo na URL atual.
function hasSiblingFilter(tab: NavSubTab, searchParams?: URLSearchParams) {
  void tab;
  return searchParams?.has("filtro") ?? false;
}

// Itens da barra inferior no celular: 3 seções + "Mais" quando sobra alguma.
export function getMobileNav(role: Role) {
  const sections = getSections(role);

  if (sections.length <= 4) {
    return { primary: sections, overflow: [] as NavSection[] };
  }

  return { primary: sections.slice(0, 3), overflow: sections.slice(3) };
}
