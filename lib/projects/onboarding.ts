export const ONBOARDING_QUESTIONS = [
  {
    key: "project_basics",
    title: "题材、平台与篇幅",
    prompt: "先给这本书一个暂定名，再说明题材、发布平台和预估篇幅。",
    placeholder:
      "例如：暂定名《港综资本局》。题材是港综商战+势力经营，发布平台偏番茄，目标做 180 万字长篇。",
    optional: false,
  },
  {
    key: "core_conflict",
    title: "主角目标与核心冲突",
    prompt: "主角最想达成什么？眼下最大的阻力、敌人或代价是什么？",
    placeholder: "例如：主角要在港岛金融圈站稳脚跟，但黑白两道都盯着他的现金流和底牌。",
    optional: false,
  },
  {
    key: "world_rules",
    title: "世界规则与禁忌",
    prompt: "这个世界最关键的规则、能力边界、禁忌和失败代价是什么？",
    placeholder: "例如：异能必须付出寿命代价，不能公开展示；触碰某条底线会被官方与地下势力同时追杀。",
    optional: false,
  },
  {
    key: "factions",
    title: "势力与关系锚点",
    prompt: "列出关键势力、重要角色、利益链和最需要维持或打破的关系。",
    placeholder: "例如：主角、师父、财阀家族、社团、警方内线之间的合作与背叛关系。",
    optional: false,
  },
  {
    key: "style_rules",
    title: "文风、节奏与写作约束",
    prompt: "你希望它写成什么气质？节奏快慢、爽点密度、叙述口吻、禁写清单分别是什么？",
    placeholder: "例如：章节要短钩子强，语言克制但信息密度高，禁写降智误会和无收益抒情。",
    optional: false,
  },
  {
    key: "research_needs",
    title: "考据与外部事实补充",
    prompt: "是否需要考据、MCP 或外部事实补充？哪些设定最怕写错？",
    placeholder: "例如：金融法规、港岛地理、警务体系需要核查；情感线和剧情设定不依赖外部事实。",
    optional: true,
  },
] as const;

export type OnboardingQuestion = (typeof ONBOARDING_QUESTIONS)[number];
export type OnboardingQuestionKey = OnboardingQuestion["key"];
export type OnboardingRecommendedOption = {
  label: string;
  value: string;
};

export type OnboardingQuestionSpec = {
  key: OnboardingQuestionKey;
  title: string;
  prompt: string;
  placeholder: string;
  optional: boolean;
};

export type OnboardingSeedInput = {
  name?: string | null;
  genre?: string | null;
  platform?: string | null;
  lengthHint?: string | null;
  era?: string | null;
  keywords?: string | null;
};

export type OnboardingAnswerEntry = {
  questionKey: OnboardingQuestionKey;
  answer: string;
  skipped: boolean;
  updatedAt: string;
};

export type OnboardingMode = "fallback" | "ai_dynamic";

export type OnboardingRuntimeConfig = {
  endpointId: string | null;
  endpointLabel: string | null;
  modelId: string | null;
  providerType: string | null;
};

export type DynamicOnboardingQuestion = OnboardingQuestionSpec & {
  recommendedOptions: OnboardingRecommendedOption[];
  askedAt: string;
  source: "ai";
};

export type OnboardingSummary = {
  metadata: {
    nameHint: string | null;
    genreHint: string | null;
    platformHint: string | null;
    lengthHint: string | null;
    requiresResearch: boolean;
  };
  sections: {
    projectBasics: string;
    coreConflict: string;
    worldRules: string;
    factions: string;
    styleRules: string;
    researchNeeds: string;
  };
  answers: Array<{
    questionKey: OnboardingQuestionKey;
    title: string;
    answer: string;
    skipped: boolean;
  }>;
  recommendedNextSteps: string[];
  completion: {
    answeredCount: number;
    totalQuestions: number;
    isReadyToFinalize: boolean;
  };
  mode: OnboardingMode;
  runtime: OnboardingRuntimeConfig | null;
  dynamic: {
    isAiDriven: boolean;
    history: DynamicOnboardingQuestion[];
  };
};

export type OnboardingQuestionPayload = OnboardingQuestionSpec & {
  answer: string;
  recommendedOptions: OnboardingRecommendedOption[];
  source: "fallback" | "ai";
};

