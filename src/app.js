import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CircleGauge,
  ClipboardList,
  createIcons,
  Download,
  LayoutDashboard,
  Library,
  ListChecks,
  Map as MapIcon,
  RefreshCw,
  RotateCcw,
  Settings,
  Upload,
  UserRound
} from "lucide";

import {
  designReferences,
  executionBoundaries,
  sourceRegistry
} from "./referenceData.js";

import {
  getCurrentUser,
  loadCloudState,
  onAuthChange,
  saveCloudSnapshot,
  saveCloudState,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  supabaseConfigured
} from "./supabaseSync.js";

import {
  escapeAttr,
  escapeHTML as escapeHtml,
  safeExternalUrl
} from "./utils/html.js";

import {
  collectCarryoverTasks,
  isTaskDone,
  markCarriedSourceTasks
} from "./domain/task-carryover.js";

import {
  DEFAULT_PLAN_CONTROLS,
  applyPlanControls,
  buildRollingReviewWindows,
  getPhaseStrategy,
  getSyllabusFramework,
  normalizePlanControls,
  recommendPlanAdjustment,
  reviewLoadSignal,
  strategySources,
  subjectKey,
  subjectLabel,
  subjectPlanWeights
} from "./domain/study-strategy.js";

const STORAGE_KEY = "pku_swm_420_dashboard_v3";
const LEGACY_STORAGE_KEY = "pku_swm_420_dashboard_v1";
const SCHEMA_VERSION = 3;
const PLAN_LOGIC_VERSION = "3.4-start-2026-06-08-evidence";
const APP_BUILD = "2026-06-08-420-evidence-workbench";
const DEFAULT_EXAM_DATE = "2027-12-25";
const DEFAULT_EXAM_DATE_STATUS = "推算排程日，非官方初试日期";
const PLAN_START_DATE = "2026-06-08";
const TARGET_TOTAL_HOURS = 2660;
const SOURCE_CHECK_DATE = "2026-06-08";
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}
const appIcons = {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CircleGauge,
  ClipboardList,
  Download,
  LayoutDashboard,
  Library,
  ListChecks,
  Map: MapIcon,
  RefreshCw,
  RotateCcw,
  Settings,
  Upload,
  UserRound
};

const defaultSettings = {
  weekdayMinutes: 120,
  weekendMinutes: 210,
  taskCount: 3,
  coreRatio: 65,
  density: "focus",
  lastExportDate: "",
  targetExamDate: DEFAULT_EXAM_DATE,
  reviewDays: [1, 3, 7, 14, 30],
  planControls: { ...DEFAULT_PLAN_CONTROLS }
};

let storageAvailable = true;

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    storageAvailable = false;
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
    storageAvailable = true;
    return true;
  } catch {
    storageAvailable = false;
    return false;
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
}

function clearAppLocalStorage() {
  [
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    "pku_swm_420_state",
    "pku_swm_dirty_map",
    "pku_swm_offline_cache",
    "pku_swm_dirty_queue"
  ].forEach(removeStorage);
}

