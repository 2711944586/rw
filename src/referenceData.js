export const sourceRegistry = [
  {
    level: "官方已发布",
    title: "北大软微 2026 电子信息招生说明",
    claim: "截至 2026-06-08 可核验的 2026 入学招生说明显示：085400 电子信息专业计划招生 583 名、拟接收推免生 255 名；01-04 方向统考科目相同，均为 101 思想政治理论、201 英语一、301 数学一、408 计算机学科专业基础，并统一划定统考分数线、统一排名、择优录取。04 方向含未来技术学院成像科学中心代招名额。该结论只能作为当前备考基准，不能替代 2028 入学当年公告。",
    url: "https://ss.pku.edu.cn/zsxx/zstz/dc23feadef534acc90b1de14c3d41a54.htm",
    checkedAt: "2026-06-08"
  },
  {
    level: "官方历史参考",
    title: "北大软微 2026 复试分数线",
    claim: "电子信息 01-04 方向复试线为政治 55、外语 55、科目三 90、科目四 90、总分 378；这是 2026 历史复试线，不用于预测 2028。",
    url: "https://ss.pku.edu.cn/zsxx/zstz/007b614356c247a897f5adbbb6494f3f.htm",
    checkedAt: "2026-06-08"
  },
  {
    level: "待官方发布",
    title: "2028 入学招生信息核验",
    claim: "截至 2026-06-08，2028 入学对应招生简章、专业目录、方向、考试科目、报名和网上确认要求尚未作为本系统的已核验事实；2027 年 9-10 月必须以研招网、北京大学研究生招生网和学院官网重新核验。",
    url: "https://yz.chsi.com.cn/",
    checkedAt: "2026-06-08"
  },
  {
    level: "官方历史参考",
    title: "2026 全国硕士研究生招生考试初试时间",
    claim: "教育部 2026 研招规定明确当年初试时间为 2025 年 12 月 20 日至 21 日。本系统中的 2027-12-25 只是推算排程日，非官方初试日期；2027 年 12 月仅作为推算窗口，官方日期待发布。",
    url: "https://hudong.moe.gov.cn/srcsite/A15/moe_778/s3261/202509/t20250918_1413836.html",
    checkedAt: "2026-06-08"
  },
  {
    level: "学习科学参考",
    title: "Practice testing / distributed practice",
    claim: "Practice testing 和 distributed practice 在学习技术综述中被列为较高效方法。本系统据此把任务写成可交付练习、错因记录和间隔复盘；这只是学习方法依据，不代表分数承诺。",
    url: "https://journals.sagepub.com/doi/10.1177/1529100612453266",
    checkedAt: "2026-06-08"
  },
  {
    level: "学习科学参考",
    title: "Retrieval practice",
    claim: "Retrieval practice 研究支持用自测、闭卷复述、重做错题来巩固长期保持。本系统将“看完”改成题量、默写、过程图和错因等证据。",
    url: "https://www.science.org/doi/10.1126/science.1152408",
    checkedAt: "2026-06-08"
  },
  {
    level: "备考经验参考",
    title: "408 复习经验共识",
    claim: "408 非官方经验帖和主流教辅体系通常建议按数据结构、计算机组成原理、操作系统、计算机网络建立框架，并用章节题、真题、过程图、伪代码和错题归档校验掌握。本系统只把这类经验转化为任务结构，不把任何机构资料视为官方指定资料。",
    url: "https://www.cskaoyan.com/",
    checkedAt: "2026-06-08"
  },
  {
    level: "备考经验参考",
    title: "公共课名师方法共识",
    claim: "数学强调基础概念、强化题型、真题限时和错题识别信号；英语强调单词不断档、真题阅读精读、定位句和干扰项复盘；政治通常后置启动选择题，考前再集中背诵和时政。本系统将其抽象为可调策略，不替代当年官方大纲。",
    url: "https://yz.chsi.com.cn/kyzx/jybzc/",
    checkedAt: "2026-06-08"
  },
  {
    level: "官方",
    title: "Supabase Auth / RLS",
    claim: "前端只使用 publishable key；用户数据表启用 RLS，并以 user_id = auth.uid() 作为访问边界。",
    url: "https://supabase.com/docs/guides/database/postgres/row-level-security",
    checkedAt: "2026-05-27"
  },
  {
    level: "官方",
    title: "Vite / Vercel 环境变量",
    claim: "浏览器端只暴露 VITE_ 前缀变量；Vercel 部署时在项目环境变量中配置 Supabase URL 和 publishable key。",
    url: "https://vite.dev/guide/env-and-mode",
    checkedAt: "2026-05-27"
  }
];

export const designReferences = [
  ["Todoist", "今日 / 未来任务", "今日页只展示第一任务、支撑任务和到期复盘，减少计划浏览成本。"],
  ["TickTick", "任务 + 专注 + 习惯", "任务完成后自动写入记录和复盘，不让记录成为第二套系统。"],
  ["Anki", "主动回忆与间隔复习", "D+1/D+3/D+7/D+14/D+30，失败或低质量会生成短复盘。"],
  ["Toggl Track", "时间报告", "记录页关注周/月趋势、核心占比和长期稳定性。"],
  ["Material / Apple HIG", "浅色、留白、低噪声动效", "默认专注密度，高级内容折叠，移动端优先完成任务。"]
];

export const executionBoundaries = [
  ["每日任务", "默认 3 项，最多 4 项。顺延或底线日可降到 2 项；数学和 408 是必保核心。"],
  ["未完成顺延", "未完成任务进入今天，原任务保留为已顺延；系统削减新任务，必要时降到 2 项，避免第二天任务超载。"],
  ["任务颗粒度", "单任务 20-120 分钟，必须有题量、图示、错因、默写或代码交付。"],
  ["渐进时长", "2026 年 6 月 8 日从工作日约 90 分钟、周末约 150 分钟重启；7 月约 120/210 分钟，8 月约 150/240 分钟；9 月起进入第一轮主干强度。"],
  ["证据掌握", "考点不能只凭主观判断标已掌握，必须留下题量、正确率、错题回炉或可交付说明；考纲范围以当年官方大纲为最终口径。"],
  ["校准规则", "2027 年 8 月全科不到 390 或 10 月不到 405，必须准备稳妥院校梯队。"]
];