export type OnboardingSessionPayload = {
  id: string;
  status: "active" | "ready" | "finalized";
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion: OnboardingQuestionPayload | null;
  answers: OnboardingAnswerEntry[];
  summary: OnboardingSummary;
  mode: OnboardingMode;
  runtime: OnboardingRuntimeConfig | null;
  finalizedProjectId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type BootstrapPackageInput = {
  name: string;
  genre: string;
  platform: string;
  summary: OnboardingSummary;
};

type BuildOnboardingSummaryOptions = {
  mode?: OnboardingMode;
  runtime?: OnboardingRuntimeConfig | null;
  dynamicHistory?: DynamicOnboardingQuestion[];
};

type ExtraArtifactDefinition = {
  artifactKey: string;
  filename: string;
  kind: "project_setting" | "project_state" | "project_outline" | "ledger" | "hook_pool";
  content: string;
  summary: string;
};

type BootstrapPackage = {
  artifactContentOverrides: Record<string, string>;
  extraArtifacts: ExtraArtifactDefinition[];
};

const QUESTION_BY_KEY = new Map(ONBOARDING_QUESTIONS.map((question) => [question.key, question]));
const KNOWN_PLATFORMS = ["番茄", "起点", "七猫", "晋江", "纵横", "飞卢", "刺猬猫", "掌阅"];
const KNOWN_GENRES = [
  "都市",
  "都市异能",
  "历史",
  "权谋",
  "港综",
  "仙侠",
  "玄幻",
  "科幻",
  "悬疑",
  "官场",
  "商战",
  "无限流",
  "校园",
  "轻小说",
  "末世",
];
const KNOWN_LENGTH_HINTS = ["短篇", "中篇", "长篇", "百万字", "180万字", "200万字", "300万字"];
const DEFAULT_PLATFORM = "番茄";
const DEFAULT_LENGTH_HINT = "180 万字长篇";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeAnswer(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function cleanSeedField(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text || null;
}

function normalizeOnboardingMode(value: unknown): OnboardingMode {
  return value === "ai_dynamic" ? "ai_dynamic" : "fallback";
}

function normalizeOnboardingRuntimeConfig(value: unknown): OnboardingRuntimeConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    endpointId: typeof value.endpointId === "string" && value.endpointId.trim() ? value.endpointId.trim() : null,
    endpointLabel:
      typeof value.endpointLabel === "string" && value.endpointLabel.trim() ? value.endpointLabel.trim() : null,
    modelId: typeof value.modelId === "string" && value.modelId.trim() ? value.modelId.trim() : null,
    providerType:
      typeof value.providerType === "string" && value.providerType.trim() ? value.providerType.trim() : null,
  };
}

function readAnswer(answers: OnboardingAnswerEntry[], key: OnboardingQuestionKey) {
  return answers.find((entry) => entry.questionKey === key)?.answer ?? "";
}

function findKnownToken(text: string, candidates: string[]) {
  return candidates.find((candidate) => text.includes(candidate)) ?? null;
}

function inferNameHint(projectBasics: string) {
  const titleMatch = projectBasics.match(/《([^》]{2,40})》/);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }

  const labeledMatch = projectBasics.match(/(?:项目名|书名|暂定名|名字)\s*[:：]\s*([^\n，。,；;]{2,40})/);
  if (labeledMatch?.[1]) {
    return labeledMatch[1].trim();
  }

  return null;
}

function inferLengthHint(projectBasics: string) {
  return findKnownToken(projectBasics, KNOWN_LENGTH_HINTS);
}

function renderMarkdownDocument(title: string, sections: Array<{ heading: string; body: string }>) {
  const lines = [`# ${title}`];

  for (const section of sections) {
    lines.push("", `## ${section.heading}`, "", section.body.trim() || "_待补充_");
  }

  return `${lines.join("\n").trim()}\n`;
}

function renderBulletList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- _待补充_";
}

function renderNameLead(nameHint: string | null) {
  return nameHint ? `暂定名《${nameHint.replace(/[《》]/g, "").trim()}》` : "项目暂定名待定";
}

function normalizeRecommendedOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [] satisfies OnboardingRecommendedOption[];
  }

  return dedupeRecommendedOptions(
    value.flatMap((row) => {
      if (!isRecord(row)) {
        return [];
      }

      const label = typeof row.label === "string" ? row.label.trim() : "";
      const optionValue = typeof row.value === "string" ? sanitizeAnswer(row.value) : "";

      if (!label || !optionValue) {
        return [];
      }

      return [
        {
          label,
          value: optionValue,
        },
      ];
    }),
  );
}

function normalizeDynamicOnboardingQuestion(value: unknown): DynamicOnboardingQuestion | null {
  if (!isRecord(value) || typeof value.key !== "string") {
    return null;
  }

  const canonicalQuestion = QUESTION_BY_KEY.get(value.key as OnboardingQuestionKey);
  if (!canonicalQuestion) {
    return null;
  }

  const prompt = typeof value.prompt === "string" && value.prompt.trim() ? value.prompt.trim() : canonicalQuestion.prompt;
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : canonicalQuestion.title;
  const placeholder =
    typeof value.placeholder === "string" && value.placeholder.trim()
      ? value.placeholder.trim()
      : canonicalQuestion.placeholder;

  return {
    key: canonicalQuestion.key,
    title,
    prompt,
    placeholder,
    optional: canonicalQuestion.optional,
    recommendedOptions: normalizeRecommendedOptions(value.recommendedOptions),
    askedAt: typeof value.askedAt === "string" && value.askedAt.trim() ? value.askedAt.trim() : new Date(0).toISOString(),
    source: "ai",
  };
}

function normalizeDynamicOnboardingHistory(value: unknown) {
  if (!Array.isArray(value)) {
    return [] satisfies DynamicOnboardingQuestion[];
  }

  return value.flatMap((row) => {
    const question = normalizeDynamicOnboardingQuestion(row);
    return question ? [question] : [];
  });
}