function consumeResetRequest() {
  try {
    const url = new URL(window.location.href);
    const resetValue = url.searchParams.get("reset");
    if (!["1", "true", "yes"].includes(String(resetValue || "").toLowerCase())) return false;
    clearAppLocalStorage();
    url.searchParams.delete("reset");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash || "#dashboard"}`);
    return true;
  } catch {
    return false;
  }
}

const rampBudgets = [
  { start: PLAN_START_DATE, end: "2026-06-30", weekday: 90, weekend: 150, note: "6 月 8 日重启，先恢复连续记录和底线任务" },
  { start: "2026-07-01", end: "2026-07-31", weekday: 120, weekend: 210, note: "暑假前段稳步加量" },
  { start: "2026-08-01", end: "2026-08-31", weekday: 150, weekend: 240, note: "暑假后段稳定加量" },
  { start: "2026-09-01", end: "2026-12-31", weekday: 270, weekend: 390, note: "9 月起第一轮主干加压" },
  { start: "2027-01-01", end: "2027-02-28", weekday: 330, weekend: 450, note: "寒假第一轮收口" },
  { start: "2027-03-01", end: "2027-06-30", weekday: 240, weekend: 360, note: "强化期稳定推进" },
  { start: "2027-07-01", end: "2027-08-31", weekday: 360, weekend: 480, note: "第二暑假套卷期" },
  { start: "2027-09-01", end: "2027-10-31", weekday: 270, weekend: 390, note: "报名与套卷期" },
  { start: "2027-11-01", end: DEFAULT_EXAM_DATE, weekday: 240, weekend: 360, note: "考前收束期" }
];

const resetApplied = consumeResetRequest();
let state = loadState();
let currentUser = null;
let syncTimer = null;
let appStarted = false;
let legacyImportPending = Boolean(readStorage(LEGACY_STORAGE_KEY) && !readStorage(STORAGE_KEY));
let lastAuthResult = {
  status: "idle",
  title: "账号状态",
  message: "填写邮箱和密码后，可以注册新账号或登录同步。"
};

const phases = [
  {
    id: "A",
    name: "启动期",
    start: PLAN_START_DATE,
    end: "2026-06-30",
    weeklyTarget: 12,
    cumulativeTarget: 40,
    quotas: { math: 5, cs408: 5, english: 2, politics: 0, project: 0 },
    focus: "上课期低强度启动，建立记录系统，高数预备、C 语言和英语单词不断档。",
    tasks: [
      ["数学", "函数、极限预备和基础题", 45],
      ["408", "C 语言变量、循环、数组入门", 45],
      ["英语", "单词 20 分钟或长难句 1 组", 20],
      ["复盘", "记录错题原因，写明天第一任务", 10]
    ]
  },
  {
    id: "B",
    name: "第一暑假奠基期",
    start: "2026-07-01",
    end: "2026-08-31",
    weeklyTarget: 22,
    cumulativeTarget: 230,
    quotas: { math: 9, cs408: 9, english: 4, politics: 0, project: 0 },
    focus: "暑假逐步拉长学习时间，高数基础、数据结构第一轮和英语阅读精读同步推进。",
    tasks: [
      ["数学", "高数基础题与定义整理", 75],
      ["408", "C 语言/数据结构章节题与代码", 75],
      ["英语", "单词 + 长难句或阅读精读", 35],
      ["复盘", "错题回炉，更新考纲状态", 20]
    ]
  },
  {
    id: "C",
    name: "第一轮主干期",
    start: "2026-09-01",
    end: "2026-12-31",
    weeklyTarget: 35,
    cumulativeTarget: 830,
    quotas: { math: 14, cs408: 15, english: 5, politics: 0, project: 1 },
    focus: "9 月起进入加压期，数学一第一轮主干、408 数据结构二轮、计组和 OS 启动。",
    tasks: [
      ["数学", "高数/线代/概率一轮推进 + 章节题", 110],
      ["408", "计组或 OS 章节学习 + 题目", 110],
      ["英语", "真题阅读精读或长难句", 40],
      ["复盘", "本章错题按知识点归档", 15]
    ]
  },
  {
    id: "D",
    name: "寒假收口期",
    start: "2027-01-01",
    end: "2027-02-28",
    weeklyTarget: 42,
    cumulativeTarget: 1180,
    quotas: { math: 16, cs408: 18, english: 5, politics: 0, project: 3 },
    focus: "数学一和 408 四门第一轮闭合，形成知识框架。",
    tasks: [
      ["数学", "概率闭合或三大模块框架复盘", 150],
      ["408", "OS/计网闭合，画四门知识图", 150],
      ["英语", "阅读真题 + 翻译小练", 60],
      ["项目", "复试项目最小版本推进", 45]
    ]
  },
  {
    id: "E",
    name: "强化期",
    start: "2027-03-01",
    end: "2027-06-30",
    weeklyTarget: 31,
    cumulativeTarget: 1720,
    quotas: { math: 12, cs408: 13, english: 5, politics: 0, project: 1 },
    focus: "强化题型、真题分章节、项目能运行。",
    tasks: [
      ["数学", "二轮强化题型 + 限时训练", 120],
      ["408", "四门专题强化 + 真题分章节", 120],
      ["英语", "阅读二刷，翻译/新题型加入", 45],
      ["项目", "项目 README、数据库或核心算法完善", 30]
    ]
  },
  {
    id: "F",
    name: "第二暑假套卷期",
    start: "2027-07-01",
    end: "2027-08-31",
    weeklyTarget: 44,
    cumulativeTarget: 2100,
    quotas: { math: 15, cs408: 17, english: 5, politics: 5, project: 2 },
    focus: "真题套卷、全科成型，政治启动。",
    tasks: [
      ["数学", "真题套卷或专项补弱", 160],
      ["408", "真题套卷 + 高频大题专题", 170],
      ["英语", "阅读保持 + 作文模板启动", 60],
      ["政治", "基础框架 + 选择题", 60]
    ]
  },
  {
    id: "G",
    name: "报名与套卷期",
    start: "2027-09-01",
    end: "2027-10-31",
    weeklyTarget: 37,
    cumulativeTarget: 2420,
    quotas: { math: 13, cs408: 13, english: 4, politics: 7, project: 0 },
    focus: "核验招生信息，完成报名确认，近 5 套全科均分稳定在 405+ 区间。",
    tasks: [
      ["数学", "套卷限时 + 48 小时错题回炉", 120],
      ["408", "套卷限时 + 四门错题归档", 120],
      ["英语", "作文定稿 + 阅读手感", 45],
      ["政治", "选择题强化 + 背诵手册", 50]
    ]
  },
  {
    id: "H",
    name: "考前收束期",
    start: "2027-11-01",
    end: "2027-12-25",
    weeklyTarget: 31,
    cumulativeTarget: TARGET_TOTAL_HOURS,
    quotas: { math: 10, cs408: 10, english: 4, politics: 7, project: 0 },
    focus: "模拟、错题、背诵和手感维持，近 10 套均分稳定在 415+ 区间。",
    tasks: [
      ["数学", "模拟卷错题回炉 + 公式定理默写", 110],
      ["408", "真题错题重做 + 大题表达规范", 110],
      ["英语", "作文默写 + 阅读保持", 45],
      ["政治", "当年版预测资料、时政、主观题背诵", 70]
    ]
  }
];

const monthlyPlan = [
  ["2026-06", 40, 40, "函数、极限预备", "C 语言入门", "单词、长难句", "连续记录"],
  ["2026-07", 90, 130, "极限、导数启动", "C 语言、线性表", "阅读入门", "不测"],
  ["2026-08", 100, 230, "高数基础、线代预热", "数据结构第一轮", "阅读精读", "不测"],
  ["2026-09", 150, 380, "高数推进", "数据结构二轮、计组", "阅读真题", "章节小测"],
  ["2026-10", 150, 530, "线代推进", "计组", "阅读真题", "章节小测"],
  ["2026-11", 150, 680, "概率启动", "计组、OS", "翻译小练", "章节小测"],
  ["2026-12", 150, 830, "第一轮收口", "OS 推进", "阅读复盘", "章节测"],
  ["2027-01", 180, 1010, "概率闭合", "OS、计网", "阅读", "基础综合"],
  ["2027-02", 170, 1180, "二轮启动", "四门闭合", "阅读", "数学90-105，408 85-100"],
  ["2027-03", 130, 1310, "强化", "四门强化", "阅读二刷", "小综合"],
  ["2027-04", 135, 1445, "强化", "专题强化", "翻译新题型", "小综合"],
  ["2027-05", 135, 1580, "真题分章节", "真题分章节", "作文预热", "小综合"],
  ["2027-06", 140, 1720, "强化验收", "强化验收", "英语70+", "全科约360"],
  ["2027-07", 190, 1910, "真题套卷", "真题套卷", "政治启动", "全科375+"],
  ["2027-08", 190, 2100, "套卷补弱", "套卷补弱", "政治选择题", "全科390+"],
  ["2027-09", 160, 2260, "套卷", "套卷", "作文定稿、政治", "全科400+"],
  ["2027-10", 160, 2420, "套卷稳定", "套卷稳定", "政治强化", "近 5 套 405+"],
  ["2027-11", 150, 2570, "模拟错题", "模拟错题", "背诵", "近10套415+"],
  ["2027-12", 90, TARGET_TOTAL_HOURS, "保持手感", "保持手感", "背诵收束", "目标420"]
];

const scoreTargets = [
  ["政治", 75, "后期稳定拿分"],
  ["英语一", 80, "长期积累，不拖后腿"],
  ["数学一", 130, "决定上限的第一核心"],
  ["408", 135, "跨考最需要稳定的第二核心"]
];

const liveFactChecks = [
  {
    label: "招生科目",
    status: "已核验",
    value: "101 / 201 / 301 / 408",
    detail: "北大软微 2026 电子信息 01-04 方向统考科目一致；2028 入学当年仍需复核。",
    source: "北京大学软件与微电子学院"
  },
  {
    label: "历史复试线",
    status: "历史参考",
    value: "2026：378",
    detail: "电子信息 01-04 方向政治 55、外语 55、业务课 90/90、总分 378；不作为未来预测。",
    source: "北大软微复试通知"
  },
  {
    label: "考试日期",
    status: "待发布",
    value: "2027-12-25 推算",
    detail: "正式日期以教育部和研招网当年公告为准，系统会把该项保持为待复核。",
    source: "教育部 / 研招网"
  },
  {
    label: "学习方法",
    status: "有研究依据",
    value: "主动回忆 + 分散复盘",
    detail: "计划只使用练习测试、提取练习、间隔复习等有证据支持的学习动作。",
    source: "Dunlosky 2013 / Karpicke 2008"
  }
];

const firstMonthActions = [
  {
    week: "第 1 周",
    tasks: ["6 月 8 日重新建档", "确定数学主线资料", "确定 408 主线资料", "确定英语单词工具", "函数图像与常用初等函数", "C 语言变量、分支、循环", "英语每天单词"],
    pass: "9-11h；连续记录 7 天；能写循环程序；数学预备题有错因记录。"
  },
  {
    week: "第 2 周",
    tasks: ["数列和函数极限预备", "C 语言数组和函数", "顺序表概念预习", "英语长难句 2 组"],
    pass: "12-14h；能写数组遍历和函数；极限预备题正确率有记录。"
  },
  {
    week: "第 3 周",
    tasks: ["极限与连续入门", "C 语言指针入门", "顺序表插入删除", "英语阅读 1 篇精读"],
    pass: "12-14h；能写顺序表基本操作；极限基础题有订正。"
  },
  {
    week: "第 4 周",
    tasks: ["导数定义预习", "链表概念预习", "英语阅读 2 篇", "6 月月度复盘"],
    pass: "6 月 8 日起累计 40h 左右；数学和 408 占比 60%+；写出 7-8 月暑假加量表。"
  }
];

const resourceProgressItems = [
  ["数学主线讲义", "math-main"],
  ["数学习题集", "math-practice"],
  ["数学一真题", "math-real"],
  ["408 主线资料", "cs-main"],
  ["408 真题", "cs-real"],
  ["英语单词", "eng-words"],
  ["英语真题阅读", "eng-reading"],
  ["政治选择题", "pol-choice"]
];

const syllabusGroupTypeMeta = {
  official: {
    label: "官方范围映射",
    note: "条目为备考拆解，不等同官方逐字大纲。"
  },
  prerequisite: {
    label: "预备能力",
    note: "用于补齐进入考研内容前的基础能力。"
  },
  supplement: {
    label: "备考补充",
    note: "用于执行和复盘，不作为官方考试范围声明。"
  }
};

const syllabusGroupTypes = {
  "math/高数预备": "prerequisite",
  "cs408/C 与算法预备": "prerequisite"
};

const syllabus = {
  math: {
    title: "数学一",
    groups: [
      ["高数预备", ["函数性质与图像", "常用初等函数", "三角恒等变换", "不等式与绝对值", "数列基础", "常用代数变形"]],
      ["极限与连续", ["数列极限", "函数极限", "无穷小与无穷大", "等价无穷小", "洛必达法则", "泰勒公式初步", "函数连续性", "间断点分类"]],
      ["一元微分学", ["导数定义", "求导法则", "高阶导数", "隐函数求导", "参数方程求导", "微分", "单调性", "极值与最值", "凹凸性与拐点", "渐近线"]],
      ["中值定理", ["罗尔定理", "拉格朗日中值定理", "柯西中值定理", "泰勒中值定理", "证明题常见构造"]],
      ["一元积分学", ["原函数与不定积分", "换元积分", "分部积分", "有理函数积分", "定积分定义", "定积分性质", "变限积分", "反常积分", "定积分应用"]],
      ["多元微分学", ["多元函数极限与连续", "偏导数", "全微分", "复合函数求导", "隐函数求导", "方向导数与梯度", "多元极值", "条件极值"]],
      ["重积分", ["二重积分概念", "直角坐标计算", "极坐标计算", "交换积分次序", "三重积分概念", "柱坐标与球坐标", "重积分应用"]],
      ["曲线曲面积分", ["第一类曲线积分", "第二类曲线积分", "格林公式", "第一类曲面积分", "第二类曲面积分", "高斯公式", "斯托克斯公式"]],
      ["级数", ["常数项级数", "正项级数判别", "交错级数", "绝对收敛与条件收敛", "幂级数", "函数展开为幂级数", "傅里叶级数基础"]],
      ["微分方程", ["一阶微分方程", "可降阶高阶方程", "二阶常系数线性方程", "差分方程基础", "微分方程应用"]],
      ["线性代数", ["行列式计算", "矩阵运算", "逆矩阵", "矩阵秩", "向量组线性相关", "极大无关组", "线性方程组", "特征值与特征向量", "相似对角化", "实对称矩阵", "二次型", "正定矩阵"]],
      ["概率统计", ["随机事件", "古典概型", "条件概率", "全概率与贝叶斯", "随机变量及分布", "常见离散分布", "常见连续分布", "二维随机变量", "边缘分布", "条件分布", "独立性", "期望", "方差", "协方差与相关系数", "大数定律", "中心极限定理", "样本与统计量", "参数估计"]]
    ]
  },
  cs408: {
    title: "408",
    groups: [
      ["C 与算法预备", ["变量与表达式", "条件与循环", "数组", "函数", "指针", "结构体", "递归", "复杂度分析", "伪代码书写"]],
      ["数据结构-线性结构", ["顺序表", "单链表", "双链表", "栈", "队列", "循环队列", "串的基本概念", "KMP 思想"]],
      ["数据结构-树", ["树的基本概念", "二叉树性质", "二叉树遍历", "线索二叉树", "树与森林", "哈夫曼树", "二叉排序树", "平衡二叉树", "B 树与 B+ 树"]],
      ["数据结构-图", ["图的存储", "DFS", "BFS", "最小生成树", "最短路径", "拓扑排序", "关键路径"]],
      ["数据结构-查找排序", ["顺序查找", "折半查找", "散列表", "插入排序", "交换排序", "选择排序", "归并排序", "基数排序", "外部排序基础"]],
      ["计组-数据表示", ["进制转换", "定点数表示", "补码运算", "浮点数表示", "IEEE754", "校验码"]],
      ["计组-运算与指令", ["ALU", "加减运算", "乘除运算", "指令格式", "寻址方式", "CISC 与 RISC"]],
      ["计组-CPU", ["CPU 基本结构", "指令执行过程", "数据通路", "控制器", "硬布线控制", "微程序控制", "流水线性能", "流水线冒险"]],
      ["计组-存储与 I/O", ["存储层次", "主存组织", "Cache 映射", "Cache 替换", "虚拟存储器", "总线", "程序查询 I/O", "中断 I/O", "DMA"]],
      ["OS-进程线程", ["进程概念", "进程状态转换", "进程控制", "线程", "处理机调度", "调度算法"]],
      ["OS-同步死锁", ["临界区", "信号量", "管程", "经典同步问题", "死锁条件", "死锁预防", "死锁避免", "银行家算法", "死锁检测解除"]],
      ["OS-内存文件 I/O", ["连续分配", "分页管理", "分段管理", "段页式", "虚拟内存", "页面置换", "文件逻辑结构", "目录结构", "磁盘调度", "设备管理"]],
      ["计网-基础与链路", ["分层体系结构", "性能指标", "物理层基础", "编码与调制", "传输介质", "差错控制", "流量控制", "可靠传输", "以太网", "交换机"]],
      ["计网-网络层", ["IP 地址", "子网划分", "CIDR", "ARP", "DHCP", "ICMP", "路由选择", "RIP", "OSPF", "BGP", "IPv6"]],
      ["计网-传输与应用", ["UDP", "TCP 报文段", "三次握手", "四次挥手", "可靠传输", "滑动窗口", "流量控制", "拥塞控制", "DNS", "HTTP", "电子邮件", "FTP"]]
    ]
  },
  english: {
    title: "英语一",
    groups: [
      ["词汇", ["高频核心词", "熟词僻义", "词根词缀", "真题生词本", "固定搭配", "同义替换"]],
      ["语法长难句", ["句子成分", "从句识别", "非谓语结构", "插入语", "倒装与强调", "长句切分", "翻译顺序"]],
      ["阅读理解", ["定位句识别", "主旨题", "细节题", "推断题", "态度题", "例证题", "词义题", "选项干扰类型"]],
      ["新题型", ["段落排序", "小标题匹配", "句子填空", "上下文衔接", "逻辑连接词"]],
      ["翻译", ["定语从句翻译", "状语从句翻译", "被动语态", "代词指代", "汉语语序重组"]],
      ["完形填空", ["逻辑关系", "词义辨析", "固定搭配", "上下文复现"]],
      ["作文", ["小作文格式", "通知/建议信/道歉信", "图画作文", "观点展开", "模板默写", "限时写作", "语料纠错"]]
    ]
  },
  politics: {
    title: "政治",
    groups: [
      ["马原", ["哲学基本问题", "唯物论", "辩证法", "认识论", "唯物史观", "政治经济学", "科学社会主义"]],
      ["毛中特", ["毛泽东思想", "新民主主义革命", "社会主义改造", "中特理论体系", "新时代思想", "高质量发展", "现代化建设"]],
      ["史纲", ["旧民主主义革命", "新民主主义革命", "社会主义革命", "改革开放史", "重要会议", "历史人物与事件"]],
      ["思修法基", ["人生观", "理想信念", "中国精神", "社会主义核心价值观", "道德规范", "法治思想", "宪法法律基础"]],
      ["当代与时政", ["国际格局", "大国关系", "中国外交", "年度会议", "重要讲话", "热点专题"]],
      ["主观题", ["原理表达", "材料定位", "关键词默写", "当年版预测题背诵", "时政整合", "答题层次"]]
    ]
  }
};

const foundationDailySequence = {
  math: [
    ["高数预备", "函数性质与图像"],
    ["高数预备", "常用初等函数"],
    ["高数预备", "常用代数变形"],
    ["极限与连续", "数列极限"],
    ["极限与连续", "函数极限"],
    ["极限与连续", "无穷小与无穷大"],
    ["极限与连续", "等价无穷小"],
    ["极限与连续", "洛必达法则"],
    ["极限与连续", "函数连续性"],
    ["极限与连续", "间断点分类"],
    ["一元微分学", "导数定义"],
    ["一元微分学", "求导法则"],
    ["一元微分学", "高阶导数"],
    ["一元微分学", "隐函数求导"],
    ["一元微分学", "参数方程求导"],
    ["一元微分学", "微分"],
    ["一元微分学", "单调性"],
    ["一元微分学", "极值与最值"],
    ["一元微分学", "凹凸性与拐点"],
    ["一元微分学", "渐近线"],
    ["中值定理", "罗尔定理"],
    ["中值定理", "拉格朗日中值定理"],
    ["中值定理", "证明题常见构造"],
    ["一元积分学", "原函数与不定积分"],
    ["一元积分学", "换元积分"],
    ["一元积分学", "分部积分"],
    ["一元积分学", "定积分定义"],
    ["一元积分学", "定积分性质"],
    ["一元积分学", "变限积分"],
    ["一元积分学", "定积分应用"]
  ],
  cs408: [
    ["C 与算法预备", "变量与表达式"],
    ["C 与算法预备", "条件与循环"],
    ["C 与算法预备", "数组"],
    ["C 与算法预备", "函数"],
    ["C 与算法预备", "指针"],
    ["C 与算法预备", "结构体"],
    ["C 与算法预备", "递归"],
    ["C 与算法预备", "复杂度分析"],
    ["数据结构-线性结构", "顺序表"],
    ["数据结构-线性结构", "单链表"],
    ["数据结构-线性结构", "双链表"],
    ["数据结构-线性结构", "栈"],
    ["数据结构-线性结构", "队列"],
    ["数据结构-线性结构", "循环队列"],
    ["数据结构-线性结构", "串的基本概念"],
    ["数据结构-线性结构", "KMP 思想"],
    ["数据结构-树", "树的基本概念"],
    ["数据结构-树", "二叉树性质"],
    ["数据结构-树", "二叉树遍历"],
    ["数据结构-树", "树与森林"],
    ["数据结构-树", "哈夫曼树"],
    ["数据结构-树", "二叉排序树"],
    ["数据结构-图", "图的存储"],
    ["数据结构-图", "DFS"],
    ["数据结构-图", "BFS"],
    ["数据结构-查找排序", "顺序查找"],
    ["数据结构-查找排序", "折半查找"],
    ["数据结构-查找排序", "插入排序"],
    ["数据结构-查找排序", "交换排序"],
    ["数据结构-查找排序", "归并排序"]
  ],
  english: [
    ["词汇", "高频核心词"],
    ["语法长难句", "句子成分"],
    ["词汇", "同义替换"],
    ["语法长难句", "从句识别"],
    ["阅读理解", "定位句识别"],
    ["语法长难句", "非谓语结构"],
    ["阅读理解", "细节题"],
    ["词汇", "熟词僻义"],
    ["阅读理解", "选项干扰类型"],
    ["翻译", "定语从句翻译"]
  ]
};

const foundationPlan = [
  {
    title: "第 0 层：学习系统和计算机感",
    weeks: "第 1-2 周",
    goal: "能稳定记录学习，知道程序、内存、文件、网络这些词大概指什么。",
    tasks: ["搭建记录表和网站使用习惯", "安装并会用一个代码编辑器", "会运行 C 或 Python 的 Hello World", "理解文件、目录、终端、编译/运行的区别"],
    pass: "连续记录 7 天；能独立运行 3 个小程序；能说清楚源代码和可执行程序的区别。"
  },
  {
    title: "第 1 层：数学预备",
    weeks: "第 1-6 周",
    goal: "补齐函数、代数、三角和数列等高数前置能力。",
    tasks: ["函数图像和性质", "常用初等函数", "三角公式", "不等式与绝对值", "代数变形", "数列基础"],
    pass: "能独立完成函数、极限前置题；看到分式、根式、三角式能做基本化简。"
  },
  {
    title: "第 2 层：C 语言和算法表达",
    weeks: "第 1-8 周",
    goal: "为数据结构服务，不追求工程复杂度。",
    tasks: ["变量、分支、循环", "数组和字符串", "函数和递归", "指针和结构体", "单链表基础操作", "复杂度 O 表示法"],
    pass: "能写顺序表、单链表、栈、队列的基本操作；能估算简单循环复杂度。"
  },
  {
    title: "第 3 层：数据结构入门",
    weeks: "暑假前半",
    goal: "把抽象结构变成图和代码，不只背定义。",
    tasks: ["线性表", "栈和队列", "二叉树遍历", "图的 DFS/BFS", "查找", "排序"],
    pass: "每类结构至少写 1 个代码或伪代码；能解释时间复杂度和适用场景。"
  },
  {
    title: "第 4 层：408 系统观",
    weeks: "2026 下半年",
    goal: "理解程序如何从代码运行到机器、操作系统和网络。",
    tasks: ["计组：CPU、指令、存储", "OS：进程、内存、文件", "计网：分层、IP、TCP、HTTP", "用图画执行过程"],
    pass: "能画出从代码执行、内存访问、系统调用到网络请求的粗略链路。"
  },
  {
    title: "第 5 层：考研题型化",
    weeks: "2027 强化期",
    goal: "从会概念变成能做题、能限时、能复盘。",
    tasks: ["数学专题题型", "408 章节真题", "错题按知识点归档", "每周限时训练"],
    pass: "数学和 408 综合训练进入 100+ 区间，错题能说出明确错因。"
  }
];

const learningPath = [
  { id: "start", name: "启动", range: "2026.06.08-06.30", goal: "低强度建立记录、补数学预备和 C 语言", deliverable: "连续记录 7 天，完成 40h 起步" },
  { id: "base", name: "奠基", range: "2026.07-08", goal: "暑假逐步加长，高数基础、线代启动、数据结构第一轮", deliverable: "累计 230h，线性表/树/图能做基础题" },
  { id: "map", name: "加压", range: "2026.09-12", goal: "9 月起提高强度，数学一和 408 主干过第一轮", deliverable: "累计 830h，数学一 70% 框架，408 至少两门" },
  { id: "close", name: "收口", range: "2027.01-02", goal: "四门 408 和数学一第一轮收口", deliverable: "数学 90+，408 85+" },
  { id: "strength", name: "强化", range: "2027.03-06", goal: "题型化、真题分章节、项目可运行", deliverable: "数学 110，408 105" },
  { id: "battle", name: "套卷", range: "2027.07-08", goal: "真题套卷和政治启动", deliverable: "全科 390+" },
  { id: "rank", name: "排位", range: "2027.09-10", goal: "报名、套卷稳定、近 5 套 405+", deliverable: "确定报考和院校梯队" },
  { id: "sprint", name: "收束", range: "2027.11-12", goal: "模拟、背诵、错题回炉", deliverable: "近 10 套 415+" }
];

const subjectMethods = {
  "数学": {
    learn: "先看定义和 2-3 个例题，再闭卷做基础题。",
    practice: "基础题 15-25 道；不会的只回定义，不刷难题逃避。",
    check: "能独立写出关键公式、题型识别信号和错因。"
  },
  "408": {
    learn: "先画结构图或过程图，再看例题和选择题。",
    practice: "章节题 20 道，或写 1 个代码/伪代码实现。",
    check: "能解释它解决什么问题、怎么做、复杂度或代价是什么。"
  },
  "英语": {
    learn: "先背词，再做一篇阅读或一组长难句。",
    practice: "限时做题后精读，不查词先复述结构。",
    check: "写出生词、长难句、定位句和错题原因。"
  },
  "政治": {
    learn: "先过框架，再刷选择题。",
    practice: "选择题一刷后只二刷错题，主观题后期默写关键词。",
    check: "能把错题归到概念、材料定位或时政记忆。"
  },
  "复盘": {
    learn: "只看本周新增错题和未完成任务。",
    practice: "回炉 5-10 道错题，写明天第一任务。",
    check: "每道错题有明确错因和下一次处理方式。"
  },
  "补弱": {
    learn: "只选一个最弱科目，不同时补多个洞。",
    practice: "补 30 分钟核心任务，优先错题和基础定义。",
    check: "写下为什么弱、下次如何提前识别。"
  },
  "项目": {
    learn: "先确定最小功能，不追求大而全。",
    practice: "推进一个可运行功能或补 README。",
    check: "能讲清楚输入、处理、输出和改进点。"
  }
};

const highStandards = [
  ["数学", "定义能复述，公式能默写，基础题正确率 80%+，错题必须写识别信号。"],
  ["408", "概念能画图，算法能写伪代码，大题能写步骤，所有错题归到四门知识点。"],
  ["英语", "单词不断，阅读必须精读，错题要定位到词汇、句法、定位或逻辑。"],
  ["政治", "选择题错题二刷，主观题后期能默写关键词，不挤占数学和 408。"],
  ["复盘", "按 D+1/D+3/D+7/D+14/D+30 回炉，每次记录具体错因。"]
];

const systemRules = [
  ["01", "渐进加量", "2026 年 6 月 8 日低强度重启；7-8 月逐步加长；9 月起提高到第一轮主干强度。"],
  ["02", "核心优先", "数学一和 408 优先分配时间，周核心占比低于 65% 就预警。"],
  ["03", "未完成顺延", "昨天没有完成的任务进入今天，同时压缩新增内容，避免补偿式超载。"],
  ["04", "先交付再加量", "每个任务必须有题量、错因、图示或代码交付，只看视频不算真正完成。"],
  ["05", "错题进复盘", "勾选完成后自动安排 D+1 / D+3 / D+7 / D+14 / D+30。"],
  ["06", "日审周审月审", "每天收口到明天第一任务；每周看核心占比、回炉率和活跃天数；每月只调总量和弱项，不重写大计划。"],
  ["07", "统计看趋势", "单日波动不判好坏，至少看 7 天有效小时、14 天趋势、错题回炉率和考纲证据。"],
  ["08", "学习曲线", "投入量按阶段爬坡；连续低完成时降到底线日，连续稳定后再增加难度或题量。"]
];

const methodEvidence = [
  ["主动回忆", "依据 practice testing / retrieval practice 思路，优先做题、闭卷默写、过程图和自测，而不是反复看讲义。"],
  ["分散复盘", "D+1/D+3/D+7/D+14/D+30 是轻量回炉；每次只验证能否重新提取，不把复盘堆成第二套课程。"],
  ["交错练习", "数学和 408 后期在章节题、真题、错题和限时题之间切换，避免只会单章套路。"],
  ["可完成负荷", "任务默认 3 项，顺延时削减新增内容；连续低完成时降到底线日，先恢复执行再加量。"],
  ["证据化掌握", "一个考点至少留下题量、正确率、错因、图示、代码或默写证据，不能只凭“感觉会了”标记掌握。"]
];

const memoryCurveRules = [
  { round: "D+1", action: "闭卷重做当天错题或核心例题。", pass: "能说出定义、触发条件和第一步。", fallback: "失败则只补一个概念，明天生成短复盘。", cost: "5-15m" },
  { round: "D+3", action: "换一道同类题验证题型识别。", pass: "不看答案能列出解题路线。", fallback: "把错因归为概念、计算、条件或表达。", cost: "10-20m" },
  { round: "D+7", action: "合并本周同类错因，重做高频错题。", pass: "同类错误本周不再重复。", fallback: "下周减少新增，优先补同类题。", cost: "15-25m" },
  { round: "D+14", action: "从题目回到章节框架，补过程图或公式链。", pass: "能把题目挂回考纲小节。", fallback: "标记为需复盘，不进入已掌握。", cost: "15-25m" },
  { round: "D+30", action: "月度回炉，只保留高频错题和核心公式。", pass: "限时重做仍能稳定完成。", fallback: "进入月度弱项清单，下一月降级处理。", cost: "20-35m" }
];

const auditCadenceRules = [
  { label: "日审", value: "每天 5-8m", text: "记录有效分钟、题量、错题和明天第一任务；未完成任务只顺延最重要的 1-2 项。" },
  { label: "周审", value: "每周 20-30m", text: "看 7 天有效小时、数学+408 占比、错题回炉率、活跃天数；只决定下周一个主攻弱项。" },
  { label: "月审", value: "每月 45-60m", text: "核对累计小时、考纲证据、资料进度和阶段验收；不因单周波动推翻路线。" },
  { label: "阶段审", value: "节点日", text: "2026-08、2026-12、2027-06、2027-10 必须检查是否需要降级、补基础或准备稳妥院校梯队。" }
];

const studyMetricRules = [
  ["有效小时", "只统计做题、复盘、默写、精读、代码或产出整理；纯播放视频不单独算有效学习。"],
  ["核心占比", "数学一 + 408 是主线，2026 年 9 月后周占比低于 65% 就减少非核心内容。"],
  ["回炉率", "固定错题数 / 新增错题数；低于 70% 说明复盘债务在扩大。"],
  ["掌握证据", "考纲条目标已掌握前，至少要有题量、正确率、错因或可解释产出。"],
  ["趋势窗口", "7 天看执行，14 天看学习曲线，30 天才调整阶段计划。"]
];

const reviewOutcomeRules = [
  ["通过", "闭卷能做、能讲清错因、能挂回考点；保持原复盘间隔。"],
  ["失败", "不会第一步、同类错因重复或看答案才懂；生成 D+1 短复盘。"],
  ["延期", "当天负荷过高时只允许 +1 或 +3 天；延期超过 2 次视作未掌握。"]
];

const subjectAcceptanceRules = {
  "数学": {
    minimum: "45 分钟或 15 道基础题，至少订正当天错题。",
    standard: "15-25 道题，正确率和错因有记录，关键公式闭卷默写。",
    high: "能写出题型识别信号，并把错题挂回考纲小节。"
  },
  "408": {
    minimum: "45 分钟或 15-20 道章节题，至少画出一个过程图。",
    standard: "20 道题或 1 个代码/伪代码实现，能解释复杂度、代价或状态变化。",
    high: "能把概念、图示、题目和错因统一到同一个知识点。"
  },
  "英语": {
    minimum: "单词不断档，完成 20 分钟词句或 1 组长难句。",
    standard: "阅读或长难句限时完成后精读，记录生词、定位句和错选项原因。",
    high: "能复述段落结构，并把错题归为词汇、句法、定位或逻辑。"
  },
  "政治": {
    minimum: "20 分钟框架或选择题，不挤占数学和 408。",
    standard: "选择题完成后归类错因，后期主观题能默写关键词。",
    high: "能用官方表述组织答案层次，不背散句。"
  },
  "复盘": {
    minimum: "回炉 5 道错题或 15 分钟到期复盘。",
    standard: "重做不翻答案，写出二次错因和下一轮处理方式。",
    high: "能合并同类错因，并决定是否降低新内容。"
  },
  "补弱": {
    minimum: "只处理一个弱项，补 30 分钟基础定义或错题。",
    standard: "写清弱在哪里、为什么弱、下一次如何提前识别。",
    high: "把弱项拆成 2-3 个可复查的小动作。"
  },
  "项目": {
    minimum: "推进一个可运行小功能或补一段 README。",
    standard: "留下输入、处理、输出和技术取舍说明。",
    high: "能形成复试可讲的证据：截图、链接、问题和改进点。"
  }
};

const resourceUsageRules = [
  "每科只保留一条主线资料，先完成 70% 再决定是否补充第二套。",
  "新增资料必须说明解决什么问题：概念不清、题量不足、真题表达弱或错题回炉不足。",
  "资料进度不能替代掌握证据；完成率高但错题回炉低时，优先停新资料。"
];

const taskBlueprints = {
  "数学": {
    output: "交付：基础题 15-25 道 + 错题原因 3 条以内 + 关键公式闭卷默写。",
    steps: ["先读定义和例题", "闭卷做基础题", "标记错因和识别信号"],
    metric: "题量/正确率"
  },
  "408": {
    output: "交付：章节题 20 道或 1 个伪代码/过程图，必须能解释复杂度或代价。",
    steps: ["先画结构或流程", "做选择题和大题", "补代码/伪代码表达"],
    metric: "题量/图示"
  },
  "英语": {
    output: "交付：单词复习 + 1 组长难句或阅读定位句 + 错选项原因。",
    steps: ["先背词", "限时阅读或长难句", "精读定位句和错选项"],
    metric: "篇数/词句"
  },
  "政治": {
    output: "交付：选择题错题归类，后期主观题关键词能默写。",
    steps: ["先过框架", "刷选择题", "二刷错题关键词"],
    metric: "选择题"
  },
  "复盘": {
    output: "交付：回炉 5-10 道错题，写出明天第一任务。",
    steps: ["只看到期错题", "重做不翻答案", "写下二次错因"],
    metric: "回炉率"
  },
  "补弱": {
    output: "交付：只补一个弱项，写清弱在哪里、下次如何提前识别。",
    steps: ["定位一个弱点", "补基础定义或错题", "写下下一步动作"],
    metric: "弱项处理"
  },
  "项目": {
    output: "交付：一个可运行小功能、README 说明或一段可讲技术点。",
    steps: ["定义最小功能", "编码或补文档", "记录技术取舍"],
    metric: "可运行"
  }
};

const subjectPalette = {
  math: "#13785f",
  cs408: "#2868a8",
  english: "#6a5acd",
  politics: "#b7791f",
  project: "#596579"
};

const resources = [
  ["数学一", ["范围以教育部教育考试院当年数学一考试大纲为准，当前按高数、线代、概率统计主干备考", "教材查漏建议：同济高数、同济线代、浙大概率，均为非官方指定资料", "主线资料只选一套体系；660/880/1000/1800 等习题集属于非官方备考建议，按当年最新版确认", "2027 年 3 月后进入分章节真题和套卷；未来年份模拟卷出版后再确认"]],
  ["408", ["范围以当年 408 计算机学科专业基础考试大纲为准，当前按数据结构、计组、OS、计网主干备考", "主线建议：王道或天勤 408 四科体系固定一种，均为非官方指定资料，当年最新版出版后确认", "查漏参考：严蔚敏、唐朔飞、汤小丹、谢希仁等教材，作为概念核对资料", "每章必须做题、画图、错题归档；资料选择服务执行，不替代官方大纲"]],
  ["英语一", ["范围以当年英语一考试大纲为准，当前按词汇、长难句、阅读、翻译、写作主干备考", "单词工具固定一种，坚持到考前；工具和书目均为非官方指定资料", "真题阅读可用黄皮书、考研真相或同类解析体系之一，按当年版确认", "作文 2027 年暑假后系统定稿，最终表达以当年真题和评分要求校正"]],
  ["政治", ["范围以当年政治考试大纲和时政要求为准，年度大纲和时政必须在官方发布后刷新", "2027 年 7-8 月启动基础框架，不提前重投入", "10 月后使用当年版背诵手册和时政材料，出版后确认", "11-12 月可用肖八、肖四或同类预测资料，均为非官方指定资料，并以官方表述收束"]]
];

const projectItems = [
  "Git 仓库和 README",
  "本地可运行版本",
  "数据库表或核心算法设计",
  "截图或演示说明",
  "3 个技术问题",
  "3 个改进方向",
  "中英文自我介绍",
  "跨考动机解释"
];

async function bootstrapApp() {
  try {
    setDefaultDates();
    hydrateIcons();
    bindNavigation();
    bindDensityControls();
    bindForms();
    bindSyllabusTabs();
    bindImportExport();
    bindQuickEntry();
    bindRecords();
    bindSettings();
    bindAuth();
    bindWeekPlanner();
    bindNetworkStatus();
    upgradeGeneratedPlans();
    await initCloudSession();
    renderAll();
    initRoute();
    appStarted = true;
    if (resetApplied) showToast("已清理本机缓存，当前为全新本机数据。");
    if (!storageAvailable) showToast("浏览器暂时禁止本机存储，页面可操作，但刷新后本机数据可能不会保留。");
  } catch (error) {
    console.error("[rw] app initialization failed", error);
    installRecoveryMode(error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApp, { once: true });
} else {
  bootstrapApp();
}

function hydrateIcons(root = document) {
  document.querySelectorAll(".nav-item[data-icon]").forEach((button) => {
    const node = button.querySelector(".nav-ico");
    if (!node || node.dataset.lucide) return;
    const iconName = navIconName(button.dataset.icon || "");
    node.setAttribute("data-lucide", iconName);
    node.setAttribute("aria-hidden", "true");
  });
  createIcons({
    icons: appIcons,
    root,
    attrs: {
      width: 17,
      height: 17,
      strokeWidth: 2
    }
  });
}

function navIconName(icon) {
  return {
    home: "layout-dashboard",
    today: "list-checks",
    week: "calendar-days",
    path: "map",
    grid: "book-open-check",
    records: "clipboard-list",
    review: "rotate-ccw",
    scores: "bar-chart-3",
    resources: "library",
    settings: "settings"
  }[icon] || "circle-gauge";
}

function loadState() {
  const currentRaw = readStorage(STORAGE_KEY);
  const legacyRaw = readStorage(LEGACY_STORAGE_KEY);
  const raw = currentRaw || legacyRaw;
  if (!raw) return freshState();
  try {
    const next = migrateState(JSON.parse(raw));
    if (!currentRaw && legacyRaw) {
      next.sync = {
        ...next.sync,
        status: "local",
        localImportPending: true,
        pending: false
      };
    }
    return next;
  } catch {
    return freshState();
  }
}

function migrateState(parsed) {
  try {
    const settings = { ...defaultSettings, ...(parsed.settings || {}) };
    if (!settings.efficiencyModeApplied) {
      if (settings.taskCount === 4) settings.taskCount = 3;
      if (!parsed.settings || parsed.settings.density === "balanced") settings.density = "focus";
      settings.efficiencyModeApplied = true;
    }
    settings.weekdayMinutes = sanitizeInteger(settings.weekdayMinutes || defaultSettings.weekdayMinutes, 60, 720);
    settings.weekendMinutes = sanitizeInteger(settings.weekendMinutes || defaultSettings.weekendMinutes, 60, 840);
    settings.taskCount = sanitizeInteger(settings.taskCount || defaultSettings.taskCount, 3, 4);
    settings.coreRatio = sanitizeInteger(settings.coreRatio || defaultSettings.coreRatio, 55, 85);
    if (!["focus", "balanced", "detail"].includes(settings.density)) settings.density = "focus";
    settings.targetExamDate = settings.targetExamDate || DEFAULT_EXAM_DATE;
    settings.reviewDays = Array.isArray(settings.reviewDays)
      ? [...new Set(settings.reviewDays.map((day) => sanitizeInteger(day, 1, 365)).filter(Boolean))].sort((a, b) => a - b)
      : [...defaultSettings.reviewDays];
    settings.planControls = normalizePlanControls(settings.planControls);
    const entries = sanitizeEntries(parsed.entries || {});
    const scores = sanitizeScores(parsed.scores || []);
    const resourcesState = sanitizeNumericObject(parsed.resources || {}, 0, 100);
    const topics = sanitizeNumericObject(parsed.topics || {}, 0, 2, true);
    const deleted = sanitizeDeleted(parsed.deleted || {});
    return {
      schemaVersion: SCHEMA_VERSION,
      entries,
      scores,
      topics,
      topicEvidence: sanitizeTopicEvidence(parsed.topicEvidence || {}),
      tasks: parsed.tasks || {},
      weekPlans: sanitizeWeekPlans(parsed.weekPlans || {}),
      project: parsed.project || {},
      resources: resourcesState,
      settings,
      customTasks: sanitizeCustomTasks(parsed.customTasks || []),
      reviewItems: sanitizeReviewItems(parsed.reviewItems || []),
      deleted,
      snapshots: sanitizeSnapshots(parsed.snapshots || []),
      sync: {
        status: "local",
        lastSyncAt: "",
        lastError: "",
        pending: false,
        localImportPending: false,
        cloudPaused: false,
        ...(parsed.sync || {})
      },
      user: sanitizeUser(parsed.user)
    };
  } catch {
    return freshState();
  }
}

function sanitizeNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function sanitizeInteger(value, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.round(sanitizeNumber(value, min, max));
}

function sanitizeEntries(entries) {
  return Object.fromEntries(Object.entries(entries || {}).map(([date, entry]) => {
    const row = entry || {};
    return [date, {
      math: sanitizeNumber(row.math),
      cs408: sanitizeNumber(row.cs408),
      english: sanitizeNumber(row.english),
      politics: sanitizeNumber(row.politics),
      project: sanitizeNumber(row.project),
      mathProblems: sanitizeNumber(row.mathProblems),
      csProblems: sanitizeNumber(row.csProblems),
      reading: sanitizeNumber(row.reading),
      newMistakes: sanitizeNumber(row.newMistakes),
      fixedMistakes: sanitizeNumber(row.fixedMistakes),
      quality: sanitizeNumber(row.quality || 3, 1, 5),
      nextTask: String(row.nextTask || ""),
      note: String(row.note || ""),
      updatedAt: String(row.updatedAt || "")
    }];
  }));
}

function sanitizeScores(scores) {
  return (Array.isArray(scores) ? scores : []).map((score) => {
    const row = score || {};
    const politics = sanitizeNumber(row.politics, 0, 100);
    const english = sanitizeNumber(row.english, 0, 100);
    const math = sanitizeNumber(row.math, 0, 150);
    const cs408 = sanitizeNumber(row.cs408, 0, 150);
    return {
      id: String(row.id || uid("score")),
      date: String(row.date || planTodayISO()),
      name: String(row.name || "未命名模考"),
      politics,
      english,
      math,
      cs408,
      total: politics + english + math + cs408,
      note: String(row.note || ""),
      updatedAt: String(row.updatedAt || "")
    };
  });
}

function sanitizeNumericObject(object, min = 0, max = Number.POSITIVE_INFINITY, integer = false) {
  return Object.fromEntries(Object.entries(object || {}).map(([key, value]) => [
    key,
    integer ? sanitizeInteger(value, min, max) : sanitizeNumber(value, min, max)
  ]));
}

function sanitizeTopicEvidence(evidenceMap) {
  return Object.fromEntries(Object.entries(evidenceMap || {}).map(([topicId, evidence]) => {
    const row = evidence || {};
    return [topicId, {
      problems: sanitizeNumber(row.problems),
      accuracy: sanitizeNumber(row.accuracy, 0, 100),
      evidence: String(row.evidence || ""),
      lastReviewDate: String(row.lastReviewDate || ""),
      totalProblems: sanitizeNumber(row.totalProblems ?? row.total_problems),
      recent14dAccuracy: normalizeRatio(row.recent14dAccuracy ?? row.recent_14d_accuracy),
      lastReviewAt: String(row.lastReviewAt || row.last_review_at || ""),
      masteryStatus: String(row.masteryStatus || row.mastery_status || ""),
      prerequisites: Array.isArray(row.prerequisites) ? row.prerequisites.map((item) => String(item)) : []
    }];
  }));
}

function sanitizeWeekPlans(weekPlans) {
  return Object.fromEntries(Object.entries(weekPlans || {}).map(([date, tasks]) => [
    date,
    (Array.isArray(tasks) ? tasks : []).filter(Boolean).map((task, index) => sanitizeTask(task, date, index))
  ]));
}

function sanitizeTask(task, date, index = 0) {
  const row = task || {};
  const status = ["todo", "done", "shifted", "delayed", "failed"].includes(row.status) ? row.status : "todo";
  return {
    id: String(row.id || `${date}-${index}`),
    date: String(row.date || date),
    subject: String(row.subject || "复盘"),
    text: String(row.text || "回炉错题，写明下次识别信号"),
    topicId: String(row.topicId || row.topic_id || ""),
    minutes: sanitizeInteger(row.minutes, 0, 240),
    priority: sanitizeInteger(row.priority || index + 1, 1, 99),
    status,
    locked: Boolean(row.locked),
    source: String(row.source || "generated"),
    sourceTaskId: String(row.sourceTaskId || row.source_task_id || ""),
    carriedFrom: String(row.carriedFrom || row.carried_from || ""),
    shiftedTo: String(row.shiftedTo || row.shifted_to || ""),
    reviewItemId: String(row.reviewItemId || ""),
    completedAt: String(row.completedAt || row.completed_at || ""),
    recordApplied: Boolean(row.recordApplied),
    updatedAt: String(row.updatedAt || row.updated_at || ""),
    contractType: String(row.contractType || row.contract_type || "problems"),
    requiredProblemCount: sanitizeInteger(row.requiredProblemCount ?? row.required_problem_count, 0, 999),
    requiredAccuracy: normalizeRatio(row.requiredAccuracy ?? row.required_accuracy),
    requiredArtifacts: Array.isArray(row.requiredArtifacts || row.required_artifacts)
      ? (row.requiredArtifacts || row.required_artifacts).map((item) => String(item)).slice(0, 8)
      : [],
    minutesMin: sanitizeInteger(row.minutesMin ?? row.minutes_min, 0, 240),
    minutesMax: sanitizeInteger(row.minutesMax ?? row.minutes_max, 0, 240),
    actualProblems: sanitizeInteger(row.actualProblems ?? row.actual_problems, 0, 999),
    actualCorrect: sanitizeInteger(row.actualCorrect ?? row.actual_correct, 0, 999),
    actualMinutes: sanitizeInteger(row.actualMinutes ?? row.actual_minutes, 0, 720),
    evidenceSubmitted: Boolean(row.evidenceSubmitted || row.evidence_submitted)
  };
}

function sanitizeReviewItems(items) {
  return (Array.isArray(items) ? items : []).filter(Boolean).map((item) => {
    const status = ["due", "done", "delayed", "failed"].includes(item.status) ? item.status : (item.done ? "done" : "due");
    return {
      id: String(item.id || uid("review")),
      sourceTaskId: String(item.sourceTaskId || item.source_task_id || ""),
      subject: String(item.subject || "复盘"),
      text: String(item.text || item.title || ""),
      round: String(item.round || item.review_round || ""),
      dueDate: String(item.dueDate || item.due_date || planTodayISO()),
      status,
      done: Boolean(item.done || status === "done"),
      delayCount: sanitizeInteger(item.delayCount ?? item.delay_count, 0, 99),
      failureReason: String(item.failureReason || item.failure_reason || ""),
      quality: sanitizeInteger(item.quality ?? item.quality_score, 0, 5),
      completedAt: String(item.completedAt || item.completed_at || ""),
      intervalIndex: sanitizeInteger(item.intervalIndex ?? item.interval_index, 0, 99),
      failStreak: sanitizeInteger(item.failStreak ?? item.fail_streak, 0, 99),
      lastResult: String(item.lastResult || item.last_result || ""),
      lastSubmittedDate: String(item.lastSubmittedDate || item.last_submitted_date || ""),
      topicId: String(item.topicId || item.topic_id || ""),
      updatedAt: String(item.updatedAt || item.updated_at || "")
    };
  });
}

function sanitizeCustomTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : []).filter(Boolean).map((task) => ({
    id: String(task.id || uid("custom")),
    subject: String(task.subject || "复盘"),
    text: String(task.text || ""),
    minutes: sanitizeInteger(task.minutes, 10, 240)
  })).filter((task) => task.text);
}

function sanitizeDeleted(deleted) {
  const asArray = (value) => Array.isArray(value) ? value.map((item) => String(item)) : [];
  return {
    records: asArray(deleted.records),
    scores: asArray(deleted.scores),
    tasks: asArray(deleted.tasks),
    reviews: asArray(deleted.reviews)
  };
}

function normalizeRatio(value) {
  const number = sanitizeNumber(value, 0, 100);
  return number > 1 ? number / 100 : number;
}

function sanitizeSnapshots(snapshots) {
  return (Array.isArray(snapshots) ? snapshots : []).slice(0, 5).map((snapshot) => {
    const row = snapshot || {};
    return {
      reason: String(row.reason || "manual"),
      createdAt: String(row.createdAt || row.created_at || ""),
      payload: row.payload && typeof row.payload === "object" ? row.payload : row
    };
  });
}

function sanitizeUser(user) {
  if (!user || typeof user !== "object") return null;
  return {
    id: String(user.id || ""),
    email: String(user.email || "")
  };
}

function freshState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    entries: {},
    scores: [],
    topics: {},
    topicEvidence: {},
    tasks: {},
    weekPlans: {},
    project: {},
    resources: {},
    settings: { ...defaultSettings, planControls: normalizePlanControls(defaultSettings.planControls), efficiencyModeApplied: true },
    customTasks: [],
    reviewItems: [],
    deleted: { records: [], scores: [], tasks: [], reviews: [] },
    snapshots: [],
    sync: { status: "local", lastSyncAt: "", lastError: "", pending: false, localImportPending: false, cloudPaused: false },
    user: null
  };
}

function saveState(options = {}) {
  state.schemaVersion = SCHEMA_VERSION;
  state.settings.lastSavedAt = new Date().toISOString();
  const saved = writeStorage(STORAGE_KEY, JSON.stringify(state));
  if (!saved) {
    state.sync = { ...state.sync, status: "local", lastError: "local-storage-unavailable", pending: false };
  }
  renderSyncStatus();
  if (!options.skipCloud) queueCloudSync();
}

async function initCloudSession() {
  try {
    currentUser = await getCurrentUser();
    if (currentUser) {
      state.user = { id: currentUser.id, email: currentUser.email || "" };
      await pullCloudState();
    }
    onAuthChange(async (user) => {
      currentUser = user;
      state.user = user ? { id: user.id, email: user.email || "" } : null;
      if (user) await pullCloudState();
      renderSyncStatus();
      renderAll();
    });
  } catch (error) {
    currentUser = null;
    state.sync = { ...state.sync, status: "error", lastError: error.message || String(error), pending: false };
  }
  renderSyncStatus();
}

async function pullCloudState() {
  if (!currentUser || !supabaseConfigured) {
    state.sync = { ...state.sync, status: currentUser ? "unconfigured" : "local" };
    return;
  }
  if (state.sync?.localImportPending) {
    state.sync = { ...state.sync, status: "pending", pending: true };
    renderSyncStatus();
    return;
  }
  try {
    state.sync = { ...state.sync, status: "syncing", lastError: "" };
    renderSyncStatus();
    const cloudState = await loadCloudState(state);
    if (cloudState) {
      state = migrateState(mergeStateByUpdatedAt(state, cloudState));
      saveState({ skipCloud: true });
      state.sync = { status: "synced", lastSyncAt: new Date().toISOString(), lastError: "", pending: false };
    }
  } catch (error) {
    state.sync = { ...state.sync, status: "error", lastError: error.message || String(error), pending: true };
  }
}

function mergeStateByUpdatedAt(localState, cloudState) {
  return applyTombstones({
    ...localState,
    ...cloudState,
    settings: { ...localState.settings, ...cloudState.settings },
    entries: mergeObjectsByUpdatedAt(localState.entries, cloudState.entries),
    tasks: { ...localState.tasks, ...cloudState.tasks },
    weekPlans: mergeWeekPlans(localState.weekPlans, cloudState.weekPlans),
    reviewItems: mergeArrayById(localState.reviewItems, cloudState.reviewItems),
    scores: mergeArrayById(localState.scores, cloudState.scores),
    topics: { ...localState.topics, ...cloudState.topics },
    topicEvidence: { ...localState.topicEvidence, ...cloudState.topicEvidence },
    resources: { ...localState.resources, ...cloudState.resources },
    deleted: {
      records: [],
      scores: [],
      tasks: [],
      reviews: [],
      ...(cloudState.deleted || {}),
      ...(localState.deleted || {})
    },
    sync: cloudState.sync,
    user: cloudState.user
  });
}

function mergeArrayById(localItems = [], cloudItems = []) {
  const map = new Map();
  [...localItems, ...cloudItems].forEach((item) => {
    const id = item.id || `${item.date}-${item.name}`;
    const existing = map.get(id);
    if (!existing) {
      map.set(id, item);
      return;
    }
    const oldTime = Date.parse(existing.updatedAt || existing.completedAt || existing.date || 0);
    const newTime = Date.parse(item.updatedAt || item.completedAt || item.date || 0);
    map.set(id, newTime >= oldTime ? item : existing);
  });
  return [...map.values()];
}

function mergeObjectsByUpdatedAt(localObject = {}, cloudObject = {}) {
  const result = { ...localObject };
  Object.entries(cloudObject || {}).forEach(([key, value]) => {
    const existing = result[key];
    if (!existing) {
      result[key] = value;
      return;
    }
    const oldTime = Date.parse(existing.updatedAt || 0);
    const newTime = Date.parse(value.updatedAt || 0);
    result[key] = newTime >= oldTime ? value : existing;
  });
  return result;
}

function mergeWeekPlans(localPlans = {}, cloudPlans = {}) {
  const dates = new Set([...Object.keys(localPlans || {}), ...Object.keys(cloudPlans || {})]);
  const result = {};
  dates.forEach((date) => {
    result[date] = mergeArrayById(localPlans[date] || [], cloudPlans[date] || []);
  });
  return result;
}

function applyTombstones(nextState) {
  const deleted = nextState.deleted || {};
  (deleted.records || []).forEach((date) => delete nextState.entries[date]);
  if (deleted.scores?.length) {
    const ids = new Set(deleted.scores);
    nextState.scores = (nextState.scores || []).filter((score) => !ids.has(score.id));
  }
  if (deleted.reviews?.length) {
    const ids = new Set(deleted.reviews);
    nextState.reviewItems = (nextState.reviewItems || []).filter((item) => !ids.has(item.id));
  }
  if (deleted.tasks?.length) {
    const ids = new Set(deleted.tasks);
    Object.keys(nextState.weekPlans || {}).forEach((date) => {
      nextState.weekPlans[date] = (nextState.weekPlans[date] || []).filter((task) => !ids.has(task.id));
    });
    ids.forEach((id) => delete nextState.tasks[id]);
  }
  return nextState;
}

function markDeleted(type, id) {
  state.deleted = state.deleted || { records: [], scores: [], tasks: [], reviews: [] };
  state.deleted[type] = state.deleted[type] || [];
  if (id && !state.deleted[type].includes(id)) state.deleted[type].push(id);
}

function queueCloudSync() {
  if (!currentUser || !supabaseConfigured) {
    state.sync = { ...state.sync, status: currentUser ? "unconfigured" : "local", pending: false };
    renderSyncStatus();
    return;
  }
  if (state.sync?.localImportPending || state.sync?.cloudPaused) {
    state.sync = { ...state.sync, status: "pending", pending: true };
    renderSyncStatus();
    return;
  }
  if (navigator && navigator.onLine === false) {
    state.sync = { ...state.sync, status: "offline", pending: true };
    renderSyncStatus();
    return;
  }
  state.sync = { ...state.sync, status: "pending", pending: true };
  renderSyncStatus();
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(syncNow, 650);
}

async function syncNow(options = {}) {
  if (!currentUser || !supabaseConfigured) {
    renderSyncStatus();
    return { ok: false, reason: "not-authenticated" };
  }
  if (state.sync?.localImportPending && !options.force) {
    state.sync = { ...state.sync, status: "pending", pending: true };
    renderSyncStatus();
    renderAuthPanel();
    showToast("检测到旧版本地数据。请在账号面板选择导入云端或保留本机。");
    return { ok: false, reason: "local-import-pending" };
  }
  if (navigator && navigator.onLine === false) {
    state.sync = { ...state.sync, status: "offline", pending: true };
    saveState({ skipCloud: true });
    return { ok: false, reason: "offline" };
  }
  try {
    state.sync = { ...state.sync, status: "syncing", lastError: "" };
    renderSyncStatus();
    const result = await saveCloudState(state);
    state.deleted = { records: [], scores: [], tasks: [], reviews: [] };
    state.sync = {
      status: "synced",
      lastSyncAt: result?.syncedAt || new Date().toISOString(),
      lastError: "",
      pending: false,
      localImportPending: false,
      cloudPaused: false
    };
    legacyImportPending = false;
    saveState({ skipCloud: true });
    renderSyncStatus();
    return { ok: true, syncedAt: state.sync.lastSyncAt };
  } catch (error) {
    const message = error.message || String(error);
    state.sync = { ...state.sync, status: "error", lastError: message, pending: true };
    saveState({ skipCloud: true });
    setAuthResult("error", "同步失败", friendlySyncError(message));
    renderSyncStatus();
    return { ok: false, reason: "sync-error", error: message };
  }
}

function renderSyncStatus() {
  const localLabel = supabaseConfigured ? "未登录" : "仅本机保存";
  const label = {
    local: localLabel,
    unconfigured: "未配置云端",
    pending: "待同步",
    syncing: "同步中",
    synced: "已同步",
    error: "同步失败",
    offline: "离线草稿"
  }[state.sync?.status] || localLabel;
  const errorSuffix = state.sync?.status === "error" && state.sync?.lastError
    ? ` · ${shortSyncError(state.sync.lastError)}`
    : "";
  setText("syncStatusText", currentUser ? `${label}${errorSuffix} · ${currentUser.email || "已登录"}` : `${label}${errorSuffix}`);
  const pill = document.getElementById("syncPill");
  if (pill) pill.dataset.status = state.sync?.status || "local";
  setText("sideDataSave", state.sync?.lastSyncAt ? `同步 ${state.sync.lastSyncAt.slice(5, 16).replace("T", " ")}` : label);
}

function shortSyncError(message) {
  return String(message || "").split(":").slice(0, 2).join(":").slice(0, 42);
}

function friendlySyncError(message) {
  const text = String(message || "未知错误");
  if (text.includes("duplicate key")) return `${text}。本地有重复记录，请导出备份后再点同步；系统已保留本机数据。`;
  if (text.includes("no unique or exclusion constraint") || text.includes("42P10")) return `${text}。数据库主键还没更新，请重新执行 supabase/schema.sql 后再同步。`;
  if (text.includes("violates row-level security")) return `${text}。当前账号没有权限写入这条数据，请退出后重新登录。`;
  if (text.includes("Could not find") || text.includes("column")) return `${text}。数据库 schema 可能不是最新，请重新执行 supabase/schema.sql。`;
  if (text.includes("invalid input syntax") || text.includes("date/time field")) return `${text}。某条本地记录日期格式不合法，请导出备份后修正。`;
  return text;
}

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function planTodayISO() {
  return todayISO() < PLAN_START_DATE ? PLAN_START_DATE : todayISO();
}

function setDefaultDates() {
  const today = planTodayISO();
  document.getElementById("entryDate").value = today;
  document.getElementById("scoreDate").value = today;
}

function uid(prefix = "id") {
  return `${prefix}-${window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`);
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentPhase(dateValue = planTodayISO()) {
  const current = parseDate(dateValue);
  return phases.find((phase) => current >= parseDate(phase.start) && current <= parseDate(phase.end)) || phases[0];
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setRoute(button.dataset.view);
    });
  });
  document.querySelector(".nav-list")?.addEventListener("click", (event) => {
    const button = event.target.closest(".nav-item[data-view]");
    if (!button) return;
    event.preventDefault();
    setRoute(button.dataset.view);
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(".nav-item[data-view], [data-jump]");
    if (!button) return;
    const view = button.dataset.view || button.dataset.jump;
    if (!isValidView(view)) return;
    event.preventDefault();
    event.stopPropagation();
    setRoute(view);
  }, true);

  window.addEventListener("hashchange", () => {
    const view = currentHashView();
    if (view) switchView(view);
  });

  window.addEventListener("pageshow", () => {
    const view = currentHashView() || activeViewId() || "dashboard";
    switchView(isValidView(view) ? view : "dashboard");
  });

  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setRoute(button.dataset.jump);
    });
  });
  document.documentElement.dataset.navBound = "1";
}

function bindDensityControls() {
  document.querySelectorAll("[data-density]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.density = button.dataset.density;
      saveState();
      applyDensityMode();
      showToast(`信息密度已切换为：${densityLabel(state.settings.density)}。`);
    });
  });
  applyDensityMode();
}

function densityLabel(value) {
  return ({ focus: "专注", balanced: "平衡", detail: "详尽" })[value] || "平衡";
}

function applyDensityMode() {
  const density = state.settings.density || "balanced";
  document.body.dataset.density = density;
  document.querySelectorAll("[data-density]").forEach((button) => {
    button.classList.toggle("active", button.dataset.density === density);
  });

  document.querySelectorAll(".detail-section").forEach((section) => {
    if (density === "detail") {
      section.open = true;
    } else if (density === "focus") {
      section.open = false;
    }
  });

  document.querySelectorAll(".plan-detail").forEach((section) => {
    section.open = density === "detail";
  });

  document.querySelectorAll(".syllabus-group").forEach((section) => {
    if (density === "detail") section.open = true;
  });
}

function initRoute() {
  const view = currentHashView();
  switchView(isValidView(view) ? view : "dashboard");
  scrollToTop();
}

function setRoute(viewId) {
  if (!isValidView(viewId)) return false;
  switchView(viewId);
  if (window.location.hash !== `#${viewId}`) {
    window.history.replaceState(null, "", `#${viewId}`);
  }
  scrollToTop();
  return true;
}