function extractOnboardingSummaryOptions(value: unknown): Required<BuildOnboardingSummaryOptions> {
  if (!isRecord(value)) {
    return {
      mode: "fallback",
      runtime: null,
      dynamicHistory: [],
    };
  }

  const mode = normalizeOnboardingMode(value.mode);
  const runtime = normalizeOnboardingRuntimeConfig(value.runtime);
  const dynamicHistory =
    mode === "ai_dynamic" && isRecord(value.dynamic) ? normalizeDynamicOnboardingHistory(value.dynamic.history) : [];

  return {
    mode,
    runtime,
    dynamicHistory,
  };
}

function inferGenreTrack(summary: OnboardingSummary) {
  const joinedText = [
    summary.metadata.genreHint ?? "",
    summary.sections.projectBasics,
    summary.sections.coreConflict,
    summary.sections.worldRules,
  ]
    .join("\n")
    .toLowerCase();

  if (/(港综|港岛|金融|商战|财阀|社团)/.test(joinedText)) {
    return "gangster_business";
  }

  if (/(历史|朝堂|权谋|世家|皇城|边军)/.test(joinedText)) {
    return "historical_power";
  }

  if (/(仙侠|玄幻|修仙|宗门|灵气|道心)/.test(joinedText)) {
    return "fantasy";
  }

  if (/(悬疑|推理|刑侦|谜案|真相|赛博|科幻)/.test(joinedText)) {
    return "suspense";
  }

  if (/(言情|恋爱|情感|婚恋)/.test(joinedText)) {
    return "relationship";
  }

  return "general";
}

function dedupeRecommendedOptions(options: OnboardingRecommendedOption[]) {
  const seen = new Set<string>();

  return options.filter((option) => {
    const value = sanitizeAnswer(option.value);
    if (!option.label.trim() || !value || seen.has(value)) {
      return false;
    }

    seen.add(value);
    option.value = value;
    return true;
  });
}

function buildProjectBasicsOptions(summary: OnboardingSummary) {
  const nameLead = renderNameLead(summary.metadata.nameHint);
  const genre = summary.metadata.genreHint ?? "都市成长";
  const platform = summary.metadata.platformHint ?? DEFAULT_PLATFORM;
  const lengthHint = summary.metadata.lengthHint ?? DEFAULT_LENGTH_HINT;

  return dedupeRecommendedOptions([
    {
      label: `${platform}长篇主线`,
      value: `${nameLead}，题材是${genre}，发布平台偏${platform}，目标做${lengthHint}，主打清晰主线和持续钩子。`,
    },
    {
      label: "补背景与关键词",
      value: `${nameLead}，题材是${genre}，发布平台偏${platform}，故事背景先锁定在待作者确认的时代/城市里，关键词以“上位、翻盘、反制、连锁爽点”为主。`,
    },
    {
      label: "先做中长线试跑",
      value: `${nameLead}，题材是${genre}，发布平台偏${platform}，先按中长篇节奏设计，前 20 章快速给出主线、敌手和持续追读钩子。`,
    },
  ]);
}

function buildCoreConflictOptions(summary: OnboardingSummary) {
  const track = inferGenreTrack(summary);

  switch (track) {
    case "gangster_business":
      return [
        {
          label: "上位夺权",
          value: "主角要借资本局在港岛完成上位，但黑白两道和旧财团都盯着他的现金流、盟友和底牌。",
        },
        {
          label: "守住基本盘",
          value: "主角最先要守住自己的产业与核心班底，否则一旦被人做空、切断货源或曝光底牌，就会被连环围猎。",
        },
        {
          label: "借局翻盘",
          value: "主角想借一场大局完成翻盘，可他必须在合作与背刺之间选边，稍有失手就会沦为替罪羊。",
        },
      ];
    case "historical_power":
      return [
        {
          label: "改命求生",
          value: "主角想借乱局改命，但朝堂、世家和边军都把他当成可替换的棋子，稍有一步走错就会家破人亡。",
        },
        {
          label: "守家与夺势",
          value: "主角既要保住家族和根基，又要争到能真正改局的话语权，最大阻力来自比他更早布局的旧势力。",
        },
        {
          label: "明暗双线",
          value: "主角明面上要完成朝廷或家族交办的任务，暗线却必须破解真正的权力交易，否则所有功劳都会变成催命符。",
        },
      ];
    case "fantasy":
      return [
        {
          label: "逆天改命",
          value: "主角想逆天改命、跨过天赋或出身的天花板，但每次突破都要付出明确代价，越强越接近失控。",
        },
        {
          label: "护住重要之人",
          value: "主角真正的目标不是单纯升级，而是护住某个关键之人或关键之地，可这会逼他不断踩进更高层级的争斗。",
        },
        {
          label: "夺传承",
          value: "主角必须拿到某份传承或资格才能活下去，但宗门、宿敌和天道规则都在争抢同一份东西。",
        },
      ];
    case "suspense":
      return [
        {
          label: "追真相",
          value: "主角最想查清真相或揪出幕后者，但每接近一步，身边人和自身安全都会先被推到危险边缘。",
        },
        {
          label: "活下去并破局",
          value: "主角要先活下去，再把局面反推回去；敌人真正的优势不是力量，而是信息差和时间差。",
        },
        {
          label: "自证清白",
          value: "主角被卷入一场无法直接解释的事件，必须在有限时间里自证、破案并找出真正操盘者。",
        },
      ];
    case "relationship":
      return [
        {
          label: "关系与立场冲突",
          value: "主角想守住一段关键关系，但身份、立场和现实利益不断逼迫双方做出相互伤害的选择。",
        },
        {
          label: "成长与选择",
          value: "主角要完成自我成长或人生翻盘，可每往前一步，都要在感情、事业和底线之间做割舍。",
        },
        {
          label: "双向拉扯",
          value: "主角与对手/对象彼此吸引又互相提防，核心冲突来自目标不一致而不是简单误会。",
        },
      ];
    default:
      return [
        {
          label: "翻盘上升",
          value: "主角想完成一次跨阶层翻盘，但资源、时间和敌意会同时压上来，任何一步失误都会让前期积累归零。",
        },
        {
          label: "守住底牌",
          value: "主角必须先守住最关键的底牌和人脉，再借一次高风险选择撬开局面，否则会被更成熟的对手直接按死。",
        },
        {
          label: "先赢一小局",
          value: "主角眼下最现实的目标是先赢下一场小局，证明自己值得下注，可这一步本身就是敌人布好的筛选局。",
        },
      ];
  }
}

function buildWorldRuleOptions(summary: OnboardingSummary) {
  const track = inferGenreTrack(summary);

  switch (track) {
    case "gangster_business":
      return [
        {
          label: "越线有代价",
          value: "这个世界的关键规则是：赚钱可以狠，但不能乱越线；一旦碰到金融监管、警务系统或大势力底线，就会被联手清场。",
        },
        {
          label: "情报比拳头更贵",
          value: "真正决定胜负的是情报、资金链和交易筹码，不是谁更能打；底牌暴露比正面失利更致命。",
        },
        {
          label: "公开身份有限制",
          value: "主角能做的事和能公开承认的身份不是一回事，很多关键动作只能借壳或借人完成，否则代价会直接落到自己身上。",
        },
      ];
    case "historical_power":
      return [
        {
          label: "制度先于个人",
          value: "世界规则首先是制度与礼法，个人再强也不能直接越过秩序；触碰禁区会先被规则反噬，再被人借题发挥。",
        },
        {
          label: "军政财互相牵制",
          value: "真正的边界在于军权、政令和钱粮彼此制衡，任何一方失控都会引发连锁震荡和清算。",
        },
        {
          label: "失败代价外溢",
          value: "主角失败的代价不会只落到自己身上，而会外溢到家族、门生和盟友，所以很多选择必须先算后果。",
        },
      ];
    case "fantasy":
      return [
        {
          label: "力量必须付费",
          value: "所有强力能力都必须付出代价，可能是寿命、道心、资源或因果，不存在无成本爆种。",
        },
        {
          label: "体系有明确边界",
          value: "能力体系必须有可验证的边界和上限，越级可以，但要依赖环境、准备和明确代价，不能随意破格。",
        },
        {
          label: "禁忌不可乱碰",
          value: "这个世界存在一条碰了就会被群起而攻之的禁忌线，它既是剧情高压线，也是主角必须学会绕开的规则。",
        },
      ];
    case "suspense":
      return [
        {
          label: "真相分层",
          value: "真相不是一次性揭开，而是层层递进；越高层的信息越难拿，也越容易让主角被盯上。",
        },
        {
          label: "信息差是核心武器",
          value: "信息差决定主动权，主角如果暴露调查方向，就会立刻被对手改写证据、节奏和叙事。",
        },
        {
          label: "错误判断有现实代价",
          value: "一旦判断错线索、错人或错时间点，代价会立刻体现为死人、失控现场或不可逆的舆论后果。",
        },
      ];
    default:
      return [
        {
          label: "能力与代价绑定",
          value: "这个世界最重要的规则是：任何优势都必须付代价，主角不能无限试错，失败要有可感知的损失。",
        },
        {
          label: "边界先写清",
          value: "先把可做、不可做、公开能做和私下能做的边界写清楚，这样后面每次升级或翻盘才有真实张力。",
        },
        {
          label: "禁忌明确",
          value: "必须存在几条绝对不能碰的禁忌线，一旦触碰就会引发系统性追杀、清算或关系崩塌。",
        },
      ];
  }
}