function isValidView(viewId) {
  return Boolean(viewId && document.getElementById(viewId)?.classList.contains("view"));
}

function currentHashView() {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  } catch {
    return window.location.hash.replace(/^#/, "").trim();
  }
}

function activeViewId() {
  return document.querySelector(".view.active")?.id || "";
}

function bindForms() {
  document.getElementById("entryDate").addEventListener("change", loadEntryForm);
  document.getElementById("entryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const date = document.getElementById("entryDate").value || planTodayISO();
    state.entries[date] = {
      math: readNumber("mathMin"),
      cs408: readNumber("csMin"),
      english: readNumber("engMin"),
      politics: readNumber("polMin"),
      project: readNumber("projectMin"),
      quality: Math.min(5, Math.max(1, readNumber("qualityScore") || 3)),
      mathProblems: readNumber("mathProblems"),
      csProblems: readNumber("csProblems"),
      reading: readNumber("readingCount"),
      newMistakes: readNumber("newMistakes"),
      fixedMistakes: readNumber("fixedMistakes"),
      nextTask: document.getElementById("nextTask").value.trim(),
      note: document.getElementById("note").value.trim(),
      updatedAt: new Date().toISOString()
    };
    saveState();
    renderAll();
    showToast("今日记录已保存，进度已更新。");
  });

  document.getElementById("scoreForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const score = {
      id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
      date: document.getElementById("scoreDate").value || planTodayISO(),
      name: document.getElementById("scoreName").value.trim() || "未命名模考",
      politics: readNumber("scorePol"),
      english: readNumber("scoreEng"),
      math: readNumber("scoreMath"),
      cs408: readNumber("scoreCs"),
      note: document.getElementById("scoreNote")?.value.trim() || ""
    };
    score.total = score.politics + score.english + score.math + score.cs408;
    const editingId = event.target.dataset.editingScore;
    if (editingId) {
      score.id = editingId;
      score.updatedAt = new Date().toISOString();
      state.scores = state.scores.map((item) => item.id === editingId ? score : item);
      delete event.target.dataset.editingScore;
    } else {
      score.updatedAt = new Date().toISOString();
      state.scores.push(score);
    }
    state.scores.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    event.target.reset();
    document.getElementById("scoreDate").value = planTodayISO();
    renderAll();
    showToast("模考成绩已保存。");
  });

  document.getElementById("regenTasks").addEventListener("click", () => renderTasks());
  document.getElementById("generatePlanBtn")?.addEventListener("click", () => {
    renderTasks(true);
    showToast("今日计划已重新生成。");
  });
}

function bindSyllabusTabs() {
  document.querySelectorAll(".seg").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".seg").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderSyllabus(button.dataset.syllabus);
    });
  });
}

function bindImportExport() {
  document.getElementById("exportBtn").addEventListener("click", () => {
    state.settings.lastExportDate = todayISO();
    saveState();
    exportStateJson("dashboard");
    renderStorageStatus();
  });

  document.getElementById("importFile").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        const snapshot = createLocalSnapshot("before-import");
        state = migrateState(imported);
        state.snapshots = [snapshot, ...(state.snapshots || [])].slice(0, 5);
        saveState();
        renderAll();
        showToast("导入完成，已保留导入前快照。");
      } catch {
        showToast("导入失败：不是有效的 JSON 数据。");
      }
    };
    reader.readAsText(file);
  });
}

function exportStateJson(label = "dashboard") {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pku-swm-${label}-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function createLocalSnapshot(reason = "manual") {
  const snapshot = {
    reason,
    createdAt: new Date().toISOString(),
    payload: JSON.parse(JSON.stringify(state))
  };
  state.snapshots = [snapshot, ...(state.snapshots || [])].slice(0, 5);
  if (currentUser && supabaseConfigured) {
    saveCloudSnapshot(state, reason).catch(() => {});
  }
  return snapshot;
}

function bindQuickEntry() {
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      applyPreset(button.dataset.preset);
    });
  });

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const [id, amount] = button.dataset.add.split(":");
      const current = Number(document.getElementById(id).value) || 0;
      document.getElementById(id).value = current + Number(amount);
    });
  });
}

function bindRecords() {
  const monthInput = document.getElementById("recordMonth");
  if (monthInput) {
    monthInput.value = planTodayISO().slice(0, 7);
    monthInput.addEventListener("change", renderRecords);
  }
  document.getElementById("clearMonthFilter")?.addEventListener("click", () => {
    monthInput.value = "";
    renderRecords();
  });
  document.getElementById("exportCsvBtn")?.addEventListener("click", exportRecordsCsv);
}

function bindSettings() {
  document.getElementById("settingsForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings.weekdayMinutes = readNumber("settingWeekdayMinutes") || defaultSettings.weekdayMinutes;
    state.settings.weekendMinutes = readNumber("settingWeekendMinutes") || defaultSettings.weekendMinutes;
    state.settings.taskCount = Math.min(4, Math.max(3, readNumber("settingTaskCount") || defaultSettings.taskCount));
    state.settings.coreRatio = Math.min(85, Math.max(55, readNumber("settingCoreRatio") || defaultSettings.coreRatio));
    state.settings.targetExamDate = document.getElementById("settingTargetExamDate")?.value || DEFAULT_EXAM_DATE;
    state.settings.reviewDays = parseReviewDays(document.getElementById("settingReviewDays").value);
    state.settings.planControls = normalizePlanControls({
      planIntensity: document.getElementById("settingPlanIntensity")?.value,
      focusSubject: document.getElementById("settingFocusSubject")?.value,
      experienceTrack: document.getElementById("settingExperienceTrack")?.value,
      maxNewTopics: readNumber("settingMaxNewTopics"),
      reviewLoad: readNumber("settingReviewLoad"),
      rollingWindowDays: readNumber("settingRollingWindowDays"),
      enabledSubjects: Array.from(document.querySelectorAll("#settingEnabledSubjects input:checked")).map((input) => input.value),
    });
    saveState();
    renderAll();
    showToast("设置已保存。");
  });

  document.getElementById("customTaskForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const subject = document.getElementById("customSubject").value.trim();
    const text = document.getElementById("customText").value.trim();
    const minutes = readNumber("customMinutes");
    if (!subject || !text || !minutes) return;
      state.customTasks.push({ id: String(Date.now()), subject, text, minutes });
    saveState();
    event.target.reset();
    renderSettings();
    showToast("自定义任务已添加。");
  });
}

function bindAuth() {
  document.getElementById("authForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    authAction("login");
  });
  document.getElementById("authOpenBtn")?.addEventListener("click", () => {
    renderAuthPanel();
    document.getElementById("authDialog")?.showModal();
  });
  document.getElementById("authCloseBtn")?.addEventListener("click", () => {
    document.getElementById("authDialog")?.close();
  });
  document.getElementById("signInBtn")?.addEventListener("click", () => authAction("login"));
  document.getElementById("signUpBtn")?.addEventListener("click", () => authAction("signup"));
  document.getElementById("signOutBtn")?.addEventListener("click", async () => {
    try {
      await signOut();
      currentUser = null;
      state.user = null;
      state.sync = { status: "local", lastSyncAt: "", lastError: "", pending: false };
      saveState({ skipCloud: true });
      renderAll();
      showToast("已退出账号，当前数据保留在本机。");
    } catch (error) {
      showToast(`退出失败：${error.message || error}`);
    }
  });
  document.getElementById("syncNowBtn")?.addEventListener("click", () => syncNow());
  document.getElementById("downloadBackupBtn")?.addEventListener("click", () => exportStateJson("manual-backup"));
  document.getElementById("pushLocalBtn")?.addEventListener("click", async () => {
    createLocalSnapshot("before-cloud-import");
    state.sync = { ...state.sync, localImportPending: false, cloudPaused: false };
    legacyImportPending = false;
    await syncNow({ force: true });
    saveState({ skipCloud: true });
    renderAuthPanel();
    showToast("已尝试导入云端。");
  });
  document.getElementById("keepLocalBtn")?.addEventListener("click", () => {
    state.sync = { ...state.sync, localImportPending: false, cloudPaused: true, status: "local", pending: false };
    legacyImportPending = false;
    saveState({ skipCloud: true });
    renderAuthPanel();
    document.getElementById("authDialog")?.close();
  });
  document.getElementById("resetLocalBtn")?.addEventListener("click", resetLocalData);
  document.documentElement.dataset.authBound = "1";
}

async function authAction(mode) {
  const email = document.getElementById("authEmail")?.value.trim();
  const password = document.getElementById("authPassword")?.value;
  if (!email || !password) {
    setAuthResult("error", "缺少邮箱或密码", "请先填写邮箱和至少 6 位密码。");
    return;
  }
  if (!isLikelyEmail(email)) {
    setAuthResult("error", "邮箱格式不正确", "请填写真实可用邮箱。Supabase 会拒绝 example.com 等测试域名。");
    return;
  }
  if (password.length < 6) {
    setAuthResult("error", "密码太短", "Supabase 要求密码至少 6 位。建议使用字母、数字和符号组合。");
    return;
  }
  if (!supabaseConfigured) {
    setAuthResult("error", "云端未配置", "Vercel 还没有配置 Supabase URL 或 publishable key。");
    return;
  }
  try {
    setAuthBusy(true);
    setAuthResult("pending", mode === "signup" ? "正在注册" : "正在登录", "正在连接 Supabase Auth，请稍等。");
    const result = mode === "signup" ? await signUpWithEmail(email, password) : await signInWithEmail(email, password);
    if (mode === "signup" && result?.needsEmailConfirmation) {
      currentUser = null;
      state.user = null;
      renderAuthPanel();
      setAuthResult("pending", "注册已提交，等待邮箱确认", "请打开确认邮件；确认后回到这里点击“登录并同步”。当前本机数据不会丢。");
      return;
    }
    currentUser = result?.user || result || null;
    if (currentUser) {
      state.user = { id: currentUser.id, email: currentUser.email || email };
      await pullCloudState();
      const syncResult = await syncNow();
      renderAll();
      renderAuthPanel();
      if (!syncResult?.ok) {
        const message = syncResult?.error || state.sync?.lastError || "同步未完成";
        setAuthResult("error", `${mode === "signup" ? "注册成功，但同步失败" : "登录成功，但同步失败"}`, friendlySyncError(message));
        showToast("账号已登录，但云同步未完成。请查看账号面板里的错误详情。");
        return;
      }
      setAuthResult("success", mode === "signup" ? "注册成功" : "登录成功", `当前账号：${currentUser.email || email}。数据已开启云同步。`);
      showToast(mode === "signup" ? "注册成功，已登录并开启云同步。" : "登录成功，数据已同步。");
      return;
    }
    state.user = null;
    renderAuthPanel();
    setAuthResult("pending", "注册已提交", result?.needsEmailConfirmation
      ? "请先打开邮箱确认链接，再回到这里登录。"
      : "如未自动登录，请检查邮箱确认后再登录。");
  } catch (error) {
    setAuthResult("error", `${mode === "signup" ? "注册" : "登录"}失败`, friendlyAuthError(error));
  } finally {
    setAuthBusy(false);
  }
}

function renderAuthPanel() {
  const configured = supabaseConfigured ? "云端已配置" : "未配置 Supabase 环境变量";
  const storageText = storageAvailable ? "本机缓存正常" : "本机缓存不可用";
  const userText = currentUser
    ? `当前账号：${currentUser.email || "已登录"}`
    : "未登录时也可先在本机记录。";
  setText("authHint", `${configured} · ${storageText}。${userText}`);
  setText("authBuildText", `版本 ${APP_BUILD}`);
  renderAuthResult();
  const migrationBox = document.getElementById("migrationBox");
  if (migrationBox) {
    const shouldShow = Boolean(state.sync?.localImportPending || legacyImportPending);
    migrationBox.hidden = !shouldShow;
  }
}

function isLikelyEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setAuthBusy(isBusy) {
  ["signInBtn", "signUpBtn", "signOutBtn"].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = isBusy;
  });
}

function setAuthResult(status, title, message) {
  lastAuthResult = { status, title, message };
  renderAuthResult();
  showToast(message);
}

function renderAuthResult() {
  const box = document.getElementById("authResult");
  if (!box) return;
  box.dataset.status = lastAuthResult.status || "idle";
  box.innerHTML = `
    <strong>${escapeHtml(lastAuthResult.title || "账号状态")}</strong>
    <p>${escapeHtml(lastAuthResult.message || "")}</p>
  `;
}

function friendlyAuthError(error) {
  const text = String(error?.message || error || "未知错误");
  const lower = text.toLowerCase();
  if (lower.includes("invalid login credentials")) return "邮箱或密码不正确。如果是刚注册，请确认是否已完成邮箱确认。";
  if (lower.includes("email not confirmed")) return "邮箱还没有确认。请打开确认邮件后再登录。";
  if (lower.includes("user already registered") || lower.includes("already registered")) return "这个邮箱已经注册过，请直接点击“登录并同步”。";
  if (lower.includes("invalid email")) return "邮箱地址被 Supabase 判定为无效。请换成真实常用邮箱。";
  if (lower.includes("password")) return `密码不符合要求：${text}`;
  if (lower.includes("rate limit") || lower.includes("too many")) return "请求太频繁，请等一会儿再试。";
  return text;
}

function resetLocalData() {
  if (!window.confirm("确认清理本浏览器里的学习数据和缓存？建议先导出备份。")) return;
  clearAppLocalStorage();
  state = freshState();
  legacyImportPending = false;
  saveState({ skipCloud: true });
  renderAll();
  initRoute();
  renderAuthPanel();
  showToast("已清理本机缓存。");
}

function bindNetworkStatus() {
  window.addEventListener("online", () => {
    if (state.sync?.status === "offline" && state.sync?.pending) syncNow();
    renderSyncStatus();
  });
  window.addEventListener("offline", () => {
    state.sync = { ...state.sync, status: "offline", pending: true };
    saveState({ skipCloud: true });
  });
}

function upgradeGeneratedPlans() {
  if (state.settings.planLogicVersion === PLAN_LOGIC_VERSION) return;
  Object.entries(state.weekPlans || {}).forEach(([date, tasks]) => {
    state.weekPlans[date] = (tasks || []).filter((task) => {
      if (date < PLAN_START_DATE) return task.locked || isTaskDone(task, state.tasks);
      return task.status === "shifted" || task.locked || isTaskDone(task, state.tasks);
    });
  });
  Object.keys(state.weekPlans || {}).forEach((date) => {
    if (date < PLAN_START_DATE && !(state.weekPlans[date] || []).length) delete state.weekPlans[date];
  });
  if (!state.settings.rampSettingsApplied) {
    state.settings.weekdayMinutes = defaultSettings.weekdayMinutes;
    state.settings.weekendMinutes = defaultSettings.weekendMinutes;
    state.settings.rampSettingsApplied = true;
  }
  state.settings.planLogicVersion = PLAN_LOGIC_VERSION;
  saveState({ skipCloud: true });
}

function bindWeekPlanner() {
  document.getElementById("generateWeekBtn")?.addEventListener("click", () => {
    generateWeekPlan();
    renderAll();
    showToast("已生成未来 7 天计划。");
  });
  document.getElementById("clearUnlockedWeekBtn")?.addEventListener("click", () => {
    nextSevenDates().forEach((date) => {
      state.weekPlans[date] = (state.weekPlans[date] || []).filter((task) => task.locked);
    });
    saveState();
    renderAll();
    showToast("已清理未锁定任务。");
  });
}