function buildFactionOptions(summary: OnboardingSummary) {
  const track = inferGenreTrack(summary);

  switch (track) {
    case "gangster_business":
      return [
        {
          label: "财团 / 社团 / 警方",
          value: "关键势力先锁成三层：明面的财团和公司、灰色地带的社团与掮客、以及握有规则解释权的警方或监管线。",
        },
        {
          label: "师门与盟友",
          value: "主角身边至少要有一条师门或老带新的关系线，它既是资源来源，也是后续背刺和托底的双刃剑。",
        },
        {
          label: "利益链清晰",
          value: "每个关键角色先标清利益链：谁给钱、谁给路、谁给保护、谁随时可能反咬，这样剧情推进时关系才会有抓手。",
        },
      ];
    case "historical_power":
      return [
        {
          label: "朝堂 / 世家 / 边军",
          value: "核心势力可以先拆成朝堂官场、地方世家和边军体系三股，它们合作时互利，翻脸时最容易互相掐死。",
        },
        {
          label: "师承与门生",
          value: "主角要么有师承线，要么有门生线，这类关系既决定政治信用，也决定关键时刻谁愿意站出来担责。",
        },
        {
          label: "关系链带利益",
          value: "不要只写人物名单，关系一定要带利益锚点，比如钱粮、人脉、兵权、名声或婚姻绑定。",
        },
      ];
    case "fantasy":
      return [
        {
          label: "宗门 / 家族 / 外敌",
          value: "先锁三类核心势力：宗门或学院、出身家族或故土、以及更高层级的外部敌对力量。",
        },
        {
          label: "同门与宿敌",
          value: "主角身边最好同时存在同门盟友和镜像宿敌，这样每次成长都能映出不同代价和路线。",
        },
        {
          label: "关系带立场",
          value: "人物关系不要只写亲疏，要标明立场变化条件，例如资源、传承、信仰或生死债。",
        },
      ];
    default:
      return [
        {
          label: "主角线 + 对手线",
          value: "先建立主角阵营、核心对手阵营和中间摇摆层三组关系，后续每次冲突就能快速落到人和利益上。",
        },
        {
          label: "关系必须可交易",
          value: "重要角色之间的关系最好都带可交易的东西，比如资源、秘密、保护、情感债或未来承诺。",
        },
        {
          label: "给一条背叛线",
          value: "至少准备一条高价值关系线，用来承担后续合作、误判、背叛或牺牲带来的戏剧张力。",
        },
      ];
  }
}

function buildStyleRuleOptions(summary: OnboardingSummary) {
  const platform = summary.metadata.platformHint ?? DEFAULT_PLATFORM;

  if (platform.includes("番茄") || platform.includes("七猫")) {
    return [
      {
        label: "快节奏强钩子",
        value: "文风要直给、节奏快、章节结尾带钩子，前三章就给出主角收益和持续追读理由，禁写长段铺垫。",
      },
      {
        label: "爽点前置",
        value: "每章都要有信息推进、局势变化或情绪兑现，爽点可以大小交替，但不能长时间空转。",
      },
      {
        label: "禁写低效冲突",
        value: "禁写降智误会、无收益抒情和重复吵架；冲突必须围绕利益、目标和选择展开。",
      },
    ];
  }

  if (platform.includes("起点")) {
    return [
      {
        label: "主线稳推进",
        value: "文风保持克制但信息密度高，主线持续推进，阶段目标和阶段奖励必须清晰可见。",
      },
      {
        label: "升级与回收",
        value: "强调长期伏笔回收、成长层级和势力博弈，章节结尾既要留钩子，也要给读者阶段性满足。",
      },
      {
        label: "避免灌水",
        value: "禁写重复解释、空转日常和只讲设定不推剧情的段落，所有细节都要服务后续回收。",
      },
    ];
  }

  if (platform.includes("晋江")) {
    return [
      {
        label: "人物关系优先",
        value: "文风更重人物心理、关系变化和关键选择，冲突不靠误会硬拖，而靠立场与情感真实碰撞。",
      },
      {
        label: "细腻但不拖",
        value: "可以细腻，但节奏不能散；每章都要推动关系、剧情或人物认知至少一项发生变化。",
      },
      {
        label: "禁写工具人对白",
        value: "尽量避免工具人式解释和机械对话，让每个关键角色的口吻、诉求和隐瞒都能区分开。",
      },
    ];
  }

  return [
    {
      label: "清楚稳准",
      value: "文风以清楚、稳准、信息密度高为主，章节推进必须服务主线，不写无效废话。",
    },
    {
      label: "张弛分明",
      value: "节奏要有快慢，但每一章都必须交代新的选择、代价或线索，不让剧情停在原地。",
    },
    {
      label: "约束先写死",
      value: "把禁写项、爽点密度、叙述口吻和回收要求先写死，后续生成与审稿都按这套约束走。",
    },
  ];
}

function buildResearchOptions(summary: OnboardingSummary) {
  const joinedText = [
    summary.metadata.genreHint ?? "",
    summary.sections.projectBasics,
    summary.sections.worldRules,
  ].join("\n");

  const needsLawAndGeo = /(港综|历史|金融|警务|官场|地理|城市|法规)/.test(joinedText);
  const needsScience = /(科幻|赛博|硬核|医学|刑侦)/.test(joinedText);

  return dedupeRecommendedOptions([
    needsLawAndGeo
      ? {
          label: "查制度与地理",
          value: "需要补金融法规、地理细节、制度流程或平台规则，但这些外部事实只作为 findings 和 Prompt 辅助，不直接改剧情事实。",
        }
      : {
          label: "只查现实外壳",
          value: "需要补少量现实外壳信息，例如地理、行业流程或时代细节，但人物关系和剧情主线仍以内设为准。",
        },
    needsScience
      ? {
          label: "查专业细节",
          value: "涉及专业细节的部分需要外部事实补充，例如技术、医学或侦查流程，但写作时要保留可读性优先。",
        }
      : {
          label: "暂不开强考据",
          value: "当前阶段不需要重考据，先把世界观、冲突和写作约束搭稳，后面再按章节需要补外部事实。",
        },
    {
      label: "MCP 只做辅助",
      value: "如果后续接 MCP 或外部搜索，只让它补真实世界事实和平台规则，不让它覆盖项目正式设定与当前状态。",
    },
  ]);
}

function buildOnboardingRecommendedOptions(question: OnboardingQuestion, summary: OnboardingSummary) {
  switch (question.key) {
    case "project_basics":
      return buildProjectBasicsOptions(summary);
    case "core_conflict":
      return dedupeRecommendedOptions(buildCoreConflictOptions(summary));
    case "world_rules":
      return dedupeRecommendedOptions(buildWorldRuleOptions(summary));
    case "factions":
      return dedupeRecommendedOptions(buildFactionOptions(summary));
    case "style_rules":
      return dedupeRecommendedOptions(buildStyleRuleOptions(summary));
    case "research_needs":
      return buildResearchOptions(summary);
    default:
      return [];
  }
}

export function buildSeededProjectBasicsAnswer(input: OnboardingSeedInput) {
  const name = cleanSeedField(input.name)?.replace(/[《》]/g, "").trim() ?? null;
  const genre = cleanSeedField(input.genre);
  const platform = cleanSeedField(input.platform);
  const lengthHint = cleanSeedField(input.lengthHint);
  const era = cleanSeedField(input.era);
  const keywords = cleanSeedField(input.keywords);
  const parts: string[] = [];

  if (name) {
    parts.push(`暂定名《${name}》`);
  }

  if (genre) {
    parts.push(`题材是${genre}`);
  }

  if (platform) {
    parts.push(`发布平台偏${platform}`);
  }

  if (lengthHint) {
    parts.push(`预估篇幅先按${lengthHint}`);
  }

  if (era) {
    parts.push(`时代/背景设定在${era}`);
  }

  if (keywords) {
    parts.push(`关键词包括${keywords}`);
  }

  return parts.length > 0 ? `${parts.join("，")}。` : "";
}

export function buildOnboardingSeedAnswers(input: OnboardingSeedInput) {
  const seededProjectBasics = buildSeededProjectBasicsAnswer(input);

  if (!seededProjectBasics) {
    return [] satisfies OnboardingAnswerEntry[];
  }

  return [
    {
      questionKey: "project_basics" as const,
      answer: seededProjectBasics,
      skipped: false,
      updatedAt: new Date().toISOString(),
    },
  ] satisfies OnboardingAnswerEntry[];
}

export function getOnboardingQuestion(index: number) {
  return ONBOARDING_QUESTIONS[index] ?? null;
}

export function normalizeOnboardingAnswers(value: unknown): OnboardingAnswerEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((row) => {
    if (!isRecord(row) || typeof row.questionKey !== "string") {
      return [];
    }

    const question = QUESTION_BY_KEY.get(row.questionKey as OnboardingQuestionKey);
    if (!question) {
      return [];
    }

    return [
      {
        questionKey: question.key,
        answer: typeof row.answer === "string" ? sanitizeAnswer(row.answer) : "",
        skipped: Boolean(row.skipped),
        updatedAt:
          typeof row.updatedAt === "string" && row.updatedAt.trim() ? row.updatedAt : new Date(0).toISOString(),
      },
    ];
  });
}

export function upsertOnboardingAnswer(
  answers: OnboardingAnswerEntry[],
  questionKey: OnboardingQuestionKey,
  answer: string,
  skipped: boolean,
) {
  const nextEntry: OnboardingAnswerEntry = {
    questionKey,
    answer: sanitizeAnswer(answer),
    skipped,
    updatedAt: new Date().toISOString(),
  };

  const existingIndex = answers.findIndex((entry) => entry.questionKey === questionKey);
  if (existingIndex === -1) {
    return [...answers, nextEntry];
  }

  return answers.map((entry, index) => (index === existingIndex ? nextEntry : entry));
}

export function getRemainingOnboardingQuestions(answers: OnboardingAnswerEntry[]) {
  const resolved = new Set(
    answers
      .filter((entry) => Boolean(entry.answer) || entry.skipped)
      .map((entry) => entry.questionKey),
  );

  return ONBOARDING_QUESTIONS.filter((question) => !resolved.has(question.key));
}