function parseReviewDays(value) {
  const days = value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);
  return days.length ? [...new Set(days)].sort((a, b) => a - b) : [...defaultSettings.reviewDays];
}

function applyPreset(type) {
  const phase = getCurrentPhase();
  const ramp = rampBudgetForDate();
  const normalMath = phase.id === "A" ? 45 : phase.id === "B" ? 90 : 120;
  const normalCs = phase.id === "A" ? 45 : phase.id === "B" ? 95 : 125;
  const normalEnglish = phase.id === "A" ? 20 : phase.id === "B" ? 35 : 45;
  const presets = {
    minimum: {
      mathMin: 45,
      csMin: 45,
      engMin: 20,
      polMin: phase.quotas.politics ? 20 : 0,
      projectMin: 0
    },
    normal: {
      mathMin: normalMath,
      csMin: normalCs,
      engMin: normalEnglish,
      polMin: phase.quotas.politics ? 45 : 0,
      projectMin: phase.quotas.project ? 25 : 0
    },
    strong: {
      mathMin: Math.min(180, Math.max(normalMath + 30, Math.round(ramp.weekday * 0.38))),
      csMin: Math.min(190, Math.max(normalCs + 30, Math.round(ramp.weekday * 0.40))),
      engMin: Math.min(60, Math.max(normalEnglish, Math.round(ramp.weekday * 0.14))),
      polMin: phase.quotas.politics ? 60 : 0,
      projectMin: phase.quotas.project ? 35 : 0
    }
  };

  Object.entries(presets[type]).forEach(([id, value]) => {
    document.getElementById(id).value = value || "";
  });
}

function readNumber(id) {
  const value = Number(document.getElementById(id).value);
  return Number.isFinite(value) ? value : 0;
}

function loadEntryForm() {
  const date = document.getElementById("entryDate").value || planTodayISO();
  const entry = state.entries[date] || {};
  setValue("mathMin", entry.math);
  setValue("csMin", entry.cs408);
  setValue("engMin", entry.english);
  setValue("polMin", entry.politics);
  setValue("projectMin", entry.project);
  setValue("qualityScore", entry.quality || 3);
  setValue("mathProblems", entry.mathProblems);
  setValue("csProblems", entry.csProblems);
  setValue("readingCount", entry.reading);
  setValue("newMistakes", entry.newMistakes);
  setValue("fixedMistakes", entry.fixedMistakes);
  document.getElementById("nextTask").value = entry.nextTask || "";
  document.getElementById("note").value = entry.note || "";
}

function setValue(id, value) {
  document.getElementById(id).value = value || "";
}

function setSelectValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value || "";
}

function renderAll() {
  loadEntryForm();
  renderDashboard();
  renderTasks();
  renderWeekPlanner();
  renderRecentLogs();
  renderSyllabus();
  renderFoundation();
  renderRecords();
  renderReview();
  renderScores();
  renderResources();
  renderFirstMonth();
  renderSettings();
  renderReviewQueue();
  renderStorageStatus();
  applyDensityMode();
}

function getEntryTotals(entry) {
  const total = sanitizeNumber(entry.math) + sanitizeNumber(entry.cs408) + sanitizeNumber(entry.english) + sanitizeNumber(entry.politics) + sanitizeNumber(entry.project);
  const core = sanitizeNumber(entry.math) + sanitizeNumber(entry.cs408);
  return { total, core };
}