export function buildOnboardingSummary(
  answers: OnboardingAnswerEntry[],
  options: BuildOnboardingSummaryOptions = {},
): OnboardingSummary {
  const projectBasics = readAnswer(answers, "project_basics");
  const coreConflict = readAnswer(answers, "core_conflict");
  const worldRules = readAnswer(answers, "world_rules");
  const factions = readAnswer(answers, "factions");
  const styleRules = readAnswer(answers, "style_rules");
  const researchNeeds = readAnswer(answers, "research_needs");
  const answeredCount = answers.filter((entry) => entry.answer || entry.skipped).length;
  const mode = options.mode ?? "fallback";
  const runtime = options.runtime ?? null;
  const dynamicHistory = mode === "ai_dynamic" ? normalizeDynamicOnboardingHistory(options.dynamicHistory) : [];
  const answersView = ONBOARDING_QUESTIONS.map((question) => {
    const answerEntry = answers.find((entry) => entry.questionKey === question.key);
    return {
      questionKey: question.key,
      title: question.title,
      answer: answerEntry?.answer ?? "",
      skipped: answerEntry?.skipped ?? false,
    };
  });

  return {
    metadata: {
      nameHint: inferNameHint(projectBasics),
      genreHint: findKnownToken(projectBasics, KNOWN_GENRES),
      platformHint: findKnownToken(projectBasics, KNOWN_PLATFORMS),
      lengthHint: inferLengthHint(projectBasics),
      requiresResearch: /考据|资料|外部事实|搜索|MCP|联网|法规|设定核查/i.test(researchNeeds),
    },
    sections: {
      projectBasics,
      coreConflict,
      worldRules,
      factions,
      styleRules,
      researchNeeds,
    },
    answers: answersView,
    recommendedNextSteps: [
      "确认项目名、题材、平台后再创建项目。",
      "把主角目标、世界规则和写作边界写进标准 artifact，避免后续生成漂移。",
      researchNeeds
        ? "需要考据的部分先进入 findings / Prompt overlay，不直接改写正式剧情事实。"
        : "暂未声明强考据需求，可先把世界观和写作约束补齐。",
    ],
    completion: {
      answeredCount,
      totalQuestions: ONBOARDING_QUESTIONS.length,
      isReadyToFinalize: answeredCount >= ONBOARDING_QUESTIONS.length,
    },
    mode,
    runtime,
    dynamic: {
      isAiDriven: mode === "ai_dynamic",
      history: dynamicHistory,
    },
  };
}

function buildFallbackCurrentQuestion(
  currentQuestionIndex: number,
  answers: OnboardingAnswerEntry[],
  summary: OnboardingSummary,
) {
  const currentQuestion = getOnboardingQuestion(currentQuestionIndex);
  if (!currentQuestion) {
    return null;
  }

  return {
    ...currentQuestion,
    answer: readAnswer(answers, currentQuestion.key),
    recommendedOptions: buildOnboardingRecommendedOptions(currentQuestion, summary),
    source: "fallback" as const,
  };
}

function buildAiDynamicCurrentQuestion(answers: OnboardingAnswerEntry[], summary: OnboardingSummary) {
  const currentQuestion = summary.dynamic.history.at(-1);
  if (!currentQuestion) {
    return null;
  }

  return {
    key: currentQuestion.key,
    title: currentQuestion.title,
    prompt: currentQuestion.prompt,
    placeholder: currentQuestion.placeholder,
    optional: currentQuestion.optional,
    answer: readAnswer(answers, currentQuestion.key),
    recommendedOptions: currentQuestion.recommendedOptions,
    source: "ai" as const,
  };
}

export function normalizeOnboardingSummary(value: unknown, answers?: OnboardingAnswerEntry[]) {
  const normalizedAnswers =
    answers ?? (isRecord(value) ? normalizeOnboardingAnswers((value as { answers?: unknown }).answers) : []);
  const options = extractOnboardingSummaryOptions(value);
  return buildOnboardingSummary(normalizedAnswers, options);
}