function entriesArray() {
  return Object.entries(state.entries)
    .map(([date, entry]) => ({ date, ...entry, ...getEntryTotals(entry) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function sumMinutes(entries, key) {
  return entries.reduce((sum, item) => sum + (item[key] || 0), 0);
}

function lastDaysEntries(days) {
  const today = parseDate(planTodayISO());
  const start = new Date(today);
  start.setDate(today.getDate() - days + 1);
  return entriesArray().filter((entry) => {
    const date = parseDate(entry.date);
    return date >= start && date <= today;
  });
}

function renderDashboard() {
  const phase = getCurrentPhase();
  const all = entriesArray();
  const week = lastDaysEntries(7);
  const totalMinutes = sumMinutes(all, "total");
  const weekMinutes = sumMinutes(week, "total");
  const coreMinutes = sumMinutes(week, "core");
  const daysLeft = Math.ceil((parseDate(state.settings.targetExamDate || DEFAULT_EXAM_DATE) - parseDate(planTodayISO())) / 86400000);
  const dateStatus = examDateStatusText();
  const planDate = planTodayISO();
  const currentMonth = monthlyPlan.find((row) => planDate.startsWith(row[0]));
  const monthMinutes = sumMinutes(entriesArray().filter((entry) => entry.date.startsWith(planDate.slice(0, 7))), "total");
  const monthTarget = currentMonth ? currentMonth[1] : phase.weeklyTarget * 4;
  const monthProgress = monthTarget ? Math.min(999, monthMinutes / 60 / monthTarget * 100) : 0;

  document.getElementById("daysLeft").textContent = `${daysLeft} 天`;
  document.getElementById("totalHours").textContent = `${(totalMinutes / 60).toFixed(1)}h`;
  document.getElementById("weekHours").textContent = `${(weekMinutes / 60).toFixed(1)}h`;
  document.getElementById("coreRatioMetric").textContent = `${weekMinutes ? Math.round(coreMinutes / weekMinutes * 100) : 0}%`;
  document.getElementById("monthProgressMetric").textContent = `${Math.round(monthProgress)}%`;
  document.getElementById("monthProgressText").textContent = `本月目标 ${monthTarget}h`;
  document.getElementById("totalProgressText").textContent = `目标 ${TARGET_TOTAL_HOURS}h，当前 ${(totalMinutes / 60 / TARGET_TOTAL_HOURS * 100).toFixed(1)}%`;
  document.getElementById("weekTargetText").textContent = `本阶段周目标 ${phase.weeklyTarget}h`;
  document.getElementById("currentPhaseBadge").textContent = `阶段 ${phase.id} · ${phase.name}`;
  setText("examDateStatus", dateStatus);
  setText("officialBasisText", officialBasisText());
  renderCurveMetric(phase);

  renderRisk(week, phase);
  renderQuotas(week, phase);
  renderSyllabusMini();
  renderCoach(week, phase);
  renderHeatmap();
  renderScoreTargets();
  renderSystemRules();
  renderMemoryCurve();
  renderVisualBoard({
    phase,
    week,
    all,
    totalMinutes,
    weekMinutes,
    coreMinutes,
    monthProgress,
    monthTarget,
    monthMinutes
  });
  renderSideNav(week, phase);
  renderFocusBoard(buildDailyTasks());
  renderTargetLane({ phase, week, totalMinutes, monthTarget, monthMinutes });
  renderWorkflowRail();
  renderStorageStatus();
  renderStrategyBoard({ phase, week, weekMinutes, coreMinutes });
  renderLiveFactChecks();
}

function renderRisk(week, phase) {
  const weekHours = sumMinutes(week, "total") / 60;
  const coreMinutes = sumMinutes(week, "core");
  const totalMinutes = sumMinutes(week, "total");
  const coreRatio = totalMinutes ? coreMinutes / totalMinutes : 0;
  const newMistakes = sumMinutes(week, "newMistakes");
  const fixedMistakes = sumMinutes(week, "fixedMistakes");
  const mistakeRatio = newMistakes ? fixedMistakes / newMistakes : 1;
  const activeDays = new Set(week.filter((entry) => entry.total > 0).map((entry) => entry.date)).size;

  if (activeDays === 0) {
    const card = document.getElementById("riskCard");
    card.className = "metric-card risk";
    document.getElementById("riskLabel").textContent = "待记录";
    document.getElementById("riskText").textContent = "连续记录 3 天后给出风险判断。";
    return;
  }

  let color = "green";
  let label = "绿色";
  let text = "节奏正常，继续按计划推进。";

  if (weekHours < phase.weeklyTarget * 0.7 || coreRatio < 0.55 || activeDays <= 3) {
    color = "red";
    label = "红色";
    text = "下周减少新增内容，优先补数学和 408。";
  } else if (weekHours < phase.weeklyTarget * 0.9 || coreRatio < 0.65 || mistakeRatio < 0.5) {
    color = "amber";
    label = "黄色";
    text = "略有偏航，优先补核心时长和错题回炉。";
  }

  const card = document.getElementById("riskCard");
  card.className = `metric-card risk ${color}`;
  document.getElementById("riskLabel").textContent = label;
  document.getElementById("riskText").textContent = text;
}

function renderStrategyBoard({ phase, week, weekMinutes, coreMinutes }) {
  const controls = normalizePlanControls(state.settings.planControls);
  const strategy = getPhaseStrategy(phase.id, controls.experienceTrack);
  const today = planTodayISO();
  const windows = buildRollingReviewWindows(state.reviewItems, today, { controls });
  const signal = reviewLoadSignal(state.reviewItems, today, controls);
  const newMistakes = sumMinutes(week, "newMistakes");
  const fixedMistakes = sumMinutes(week, "fixedMistakes");
  const metrics = {
    activeDays: new Set(week.filter((entry) => entry.total > 0).map((entry) => entry.date)).size,
    coreRatio: weekMinutes ? coreMinutes / weekMinutes : 0,
    mistakeRecovery: newMistakes ? fixedMistakes / newMistakes : 1
  };
  const adjustment = recommendPlanAdjustment(metrics, controls, phase.id);
  const enabledText = controls.enabledSubjects.map(subjectLabel).join(" / ");
  const focus = controls.focusSubject === "auto" ? "自动" : subjectLabel(controls.focusSubject);

  setText("activeStrategyTitle", `${phase.id} · ${strategy.label}`);
  setText("activeStrategyText", `${strategy.method}${strategy.trackText ? ` ${strategy.trackText}` : ""}`);
  setText("rollingReviewTitle", signal.label);
  setText("rollingReviewText", signal.action);
  setText("planAdjustmentTitle", controls.planIntensity === "bottomline" ? "底线恢复" : controls.planIntensity === "strong" ? "加强推进" : "正常推进");
  setText("planAdjustmentText", adjustment);

  const tagContainer = document.getElementById("activeStrategyTags");
  if (tagContainer) {
    tagContainer.innerHTML = [
      `强度 ${planIntensityLabel(controls.planIntensity)}`,
      `聚焦 ${focus}`,
      `新内容 <= ${controls.maxNewTopics}`,
      `复盘 ${controls.reviewLoad}m/项`,
      enabledText
    ].map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  }

  const mini = document.getElementById("rollingReviewMini");
  if (mini) {
    const max = Math.max(1, ...windows.map((item) => item.count));
    mini.innerHTML = windows.slice(0, 5).map((item) => `
      <div class="review-window-mini ${item.key}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${item.count}</strong>
        <div><em style="width:${Math.max(3, item.count / max * 100)}%"></em></div>
      </div>
    `).join("");
  }
}

function renderLiveFactChecks() {
  const container = document.getElementById("liveFactGrid");
  if (!container) return;
  container.innerHTML = liveFactChecks.map((item) => `
    <article class="fact-check-card ${factStatusClass(item.status)}">
      <div>
        <span>${escapeHtml(item.label)}</span>
        <em>${escapeHtml(item.status)}</em>
      </div>
      <strong>${escapeHtml(item.value)}</strong>
      <p>${escapeHtml(item.detail)}</p>
      <small>${escapeHtml(item.source)} · ${SOURCE_CHECK_DATE}</small>
    </article>
  `).join("");
}

function factStatusClass(status) {
  if (status.includes("待")) return "pending";
  if (status.includes("历史")) return "history";
  if (status.includes("研究")) return "method";
  return "verified";
}

function planIntensityLabel(value) {
  return ({ bottomline: "底线", normal: "正常", strong: "加强" })[value] || "正常";
}

function renderCurveMetric(phase = getCurrentPhase()) {
  const today = parseDate(planTodayISO());
  const days = [];
  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const iso = formatDateISO(date);
    const entry = state.entries[iso];
    days.push({ date, iso, hours: entry ? getEntryTotals(entry).total / 60 : 0 });
  }
  const previousAvg = averageHours(days.slice(0, 7));
  const recentAvg = averageHours(days.slice(7));
  const activeDays = days.slice(7).filter((day) => day.hours > 0).length;
  const ratio = previousAvg ? recentAvg / previousAvg : 0;
  let metric = `${recentAvg.toFixed(1)}h/天`;
  let text = activeDays ? `${activeDays}/7 天有记录，继续看 14 天学习曲线。` : "记录 3 天后判断 14 天趋势";
  if (previousAvg) {
    metric = `${Math.round(ratio * 100)}%`;
    text = ratio >= 1.12 ? "近 7 天升高，确认不是单日硬冲。" :
      ratio <= 0.78 ? "近 7 天回落，先恢复底线日。" :
      "曲线基本平稳，保持当前负荷。";
  }
  setText("curveMetric", metric);
  setText("curveText", text);
}

function riskSnapshot(week, phase) {
  const weekHours = sumMinutes(week, "total") / 60;
  const totalMinutes = sumMinutes(week, "total");
  const coreRatio = totalMinutes ? sumMinutes(week, "core") / totalMinutes : 0;
  const newMistakes = sumMinutes(week, "newMistakes");
  const fixedMistakes = sumMinutes(week, "fixedMistakes");
  const mistakeRatio = newMistakes ? fixedMistakes / newMistakes : 1;
  const activeDays = new Set(week.filter((entry) => entry.total > 0).map((entry) => entry.date)).size;

  if (activeDays === 0) return { label: "待记录", color: "muted" };
  if (weekHours < phase.weeklyTarget * 0.7 || coreRatio < 0.55 || activeDays <= 3) return { label: "红色", color: "red" };
  if (weekHours < phase.weeklyTarget * 0.9 || coreRatio < 0.65 || mistakeRatio < 0.5) return { label: "黄色", color: "amber" };
  return { label: "绿色", color: "green" };
}

function renderSideNav(week, phase) {
  const weekHours = sumMinutes(week, "total") / 60;
  const totalMinutes = sumMinutes(week, "total");
  const corePercent = totalMinutes ? Math.round(sumMinutes(week, "core") / totalMinutes * 100) : 0;
  const dueCount = state.reviewItems.filter((item) => !item.done && item.dueDate <= planTodayISO()).length;
  const activeDays = entriesArray().filter((entry) => entry.total > 0).length;
  const avgSyllabus = Math.round(["math", "cs408", "english", "politics"].reduce((sum, subject) => sum + syllabusProgress(subject).percent, 0) / 4);
  const last5 = [...state.scores].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const scoreAvg = averageScores(last5).total;
  const risk = riskSnapshot(week, phase);

  setText("sidePhase", `${phase.id} · ${phase.name}`);
  setText("sideWeek", `${weekHours.toFixed(1)} / ${phase.weeklyTarget}h`);
  setText("minimumTarget", minimumTargetText(phase));
  setText("sideCoreLabel", `核心占比 ${corePercent}%`);
  setStyleWidth("sideCoreFill", `${Math.min(100, corePercent)}%`);
  setText("navRiskDot", risk.label);
  setText("navRecordDays", `${activeDays} 天`);
  setText("navReviewDue", `${dueCount} 到期`);
  setText("navSyllabusProgress", `${avgSyllabus}%`);
  setText("navScoreAvg", scoreAvg ? `${scoreAvg.toFixed(0)}` : "--");
}

function examDateStatusText() {
  const target = state.settings.targetExamDate || DEFAULT_EXAM_DATE;
  if (target === DEFAULT_EXAM_DATE) return `${target} · ${DEFAULT_EXAM_DATE_STATUS}`;
  return `${target} · 用户自定日期，仍需以当年官方公告复核`;
}

function officialBasisText() {
  return `资料核验 ${SOURCE_CHECK_DATE}：科目以北大软微 2026 已发布信息为备考基准；2027 年 12 月仍为推算窗口，官方日期待发布。`;
}

function renderWorkflowRail() {
  const container = document.getElementById("workflowRail");
  if (!container) return;
  const tasks = buildDailyTasks();
  const doneTasks = tasks.filter((task) => isTaskDone(task, state.tasks)).length;
  const planDate = planTodayISO();
  const todayEntry = state.entries[planDate];
  const dueCount = state.reviewItems.filter((item) => !item.done && item.dueDate <= planDate).length;
  const recentScores = state.scores.filter((score) => score.date >= formatDateISO(addDays(parseDate(planDate), -45))).length;
  const active14 = new Set(lastDaysEntries(14).filter((entry) => entry.total > 0).map((entry) => entry.date)).size;
  const avgSyllabus = Math.round(["math", "cs408", "english", "politics"].reduce((sum, subject) => sum + syllabusProgress(subject).percent, 0) / 4);
  const steps = [
    ["计划", `${tasks.length} 项`, tasks.length ? "done" : "wait"],
    ["执行", `${doneTasks}/${tasks.length}`, doneTasks ? "active" : "wait"],
    ["记录", todayEntry ? `${(getEntryTotals(todayEntry).total / 60).toFixed(1)}h` : "未填", todayEntry ? "done" : "active"],
    ["复盘", dueCount ? `${dueCount} 到期` : "无到期", dueCount ? "active" : "done"],
    ["日审", todayEntry?.nextTask ? "已收口" : "待收口", todayEntry?.nextTask ? "done" : todayEntry ? "active" : "wait"],
    ["统计", `${active14}/14 天`, active14 >= 8 ? "done" : active14 ? "active" : "wait"],
    ["模考", recentScores ? `${recentScores} 次` : "未到期", recentScores ? "done" : "wait"],
    ["校准", `${avgSyllabus}%`, avgSyllabus ? "active" : "wait"]
  ];
  container.innerHTML = steps.map(([label, value, status], index) => `
    <div class="workflow-step ${status}">
      <span>${index + 1}</span>
      <strong>${label}</strong>
      <em>${value}</em>
    </div>
  `).join("");
}

function renderTargetLane({ phase, week, totalMinutes, monthTarget, monthMinutes }) {
  const totalHours = totalMinutes / 60;
    const next = nextMilestone();
    const [month, , cumulative, mathFocus, csFocus, otherFocus, scoreWatch] = next;
    const remaining = Math.max(0, cumulative - totalHours);
  const weekMinutes = sumMinutes(week, "total");
  const coreRatio = weekMinutes ? sumMinutes(week, "core") / weekMinutes : 0;
  const monthPercent = monthTarget ? (monthMinutes / 60 / monthTarget) * 100 : 0;
  const last5 = [...state.scores].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const scoreAvg = averageScores(last5).total;

    let title = `${month} 节点还差 ${remaining.toFixed(0)}h`;
  let text = `本阶段重点：${mathFocus}；${csFocus}。完成后记录题量、错因和复盘日期。`;
  if (totalHours >= cumulative) {
    title = `${month} 节点已达累计线`;
    text = "继续检查核心占比、错题回炉和考点掌握。";
  } else if (coreRatio && coreRatio < 0.55) {
    title = "核心占比偏低";
    text = "本周优先安排数学和 408，减少非核心任务。";
  } else if (monthPercent >= 90) {
    title = "本月节奏接近目标";
    text = `继续按阶段验收推进。监测口径：${scoreWatch}。`;
  }

  setText("targetGateTitle", title);
  setText("targetGateText", text);
  setText("targetGateHours", `累计 ${totalHours.toFixed(1)} / ${cumulative}h`);
  setText("targetGateScore", scoreAvg ? `近 5 套 ${scoreAvg.toFixed(0)} / 500 · 目标 420` : `监测：${scoreWatch || otherFocus}`);

  const targetGrid = document.getElementById("targetSubjectGrid");
  if (targetGrid) {
    const latestAvg = averageScores(last5);
    const scoreKeys = { "政治": "politics", "英语一": "english", "数学一": "math", "408": "cs408" };
    targetGrid.innerHTML = scoreTargets.map(([subject, target, note]) => {
      const key = scoreKeys[subject];
      const max = subject === "数学一" || subject === "408" ? 150 : 100;
      const current = latestAvg[key] || 0;
      const currentText = current ? `${current.toFixed(0)} / ${target}` : `目标 ${target}`;
      const fill = Math.min(100, (current || target) / max * 100);
      return `
        <div class="target-subject">
          <div><span>${subject}</span><strong>${currentText}</strong></div>
          <div class="progress-track slim"><div class="progress-fill" style="width:${fill}%"></div></div>
          <em>${note}</em>
        </div>
      `;
    }).join("");
  }

  const tasks = buildDailyTasks();
  const doneTasks = tasks.filter((task) => isTaskDone(task, state.tasks)).length;
  const planDate = planTodayISO();
  const todayEntry = state.entries[planDate];
  const dueCount = state.reviewItems.filter((item) => !item.done && item.dueDate <= planDate).length;
  const activeCore = weekMinutes ? Math.round(coreRatio * 100) : 0;
  const checks = [
    ["任务", doneTasks >= Math.min(2, tasks.length), `${doneTasks}/${tasks.length}`],
    ["记录", Boolean(todayEntry && getEntryTotals(todayEntry).total), todayEntry ? `${(getEntryTotals(todayEntry).total / 60).toFixed(1)}h` : "未填"],
    ["复盘", dueCount === 0, dueCount ? `${dueCount} 到期` : "清空"],
    ["核心", weekMinutes === 0 || activeCore >= state.settings.coreRatio, weekMinutes ? `${activeCore}%` : "待建立"]
  ];
  const passed = checks.filter(([, ok]) => ok).length;
  setText("targetLoopScore", `${passed}/${checks.length}`);
  const audit = document.getElementById("targetLoopAudit");
  if (audit) {
    audit.innerHTML = checks.map(([label, ok, value]) => `
      <div class="audit-item ${ok ? "ok" : "warn"}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
  }
}

function renderStorageStatus() {
  const entries = entriesArray();
  const touchedTopics = Object.keys(state.topics).length;
  const exportDate = state.settings.lastExportDate;
  const lastSavedAt = state.settings.lastSavedAt ? state.settings.lastSavedAt.slice(0, 10) : "";
  const exportAge = exportDate ? Math.max(0, Math.floor((parseDate(todayISO()) - parseDate(exportDate)) / 86400000)) : null;
  const healthScore =
    Math.min(40, entries.length * 2) +
    Math.min(20, touchedTopics) +
    Math.min(20, state.reviewItems.length) +
    (exportDate && exportAge <= 7 ? 20 : exportDate ? 10 : 0);
  const health = Math.min(100, healthScore);
  setText("sideDataCount", `${entries.length} 条记录`);
  setText("sideDataSave", lastSavedAt ? `最近保存 ${lastSavedAt}` : "尚未保存");
  setStyleWidth("sideDataFill", `${health}%`);

  const container = document.getElementById("storageStatus");
  if (!container) return;
  const rows = [
    ["学习记录", `${entries.length} 天`, entries.length ? "记录已建立" : "今天先保存第一条记录"],
    ["考纲状态", `${touchedTopics} 项`, touchedTopics ? "已有考点标记" : "先标记当前数学和 408 小节"],
    ["复盘队列", `${state.reviewItems.length} 项`, state.reviewItems.length ? "任务完成后自动生成" : "勾选任务后自动生成"],
    ["备份", exportDate ? `${exportDate}` : "未导出", exportAge === null ? "建议现在导出一次 JSON" : exportAge > 7 ? `已 ${exportAge} 天未导出` : "备份节奏正常"]
  ];
  container.innerHTML = rows.map(([label, value, text]) => `
    <div class="storage-row">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${text}</p>
    </div>
  `).join("");
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function minimumTargetText(phase) {
  const politics = phase.quotas.politics ? " · 政治 20m" : "";
  return `数学 45m · 408 45m · 英语 20m${politics}`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setStyleWidth(id, value) {
  const element = document.getElementById(id);
  if (element) element.style.width = value;
}

function renderSystemRules() {
  const container = document.getElementById("ruleStack");
  if (!container) return;
  const budget = dailyBudgetMinutes();
  const rules = [
    ...systemRules,
    ["09", "今日预算自动校准", `当前设置下今日预算 ${budget} 分钟，任务生成会围绕 ${state.settings.taskCount} 项和 ${state.settings.coreRatio}% 核心占比收敛。`],
    ["10", "学习科学口径", "主动回忆、分散复盘、交错练习和可完成负荷只是提高执行质量的方法，不代表分数或录取承诺。"]
  ];
  container.innerHTML = rules.map(([num, title, text]) => `
    <article class="rule-item">
      <strong>${num}</strong>
      <div>
        <span>${title}</span>
        <p>${text}</p>
      </div>
    </article>
  `).join("");
}

function renderMemoryCurve() {
  const container = document.getElementById("memoryCurve");
  if (!container) return;
  container.innerHTML = memoryCurveRules.map(({ round, action, pass, fallback, cost }) => `
    <div class="memory-row">
      <div class="memory-head">
        <strong>${escapeHtml(round)}</strong>
        <em>${escapeHtml(cost)}</em>
      </div>
      <p>${escapeHtml(action)}</p>
      <span>通过：${escapeHtml(pass)}</span>
      <span>未过：${escapeHtml(fallback)}</span>
    </div>
  `).join("");
}

function renderQuotas(week, phase) {
  const items = [
    ["数学", "math", phase.quotas.math],
    ["408", "cs408", phase.quotas.cs408],
    ["英语", "english", phase.quotas.english],
    ["政治", "politics", phase.quotas.politics],
    ["项目", "project", phase.quotas.project]
  ];
  document.getElementById("quotaGrid").innerHTML = items.map(([label, key, target]) => {
    const hours = sumMinutes(week, key) / 60;
    const percent = target ? Math.min(100, hours / target * 100) : 0;
    const targetLabel = target ? `本周目标 ${target}h` : "本阶段暂不安排";
    return `
      <div class="quota">
        <span>${label} · ${targetLabel}</span>
        <strong>${hours.toFixed(1)}h</strong>
        <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
      </div>
    `;
  }).join("");
}

function renderVisualBoard(data) {
  renderRingGrid(data);
  renderSubjectChart(data.week, data.phase);
  renderTrendChart(data.phase);
}

function renderRingGrid({ phase, weekMinutes, coreMinutes, totalMinutes, monthProgress }) {
  const weekPercent = phase.weeklyTarget ? weekMinutes / 60 / phase.weeklyTarget * 100 : 0;
  const corePercent = weekMinutes ? coreMinutes / weekMinutes * 100 : 0;
  const totalPercent = totalMinutes / 60 / TARGET_TOTAL_HOURS * 100;
  const rings = [
    ["总量", totalPercent, `${(totalMinutes / 60).toFixed(0)}h`, `${TARGET_TOTAL_HOURS}h`],
    ["本月", monthProgress, `${Math.round(monthProgress)}%`, "月目标"],
    ["本周", weekPercent, `${(weekMinutes / 60).toFixed(1)}h`, `${phase.weeklyTarget}h`],
    ["核心", corePercent, `${Math.round(corePercent)}%`, "65%+"]
  ];
  const container = document.getElementById("ringGrid");
  if (!container) return;
  container.innerHTML = rings.map(([label, percent, value, target]) => {
    const clamped = Math.max(0, Math.min(100, percent));
    return `
      <div class="ring-card">
        <div class="ring" style="--value:${clamped}">
          <span>${value}</span>
        </div>
        <strong>${label}</strong>
        <em>${target}</em>
      </div>
    `;
  }).join("");
}

function renderSubjectChart(week, phase) {
  const subjects = [
    ["数学", "math", phase.quotas.math],
    ["408", "cs408", phase.quotas.cs408],
    ["英语", "english", phase.quotas.english],
    ["政治", "politics", phase.quotas.politics],
    ["项目", "project", phase.quotas.project]
  ];
  const maxTarget = Math.max(...subjects.map(([, , target]) => target || 1));
  const container = document.getElementById("subjectChart");
  if (!container) return;
  container.innerHTML = subjects.map(([label, key, target]) => {
    const hours = sumMinutes(week, key) / 60;
    const baseline = target || maxTarget;
    const fill = target ? Math.min(100, hours / target * 100) : hours ? Math.min(100, hours / baseline * 100) : 0;
    const visualFill = fill ? Math.max(5, fill) : 0;
    return `
      <div class="subject-bar">
        <div class="subject-bar-track">
          <div class="subject-bar-fill" style="height:${visualFill}%; --mobile-width:${visualFill}%; --bar:${subjectPalette[key] || "#13785f"}"></div>
        </div>
        <strong>${hours.toFixed(1)}</strong>
        <span>${label}</span>
        <em>${target}h</em>
      </div>
    `;
  }).join("");
}

function renderTrendChart(phase = getCurrentPhase()) {
  const container = document.getElementById("trendChart");
  if (!container) return;
  const today = parseDate(planTodayISO());
  const days = [];
  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const iso = formatDateISO(date);
    const entry = state.entries[iso];
    const minutes = entry ? getEntryTotals(entry).total : 0;
    days.push({ date, iso, hours: minutes / 60 });
  }
  const maxHours = Math.max(3, ...days.map((day) => day.hours));
  const bars = days.map((day) => {
    const height = Math.max(4, day.hours / maxHours * 100);
    return `
      <div class="trend-day" title="${day.iso} · ${day.hours.toFixed(1)}h">
        <div class="trend-stem"><span style="height:${height}%"></span></div>
        <em>${day.date.getDate()}</em>
      </div>
    `;
  }).join("");
  const curve = learningCurveSnapshot(days, phase);
  container.innerHTML = `
    <div class="trend-bars">${bars}</div>
    <div class="learning-signal-list">
      ${curve.map(([label, value, text, status]) => `
        <article class="learning-signal ${status}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <p>${escapeHtml(text)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function averageHours(days) {
  return days.length ? days.reduce((sum, day) => sum + day.hours, 0) / days.length : 0;
}

function learningCurveSnapshot(days, phase = getCurrentPhase()) {
  const previous7 = days.slice(0, 7);
  const recent7 = days.slice(7);
  const previousAvg = averageHours(previous7);
  const recentAvg = averageHours(recent7);
  const activeDays = recent7.filter((day) => day.hours > 0).length;
  const weeklyTarget = Number(phase.weeklyTarget) || 0;
  const targetDaily = weeklyTarget ? weeklyTarget / 7 : 0;
  const trendRatio = previousAvg ? recentAvg / previousAvg : recentAvg ? 1 : 0;
  const trendText = trendRatio >= 1.12 ? "近 7 天高于前 7 天，确认不是靠单日硬冲。" :
    trendRatio <= 0.78 && previousAvg ? "近 7 天明显回落，下周先恢复底线日和核心任务。" :
    activeDays ? "投入基本平稳，可以继续按当前阶段推进。" :
    "先连续记录 3 天，再判断曲线。";
  const loadStatus = recentAvg >= targetDaily * 0.9 ? "ok" : recentAvg >= targetDaily * 0.65 ? "warn" : "risk";
  const continuityStatus = activeDays >= 6 ? "ok" : activeDays >= 4 ? "warn" : "risk";
  return [
    ["7 天均值", `${recentAvg.toFixed(1)}h/天`, targetDaily ? `阶段参考 ${targetDaily.toFixed(1)}h/天。` : "阶段目标未设定。", loadStatus],
    ["曲线判断", previousAvg ? `${Math.round(trendRatio * 100)}%` : "待建立", trendText, trendRatio >= 0.78 || !previousAvg ? "ok" : "risk"],
    ["连续性", `${activeDays}/7 天`, activeDays >= 6 ? "节奏稳定，允许小幅加难度。" : "先保学习天数，再谈加量。", continuityStatus]
  ];
}

function renderScoreTargets() {
  document.getElementById("scoreTargets").innerHTML = scoreTargets.map(([subject, target, note]) => `
    <div class="score-target">
      <span>${subject}</span>
      <strong>${target}</strong>
      <em>${note}</em>
    </div>
  `).join("");
}

function renderTasks(force = false, date = planTodayISO()) {
  const phase = getCurrentPhase(date);
  const tasks = buildDailyTasks(force, date);

  const fullHtml = tasks.map((task) => {
    const checked = isTaskDone(task, state.tasks) ? "checked" : "";
    const method = subjectMethods[task.subject] || subjectMethods["复盘"];
    const blueprint = taskBlueprint(task);
    const taskId = escapeAttr(task.id);
    const subject = escapeHtml(task.subject);
    const text = escapeHtml(task.text);
    return `
      <label class="task-item task-prescription">
        <input type="checkbox" data-task="${taskId}" ${checked}>
        <span>
          <strong>${subject}<em>${escapeHtml(blueprint.metric)}</em></strong>
          <span class="task-topic">${text}</span>
          <span class="task-output">${escapeHtml(blueprint.output)}</span>
          <span class="task-steps">学法：${escapeHtml(method.learn)}</span>
          <span class="task-steps">练习：${escapeHtml(method.practice)}</span>
          <span class="task-steps">验收：${escapeHtml(method.check)}</span>
        </span>
        <em class="task-time">${Number(task.minutes) || 0}m</em>
      </label>
    `;
  }).join("");

  const compactHtml = tasks.slice(0, 4).map((task) => {
    const checked = isTaskDone(task, state.tasks) ? "checked" : "";
    return `
      <label class="task-item task-compact">
        <input type="checkbox" data-task="${escapeAttr(task.id)}" ${checked}>
        <span><strong>${escapeHtml(task.subject)}</strong><span>${escapeHtml(task.text)}</span></span>
        <em class="task-time">${Number(task.minutes) || 0}m</em>
      </label>
    `;
  }).join("");

  document.getElementById("todayTasks").innerHTML = fullHtml;
  document.getElementById("todayTasksPreview").innerHTML = compactHtml;
  document.getElementById("dailyPlan").innerHTML = renderPlanCards(tasks);
  renderDailyTaskProgress(tasks);
  const taskFlow = document.getElementById("taskFlow");
  if (taskFlow) taskFlow.innerHTML = renderTaskFlow(tasks);
  const carryCount = tasks.filter((task) => task.source === "carryover").length;
  document.getElementById("dailyPlanMeta").textContent = `${tasks.length} 个必做任务，预算 ${tasks.reduce((sum, task) => sum + task.minutes, 0)} 分钟${carryCount ? `；${carryCount} 项由未完成任务顺延` : "；完成后只做记录和到期复盘"}`;
  document.getElementById("todayPhaseText").textContent = `阶段 ${phase.id}：${phase.focus}`;
  setText("navTaskCount", `${tasks.length} 项`);
  renderFocusBoard(tasks);
  renderAcceptance(tasks);

  document.querySelectorAll("[data-task]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const task = tasks.find((item) => item.id === checkbox.dataset.task);
      state.tasks[checkbox.dataset.task] = checkbox.checked;
      if (task) {
        task.status = checkbox.checked ? "done" : "todo";
        task.completedAt = checkbox.checked ? new Date().toISOString() : "";
        if (checkbox.checked && !task.recordApplied) {
          applyTaskToEntry(task);
          task.recordApplied = true;
        }
      }
      document.querySelectorAll("[data-task]").forEach((item) => {
        if (item.dataset.task !== checkbox.dataset.task) return;
        item.checked = checkbox.checked;
        item.closest(".plan-card")?.classList.toggle("done", checkbox.checked);
      });
      if (checkbox.checked && task?.reviewItemId) {
        const item = state.reviewItems.find((review) => review.id === task.reviewItemId);
        if (item) item.done = true;
      } else if (checkbox.checked) {
        scheduleReviewForTask(checkbox.dataset.task, task);
      }
      saveState();
      renderDailyTaskProgress(tasks);
      renderReviewQueue();
      renderDashboard();
      renderFocusBoard(tasks);
      renderWeekPlanner();
    });
  });
}

function applyTaskToEntry(task) {
  const date = task.date || planTodayISO();
  const entry = state.entries[date] || {};
  const key = subjectToEntryKey(task.subject);
  if (key) entry[key] = (entry[key] || 0) + (task.minutes || 0);
  if (task.subject === "数学") entry.mathProblems = Math.max(entry.mathProblems || 0, 15);
  if (task.subject === "408") entry.csProblems = Math.max(entry.csProblems || 0, 20);
  if (task.subject === "英语") entry.reading = Math.max(entry.reading || 0, 1);
  entry.quality = entry.quality || 3;
  entry.nextTask = entry.nextTask || "";
  entry.note = entry.note || "";
  entry.updatedAt = new Date().toISOString();
  state.entries[date] = entry;
  if (date === (document.getElementById("entryDate")?.value || planTodayISO())) loadEntryForm();
}

function subjectToEntryKey(subject) {
  return {
    "数学": "math",
    "408": "cs408",
    "英语": "english",
    "政治": "politics",
    "项目": "project",
    "补弱": "math",
    "复盘": null
  }[subject] || null;
}

function nextSevenDates(startDate = planTodayISO()) {
  const start = parseDate(startDate);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return formatDateISO(date);
  });
}

function generateWeekPlan() {
  nextSevenDates().forEach((date) => buildDailyTasks(false, date));
  saveState();
}

function renderWeekPlanner() {
  const container = document.getElementById("weekPlanner");
  if (!container) return;
  const dates = nextSevenDates();
  dates.forEach((date) => {
    if (!state.weekPlans[date]?.length) buildDailyTasks(false, date);
  });
  container.innerHTML = dates.map((date) => {
    const tasks = normalizeTaskList(state.weekPlans[date] || [], date);
    const visibleTasks = tasks.filter((task) => task.status !== "shifted");
    const done = visibleTasks.filter((task) => isTaskDone(task, state.tasks)).length;
    const total = visibleTasks.reduce((sum, task) => sum + (task.minutes || 0), 0);
    const percent = visibleTasks.length ? Math.round(done / visibleTasks.length * 100) : 0;
    const subjects = [...new Set(visibleTasks.map((task) => task.subject))];
    const isToday = date === planTodayISO();
    const shortDate = date.slice(5).replace("-", "/");
    return `
      <article class="week-day-card ${isToday ? "today" : ""}">
        <div class="week-day-head">
          <div class="week-date-block">
            <span class="week-day-chip">${escapeHtml(weekDayLabel(date))}</span>
            <strong>${escapeHtml(shortDate)}${isToday ? " · 今天" : ""}</strong>
            <em>${escapeHtml(date)}</em>
          </div>
          <button type="button" data-regenerate-day="${escapeAttr(date)}" aria-label="重排 ${escapeAttr(date)} 的未锁定任务">重排</button>
        </div>
        <div class="week-day-summary">
          <span><strong>${done}/${visibleTasks.length}</strong> 完成</span>
          <span><strong>${total}</strong> 分钟</span>
        </div>
        <div class="week-subject-row" aria-label="当日科目">
          ${subjects.length ? subjects.map((subject) => `<span>${escapeHtml(subject)}</span>`).join("") : "<span>休整</span>"}
        </div>
        <div class="week-day-progress">
          <div style="width:${percent}%"></div>
        </div>
        <div class="week-task-list">
          ${visibleTasks.map((task, index) => `
            <div class="week-task ${isTaskDone(task, state.tasks) ? "done" : ""} ${task.source === "carryover" ? "carryover" : ""}">
              <span class="week-task-index">${index + 1}</span>
              <div class="week-task-body">
                <div class="week-task-title">
                  <strong>${escapeHtml(task.subject)}</strong>
                  <em>${Number(task.minutes) || 0}m</em>
                </div>
                <p>${escapeHtml(task.text)}</p>
                <span>${task.source === "carryover" ? `从 ${escapeHtml(task.carriedFrom || "前序任务")} 顺延` : task.locked ? "已锁定" : "可调整"}</span>
              </div>
              <div class="week-task-actions">
                <button type="button" data-lock-task="${escapeAttr(task.id)}">${task.locked ? "解锁" : "锁定"}</button>
                <button type="button" data-edit-task="${escapeAttr(task.id)}">编辑</button>
                <button type="button" data-shift-task="${escapeAttr(task.id)}">顺延</button>
              </div>
            </div>
          `).join("")}
        </div>
      </article>
    `;
  }).join("");
  setText("navWeekPlan", `${dates.length} 天`);

  document.querySelectorAll("[data-regenerate-day]").forEach((button) => {
    button.addEventListener("click", () => {
      buildDailyTasks(true, button.dataset.regenerateDay);
      renderAll();
      showToast("已重排该日未锁定任务。");
    });
  });
  document.querySelectorAll("[data-lock-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = findTask(button.dataset.lockTask);
      if (!task) return;
      task.locked = !task.locked;
      task.updatedAt = new Date().toISOString();
      saveState();
      renderWeekPlanner();
    });
  });
  document.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      editTask(button.dataset.editTask);
    });
  });
  document.querySelectorAll("[data-shift-task]").forEach((button) => {
    button.addEventListener("click", () => {
      shiftTaskToTomorrow(button.dataset.shiftTask);
      saveState();
      renderAll();
      showToast("已顺延到下一天。");
    });
  });
}

function weekDayLabel(date) {
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return labels[parseDate(date).getDay()];
}

function findTask(taskId) {
  for (const tasks of Object.values(state.weekPlans || {})) {
    const task = tasks.find((item) => item.id === taskId);
    if (task) return task;
  }
  return null;
}

function editTask(taskId) {
  const task = findTask(taskId);
  if (!task) return;
  const text = window.prompt("修改任务内容。要求写成可验收动作，例如：基础题 20 道 + 错因 3 条。", task.text);
  if (!text || !text.trim()) return;
  const minutes = Number(window.prompt("修改预计分钟数。建议 20-120 分钟，避免虚高。", task.minutes));
  task.text = text.trim();
  if (Number.isFinite(minutes) && minutes > 0) task.minutes = Math.min(180, Math.max(10, roundToFive(minutes)));
  task.locked = true;
  task.source = "manual";
  task.updatedAt = new Date().toISOString();
  saveState();
  renderAll();
  showToast("任务已修改并锁定。");
}

function shiftTaskToTomorrow(taskId) {
  const date = Object.keys(state.weekPlans || {}).find((day) => (state.weekPlans[day] || []).some((task) => task.id === taskId));
  if (!date) return;
  const task = state.weekPlans[date].find((item) => item.id === taskId);
  const next = formatDateISO(addDays(parseDate(date), 1));
  state.weekPlans[next] = state.weekPlans[next] || [];
  const shiftedId = `${task.id}-shift-${next}`;
  task.status = "shifted";
  task.shiftedTo = next;
  task.updatedAt = new Date().toISOString();
  state.weekPlans[next].push({
    ...task,
    id: shiftedId,
    date: next,
    priority: state.weekPlans[next].length + 1,
    locked: true,
    status: "todo",
    completedAt: "",
    recordApplied: false,
    source: "carryover",
    sourceTaskId: task.id,
    carriedFrom: task.date || date,
    updatedAt: new Date().toISOString()
  });
  state.tasks[taskId] = false;
  state.tasks[shiftedId] = false;
}

function renderFocusBoard(tasks) {
  const phase = getCurrentPhase();
  const week = lastDaysEntries(7);
  const weekHours = sumMinutes(week, "total") / 60;
  const dueCount = state.reviewItems.filter((item) => !item.done && item.dueDate <= planTodayISO()).length;
  const primary = tasks[0];
  const support = tasks.slice(1, 3);
  const weekPercent = phase.weeklyTarget ? Math.min(100, Math.round(weekHours / phase.weeklyTarget * 100)) : 0;

  setText("focusPrimarySubject", primary ? primary.subject : "未生成");
  setText("focusPrimaryTask", primary ? primary.text : "进入今日页生成任务。");
  setText("focusPrimaryTime", primary ? `${primary.minutes}m` : "--m");
  setText("focusReviewCount", `${dueCount} 项`);
  setText("focusPace", `${weekHours.toFixed(1)} / ${phase.weeklyTarget}h`);
    setText("focusRecordHint", dueCount ? "先处理到期复盘。" : "完成后保存记录。");
  setStyleWidth("focusWeekFill", `${weekPercent}%`);

  const supportNode = document.getElementById("focusSupportTasks");
  if (supportNode) {
    supportNode.innerHTML = support.length ? support.map((task) => `
      <div>
        <strong>${escapeHtml(task.subject)}</strong>
        <span>${Number(task.minutes) || 0}m</span>
      </div>
      <p>${escapeHtml(task.text)}</p>
    `).join("") : `<p>今天先完成主任务，再决定是否加量。</p>`;
  }
}

function buildDailyTasks(force = false, date = planTodayISO()) {
  const existing = state.weekPlans[date] || [];
  let carried = [];
  if (date === planTodayISO()) {
    const budget = dailyBudgetMinutes(date);
    const carryLimit = carryoverLimitForBudget(budget, state.settings.taskCount || 3);
    carried = collectCarryoverTasks(state.weekPlans, state.tasks, date, {
      limit: carryLimit,
      maxMinutes: carryLimit >= 2 ? 75 : 90
    });
    if (carried.length) markCarriedSourceTasks(state.weekPlans, carried, state.tasks);
  }
  const existingCarrySources = new Set(existing.map((task) => task.sourceTaskId || ""));
  carried = carried.filter((task) => !existingCarrySources.has(task.sourceTaskId));
  const activeExisting = normalizeTaskList([...existing, ...carried], date).filter((task) => task.status !== "shifted");
  const hasNewCarryover = carried.length > 0;
  if (activeExisting.length && !force && !hasNewCarryover) {
    const shiftedExisting = normalizeTaskList(existing, date).filter((task) => task.status === "shifted");
    state.weekPlans[date] = normalizeTaskList([...shiftedExisting, ...activeExisting], date);
    state.weekPlans[date].forEach((task) => {
      if (typeof state.tasks[task.id] === "undefined") state.tasks[task.id] = task.status === "done";
    });
    return activeExisting;
  }
  const locked = existing.filter((task) => task.locked);
  const lockedActive = [...locked, ...carried].filter((task) => task.status !== "shifted");
  const generated = createDailyTasks(date);
  const targetCount = targetTaskCountForDate(date);
  const merged = [...lockedActive];
  const budget = dailyBudgetMinutes(date);
  generated.forEach((task) => {
    if (merged.length >= targetCount) return;
    if (!merged.some((item) => item.subject === task.subject && item.text === task.text)) merged.push(task);
  });
  const nextTasks = normalizeTaskList(trimTasksToBudget(merged.slice(0, targetCount), budget, targetCount), date);
  const nextIds = new Set(nextTasks.map((task) => task.id));
  existing
    .filter((task) => task.status !== "shifted" && !task.locked && !nextIds.has(task.id))
    .forEach((task) => markDeleted("tasks", task.id));
  const shiftedExisting = existing.filter((task) => task.status === "shifted");
  state.weekPlans[date] = normalizeTaskList([...shiftedExisting, ...nextTasks], date);
  state.weekPlans[date].forEach((task) => {
    if (task.status === "shifted") state.tasks[task.id] = false;
    else if (typeof state.tasks[task.id] === "undefined") state.tasks[task.id] = task.status === "done";
  });
  saveState();
  return state.weekPlans[date].filter((task) => task.status !== "shifted");
}

function carryoverLimitForBudget(budget, taskCount) {
  if (budget <= bottomLineMinutes(getCurrentPhase())) return 1;
  if (taskCount <= 3) return 1;
  return 2;
}

function targetTaskCountForDate(date = planTodayISO()) {
  const controls = normalizePlanControls(state.settings.planControls);
  const base = Math.min(4, Math.max(3, state.settings.taskCount || 3));
  if (controls.planIntensity === "bottomline" || shouldUseMinimumDay(date)) return 2;
  if (controls.planIntensity === "strong") return 4;
  return base;
}

function createDailyTasks(date = planTodayISO()) {
  const phase = getCurrentPhase(date);
  const controls = normalizePlanControls(state.settings.planControls);
  const weights = subjectPlanWeights(phase.id, controls);
  const weak = getWeakSubject();
  const topicMath = topicForDate("math", date);
  const topicCs = topicForDate("cs408", date);
  const topicEnglish = topicForDate("english", date);
  const topicPolitics = phase.quotas.politics ? topicForDate("politics", date) : null;
  const budget = dailyBudgetMinutes(date);
  const targetCount = targetTaskCountForDate(date);
  const reviewCapacity = Math.max(1, Math.floor(Math.max(controls.reviewLoad, budget * 0.25) / controls.reviewLoad));
  const tasks = dueReviewTasks(date).slice(0, reviewCapacity).map((task) => ({
    ...task,
    minutes: controls.reviewLoad,
    priority: 1
  }));

  const coreFloor = phase.id === "A" ? 35 : 45;
  const minutesFor = (key, floor, cap = 240) => Math.max(floor, Math.min(cap, roundToFive(budget * (weights[key] || 0))));
  const englishMinutes = minutesFor("english", 20, 70);
  const politicsMinutes = minutesFor("politics", 25, 75);
  const projectMinutes = minutesFor("project", 20, 60);
  const reviewReserve = controls.enabledSubjects.includes("review") && targetCount > 3 ? Math.max(15, roundToFive(budget * (weights.review || 0.08))) : 0;
  const politicsDay = Boolean(topicPolitics && weights.politics > 0 && parseDate(date).getDay() % 2 === 0);
  const nonCoreReserve = (politicsDay ? politicsMinutes : englishMinutes) + reviewReserve;
  const minimumCore = Math.round(budget * (state.settings.coreRatio || 65) / 100);
  const coreMinutes = Math.max(coreFloor * 2, minimumCore, budget - nonCoreReserve);
  const coreWeight = (weights.math || 0) + (weights.cs408 || 0) || 1;
  const mathMinutes = Math.max(coreFloor, roundToFive(coreMinutes * ((weights.math || 0.5) / coreWeight)));
  const csMinutes = Math.max(coreFloor, roundToFive(coreMinutes * ((weights.cs408 || 0.5) / coreWeight)));

  if (controls.enabledSubjects.includes("math")) {
    tasks.push(topicTask(date, phase, "数学", topicMath, mathMinutes, "高数/线代/概率按阶段推进"));
  }
  if (controls.enabledSubjects.includes("cs408")) {
    tasks.push(topicTask(date, phase, "408", topicCs, csMinutes, "按数据结构、计组、OS、计网推进"));
  }
  if (topicPolitics && politicsDay && controls.enabledSubjects.includes("politics")) {
    tasks.push(topicTask(date, phase, "政治", topicPolitics, politicsMinutes, "基础框架、选择题、背诵"));
  } else if (controls.enabledSubjects.includes("english")) {
    tasks.push(topicTask(date, phase, "英语", topicEnglish, englishMinutes, "单词、长难句、真题阅读"));
  }

  if (topicPolitics && !politicsDay && controls.enabledSubjects.includes("politics") && tasks.length < targetCount) {
    tasks.push(topicTask(date, phase, "政治", topicPolitics, politicsMinutes, "基础框架、选择题、背诵"));
  } else if (controls.enabledSubjects.includes("review") && tasks.length < targetCount) {
    tasks.push({
      id: `${date}-${phase.id}-review`,
      subject: "复盘",
      text: "回炉本周错题，写出错因和下次识别信号",
      minutes: Math.max(15, reviewReserve || roundToFive(budget * (weights.review || 0.08))),
      priority: 8
    });
  }

  if (weights.project > 0 && controls.enabledSubjects.includes("project") && tasks.length < targetCount) {
    tasks.push({
      id: `${date}-${phase.id}-project`,
      subject: "项目",
      text: "推进复试项目最小可展示功能或补 README 证据",
      minutes: projectMinutes,
      priority: 9
    });
  }

  if (weak && controls.enabledSubjects.includes(subjectKey(weak.label)) && tasks.length < targetCount + 1) {
    tasks.push({
      id: `${date}-weak-${weak.key}`,
      subject: "补弱",
      text: `${weak.label} 本周低于配额，补 30 分钟核心任务`,
      minutes: 30,
      priority: 7
    });
  }

  state.customTasks.slice(0, 2).forEach((custom) => {
    if (tasks.length < targetCount && controls.enabledSubjects.includes(subjectKey(custom.subject)) && !tasks.some((task) => task.text === custom.text)) {
      tasks.push({
        id: `${date}-custom-${custom.id}`,
        subject: custom.subject,
        text: custom.text,
        minutes: custom.minutes,
        priority: 6
      });
    }
  });

  return applyPlanControls(trimTasksToBudget(tasks.filter(Boolean), budget, Math.max(targetCount, tasks.length)), {
    controls,
    targetCount,
    budget
  }).map((task, index) => ({
    ...task,
    date,
    priority: task.priority || index + 1,
    status: task.status === "shifted" ? "shifted" : isTaskDone(task, state.tasks) ? "done" : task.status || "todo",
    locked: Boolean(task.locked),
    source: task.source || "generated"
  }));
}

function normalizeTaskList(tasks, date) {
  return tasks.map((task, index) => ({
    id: task.id || `${date}-${index}-${task.subject}`,
    date,
    subject: task.subject,
    text: task.text,
    topicId: task.topicId || "",
    minutes: task.minutes || 0,
    priority: task.priority || index + 1,
    status: task.status === "shifted" ? "shifted" : isTaskDone(task, state.tasks) ? "done" : task.status || "todo",
    locked: Boolean(task.locked),
    source: task.source || "generated",
    sourceTaskId: task.sourceTaskId || "",
    carriedFrom: task.carriedFrom || "",
    shiftedTo: task.shiftedTo || "",
    reviewItemId: task.reviewItemId || "",
    completedAt: task.completedAt || "",
    recordApplied: Boolean(task.recordApplied)
  }))
    .sort((a, b) => {
      if (a.status === "shifted" && b.status !== "shifted") return 1;
      if (b.status === "shifted" && a.status !== "shifted") return -1;
      if (a.source === "carryover" && b.source !== "carryover") return -1;
      if (b.source === "carryover" && a.source !== "carryover") return 1;
      return a.priority - b.priority;
    })
    .map((task, index) => ({ ...task, priority: task.status === "shifted" ? task.priority : index + 1 }));
}

function dailyBudgetMinutes(date = planTodayISO()) {
  const phase = getCurrentPhase(date);
  const controls = normalizePlanControls(state.settings.planControls);
  const day = parseDate(date).getDay();
  const isWeekend = day === 0 || day === 6;
  const ramp = rampBudgetForDate(date);
  const settingCap = isWeekend ? state.settings.weekendMinutes : state.settings.weekdayMinutes;
  const rampCap = isWeekend ? ramp.weekend : ramp.weekday;
  const current = parseDate(date);
  const earlyRampEnd = parseDate("2026-08-31");
  const userCap = current <= earlyRampEnd ? Math.min(settingCap || rampCap, rampCap) : Math.max(settingCap, rampCap);
  const floor = bottomLineMinutes(phase);
  const normalBudget = phase.id === "A" ? Math.min(userCap, Math.max(Math.min(floor, userCap), rampCap)) : Math.max(floor, userCap);
  if (controls.planIntensity === "bottomline" || shouldUseMinimumDay(date)) return Math.min(normalBudget, floor);
  if (controls.planIntensity === "strong") return Math.min(Math.round(normalBudget * 1.18), Math.max(normalBudget, userCap + 60));
  return normalBudget;
}

function rampBudgetForDate(date = planTodayISO()) {
  const current = parseDate(date);
  if (current < parseDate(rampBudgets[0].start)) return rampBudgets[0];
  return rampBudgets.find((item) => current >= parseDate(item.start) && current <= parseDate(item.end)) || rampBudgets[rampBudgets.length - 1];
}

function shouldUseMinimumDay(date = planTodayISO()) {
  const cursor = parseDate(date);
  let lowDays = 0;
  for (let index = 1; index <= 3; index += 1) {
    const day = new Date(cursor);
    day.setDate(cursor.getDate() - index);
    const entry = state.entries[formatDateISO(day)];
    if (!entry) continue;
    const total = getEntryTotals(entry).total;
    if (total > 0 && total < 120) lowDays += 1;
  }
  return lowDays >= 2;
}

function bottomLineMinutes(phase = getCurrentPhase()) {
  if (phase.id === "A") return 90;
  return 45 + 45 + 20 + (phase.quotas.politics ? 20 : 0) + 10;
}

function trimTasksToBudget(tasks, budget, targetCount) {
  const hardBudget = Math.max(0, budget || 0);
  const hasCarryover = tasks.some((task) => task.source === "carryover");
  const desiredCount = Math.min(targetCount, tasks.length);
  const minCount = Math.min(desiredCount, hasCarryover ? 2 : 3);
  let selected = tasks.slice(0, Math.min(6, Math.max(minCount, targetCount)));
  while (selected.length > minCount && selected.reduce((sum, task) => sum + task.minutes, 0) > hardBudget) {
    selected.pop();
  }
  const total = selected.reduce((sum, task) => sum + task.minutes, 0);
  if (total > hardBudget && total > 0) {
    const scale = hardBudget / total;
    selected = selected.map((task) => {
      const floor = task.subject === "数学" || task.subject === "408" ? 30 : task.subject === "复盘" ? 15 : 15;
      return { ...task, minutes: Math.max(floor, floorToFive(task.minutes * scale)) };
    });
  }
  while (selected.length > 1 && selected.reduce((sum, task) => sum + task.minutes, 0) > hardBudget) {
    const removableIndex = findLowestValueTaskIndex(selected);
    selected.splice(removableIndex, 1);
  }
  return selected;
}

function findLowestValueTaskIndex(tasks) {
  const rank = { "项目": 6, "政治": 5, "英语": 4, "补弱": 3, "数学": 2, "408": 2, "复盘": 1 };
  let index = tasks.length - 1;
  let worst = -1;
  tasks.forEach((task, taskIndex) => {
    const score = (rank[task.subject] || 3) * 1000 + (task.priority || taskIndex);
    if (task.source === "carryover" || task.reviewItemId) return;
    if (score >= worst) {
      worst = score;
      index = taskIndex;
    }
  });
  return index;
}

function roundToFive(value) {
  return Math.round(value / 5) * 5;
}

function floorToFive(value) {
  return Math.floor(value / 5) * 5;
}

function taskBlueprint(task) {
  return taskBlueprints[task.subject] || taskBlueprints["复盘"];
}

function renderPlanCards(tasks) {
  return tasks.map((task, index) => {
    const blueprint = taskBlueprint(task);
    const method = subjectMethods[task.subject] || subjectMethods["复盘"];
    const checked = isTaskDone(task, state.tasks) ? "checked" : "";
    const openDetail = state.settings.density === "detail" ? "open" : "";
    const featured = index === 0 ? "primary-task" : "";
    const carryover = task.source === "carryover" ? "carryover-task" : "";
    return `
      <article class="plan-card ${checked ? "done" : ""} ${featured} ${carryover}">
        <div class="plan-index">${index + 1}</div>
        <div>
          <div class="plan-head">
            <label class="plan-check">
              <input type="checkbox" data-task="${escapeAttr(task.id)}" ${checked}>
              <strong>${escapeHtml(task.subject)}</strong>
            </label>
            <span>${Number(task.minutes) || 0} 分钟</span>
          </div>
          <div class="plan-meta-line">
            <em>${task.source === "carryover" ? `顺延自 ${escapeHtml(task.carriedFrom || "前序任务")}` : index === 0 ? "当前主任务" : "支撑任务"}</em>
            <em>${escapeHtml(blueprint.metric)}</em>
          </div>
          <p>${escapeHtml(task.text)}</p>
          <div class="plan-output">${escapeHtml(blueprint.output)}</div>
          <details class="plan-detail" ${openDetail}>
            <summary>展开学法和验收</summary>
            <ul>
              <li>${escapeHtml(method.learn)}</li>
              <li>${escapeHtml(method.practice)}</li>
              <li>${escapeHtml(method.check)}</li>
            </ul>
          </details>
        </div>
      </article>
    `;
  }).join("");
}

function renderDailyTaskProgress(tasks) {
  const container = document.getElementById("dailyTaskProgress");
  if (!container) return;
  const done = tasks.filter((task) => isTaskDone(task, state.tasks)).length;
  const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const minutes = tasks.reduce((sum, task) => sum + (isTaskDone(task, state.tasks) ? task.minutes : 0), 0);
  container.innerHTML = `
    <div class="daily-progress-head">
      <strong>今日完成 ${done}/${tasks.length}</strong>
      <span>${minutes} 分钟已完成 · ${percent}%</span>
    </div>
    <div class="progress-track slim"><div class="progress-fill" style="width:${percent}%"></div></div>
  `;
}

function renderTaskFlow(tasks) {
  return tasks.map((task, index) => {
    const blueprint = taskBlueprint(task);
    return `
      <article class="task-flow-card">
        <div class="flow-index">${index + 1}</div>
        <div>
          <div class="flow-head">
            <strong>${escapeHtml(task.subject)}</strong>
            <span>${Number(task.minutes) || 0}m</span>
          </div>
          <p>${escapeHtml(task.text)}</p>
          <div class="flow-steps">
            ${blueprint.steps.map((step) => `<em>${escapeHtml(step)}</em>`).join("")}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function topicForDate(subject, date = planTodayISO()) {
  const curated = firstMonthTopicOverride(subject, date);
  if (curated) return curated;
  const candidates = nextTopics(subject, 30);
  const dayOffset = Math.max(0, Math.floor((parseDate(date) - parseDate(planTodayISO())) / 86400000));
  return candidates[Math.min(dayOffset, Math.max(0, candidates.length - 1))] || candidates[0];
}

function firstMonthTopicOverride(subject, date = planTodayISO()) {
  const start = parseDate(PLAN_START_DATE);
  const current = parseDate(date);
  const index = Math.floor((current - start) / 86400000);
  const sequence = foundationDailySequence[subject];
  if (!sequence || index < 0 || index >= sequence.length) return null;
  const [group, topic] = sequence[index];
  const subjectTitle = { math: "数学一", cs408: "408", english: "英语一", politics: "政治" }[subject] || subject;
  return manualTopic(subjectTitle, group, topic);
}

function manualTopic(subjectTitle, group, topic) {
  return {
    id: `${subjectTitle}/${group}/${topic}`,
    group,
    topic,
    state: 0
  };
}

function topicTask(date, phase, subject, topic, minutes, fallback) {
  const detail = topic ? `${topic.group}：${topic.topic}` : fallback;
  const stateLabel = topic && topic.state === 1 ? "复盘" : "推进";
  return {
    id: `${date}-${phase.id}-${subject}-${topic ? topic.id : "fallback"}`,
    subject,
    text: `${stateLabel}${detail}`,
    minutes
  };
}

function scheduleReviewForTask(taskId, task) {
  if (!task || state.reviewItems.some((item) => item.sourceTaskId === taskId)) return;
  const base = parseDate(task.date || planTodayISO());
  const items = state.settings.reviewDays.map((days) => {
    const due = new Date(base);
    due.setDate(base.getDate() + days);
    return {
      id: `${taskId}-r${days}`,
      sourceTaskId: taskId,
      subject: task.subject,
      text: task.text,
      round: `D+${days}`,
      dueDate: formatDateISO(due),
      status: "due",
      done: false,
      delayCount: 0,
      failureReason: "",
      quality: 0
    };
  });
  state.reviewItems.push(...items);
}

function dueReviewTasks(date = planTodayISO()) {
  return state.reviewItems
    .filter((item) => !item.done && item.status !== "done" && item.dueDate <= date)
    .slice(0, 1)
    .map((item) => ({
      id: `review-${item.id}`,
      subject: "复盘",
      text: `${item.round}：${item.subject} · ${item.text}`,
      minutes: 25,
      reviewItemId: item.id
    }));
}

function renderReviewQueue() {
  const planDate = planTodayISO();
  const due = state.reviewItems.filter((item) => !item.done && item.status !== "done" && item.dueDate <= planDate);
  const upcoming = state.reviewItems.filter((item) => !item.done && item.status !== "done" && item.dueDate > planDate).slice(0, 8);
  const todayHtml = due.length ? due.map(renderReviewItem).join("") : `<div class="empty-state">今天没有到期复盘。完成任务后会自动安排 D+1/D+3/D+7/D+14/D+30。</div>`;
  document.getElementById("reviewQueue").innerHTML = todayHtml;
  document.getElementById("spacedReviewList").innerHTML = [...due, ...upcoming].length ? [...due, ...upcoming].map(renderReviewItem).join("") : `<div class="empty-state">复盘队列为空。先完成今日任务，系统会自动生成复盘。</div>`;
  renderReviewPolicy(due.length, upcoming.length);
  setText("navReviewDue", `${due.length} 到期`);

  document.querySelectorAll("[data-review-done]").forEach((button) => {
    button.addEventListener("click", () => {
      completeReview(button.dataset.reviewDone, 4);
      saveState();
      renderReviewQueue();
      renderDashboard();
      showToast("复盘已完成。");
    });
  });
  document.querySelectorAll("[data-review-delay]").forEach((button) => {
    button.addEventListener("click", () => {
      delayReview(button.dataset.reviewDelay, Number(button.dataset.days) || 1);
      saveState();
      renderReviewQueue();
      showToast("已顺延复盘。");
    });
  });
  document.querySelectorAll("[data-review-fail]").forEach((button) => {
    button.addEventListener("click", () => {
      failReview(button.dataset.reviewFail);
      saveState();
      renderReviewQueue();
      showToast("已记录失败原因，并安排短复盘。");
    });
  });
}

function completeReview(id, quality = 4) {
  const item = state.reviewItems.find((review) => review.id === id);
  if (!item) return;
  item.done = true;
  item.status = "done";
  item.quality = quality;
  item.completedAt = new Date().toISOString();
  if (quality <= 2) cloneShortReview(item, "低质量复盘");
}

function delayReview(id, days) {
  const item = state.reviewItems.find((review) => review.id === id);
  if (!item) return;
  const due = parseDate(item.dueDate);
  due.setDate(due.getDate() + days);
  item.dueDate = formatDateISO(due);
  item.delayCount = (item.delayCount || 0) + 1;
  item.status = "delayed";
}

function failReview(id) {
  const item = state.reviewItems.find((review) => review.id === id);
  if (!item) return;
  const reasons = ["概念不清", "公式不熟", "题型识别失败", "计算错误", "表达不规范", "记忆遗忘"];
  const reason = window.prompt(`选择或填写失败原因：${reasons.join(" / ")}`, item.failureReason || "概念不清");
  item.failureReason = reason || "未说明";
  item.status = "failed";
  item.quality = 1;
  cloneShortReview(item, item.failureReason);
}

function cloneShortReview(item, reason) {
  const due = addDays(parseDate(planTodayISO()), 1);
  state.reviewItems.push({
    id: `${item.id}-retry-${Date.now()}`,
    sourceTaskId: item.sourceTaskId,
    subject: item.subject,
    text: `${item.text}（回炉：${reason}）`,
    round: "D+1短复盘",
    dueDate: formatDateISO(due),
    status: "due",
    done: false,
    delayCount: 0,
    failureReason: reason,
    quality: 0
  });
}

function renderReviewPolicy(dueCount, upcomingCount) {
  const container = document.getElementById("reviewPolicy");
  if (!container) return;
  const rows = [
    ["到期", `${dueCount} 项`, "今天优先处理到期复盘，再开新内容。"],
    ["排队", `${upcomingCount} 项`, "未来复盘只保留轻量回炉，避免挤压数学和 408 主任务。"],
    ["间隔", state.settings.reviewDays.map((day) => `D+${day}`).join(" / "), "可在设置里调整，但不建议少于 4 轮。"],
    ...auditCadenceRules.map((item) => [item.label, item.value, item.text]),
    ...reviewOutcomeRules.map(([label, text]) => [label, "判定口径", text])
  ];
  container.innerHTML = rows.map(([label, value, text]) => `
    <div class="review-policy-row">
      <strong>${label}</strong>
      <span>${text}</span>
      <em>${value}</em>
    </div>
  `).join("");
}

function renderReviewItem(item) {
  const due = item.dueDate <= planTodayISO() ? "due" : "";
  return `
    <article class="review-queue-item ${due}">
      <div>
        <strong>${escapeHtml(item.round)} · ${escapeHtml(item.subject)}</strong>
        <p>${escapeHtml(item.text)}</p>
        <span>${escapeHtml(item.dueDate)}${item.failureReason ? ` · ${escapeHtml(item.failureReason)}` : ""}</span>
      </div>
      <div class="review-actions">
        <button type="button" data-review-done="${escapeAttr(item.id)}">完成</button>
        <button type="button" data-review-delay="${escapeAttr(item.id)}" data-days="1">+1</button>
        <button type="button" data-review-delay="${escapeAttr(item.id)}" data-days="3">+3</button>
        <button type="button" data-review-fail="${escapeAttr(item.id)}">失败</button>
      </div>
    </article>
  `;
}

function nextTopics(subject, limit = 3) {
  const data = syllabus[subject];
  if (!data) return [];
  const topics = [];
  data.groups.forEach(([group, groupTopics]) => {
    groupTopics.forEach((topic) => {
      const id = topicId(subject, group, topic);
      const stateValue = state.topics[id] || 0;
      if (stateValue < 2) {
        topics.push({ id, group, topic, state: stateValue });
      }
    });
  });
  return topics
    .sort((a, b) => b.state - a.state)
    .slice(0, limit);
}

function renderAcceptance(tasks) {
  const subjects = [...new Set(tasks.map((task) => task.subject || "复盘"))];
  const standards = subjects.map((subject) => [subject, subjectAcceptanceRules[subject] || subjectAcceptanceRules["复盘"]]);
  document.getElementById("acceptanceList").innerHTML = standards.map(([subject, rule]) => `
    <article class="acceptance-item">
      <strong>${escapeHtml(subject)}</strong>
      <div>
        <p><span>最低</span>${escapeHtml(rule.minimum)}</p>
        <p><span>标准</span>${escapeHtml(rule.standard)}</p>
        <p><span>高质量</span>${escapeHtml(rule.high)}</p>
      </div>
    </article>
  `).join("");
}

function renderFoundation() {
  renderLearningPath();
  renderWeekPath();
  document.getElementById("foundationGrid").innerHTML = foundationPlan.map((stage, index) => `
    <article class="foundation-card">
      <div class="foundation-index">${String(index).padStart(2, "0")}</div>
      <div class="foundation-body">
        <div class="foundation-meta">
          <span>${stage.weeks}</span>
          <em>Layer ${index}</em>
        </div>
        <h4>${stage.title}</h4>
        <p>${stage.goal}</p>
        <ul>${stage.tasks.map((item) => `<li>${item}</li>`).join("")}</ul>
        <strong class="foundation-pass">过关：${stage.pass}</strong>
      </div>
    </article>
  `).join("");
}

function renderFirstMonth() {
  document.getElementById("firstMonthGrid").innerHTML = firstMonthActions.map((item) => `
    <article class="first-month-card">
      <div class="first-month-head">
        <strong>${item.week}</strong>
        <span>${item.pass}</span>
      </div>
      <ul>${item.tasks.map((task) => `<li>${task}</li>`).join("")}</ul>
    </article>
  `).join("");
}

function renderLearningPath() {
  const phase = getCurrentPhase();
  const activeIndex = Math.max(0, phases.findIndex((item) => item.id === phase.id));
  document.getElementById("pathRail").innerHTML = learningPath.map((step, index) => {
    const status = index < activeIndex ? "done" : index === activeIndex ? "active" : "";
    return `
      <article class="path-step ${status}">
        <div class="path-step-index">${String(index + 1).padStart(2, "0")}</div>
        <div class="path-step-copy">
          <span>${step.range}</span>
          <strong>${step.name}</strong>
          <p>${step.goal}</p>
          <em>${step.deliverable}</em>
        </div>
      </article>
    `;
  }).join("");
}

function renderWeekPath() {
  const phase = getCurrentPhase();
  const ramp = rampBudgetForDate();
  const mathTopic = nextTopics("math", 1)[0];
  const csTopic = nextTopics("cs408", 1)[0];
  const englishTopic = nextTopics("english", 1)[0];
  const items = [
    ["1", "渐进时长", `${ramp.note}：工作日 ${ramp.weekday}m，周末 ${ramp.weekend}m。`],
    ["2", "主推数学", mathTopic ? `${mathTopic.group}：${mathTopic.topic}` : "回炉数学错题。"],
    ["3", "主推 408", csTopic ? `${csTopic.group}：${csTopic.topic}` : "回炉 408 错题。"],
    ["4", "英语不断", englishTopic ? `${englishTopic.group}：${englishTopic.topic}` : "单词和阅读保持。"],
    ["5", "周末复盘", `对照阶段 ${phase.id}：${phase.focus}`]
  ];
  document.getElementById("weekPath").innerHTML = items.map(([num, title, text]) => `
    <div class="week-step">
      <span>${num}</span>
      <div>
        <strong>${title}</strong>
        <p>${text}</p>
      </div>
    </div>
  `).join("");
}

function renderRecords() {
  renderRecordSummary();
  const month = document.getElementById("recordMonth")?.value || "";
  const records = entriesArray()
    .filter((entry) => !month || entry.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById("recordsTable").innerHTML = records.length ? records.map((entry) => {
    const coreRatio = entry.total ? Math.round(entry.core / entry.total * 100) : 0;
    const mistakeRatio = entry.newMistakes ? Math.round((entry.fixedMistakes || 0) / entry.newMistakes * 100) : "--";
    return `
      <article class="record-row">
        <div class="record-main">
          <strong>${escapeHtml(entry.date)}</strong>
          <span>${(entry.total / 60).toFixed(1)}h · 核心 ${coreRatio}% · 错题回炉 ${mistakeRatio}%</span>
        </div>
        <div class="record-detail">
          数学 ${entry.math || 0}m / ${entry.mathProblems || 0} 题 · 408 ${entry.cs408 || 0}m / ${entry.csProblems || 0} 题 · 英语 ${entry.english || 0}m / ${entry.reading || 0} 篇 · 政治 ${entry.politics || 0}m · 项目 ${entry.project || 0}m
        </div>
        ${entry.nextTask ? `<div class="record-note">明日第一任务：${escapeHtml(entry.nextTask)}</div>` : ""}
        ${entry.note ? `<div class="record-note">备注：${escapeHtml(entry.note)}</div>` : ""}
        <div class="record-actions">
          <button class="edit-record" data-edit-record="${escapeAttr(entry.date)}">编辑</button>
          <button class="delete-record" data-delete-record="${escapeAttr(entry.date)}">删除</button>
        </div>
      </article>
    `;
  }).join("") : `<div class="empty-state">当前筛选下还没有记录。先去“今日任务”保存一条。</div>`;

  document.querySelectorAll("[data-edit-record]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("entryDate").value = button.dataset.editRecord;
      loadEntryForm();
      switchView("today");
      showToast("已载入该日记录，可修改后保存。");
    });
  });

  document.querySelectorAll("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const date = button.dataset.deleteRecord;
      if (window.confirm(`确认删除 ${date} 的记录？`)) {
        delete state.entries[date];
        markDeleted("records", date);
        saveState();
        renderAll();
        showToast("记录已删除。");
      }
    });
  });
}

function switchView(viewId) {
  if (!document.getElementById(viewId)) return;
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
  const nav = document.querySelector(`[data-view="${viewId}"]`);
  document.getElementById("viewTitle").textContent = nav ? nav.dataset.title || nav.textContent.trim() : "";
  if (nav && window.matchMedia("(max-width: 760px)").matches) {
    window.requestAnimationFrame(() => {
      nav.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });
  }
  scrollToTop();
}

function scrollToTop() {
  window.requestAnimationFrame(() => window.scrollTo(0, 0));
  window.setTimeout(() => window.scrollTo(0, 0), 60);
  window.setTimeout(() => window.scrollTo(0, 0), 180);
}

function exportRecordsCsv() {
  const headers = ["日期", "数学分钟", "408分钟", "英语分钟", "政治分钟", "项目分钟", "总分钟", "核心分钟", "数学题", "408题", "阅读篇", "新增错题", "回炉错题", "明日第一任务", "备注"];
  const rows = entriesArray().map((entry) => [
    entry.date,
    entry.math || 0,
    entry.cs408 || 0,
    entry.english || 0,
    entry.politics || 0,
    entry.project || 0,
    entry.total || 0,
    entry.core || 0,
    entry.mathProblems || 0,
    entry.csProblems || 0,
    entry.reading || 0,
    entry.newMistakes || 0,
    entry.fixedMistakes || 0,
    entry.nextTask || "",
    entry.note || ""
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pku-swm-records-${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvCell(value) {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}

function renderRecordSummary() {
  const all = entriesArray();
  const currentMonth = planTodayISO().slice(0, 7);
  const monthEntries = all.filter((entry) => entry.date.startsWith(currentMonth));
  const totalHours = sumMinutes(all, "total") / 60;
  const monthHours = sumMinutes(monthEntries, "total") / 60;
  const activeDays = all.filter((entry) => entry.total > 0).length;
  const coreRatio = sumMinutes(all, "total") ? sumMinutes(all, "core") / sumMinutes(all, "total") : 0;
  const cards = [
    ["累计小时", `${totalHours.toFixed(1)}h`],
    ["本月小时", `${monthHours.toFixed(1)}h`],
    ["记录天数", `${activeDays} 天`],
    ["核心占比", `${Math.round(coreRatio * 100)}%`]
  ];
  document.getElementById("recordSummary").innerHTML = cards.map(([label, value]) => `
    <div class="record-stat">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function getWeakSubject() {
  const phase = getCurrentPhase();
  const week = lastDaysEntries(7);
  const activeDays = new Set(week.filter((entry) => entry.total > 0).map((entry) => entry.date)).size;
  if (activeDays < 3) return null;
  const subjects = [
    ["math", "数学"],
    ["cs408", "408"],
    ["english", "英语"],
    ["politics", "政治"]
  ];
  let weakest = null;
  subjects.forEach(([key, label]) => {
    const target = phase.quotas[key];
    if (!target) return;
    const actual = sumMinutes(week, key) / 60;
    const ratio = actual / target;
    if (!weakest || ratio < weakest.ratio) {
      weakest = { key, label, ratio };
    }
  });
  return weakest && weakest.ratio < 0.7 ? weakest : null;
}

function renderSyllabusMini() {
  const subjects = Object.keys(syllabus);
  document.getElementById("syllabusMini").innerHTML = subjects.map((key) => {
    const stat = syllabusSubjectDetail(key);
    const next = nextTopics(key, 1)[0];
    return `
      <div class="mini-row">
        <div class="mini-row-head"><span>${syllabus[key].title}</span><span>${stat.percent}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${stat.percent}%"></div></div>
        <div class="mini-row-meta">已掌握 ${stat.done}/${stat.total} · 需复盘 ${stat.review} · 下一步：${next ? `${next.group} / ${next.topic}` : "回炉错题"}</div>
      </div>
    `;
  }).join("");
}

function renderSyllabus(selected = document.querySelector(".seg.active")?.dataset.syllabus || "math") {
  const data = syllabus[selected];
  renderSyllabusDashboard(selected);
  const density = state.settings.density || "balanced";
  const nextGroup = nextTopics(selected, 1)[0]?.group;
  document.getElementById("syllabusBoard").innerHTML = data.groups.map(([group, topics], index) => {
    const progress = groupProgress(selected, group);
    const groupType = syllabusGroupMeta(selected, group);
    const shouldOpen = density === "detail" || progress.review > 0 || group === nextGroup || (!nextGroup && index === 0);
    return `
      <details class="syllabus-group" ${shouldOpen ? "open" : ""}>
        <summary class="syllabus-group-summary">
          <div>
            <span class="syllabus-type-pill ${groupType.type}">${escapeHtml(groupType.label)}</span>
            <strong>${escapeHtml(group)}</strong>
            <span>${sanitizeNumber(progress.done)}/${sanitizeNumber(progress.total)} 已掌握 · ${sanitizeNumber(progress.review)} 需复盘 · ${escapeHtml(groupType.note)}</span>
          </div>
          <em>${sanitizeNumber(progress.percent, 0, 100)}%</em>
        </summary>
        <div class="progress-track slim"><div class="progress-fill" style="width:${sanitizeNumber(progress.percent, 0, 100)}%"></div></div>
        <div class="topic-list">
          ${topics.map((topic) => renderTopic(selected, group, topic)).join("")}
        </div>
      </details>
    `;
  }).join("");

  document.querySelectorAll(".topic").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.topicId;
      const current = state.topics[id] || 0;
      let next = (current + 1) % 3;
      if (next === 2 && !hasTopicEvidence(id)) {
        captureTopicEvidence(id);
        next = hasTopicEvidence(id) ? 2 : 1;
        if (next === 1) showToast("已先标为需复盘；补充题量、正确率或证据后再标已掌握。");
      }
      state.topics[id] = next;
      saveState();
      renderSyllabus(selected);
      renderSyllabusMini();
      renderDashboard();
    });
  });
}

function hasTopicEvidence(id) {
  const evidence = state.topicEvidence[id] || {};
  return Boolean((evidence.problems || 0) > 0 || (evidence.accuracy || 0) > 0 || evidence.evidence);
}

function captureTopicEvidence(id) {
  const existing = state.topicEvidence[id] || {};
  const text = window.prompt("补充掌握证据：题量/正确率/可交付结果。例如：基础题 25 道，正确率 84%，能默写定义。", existing.evidence || "");
  if (!text) return;
  const problems = Number((text.match(/(\d+)\s*道/) || [])[1]) || existing.problems || 0;
  const accuracy = Number((text.match(/(\d+)\s*%/) || [])[1]) || existing.accuracy || 0;
  state.topicEvidence[id] = {
    problems,
    accuracy,
    evidence: text.trim(),
    lastReviewDate: planTodayISO()
  };
}

function renderSyllabusDashboard(selected) {
  const container = document.getElementById("syllabusDashboard");
  if (!container) return;
  const detail = syllabusSubjectDetail(selected);
  const next = nextTopics(selected, 4);
  const legend = Object.entries(syllabusGroupTypeMeta).map(([type, meta]) => `
    <span class="syllabus-type-pill ${type}">${escapeHtml(meta.label)}</span>
  `).join("");
  container.innerHTML = `
    <section class="syllabus-hero">
      <div class="ring syllabus-ring" style="--value:${sanitizeNumber(detail.percent, 0, 100)}">
        <span>${sanitizeNumber(detail.percent, 0, 100)}%</span>
      </div>
      <div>
        <strong>${syllabus[selected].title} 图谱</strong>
        <p>已掌握 ${sanitizeNumber(detail.done)} / ${sanitizeNumber(detail.total)}，需复盘 ${sanitizeNumber(detail.review)}，未开始 ${sanitizeNumber(detail.todo)}。点击任一考点可在“未开始 / 需复盘 / 已掌握”之间切换。条目为备考拆解，不等同官方逐字大纲。</p>
        <div class="syllabus-legend" aria-label="考纲条目类型">${legend}</div>
      </div>
    </section>
    <section class="syllabus-next">
      <strong>下一步小任务</strong>
      <div>
        ${next.map((topic, index) => `
          <article>
            <span>${index + 1}</span>
            <p>${topic.group}：${topic.topic}</p>
            <em>${topic.state === 1 ? "先复盘" : "新推进"}</em>
          </article>
        `).join("") || `<article><span>1</span><p>当前科目已覆盖，回到错题和套卷。</p><em>回炉</em></article>`}
      </div>
    </section>
    <section class="syllabus-framework">
      <strong>大框架</strong>
      <div>
        ${getSyllabusFramework(selected).map(([title, scope, method]) => `
          <article>
            <span>${escapeHtml(title)}</span>
            <p>${escapeHtml(scope)}</p>
            <em>${escapeHtml(method)}</em>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="syllabus-group-bars">
      ${detail.groups.map((group) => `
        <div class="group-bar">
          <div><span>${group.group}</span><em>${group.done}/${group.total}</em></div>
          <div class="progress-track slim"><div class="progress-fill" style="width:${group.percent}%"></div></div>
        </div>
      `).join("")}
    </section>
  `;
}

function syllabusGroupMeta(subject, group) {
  const type = syllabusGroupTypes[`${subject}/${group}`] || "official";
  return { type, ...syllabusGroupTypeMeta[type] };
}

function renderTopic(subject, group, topic) {
  const id = topicId(subject, group, topic);
  const value = state.topics[id] || 0;
  const className = value === 2 ? "done" : value === 1 ? "review" : "";
  const label = value === 2 ? "已掌握" : value === 1 ? "需复盘" : "未开始";
  const guide = topicGuide(subject, group, topic);
  const evidence = state.topicEvidence[id];
  return `
    <button class="topic ${className}" data-topic-id="${escapeAttr(id)}">
      <span class="topic-main">
        <strong>${escapeHtml(topic)}</strong>
        <em>${escapeHtml(guide.explain)}</em>
        <small>${escapeHtml(guide.output)}</small>
        ${evidence?.evidence ? `<small class="topic-evidence">证据：${escapeHtml(evidence.evidence)}</small>` : ""}
      </span>
      <span class="topic-side">
        <span class="topic-state">${escapeHtml(label)}</span>
        <em>${escapeHtml(guide.drill)}</em>
      </span>
    </button>
  `;
}

function topicGuide(subject, group, topic) {
  const exact = specificTopicGuide(subject, group, topic);
  if (exact) return exact;
  const defaults = {
    math: {
      explain: "先会定义和公式，再做基础题，不用难题逃避基础。",
      output: "交付：公式默写 + 基础题 15-25 道 + 错因 1-3 条。",
      drill: "15-25 题"
    },
    cs408: {
      explain: "先画结构或流程，再做题，最后写伪代码或代价分析。",
      output: "交付：章节题 20 道或 1 张过程图/1 段伪代码。",
      drill: "20 题"
    },
    english: {
      explain: "先背词，再定位句子结构，最后解释错选项原因。",
      output: "交付：生词、长难句、定位句、错因各一组。",
      drill: "1 组"
    },
    politics: {
      explain: "先搭框架，再做选择题，错题归到概念或材料定位。",
      output: "交付：框架关键词 + 选择题错题归类。",
      drill: "20-40 题"
    }
  };
  const base = defaults[subject] || defaults.math;
  const key = `${subject}/${group}`;
  const byGroup = {
    "math/高数预备": ["补前置，不追求考研难度，目标是看懂极限和导数符号。", "交付：会画图、会化简、会说变量关系。", "10-15 题"],
    "math/极限与连续": ["理解趋近过程、等价替换和连续判定，是高数第一道门。", "交付：写出适用条件，基础极限正确率 80%+。", "20-30 题"],
    "math/一元微分学": ["把导数理解成变化率，并能连接单调、极值、凹凸。", "交付：求导链条 + 应用题识别信号。", "20-30 题"],
    "math/中值定理": ["证明题核心区，先背定理条件，再学构造辅助函数。", "交付：每个定理写条件、结论和常见构造。", "8-15 题"],
    "math/一元积分学": ["先算对基本积分，再理解定积分性质和应用。", "交付：换元/分部选择理由 + 基础题正确率。", "20-30 题"],
    "math/多元微分学": ["从一元变化扩展到多变量，重心是偏导、全微分和极值。", "交付：会写求导链路和条件极值步骤。", "15-25 题"],
    "math/重积分": ["先画区域，再选坐标，顺序比技巧更重要。", "交付：画区域 + 写积分限 + 完成计算。", "15-25 题"],
    "math/曲线曲面积分": ["公式多但有套路，先分清第一类和第二类。", "交付：类型判断表 + 公式适用条件。", "12-20 题"],
    "math/级数": ["先判敛散，再做展开，避免一上来套公式。", "交付：判别法选择理由 + 错题归类。", "15-25 题"],
    "math/微分方程": ["识别方程类型，按模板解，不追求花活。", "交付：类型识别表 + 标准解题步骤。", "12-20 题"],
    "math/线性代数": ["核心是矩阵、向量组、秩、特征值之间的关系。", "交付：概念关系图 + 题型识别信号。", "20-30 题"],
    "math/概率统计": ["先用事件和随机变量建模，再算分布、数字特征和估计。", "交付：分布表 + 公式条件 + 基础题。", "15-25 题"],
    "cs408/C 与算法预备": ["跨考先补程序表达，目标是能读懂数据结构伪代码。", "交付：一个小程序或伪代码，能解释变量变化。", "代码+10题"],
    "cs408/数据结构-线性结构": ["线性表、栈、队列是后面树图算法的地基。", "交付：基本操作伪代码 + 复杂度。", "20 题"],
    "cs408/数据结构-树": ["树题先画结构，再写遍历和存储关系。", "交付：遍历序列、结构图、伪代码。", "20 题"],
    "cs408/数据结构-图": ["图题重在存储、遍历和经典算法过程。", "交付：过程表 + 算法复杂度。", "20 题"],
    "cs408/数据结构-查找排序": ["排序查找必须能手推过程和比较复杂度。", "交付：手推过程 + 稳定性/复杂度表。", "20 题"],
    "cs408/计组-数据表示": ["先理解机器如何表示数，后面 ALU 和指令才顺。", "交付：补码/浮点转换步骤。", "20 题"],
    "cs408/计组-运算与指令": ["把运算部件和指令格式联系起来，不只背名词。", "交付：指令字段解释 + 运算流程。", "15-25 题"],
    "cs408/计组-CPU": ["CPU 题要画数据通路和控制信号流向。", "交付：数据通路图 + 周期/冒险分析。", "15-25 题"],
    "cs408/计组-存储与 I/O": ["Cache、虚存、I/O 是高频综合区。", "交付：地址划分 + 命中/替换过程。", "20 题"],
    "cs408/OS-进程线程": ["先懂进程状态和调度，再做同步死锁。", "交付：状态转换图 + 调度过程表。", "20 题"],
    "cs408/OS-同步死锁": ["这是 OS 难点，信号量题必须逐步模拟。", "交付：PV 伪代码 + 死锁条件判断。", "20 题"],
    "cs408/OS-内存文件 I/O": ["内存管理和文件系统要画地址转换与目录结构。", "交付：页表/置换/磁盘调度过程。", "20 题"],
    "cs408/计网-基础与链路": ["先建立分层视角，知道每层解决什么问题。", "交付：层次图 + 链路层过程说明。", "15-25 题"],
    "cs408/计网-网络层": ["IP、子网和路由必须能算、能画、能解释。", "交付：子网划分 + 路由转发表。", "20 题"],
    "cs408/计网-传输与应用": ["TCP 是重心，握手、可靠传输、拥塞控制要手推。", "交付：时序图 + 窗口变化过程。", "20 题"],
    "english/词汇": ["目标不是背完列表，而是在真题里认出同义替换。", "交付：高频词 + 熟词僻义 + 错词复现。", "20-40min"],
    "english/语法长难句": ["先找主干，再处理从句、非谓语和插入成分。", "交付：长句切分 + 翻译顺序。", "3-5 句"],
    "english/阅读理解": ["阅读分数靠定位和排除，不靠全文翻译。", "交付：定位句 + 错选项原因。", "1 篇"],
    "politics/马原": ["马原先理解原理，再做材料匹配。", "交付：原理关键词 + 选择题错因。", "20 题"],
    "politics/主观题": ["后期再重投入，先练关键词和答题层次。", "交付：关键词默写 + 材料定位。", "1 题"]
  };
  const detail = byGroup[key];
  if (!detail) return base;
  return { explain: detail[0], output: detail[1], drill: detail[2] };
}

function specificTopicGuide(subject, group, topic) {
  const guides = {
    "math/高数预备/函数性质与图像": ["会判断定义域、值域、奇偶、单调、周期，能用图像理解函数变化。", "交付：画 5 类常见函数图像，完成定义域和值域基础题。", "10-15 题"],
    "math/高数预备/常用初等函数": ["指数、对数、幂函数、三角函数是极限和导数的语言。", "交付：默写基本图像、单调区间和常用变形。", "10-15 题"],
    "math/高数预备/三角恒等变换": ["三角题先识别公式，再化成同角同函数，不硬算。", "交付：默写基本恒等式，完成化简题。", "10-15 题"],
    "math/高数预备/不等式与绝对值": ["绝对值题先分区间，不等式题先明确变形是否保号。", "交付：写出分段讨论步骤和常用不等式。", "10-15 题"],
    "math/高数预备/数列基础": ["数列是极限入口，先理解单调、有界、递推和通项。", "交付：会判断简单数列趋势，写出递推前几项。", "10-15 题"],
    "math/高数预备/常用代数变形": ["分式、根式、因式分解和有理化决定极限基础题速度。", "交付：整理 8 个常用变形，错题写变形信号。", "10-15 题"],
    "math/极限与连续/数列极限": ["看清 n 趋向无穷时项的变化，先用夹逼、单调有界和等价量。", "交付：写出判定路线，基础题正确率 80%+。", "15-25 题"],
    "math/极限与连续/函数极限": ["明确 x 趋近对象、左右极限和无穷小阶，先判型再变形。", "交付：每题写出未定式类型和变形原因。", "20-30 题"],
    "math/极限与连续/无穷小与无穷大": ["理解量级比较，后面等价无穷小和泰勒都靠它。", "交付：会比较同阶、高阶、低阶和等价。", "15-20 题"],
    "math/极限与连续/等价无穷小": ["只在乘除结构中直接替换，加减结构要谨慎。", "交付：列出常见等价式和禁用场景。", "20 题"],
    "math/极限与连续/洛必达法则": ["先确认 0/0 或无穷/无穷以及可导条件，不要把它当万能钥匙。", "交付：每题写出使用条件，能判断不适用题。", "15-20 题"],
    "math/极限与连续/函数连续性": ["连续就是函数值和极限对上，重点看分段点和定义点。", "交付：会求参数并判断连续区间。", "15-20 题"],
    "math/一元微分学/导数定义": ["导数定义题看增量比，理解变化率而不是只背公式。", "交付：用定义做 5 道题，写出 h 趋近过程。", "10-15 题"],
    "math/一元微分学/求导法则": ["先熟练链式法则、乘除法则，再做隐函数和参数方程。", "交付：常见函数求导无卡顿，错题标出漏链式位置。", "20-30 题"],
    "math/一元微分学/单调性": ["一阶导数符号决定增减，先找定义域和临界点。", "交付：画符号表，完成单调区间题。", "15-20 题"],
    "math/一元微分学/极值与最值": ["极值看局部，最值看区间；端点和不可导点不能漏。", "交付：写完整候选点清单。", "15-20 题"],
    "cs408/C 与算法预备/变量与表达式": ["知道类型、赋值、表达式求值顺序，能手推变量变化。", "交付：写 3 个小程序，手推输出结果。", "代码+10题"],
    "cs408/C 与算法预备/条件与循环": ["能把自然语言步骤翻成 if/for/while，是算法题入口。", "交付：写 5 个循环题，说明循环不变量。", "代码+10题"],
    "cs408/C 与算法预备/数组": ["数组是顺序存储的基础，注意下标、边界和连续内存。", "交付：写查找、插入、删除、逆置。", "代码+10题"],
    "cs408/C 与算法预备/函数": ["函数用于拆步骤，重点是参数、返回值和作用域。", "交付：把数组操作封装成函数。", "代码+8题"],
    "cs408/C 与算法预备/指针": ["指针先理解地址和解引用，再碰链表，不要死背符号。", "交付：画变量-地址图，写指针交换和数组遍历。", "代码+10题"],
    "cs408/数据结构-线性结构/顺序表": ["顺序表核心是连续存储，插入删除要移动元素。", "交付：写插入、删除、查找伪代码和复杂度。", "20 题"],
    "cs408/数据结构-线性结构/单链表": ["链表核心是指针改链，先画图再写代码。", "交付：头插、尾插、删除、逆置伪代码。", "20 题"],
    "cs408/数据结构-线性结构/栈": ["栈是后进先出，常用于括号匹配、表达式、递归模拟。", "交付：写入栈出栈，做应用题。", "15-20 题"],
    "cs408/数据结构-线性结构/队列": ["队列是先进先出，循环队列重点是判空判满。", "交付：画 front/rear 变化过程。", "15-20 题"],
    "cs408/数据结构-树/二叉树遍历": ["遍历题先确定根的位置，再根据先中后序还原结构。", "交付：手推遍历序列，写递归/非递归思路。", "20 题"],
    "cs408/数据结构-图/DFS": ["DFS 是沿一条路走到底再回退，重点是访问标记和递归栈。", "交付：画搜索树，写伪代码和复杂度。", "15-20 题"],
    "cs408/数据结构-图/BFS": ["BFS 按层扩展，队列是关键，常用于最短步数。", "交付：画队列变化和访问序列。", "15-20 题"],
    "english/词汇/高频核心词": ["先保证真题高频词能反应，不追求一次背完所有词。", "交付：当天新词、复习词、错词各有记录。", "20-40min"],
    "english/阅读理解/定位句识别": ["题干关键词回原文定位，答案必须有原文依据。", "交付：每题写定位句和干扰项原因。", "1 篇"],
    "politics/马原/辩证法": ["辩证法主看联系、发展、矛盾，材料题要匹配原理。", "交付：原理关键词 + 选择题错因归类。", "20 题"]
  };
  const item = guides[`${subject}/${group}/${topic}`];
  if (item) return { explain: item[0], output: item[1], drill: item[2] };
  const generated = generatedTopicGuide(subject, group, topic);
  return generated ? { explain: generated[0], output: generated[1], drill: generated[2] } : null;
}

function generatedTopicGuide(subject, group, topic) {
  if (subject === "math") return generatedMathGuide(group, topic);
  if (subject === "cs408") return generatedCsGuide(group, topic);
  if (subject === "english") return generatedEnglishGuide(group, topic);
  if (subject === "politics") return generatedPoliticsGuide(group, topic);
  return null;
}

function generatedMathGuide(group, topic) {
  const exact = {
    "泰勒公式初步": ["泰勒用于把复杂函数局部多项式化，极限和证明题常用。", "交付：默写常见展开，说明余项阶数。", "12-18 题"],
    "间断点分类": ["先找无定义或分段点，再看左右极限和函数值。", "交付：可去、跳跃、无穷、振荡分类表。", "12-18 题"],
    "高阶导数": ["高阶导数重在规律归纳和常见函数模板。", "交付：写出前 3 阶并归纳通项。", "12-18 题"],
    "隐函数求导": ["把 y 看成 x 的函数，两边同时求导并解出 y'。", "交付：写完整链式过程，不漏 y 的导数。", "12-20 题"],
    "参数方程求导": ["先分别对参数求导，再用 dy/dx 连接。", "交付：一阶、二阶求导步骤卡。", "10-16 题"],
    "微分": ["微分是局部线性近似，和导数、误差估计相连。", "交付：会写 dy=f'(x)dx 并做近似计算。", "10-16 题"],
    "凹凸性与拐点": ["二阶导数符号看弯曲方向，拐点要看符号变化。", "交付：画二阶导符号表。", "12-18 题"],
    "渐近线": ["分别检查垂直、水平、斜渐近线，先看极限。", "交付：列三类渐近线判定式。", "10-15 题"],
    "罗尔定理": ["罗尔是中值定理证明入口，条件是连续、可导、端点相等。", "交付：写条件核验 + 辅助函数。", "8-12 题"],
    "拉格朗日中值定理": ["把函数增量和某点导数联系起来，常用于不等式证明。", "交付：写出套用区间和结论。", "8-12 题"],
    "柯西中值定理": ["两个函数的增量比连接导数比，常用于复杂比值证明。", "交付：明确 f、g 和 g' 不为 0。", "8-12 题"],
    "泰勒中值定理": ["用多项式加余项表达函数，常处理极限和估计。", "交付：写展开点、阶数、余项形式。", "8-12 题"],
    "证明题常见构造": ["证明题先看要证形式，再构造辅助函数或套中值。", "交付：归纳 5 类构造信号。", "8-12 题"],
    "有理函数积分": ["先做因式分解或拆分，复杂题再部分分式。", "交付：写拆分过程和基本积分模板。", "12-18 题"],
    "反常积分": ["重点是无穷区间和瑕点，先判收敛再计算。", "交付：写出比较判别或极限定义。", "12-18 题"],
    "定积分应用": ["应用题先画几何对象，再写面积、体积或物理量。", "交付：画图 + 列积分式。", "12-18 题"],
    "条件极值": ["约束极值优先拉格朗日乘子，边界不能漏。", "交付：写方程组和候选点比较。", "12-18 题"],
    "交换积分次序": ["先画积分区域，再把边界改写成另一方向。", "交付：区域图 + 两种积分限。", "12-18 题"],
    "柱坐标与球坐标": ["三重积分遇圆柱、球面结构要换坐标。", "交付：写变量替换和雅可比因子。", "10-16 题"],
    "格林公式": ["平面曲线积分和二重积分互化，先检查闭合和方向。", "交付：写方向判断和公式条件。", "10-16 题"],
    "高斯公式": ["曲面积分转三重积分，先补闭合面并判断外法向。", "交付：画封闭区域和法向。", "8-14 题"],
    "斯托克斯公式": ["空间曲线积分和曲面积分互化，重在方向一致。", "交付：写边界方向和旋度。", "8-12 题"],
    "幂级数": ["幂级数先求收敛半径，再单独检查端点。", "交付：收敛域步骤卡。", "12-18 题"],
    "函数展开为幂级数": ["利用标准展开和逐项求导积分，不硬推。", "交付：默写常见展开并标收敛域。", "10-16 题"],
    "二阶常系数线性方程": ["先写特征方程，再处理齐次和非齐次。", "交付：特征根分类表。", "10-16 题"],
    "行列式计算": ["先用性质化简，再展开，避免硬算大行列式。", "交付：3 类化简手法 + 计算题。", "15-25 题"],
    "矩阵运算": ["矩阵乘法看维度和顺序，运算律不要套错。", "交付：维度检查 + 典型运算题。", "15-25 题"],
    "逆矩阵": ["逆矩阵和可逆条件、初等变换、伴随矩阵相连。", "交付：写出 3 种求逆路径。", "15-25 题"],
    "矩阵秩": ["秩是线代主轴，和方程组、向量组、可逆性贯通。", "交付：初等变换求秩 + 结论解释。", "15-25 题"],
    "特征值与特征向量": ["先求特征方程，再解特征向量，注意重根。", "交付：完整计算流程。", "15-25 题"],
    "相似对角化": ["能否对角化看特征向量个数，不只看特征值。", "交付：判定条件 + P 矩阵构造。", "12-20 题"],
    "二次型": ["二次型重在矩阵表示、合同变换和标准形。", "交付：写矩阵、化标准形、判正定。", "15-25 题"],
    "随机事件": ["先把文字事件翻译成集合运算，再算概率。", "交付：事件关系图和公式。", "12-18 题"],
    "条件概率": ["条件概率先缩小样本空间，别机械套公式。", "交付：写条件空间和计算步骤。", "12-18 题"],
    "全概率与贝叶斯": ["全概率先分完备事件，贝叶斯反推原因。", "交付：画树状图。", "12-18 题"],
    "常见离散分布": ["二项、泊松、几何等要会识别试验模型。", "交付：分布表 + 适用信号。", "12-18 题"],
    "常见连续分布": ["均匀、指数、正态要会密度、分布函数和数字特征。", "交付：公式表 + 基础计算。", "12-18 题"],
    "期望": ["期望是加权平均，先判离散还是连续。", "交付：写求和/积分式。", "12-18 题"],
    "方差": ["方差看波动，常用 E(X^2)-E(X)^2。", "交付：两种公式都能用。", "12-18 题"],
    "中心极限定理": ["大样本近似正态，重点是标准化。", "交付：写标准化步骤。", "8-12 题"],
    "参数估计": ["估计题先区分矩估计和最大似然。", "交付：两种方法流程卡。", "10-16 题"]
  };
  if (exact[topic]) return exact[topic];
  if (group.includes("积分")) return [`${topic} 先判断积分对象和区域，再选择换元、分部或坐标系。`, "交付：写出适用条件、计算步骤和错因。", "12-20 题"];
  if (group.includes("线性代数")) return [`${topic} 要和秩、方程组、特征值或二次型关系一起学。`, "交付：概念关系图 + 典型题步骤。", "15-25 题"];
  if (group.includes("概率")) return [`${topic} 先识别随机模型，再写公式条件，不背孤立公式。`, "交付：模型信号 + 公式条件 + 基础题。", "12-20 题"];
  return null;
}

function generatedCsGuide(group, topic) {
  const exact = {
    "结构体": ["结构体把多个字段合成一个对象，是链表和树节点基础。", "交付：定义节点结构并完成输入输出。", "代码+8题"],
    "递归": ["递归先明确终止条件，再写子问题，不要只背调用栈。", "交付：画调用树，写 3 个递归函数。", "代码+10题"],
    "复杂度分析": ["复杂度看输入规模增长，不是数机器运行秒数。", "交付：循环、递归、排序复杂度表。", "10-15 题"],
    "伪代码书写": ["408 算法题要写清输入、处理、输出和边界。", "交付：按规范写 2 道算法题。", "2 题"],
    "循环队列": ["循环队列重点是 front/rear 约定和判空判满。", "交付：画指针变化，写入队出队。", "15-20 题"],
    "KMP 思想": ["KMP 核心是利用已匹配信息，重点理解 next 数组。", "交付：手推 next 数组和匹配过程。", "10-16 题"],
    "二叉树性质": ["二叉树性质题常考结点数、高度、叶子关系。", "交付：性质公式 + 推导题。", "15-20 题"],
    "线索二叉树": ["线索化用空指针保存前驱后继，先理解遍历线索。", "交付：画线索指向和遍历过程。", "10-16 题"],
    "树与森林": ["树、森林和二叉树转换要会画左孩子右兄弟。", "交付：互转图 + 遍历对应关系。", "10-16 题"],
    "哈夫曼树": ["哈夫曼树按权值合并，目标是最短带权路径。", "交付：构造过程和 WPL 计算。", "10-16 题"],
    "平衡二叉树": ["AVL 调整看失衡类型，先判 LL/RR/LR/RL。", "交付：旋转过程图。", "10-16 题"],
    "B 树与 B+ 树": ["B 类树服务外存索引，重点是阶、关键字和分裂合并。", "交付：插入删除过程图。", "8-14 题"],
    "最小生成树": ["Prim 和 Kruskal 都求连通最小代价，选择边的逻辑不同。", "交付：手推两种算法。", "10-16 题"],
    "最短路径": ["Dijkstra 和 Floyd 分别处理单源和多源最短路。", "交付：距离表更新过程。", "10-16 题"],
    "拓扑排序": ["拓扑排序用于有向无环图，入度为 0 是入口。", "交付：队列变化和序列。", "8-14 题"],
    "关键路径": ["关键路径看工程最短完成时间，先算最早最迟时间。", "交付：ve/vl/e/l 表。", "8-14 题"],
    "散列表": ["散列表重在冲突处理和查找长度。", "交付：构造表并计算 ASL。", "12-18 题"],
    "插入排序": ["插入排序每轮把元素插入有序区，稳定性要记。", "交付：手推过程 + 复杂度。", "8-12 题"],
    "交换排序": ["冒泡和快排都属交换，快排分区过程是重点。", "交付：分区过程和复杂度。", "10-16 题"],
    "选择排序": ["选择排序每轮选最小或最大，通常不稳定。", "交付：过程表 + 稳定性判断。", "8-12 题"],
    "归并排序": ["归并排序先分后合，时间稳定但需要额外空间。", "交付：递归树和合并过程。", "8-12 题"],
    "进制转换": ["进制转换是数据表示入口，注意整数和小数方法不同。", "交付：二八十六互转。", "12-18 题"],
    "补码运算": ["补码统一加减法，溢出判断是重点。", "交付：补码表示和溢出例题。", "15-20 题"],
    "IEEE754": ["浮点数按符号、阶码、尾数拆解，先会编码解码。", "交付：单精度字段拆分。", "10-16 题"],
    "指令执行过程": ["取指、译码、执行、访存、写回要能串起来。", "交付：周期流程图。", "12-18 题"],
    "流水线性能": ["流水线题算吞吐率、加速比和周期数。", "交付：时空图 + 公式。", "12-18 题"],
    "流水线冒险": ["冒险分结构、数据、控制，处理方法要对应。", "交付：冒险类型表。", "10-16 题"],
    "Cache 映射": ["Cache 先做地址划分，再判断映射位置和命中。", "交付：标记/组号/块内地址。", "15-20 题"],
    "虚拟存储器": ["虚存把地址转换和页面置换联系起来。", "交付：页表转换过程。", "15-20 题"],
    "进程状态转换": ["状态转换要看事件触发：创建、就绪、运行、阻塞、终止。", "交付：状态图 + 触发条件。", "12-18 题"],
    "处理机调度": ["调度题先列到达、服务、优先级，再手算周转时间。", "交付：甘特图和指标。", "12-18 题"],
    "信号量": ["PV 操作题先找资源和互斥/同步关系。", "交付：PV 伪代码和执行序列。", "15-20 题"],
    "银行家算法": ["银行家算法判断安全序列，先算 Need 和 Available。", "交付：安全性检查表。", "10-16 题"],
    "分页管理": ["分页题核心是页号、页内偏移和页表地址转换。", "交付：地址划分和转换。", "15-20 题"],
    "页面置换": ["FIFO、LRU、Clock 要会手推缺页过程。", "交付：置换表 + 缺页率。", "12-18 题"],
    "磁盘调度": ["磁盘调度看访问序列和移动距离。", "交付：FCFS/SSTF/SCAN 手推。", "10-16 题"],
    "子网划分": ["子网题先写二进制掩码，再算网络号和可用地址。", "交付：网络号、广播地址、主机范围。", "15-20 题"],
    "ARP": ["ARP 解决 IP 到 MAC 的映射，发生在同一链路。", "交付：请求/响应过程图。", "8-12 题"],
    "路由选择": ["路由题先看目的网络和最长前缀匹配。", "交付：转发表匹配过程。", "10-16 题"],
    "TCP 报文段": ["TCP 字段服务可靠传输、流控和拥塞控制。", "交付：字段作用表。", "10-16 题"],
    "三次握手": ["握手用于建立连接和同步序号，必须会画时序图。", "交付：SYN/ACK 序号图。", "8-12 题"],
    "四次挥手": ["挥手是双向关闭，重点理解 TIME_WAIT。", "交付：状态转换图。", "8-12 题"],
    "拥塞控制": ["慢开始、拥塞避免、快重传、快恢复要会画窗口变化。", "交付：cwnd 曲线。", "10-16 题"],
    "HTTP": ["HTTP 是应用层请求响应协议，和 TCP、DNS 常综合。", "交付：一次访问网页的协议链路。", "8-12 题"]
  };
  if (exact[topic]) return exact[topic];
  if (group.includes("计组")) return [`${topic} 先画硬件结构或数据流，再做计算题。`, "交付：过程图 + 关键字段/公式。", "12-20 题"];
  if (group.includes("OS")) return [`${topic} 先画状态、资源或地址转换过程，再做选择和大题。`, "交付：过程表 + 易错条件。", "12-20 题"];
  if (group.includes("计网")) return [`${topic} 要回答解决什么问题、报文怎么走、代价是什么。`, "交付：协议流程图 + 计算或字段题。", "10-18 题"];
  return null;
}

function generatedEnglishGuide(group, topic) {
  const exact = {
    "熟词僻义": ["真题常用熟词僻义制造障碍，要在语境里记。", "交付：当天 10 个熟词僻义例句。", "20min"],
    "词根词缀": ["词根词缀用于降低生词恐惧，不替代真题语境。", "交付：整理 8 个词族。", "20min"],
    "同义替换": ["阅读正确选项常改写原文，同义替换是定位核心。", "交付：每篇摘 5 组替换。", "1 篇"],
    "从句识别": ["先找主干，再判断名词性、定语、状语从句。", "交付：切分 5 个长句。", "3-5 句"],
    "非谓语结构": ["非谓语常作定语、状语、补足语，翻译要还原逻辑。", "交付：标出形式和成分。", "3-5 句"],
    "主旨题": ["主旨题看文章框架和转折，不被局部细节带跑。", "交付：段落功能表。", "1 篇"],
    "细节题": ["细节题必须回原文定位，选项逐词比对。", "交付：定位句 + 改写方式。", "1 篇"],
    "推断题": ["推断题不能脑补，只能从原文逻辑推出一步。", "交付：依据句 + 排除理由。", "1 篇"],
    "态度题": ["态度题看评价词和转折，区分作者与他人观点。", "交付：态度词清单。", "1 篇"],
    "选项干扰类型": ["干扰项常见偷换、扩大、无中生有、反向。", "交付：每篇错题归类。", "1 篇"],
    "段落排序": ["排序题先找代词、连接词和主题推进。", "交付：写连接依据。", "1 组"],
    "小标题匹配": ["小标题看段落中心句和重复主题词。", "交付：每段一句话概括。", "1 组"],
    "定语从句翻译": ["定语从句先找先行词，再决定前置或拆句。", "交付：翻译 3-5 句。", "3-5 句"],
    "被动语态": ["被动翻译按中文表达重组，不硬译“被”。", "交付：改写 5 句。", "3-5 句"],
    "小作文格式": ["小作文先保格式和功能句，内容简洁准确。", "交付：默写 1 个格式模板。", "20min"],
    "图画作文": ["大作文先描述图，再提观点，最后展开原因和建议。", "交付：写提纲 + 1 段。", "30min"],
    "限时写作": ["作文要在限时内稳定成文，后期反复默写和改错。", "交付：30-40 分钟完整一篇。", "1 篇"]
  };
  if (exact[topic]) return exact[topic];
  return [`${topic} 不单独死记，要放进真题句子或篇章里复盘。`, "交付：例句/定位句 + 错因或改写记录。", group.includes("阅读") ? "1 篇" : "20-30min"];
}

function generatedPoliticsGuide(group, topic) {
  const exact = {
    "哲学基本问题": ["先分物质意识和可知论，选择题常考概念边界。", "交付：概念对照表 + 错题归类。", "20 题"],
    "唯物论": ["唯物论看物质、意识、实践及其关系。", "交付：关键词默写和材料对应。", "20 题"],
    "认识论": ["认识论重点是实践、认识、真理和价值。", "交付：原理关键词 + 材料例子。", "20 题"],
    "唯物史观": ["社会存在、社会意识、人民群众是高频点。", "交付：框架图 + 选择错因。", "20 题"],
    "政治经济学": ["政经概念密集，先分商品、价值、剩余价值。", "交付：概念链条表。", "20 题"],
    "新时代思想": ["中特后期分值高，先建政策和关键词框架。", "交付：章节框架 + 选择错因。", "20-40 题"],
    "重要会议": ["史纲会议要按时间线和意义记，不孤立背。", "交付：时间轴 + 关键词。", "20min"],
    "热点专题": ["时政热点后期整合，先关注主题和官方表述。", "交付：热点关键词卡。", "20min"],
    "当年版预测题背诵": ["考前用当年版非官方预测资料或同类材料背主观题，重在关键词和层次。", "交付：闭卷默写一题框架。", "1 题"]
  };
  if (exact[topic]) return exact[topic];
  return [`${topic} 先放进 ${group} 框架里理解，再用选择题校正概念边界。`, "交付：框架关键词 + 选择题错因。", "20-40 题"];
}

function topicId(subject, group, topic) {
  return `${subject}/${group}/${topic}`;
}

function syllabusProgress(subject) {
  return { percent: syllabusSubjectDetail(subject).percent };
}

function syllabusSubjectDetail(subject) {
  const data = syllabus[subject];
  let total = 0;
  let score = 0;
  let done = 0;
  let review = 0;
  const groups = [];
  data.groups.forEach(([group, topics]) => {
    let groupScore = 0;
    let groupTotalScore = 0;
    let groupDone = 0;
    let groupReview = 0;
    topics.forEach((topic) => {
      const value = state.topics[topicId(subject, group, topic)] || 0;
      total += 2;
      score += value;
      groupTotalScore += 2;
      groupScore += value;
      if (value === 2) {
        done += 1;
        groupDone += 1;
      }
      if (value === 1) {
        review += 1;
        groupReview += 1;
      }
    });
    groups.push({
      group,
      total: topics.length,
      done: groupDone,
      review: groupReview,
      percent: groupTotalScore ? Math.round(groupScore / groupTotalScore * 100) : 0
    });
  });
  const totalTopics = data.groups.reduce((sum, [, topics]) => sum + topics.length, 0);
  return {
    percent: total ? Math.round(score / total * 100) : 0,
    total: totalTopics,
    done,
    review,
    todo: totalTopics - done - review,
    groups
  };
}

function groupProgress(subject, groupName) {
  return syllabusSubjectDetail(subject).groups.find((item) => item.group === groupName) || { percent: 0, done: 0, review: 0, total: 0 };
}

function renderReview() {
  const phase = getCurrentPhase();
  const week = lastDaysEntries(7);
  const days14 = lastDaysEntries(14);
  const weekHours = sumMinutes(week, "total") / 60;
  const avg14 = days14.length ? sumMinutes(days14, "total") / 60 / 14 : 0;
  const coreRatio = sumMinutes(week, "total") ? sumMinutes(week, "core") / sumMinutes(week, "total") : 0;
  const newMistakes = sumMinutes(week, "newMistakes");
  const fixedMistakes = sumMinutes(week, "fixedMistakes");
  const mistakeRatio = newMistakes ? fixedMistakes / newMistakes : 1;
  const activeDays = new Set(week.filter((entry) => entry.total > 0).map((entry) => entry.date)).size;
  const planDate = planTodayISO();
  const monthHours = sumMinutes(entriesArray().filter((entry) => entry.date.startsWith(planDate.slice(0, 7))), "total") / 60;
  const currentMonth = monthlyPlan.find((row) => planDate.startsWith(row[0]));
  const monthTarget = currentMonth ? currentMonth[1] : phase.weeklyTarget * 4;
  const dueCount = state.reviewItems.filter((item) => !item.done && item.status !== "done" && item.dueDate <= planDate).length;
  const avgSyllabus = Math.round(["math", "cs408", "english", "politics"].reduce((sum, subject) => sum + syllabusProgress(subject).percent, 0) / 4);
  const learningStatus = weekHours >= phase.weeklyTarget * 0.9 && coreRatio >= 0.65 && activeDays >= 6 ? "可小幅加难度" :
    weekHours < phase.weeklyTarget * 0.7 || activeDays <= 3 ? "先恢复底线日" :
    "保持当前负荷";

  const items = [
    ["周总有效小时", `${weekHours.toFixed(1)}h`, `目标 ${phase.weeklyTarget}h`],
    ["数学+408 占比", `${Math.round(coreRatio * 100)}%`, "绿色线 65%"],
    ["错题回炉率", `${Math.round(mistakeRatio * 100)}%`, "绿色线 70%"],
    ["本周学习天数", `${activeDays} 天`, "目标 6-7 天"],
    ["14天日均", `${avg14.toFixed(1)}h`, "判断曲线，不看单日"],
    ["本月累计", `${monthHours.toFixed(1)}h`, `月目标 ${monthTarget}h`],
    ["到期复盘", `${dueCount} 项`, dueCount ? "先清到期再开新内容" : "队列正常"],
    ["考纲证据", `${avgSyllabus}%`, "四科平均掌握标记"],
    ["负荷建议", learningStatus, "按完成率调整难度"]
  ];

  document.getElementById("weeklyReview").innerHTML = items.map(([label, value, hint]) => `
    <div class="review-item">
      <span>${label}</span>
      <strong>${value}</strong>
      <span>${hint}</span>
    </div>
  `).join("");

  renderMilestone();
  renderRollingWindowChart();

  const totalHours = sumMinutes(entriesArray(), "total") / 60;
  document.getElementById("monthTable").innerHTML = monthlyPlan.map((row) => {
    const [month, target, cumulative, math, cs408, other, score] = row;
    const reached = totalHours >= cumulative;
    const current = planTodayISO().startsWith(month) ? " current" : "";
    return `
      <div class="month-row${current}">
        <div class="month-row-head">
          <span>${month} · 目标 ${target}h</span>
          <span>${reached ? "已达累计" : `累计 ${cumulative}h`}</span>
        </div>
        <div class="month-meta">数学：${math} · 408：${cs408} · 其他：${other} · 监测：${score}</div>
      </div>
    `;
  }).join("");
}

function renderRollingWindowChart() {
  const container = document.getElementById("rollingWindowChart");
  if (!container) return;
  const controls = normalizePlanControls(state.settings.planControls);
  const windows = buildRollingReviewWindows(state.reviewItems, planTodayISO(), { controls });
  const maxMinutes = Math.max(1, ...windows.map((item) => item.minutes));
  const signal = reviewLoadSignal(state.reviewItems, planTodayISO(), controls);
  container.innerHTML = `
    <article class="rolling-window-summary ${signal.level}">
      <span>滚动复盘负荷</span>
      <strong>${escapeHtml(signal.label)}</strong>
      <p>${escapeHtml(signal.action)}</p>
    </article>
    <div class="rolling-window-bars">
      ${windows.map((item) => `
        <div class="rolling-window-bar">
          <div class="rolling-window-track"><span style="height:${Math.max(4, item.minutes / maxMinutes * 100)}%"></span></div>
          <strong>${item.count}</strong>
          <em>${escapeHtml(item.label)}</em>
          <small>${item.minutes}m</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCoach(week, phase) {
  const weekHours = sumMinutes(week, "total") / 60;
  const coreRatio = sumMinutes(week, "total") ? sumMinutes(week, "core") / sumMinutes(week, "total") : 0;
  const streak = currentStreak();
  const mathProgress = syllabusProgress("math").percent;
  const csProgress = syllabusProgress("cs408").percent;
  const next = nextMilestone();

  let title = `${phase.name}：先稳住每日底线`;
  let text = `本阶段重点是：${phase.focus}`;
  let pace = "节奏未建立";

  if (streak >= 7 && weekHours >= phase.weeklyTarget * 0.9 && coreRatio >= 0.65) {
    title = "节奏健康，可以推进新内容";
    text = `继续保持数学+408 的核心占比。下一节点 ${next[0]}，累计目标 ${next[2]}h。`;
    pace = "节奏健康";
  } else if (weekHours < phase.weeklyTarget * 0.7 && streak >= 3) {
    title = "执行偏轻，先补核心时长";
    text = "下周减少新增资料，补足数学和 408 日均时间。";
    pace = "需要加固";
  } else if (mathProgress < csProgress - 15) {
    title = "数学考纲进度偏慢";
    text = "今日任务优先安排数学未完成条目。";
    pace = "数学补强";
  } else if (csProgress < mathProgress - 15) {
    title = "408 考纲进度偏慢";
    text = "今日任务优先安排 408 未完成条目。";
    pace = "408 补强";
  }

  document.getElementById("coachTitle").textContent = title;
  document.getElementById("coachText").textContent = text;
  document.getElementById("streakBadge").textContent = `连续 ${streak} 天`;
  document.getElementById("paceBadge").textContent = pace;
}

function renderHeatmap() {
  const container = document.getElementById("heatmap");
  const today = parseDate(planTodayISO());
  const cells = [];
  for (let index = 27; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const iso = formatDateISO(date);
    const entry = state.entries[iso];
    const minutes = entry ? getEntryTotals(entry).total : 0;
    const level = minutes >= 300 ? 4 : minutes >= 180 ? 3 : minutes >= 90 ? 2 : minutes > 0 ? 1 : 0;
    cells.push(`<div class="heat-cell level-${level}" title="${iso} · ${Math.round(minutes / 60 * 10) / 10}h"><span>${date.getDate()}</span></div>`);
  }
  container.innerHTML = cells.join("");
}

function currentStreak() {
  let streak = 0;
  const cursor = parseDate(planTodayISO());
  while (true) {
    const iso = formatDateISO(cursor);
    const entry = state.entries[iso];
    if (!entry || getEntryTotals(entry).total <= 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function nextMilestone() {
  const totalHours = sumMinutes(entriesArray(), "total") / 60;
  return monthlyPlan.find((row) => totalHours < row[2]) || monthlyPlan[monthlyPlan.length - 1];
}

function renderMilestone() {
  const [month, target, cumulative, math, cs408, other, score] = nextMilestone();
  const totalHours = sumMinutes(entriesArray(), "total") / 60;
  const remaining = Math.max(0, cumulative - totalHours);
  const percent = Math.min(100, totalHours / cumulative * 100);
  document.getElementById("milestoneCard").innerHTML = `
    <div class="milestone-top">
      <div>
        <span>下一节点</span>
        <strong>${month}</strong>
      </div>
      <div>
        <span>还差</span>
        <strong>${remaining.toFixed(1)}h</strong>
      </div>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
    <p>本月目标 ${target}h，累计目标 ${cumulative}h。数学：${math}；408：${cs408}；其他：${other}；监测：${score}。</p>
  `;
}

function renderScores() {
  const sorted = [...state.scores].sort((a, b) => b.date.localeCompare(a.date));
  const last5 = sorted.slice(0, 5);
  const last10 = sorted.slice(0, 10);
  const avg = averageScores(last5);
  const avg10 = averageScores(last10);
  const weak = weakestScoreSubject(avg);
  const chips = [
    ["近 5 套总分", avg.total ? avg.total.toFixed(1) : "--"],
    ["近 10 套总分", avg10.total ? avg10.total.toFixed(1) : "--"],
    ["数学均分", avg.math ? avg.math.toFixed(1) : "--"],
    ["408均分", avg.cs408 ? avg.cs408.toFixed(1) : "--"],
    ["当前短板", weak]
  ];

  document.getElementById("scoreSummary").innerHTML = chips.map(([label, value]) => `
    <div class="score-chip">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");

  document.getElementById("scoreList").innerHTML = sorted.length ? sorted.map((score) => `
    <div class="score-row">
      <div class="score-row-head">
        <span>${escapeHtml(score.date)} · ${escapeHtml(score.name)}</span>
        <span>${Number(score.total) || 0}</span>
      </div>
      <div class="score-meta">政治 ${sanitizeNumber(score.politics)} · 英语 ${sanitizeNumber(score.english)} · 数学 ${sanitizeNumber(score.math)} · 408 ${sanitizeNumber(score.cs408)}${score.note ? ` · ${escapeHtml(score.note)}` : ""}</div>
      <div class="record-actions">
        <button type="button" data-edit-score="${escapeAttr(score.id)}">编辑</button>
        <button type="button" data-delete-score="${escapeAttr(score.id)}">删除</button>
      </div>
    </div>
  `).join("") : `<div class="score-row"><div class="score-meta">还没有模考记录。2027 年 6 月后再重点看总分趋势。</div></div>`;

  document.querySelectorAll("[data-edit-score]").forEach((button) => {
    button.addEventListener("click", () => {
      const score = state.scores.find((item) => item.id === button.dataset.editScore);
      if (!score) return;
      document.getElementById("scoreDate").value = score.date;
      document.getElementById("scoreName").value = score.name;
      document.getElementById("scorePol").value = score.politics;
      document.getElementById("scoreEng").value = score.english;
      document.getElementById("scoreMath").value = score.math;
      document.getElementById("scoreCs").value = score.cs408;
      document.getElementById("scoreNote").value = score.note || "";
      document.getElementById("scoreForm").dataset.editingScore = score.id;
      showToast("已载入模考，可修改后保存。");
    });
  });
  document.querySelectorAll("[data-delete-score]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("确认删除这条模考记录？")) return;
      markDeleted("scores", button.dataset.deleteScore);
      state.scores = state.scores.filter((item) => item.id !== button.dataset.deleteScore);
      saveState();
      renderScores();
      renderDashboard();
      showToast("模考记录已删除。");
    });
  });
}

function weakestScoreSubject(avg) {
  if (!avg.total) return "--";
  const gaps = [
    ["政治", 75 - avg.politics],
    ["英语", 80 - avg.english],
    ["数学", 130 - avg.math],
    ["408", 135 - avg.cs408]
  ].sort((a, b) => b[1] - a[1]);
  return gaps[0][1] > 0 ? gaps[0][0] : "保持";
}

function renderRecentLogs() {
  const recent = entriesArray().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  document.getElementById("recentLogs").innerHTML = recent.length ? recent.map((entry) => {
    const hours = entry.total / 60;
    const coreRatio = entry.total ? Math.round(entry.core / entry.total * 100) : 0;
    const note = entry.note ? ` · ${escapeHtml(entry.note)}` : "";
    return `
      <div class="log-item">
        <div class="log-item-head">
          <span>${entry.date}</span>
          <span>${hours.toFixed(1)}h</span>
        </div>
        <div class="log-meta">数学 ${entry.math || 0}m · 408 ${entry.cs408 || 0}m · 英语 ${entry.english || 0}m · 核心占比 ${coreRatio}%${note}</div>
      </div>
    `;
  }).join("") : `<div class="log-item"><div class="log-meta">还没有记录。今天先填一条，哪怕只有 120 分钟。</div></div>`;
}

function averageScores(scores) {
  if (!scores.length) return { total: 0, politics: 0, english: 0, math: 0, cs408: 0 };
  const sum = scores.reduce((acc, score) => {
    acc.total += score.total || 0;
    acc.politics += score.politics || 0;
    acc.english += score.english || 0;
    acc.math += score.math || 0;
    acc.cs408 += score.cs408 || 0;
    return acc;
  }, { total: 0, politics: 0, english: 0, math: 0, cs408: 0 });
  Object.keys(sum).forEach((key) => {
    sum[key] = sum[key] / scores.length;
  });
  return sum;
}

function renderResources() {
  const usageCard = `
    <article class="resource-card resource-rule-card">
      <h4>资料使用规则</h4>
      <ul>${resourceUsageRules.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  `;
  document.getElementById("resourceGrid").innerHTML = usageCard + resources.map(([title, items]) => `
    <article class="resource-card">
      <h4>${escapeHtml(title)}</h4>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  `).join("");

  document.getElementById("projectChecklist").innerHTML = projectItems.map((item) => {
    const checked = state.project[item] ? "checked" : "";
    return `
      <label class="check-row">
        <input type="checkbox" data-project="${escapeAttr(item)}" ${checked}>
        <span>${escapeHtml(item)}</span>
      </label>
    `;
  }).join("");

  document.querySelectorAll("[data-project]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      state.project[checkbox.dataset.project] = checkbox.checked;
      state.project.updatedAt = new Date().toISOString();
      saveState();
    });
  });

  renderResourceProgress();
}

function renderResourceProgress() {
  document.getElementById("resourceProgress").innerHTML = resourceProgressItems.map(([label, key]) => {
    const value = sanitizeNumber(state.resources[key], 0, 100);
    return `
      <label class="resource-progress-row">
        <span>${label}</span>
        <input type="range" min="0" max="100" step="5" value="${value}" data-resource-progress="${escapeAttr(key)}">
        <strong>${value}%</strong>
      </label>
    `;
  }).join("");

  document.querySelectorAll("[data-resource-progress]").forEach((input) => {
    input.addEventListener("input", () => {
      state.resources[input.dataset.resourceProgress] = Number(input.value);
      const label = input.closest(".resource-progress-row")?.querySelector("strong");
      if (label) label.textContent = `${Number(input.value) || 0}%`;
      saveState();
    });
  });
}

function renderSettings() {
  document.getElementById("settingWeekdayMinutes").value = state.settings.weekdayMinutes;
  document.getElementById("settingWeekendMinutes").value = state.settings.weekendMinutes;
  document.getElementById("settingTaskCount").value = state.settings.taskCount;
  document.getElementById("settingCoreRatio").value = state.settings.coreRatio;
  document.getElementById("settingTargetExamDate").value = state.settings.targetExamDate || DEFAULT_EXAM_DATE;
  document.getElementById("settingReviewDays").value = state.settings.reviewDays.join(",");
  const controls = normalizePlanControls(state.settings.planControls);
  state.settings.planControls = controls;
  setValue("settingMaxNewTopics", controls.maxNewTopics);
  setValue("settingReviewLoad", controls.reviewLoad);
  setValue("settingRollingWindowDays", controls.rollingWindowDays);
  setSelectValue("settingPlanIntensity", controls.planIntensity);
  setSelectValue("settingFocusSubject", controls.focusSubject);
  setSelectValue("settingExperienceTrack", controls.experienceTrack);
  document.querySelectorAll("#settingEnabledSubjects input").forEach((input) => {
    input.checked = controls.enabledSubjects.includes(input.value);
  });
  setText("settingsExamDateStatus", examDateStatusText());
  setText("appBuildText", APP_BUILD);
  setText("storageHealthText", storageAvailable ? "本机缓存正常" : "本机缓存不可用，建议检查浏览器隐私/存储权限");

  document.getElementById("standardsList").innerHTML = [
    ["渐进时长", "2026 年 6 月 8 日从工作日 90m、周末 150m 重启；7 月约 120/210m，8 月约 150/240m；9 月起进入第一轮主干强度。"],
    ...highStandards
  ].map(([subject, standard]) => `
    <div class="standard-item">
      <strong>${subject}</strong>
      <p>${standard}</p>
    </div>
  `).join("");

  document.getElementById("customTaskList").innerHTML = state.customTasks.length ? state.customTasks.map((task) => `
    <div class="custom-task-row">
      <span>${escapeHtml(task.subject)}</span>
      <strong>${escapeHtml(task.text)}</strong>
      <em>${Number(task.minutes) || 0}m</em>
      <button type="button" data-delete-custom="${escapeAttr(task.id)}">删除</button>
    </div>
  `).join("") : `<div class="empty-state">还没有自定义任务。可以添加固定错题回炉、项目推进或单词任务。</div>`;

  document.querySelectorAll("[data-delete-custom]").forEach((button) => {
    button.addEventListener("click", () => {
      state.customTasks = state.customTasks.filter((task) => task.id !== button.dataset.deleteCustom);
      saveState();
      renderSettings();
    });
  });

  renderSourceRegistry();
  renderDesignReferences();
  renderExecutionBoundaries();
  renderStrategySources();
}

function renderSourceRegistry() {
  const container = document.getElementById("sourceRegistry");
  if (!container) return;
  container.innerHTML = sourceRegistry.map((item) => {
    const url = safeExternalUrl(item.url);
    return `
      <article class="source-card">
        <span>${escapeHtml(item.level)} · ${escapeHtml(item.checkedAt)}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.claim)}</p>
        <a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
      </article>
    `;
  }).join("");
}

function renderDesignReferences() {
  const container = document.getElementById("designReferences");
  if (!container) return;
  container.innerHTML = designReferences.map(([name, pattern, use]) => `
    <article class="design-card">
      <span>${escapeHtml(name)}</span>
      <strong>${escapeHtml(pattern)}</strong>
      <p>${escapeHtml(use)}</p>
    </article>
  `).join("");
}

function renderExecutionBoundaries() {
  const container = document.getElementById("executionBoundaries");
  if (!container) return;
  const rows = [
    ...executionBoundaries,
    ...methodEvidence.map(([title, text]) => [title, text]),
    ...auditCadenceRules.map((item) => [item.label, item.text]),
    ...studyMetricRules.map(([title, text]) => [title, text])
  ];
  container.innerHTML = rows.map(([title, text]) => `
    <article class="boundary-card">
      <span>规则</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `).join("");
}

function renderStrategySources() {
  const container = document.getElementById("strategySourceGrid");
  if (!container) return;
  container.innerHTML = strategySources.map((item) => `
    <article class="strategy-source-card">
      <span>${escapeHtml(item.source)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.use)}</p>
    </article>
  `).join("");
}

function sumMinutesForMonth(month) {
  return entriesArray()
    .filter((entry) => entry.date.startsWith(month))
    .reduce((sum, entry) => sum + entry.total, 0);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function installRecoveryMode(error) {
  hydrateIcons();
  setDefaultDates();
  state = freshState();
  renderAuthPanel();
  try {
    renderAll();
  } catch (renderError) {
    console.warn("[rw] recovery render failed", renderError);
  }
  if (document.documentElement.dataset.navBound !== "1") {
    try {
      bindNavigation();
    } catch (navError) {
      console.warn("[rw] recovery navigation wiring failed", navError);
    }
  }
  if (document.documentElement.dataset.authBound !== "1") {
    bindRecoveryAuthControls();
  }
  initRoute();
  setText("syncStatusText", "恢复模式");
  setText("sideDataSave", "恢复模式");
  showToast(`页面已进入恢复模式：${error?.message || error || "初始化失败"}`);
}

function bindRecoveryAuthControls() {
  const dialog = document.getElementById("authDialog");
  document.getElementById("authOpenBtn")?.addEventListener("click", () => {
    renderAuthPanel();
    dialog?.showModal();
  });
  document.getElementById("authCloseBtn")?.addEventListener("click", () => {
    dialog?.close();
  });
  document.getElementById("signInBtn")?.addEventListener("click", () => authAction("login"));
  document.getElementById("signUpBtn")?.addEventListener("click", () => authAction("signup"));
  document.getElementById("signOutBtn")?.addEventListener("click", async () => {
    try {
      await signOut();
      currentUser = null;
      state.user = null;
      state.sync = { status: "local", lastSyncAt: "", lastError: "", pending: false };
      saveState({ skipCloud: true });
      renderAll();
      showToast("已退出账号，当前数据保留在本机。");
    } catch (authError) {
      showToast(`退出失败：${authError.message || authError}`);
    }
  });
  document.getElementById("syncNowBtn")?.addEventListener("click", () => syncNow());
  document.getElementById("downloadBackupBtn")?.addEventListener("click", () => exportStateJson("manual-backup"));
  document.getElementById("pushLocalBtn")?.addEventListener("click", async () => {
    createLocalSnapshot("before-cloud-import");
    state.sync = { ...state.sync, localImportPending: false, cloudPaused: false };
    legacyImportPending = false;
    await syncNow({ force: true });
    saveState({ skipCloud: true });
    renderAuthPanel();
    showToast("已尝试导入云端。");
  });
  document.getElementById("keepLocalBtn")?.addEventListener("click", () => {
    state.sync = { ...state.sync, localImportPending: false, cloudPaused: true, status: "local", pending: false };
    legacyImportPending = false;
    saveState({ skipCloud: true });
    renderAuthPanel();
    dialog?.close();
  });
  document.getElementById("resetLocalBtn")?.addEventListener("click", resetLocalData);
  document.documentElement.dataset.authBound = "1";
}

window.__rwDebug = {
  build: APP_BUILD,
  route: setRoute,
  view: activeViewId,
  resetLocal: () => {
    clearAppLocalStorage();
    window.location.href = "/?reset=1";
  },
  health: () => ({
    build: APP_BUILD,
    appStarted,
    storageAvailable,
    activeView: activeViewId(),
    hash: window.location.hash,
    supabaseConfigured,
    user: currentUser?.email || null
  })
};