export function serializeOnboardingSession(session: {
  id: string;
  status: "active" | "ready" | "finalized";
  currentQuestionIndex: number;
  answers: unknown;
  summary: unknown;
  finalizedProjectId: string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): OnboardingSessionPayload {
  const answers = normalizeOnboardingAnswers(session.answers);
  const summary = normalizeOnboardingSummary(session.summary, answers);
  const currentQuestion =
    session.status === "active"
      ? summary.mode === "ai_dynamic"
        ? buildAiDynamicCurrentQuestion(answers, summary)
        : buildFallbackCurrentQuestion(session.currentQuestionIndex, answers, summary)
      : null;

  return {
    id: session.id,
    status: session.status,
    currentQuestionIndex: session.currentQuestionIndex,
    totalQuestions: ONBOARDING_QUESTIONS.length,
    currentQuestion,
    answers,
    summary,
    mode: summary.mode,
    runtime: summary.runtime,
    finalizedProjectId: session.finalizedProjectId ?? null,
    completedAt: session.completedAt ? new Date(session.completedAt).toISOString() : null,
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: new Date(session.updatedAt).toISOString(),
  };
}

export function buildOnboardingBootstrapPackage(input: BootstrapPackageInput): BootstrapPackage {
  const { name, genre, platform, summary } = input;
  const basics = summary.sections.projectBasics;
  const conflict = summary.sections.coreConflict;
  const worldRules = summary.sections.worldRules;
  const factions = summary.sections.factions;
  const styleRules = summary.sections.styleRules;
  const researchNeeds = summary.sections.researchNeeds;
  const nextStepLines = [
    `项目已按 AI 引导式初始化完成 bootstrap：${name}。`,
    "优先检查 onboarding_brief、project_prompt_pack、project_skill_pack 三个项目级 overlay 文件。",
    "接下来建议先执行 generate_setting / generate_outline，再进入章节生成。",
  ];

  return {
    artifactContentOverrides: {
      story_background: renderMarkdownDocument("story background", [
        { heading: "题材定位", body: basics || `项目名：${name}\n题材：${genre}\n平台：${platform}` },
        { heading: "故事前提", body: conflict || basics },
        { heading: "核心矛盾", body: conflict },
        { heading: "读者收益逻辑", body: styleRules || "先用 onboarding 结果定义平台收益逻辑，后续在写作规则里细化。" },
      ]),
      world_bible: renderMarkdownDocument("world bible", [
        { heading: "世界规则", body: worldRules },
        { heading: "地图与地理", body: factions || "根据当前势力关系继续补地图与活动范围。" },
        { heading: "能力体系", body: worldRules },
        { heading: "禁忌与限制", body: worldRules || researchNeeds },
      ]),
      protagonist_card: renderMarkdownDocument("protagonist card", [
        { heading: "角色定位", body: conflict || basics },
        { heading: "核心动机", body: conflict },
        { heading: "能力与短板", body: worldRules || conflict },
        { heading: "关系锚点", body: factions },
      ]),
      factions_and_characters: renderMarkdownDocument("factions and characters", [
        { heading: "势力清单", body: factions },
        { heading: "主要角色", body: factions || conflict },
        { heading: "利益链", body: `${conflict || "_待补充_"}\n\n${factions || ""}`.trim() },
        { heading: "敌我格局", body: factions || conflict },
      ]),
      writing_rules: renderMarkdownDocument("writing rules", [
        { heading: "平台与题材", body: `项目名：${name}\n题材：${genre}\n平台：${platform}\n\n${basics}`.trim() },
        { heading: "风格边界", body: styleRules },
        { heading: "主角路线", body: conflict },
        { heading: "禁写清单", body: styleRules || "禁止脱离当前 onboarding 结论随意改主角路线和世界规则。" },
        { heading: "输出要求", body: researchNeeds || "默认按项目级 Prompt / Skill overlay 继续细化输出。"},
      ]),
      task_plan: renderMarkdownDocument("task plan", [
        { heading: "目标", body: conflict || `完成 ${name} 的项目 bootstrap，并开始设定与卷纲沉淀。` },
        { heading: "当前阶段", body: "已完成 AI 引导式初始化，下一步进入标准 artifact 工作流。" },
        { heading: "关键问题", body: researchNeeds || worldRules || "_待补充_" },
        { heading: "决策记录", body: `${basics || "_待补充_"}\n\n${styleRules || ""}`.trim() },
        { heading: "风险与阻塞", body: researchNeeds || "当前最大风险是 world_bible / protagonist_card 仍需进一步细化。" },
      ]),
    },
    extraArtifacts: [
      {
        artifactKey: "onboarding_brief",
        filename: "onboarding_brief.md",
        kind: "project_setting",
        summary: "AI onboarding brief",
        content: renderMarkdownDocument("onboarding brief", [
          { heading: "项目名", body: name },
          { heading: "题材 / 平台", body: `题材：${genre}\n平台：${platform}` },
          { heading: "问答摘要", body: summary.answers.map((entry) => `### ${entry.title}\n${entry.answer || "_已跳过_"}`).join("\n\n") },
          { heading: "下一步建议", body: renderBulletList(summary.recommendedNextSteps) },
        ]),
      },
      {
        artifactKey: "project_prompt_pack",
        filename: "project_prompt_pack.md",
        kind: "project_setting",
        summary: "Project prompt overlay pack",
        content: renderMarkdownDocument("project prompt pack", [
          {
            heading: "使用边界",
            body:
              "这是项目级 Prompt overlay，只补充表达风格、叙事重点、场景偏好和审稿关注点。\n不得覆盖全局安全约束、输出合同或既有正式剧情事实。",
          },
          { heading: "写作偏好", body: styleRules || basics },
          { heading: "叙事重点", body: conflict || factions },
          { heading: "场景偏好与禁忌", body: `${worldRules || "_待补充_"}\n\n${styleRules || ""}`.trim() },
          { heading: "审稿关注点", body: researchNeeds || "重点检查世界规则一致性、主角收益链和节奏控制。" },
        ]),
      },
      {
        artifactKey: "project_skill_pack",
        filename: "project_skill_pack.md",
        kind: "project_setting",
        summary: "Project skill overlay pack",
        content: renderMarkdownDocument("project skill pack", [
          {
            heading: "使用边界",
            body:
              "这是项目级 Skill overlay，用来强调本项目在 planner / writer / reviewer / researcher 之间的偏重，不替换系统级 Skills 组合。",
          },
          {
            heading: "Writer 偏重",
            body: styleRules || "保持网文节奏、爽点推进和章节钩子稳定输出。",
          },
          {
            heading: "Reviewer 偏重",
            body: `重点核查：${researchNeeds || "设定一致性、冲突推进、收益链清晰度、文风稳定性。"}`,
          },
          {
            heading: "Researcher 偏重",
            body: researchNeeds || "默认仅在外部事实高风险时启用考据，不把搜索结果直接写进正式剧情事实。",
          },
          {
            heading: "Bootstrap 后动作",
            body: renderBulletList(nextStepLines),
          },
        ]),
      },
    ],
  };
}
