/**
 * Admission goal catalog for PKU SS (软件与微电子学院) 085400.
 *
 * 2026 subjects were re-read from the college notice on 2026-10-10.
 * 2027 unified-exam directions are not published yet and stay pending.
 * Changing a goal never deletes completed study history.
 */

export const ADMISSION_SOURCE_CHECKED_AT = '2026-10-10';

export const CATALOG_2026_URL = 'https://ss.pku.edu.cn/zsxx/zstz/dc23feadef534acc90b1de14c3d41a54.htm';
export const RETEST_2026_URL = 'https://ss.pku.edu.cn/zsxx/zstz/007b614356c247a897f5adbbb6494f3f.htm';
export const NOTICES_URL = 'https://ss.pku.edu.cn/zsxx/zstz/index.htm';

const POLITICS = Object.freeze({ code: '101', name: '思想政治理论', key: 'politics' });
const ENGLISH = Object.freeze({ code: '201', name: '英语一', key: 'english' });
const MATH1 = Object.freeze({ code: '301', name: '数学一', key: 'math' });
const MATH2 = Object.freeze({ code: '302', name: '数学二', key: 'math' });
const CS408 = Object.freeze({ code: '408', name: '计算机学科专业基础', key: 'cs408' });
const ELECTRONICS = Object.freeze({ code: 'self-ee', name: '电子信息基础', key: 'professional' });
const ECONOMICS = Object.freeze({ code: 'self-econ', name: '经济学综合', key: 'professional' });

function direction(id, name, subjects, note, extra = {}) {
  return Object.freeze({
    id,
    name,
    subjects: Object.freeze(subjects.map((subject) => Object.freeze({ ...subject }))),
    note,
    examTrack: extra.examTrack || 'unified',
    ...extra,
  });
}

export const PUBLISHED_CATALOGS = Object.freeze({
  2026: Object.freeze({
    admissionYear: 2026,
    examYear: 2025,
    status: 'official',
    sourceYear: 2026,
    sourceUrl: CATALOG_2026_URL,
    verifiedAt: ADMISSION_SOURCE_CHECKED_AT,
    publisher: '北京大学软件与微电子学院',
    summary: '2026 入学统考：01–04 为政治、英语一、数学一、408；05 为数学一+电子信息基础；06 为数学二+经济学综合。07、08 只招推免。',
    directions: Object.freeze([
      direction('01', '软件工程', [POLITICS, ENGLISH, MATH1, CS408], '统考，与 02/03/04 统一划线、统一排名。'),
      direction('02', '人工智能', [POLITICS, ENGLISH, MATH1, CS408], '统考，与 01/03/04 统一划线、统一排名。'),
      direction('03', '网络与信息安全', [POLITICS, ENGLISH, MATH1, CS408], '统考，与 01/02/04 统一划线、统一排名。'),
      direction('04', '新兴交叉学科', [POLITICS, ENGLISH, MATH1, CS408], '统考。名额含未来技术学院成像科学中心代招。'),
      direction('05', '集成电路工程', [POLITICS, ENGLISH, MATH1, ELECTRONICS], '统考。专业课不是 408。'),
      direction('06', '金融科技', [POLITICS, ENGLISH, MATH2, ECONOMICS], '统考。数学为数学二，专业课为经济学综合。'),
      direction('07', '关键软件', [POLITICS, ENGLISH, MATH1, CS408], '只招收推荐免试研究生。', { examTrack: 'recommendation-only' }),
      direction('08', '高端芯片', [POLITICS, ENGLISH, MATH1, ELECTRONICS], '只招收推荐免试研究生。', { examTrack: 'recommendation-only' }),
    ]),
  }),
});

export const PENDING_ADMISSION_YEARS = Object.freeze([2027, 2028]);

export const DEFAULT_STUDY_GOAL = Object.freeze({
  admissionYear: 2027,
  examYear: 2026,
  directionId: '01',
  college: '北京大学软件与微电子学院',
  programCode: '085400',
  programName: '电子信息',
  provisionalBasisYear: 2026,
});

const SOURCE_STATUS = new Set(['official', 'historical', 'pending', 'derived']);

export function publishedCatalog(admissionYear) {
  return PUBLISHED_CATALOGS[Number(admissionYear)] || null;
}

export function isAdmissionYearPending(admissionYear) {
  const year = Number(admissionYear);
  return !publishedCatalog(year) || PENDING_ADMISSION_YEARS.includes(year);
}

export function directionById(catalog, directionId) {
  return catalog?.directions?.find((item) => item.id === String(directionId || '')) || null;
}

export function defaultDirectionId(catalog) {
  const unified = catalog?.directions?.find((item) => item.examTrack === 'unified');
  return unified?.id || catalog?.directions?.[0]?.id || '01';
}

/**
 * Resolve the subject set a learner should schedule against.
 * Unpublished years keep the latest official catalog as a labeled provisional basis.
 */
export function resolveStudyGoal(goal = {}, options = {}) {
  const requestedYear = Number(goal.admissionYear) || DEFAULT_STUDY_GOAL.admissionYear;
  const published = publishedCatalog(requestedYear);
  const basis = published || publishedCatalog(DEFAULT_STUDY_GOAL.provisionalBasisYear);
  const pending = !published;
  const directionId = directionById(basis, goal.directionId)
    ? String(goal.directionId)
    : defaultDirectionId(basis);
  const direction = directionById(basis, directionId);
  const status = pending ? 'pending' : (basis?.status || 'official');
  return {
    admissionYear: requestedYear,
    examYear: Number(goal.examYear) || requestedYear - 1,
    directionId,
    directionName: direction?.name || '',
    college: goal.college || DEFAULT_STUDY_GOAL.college,
    programCode: DEFAULT_STUDY_GOAL.programCode,
    programName: DEFAULT_STUDY_GOAL.programName,
    subjects: direction ? direction.subjects.map((subject) => ({ ...subject })) : [],
    subjectKeys: direction ? [...new Set(direction.subjects.map((subject) => subject.key))] : [],
    status,
    pendingOfficial: pending,
    provisional: pending,
    basisAdmissionYear: basis?.admissionYear || null,
    sourceYear: basis?.sourceYear || null,
    sourceUrl: pending ? NOTICES_URL : (basis?.sourceUrl || ''),
    verifiedAt: options.verifiedAt || basis?.verifiedAt || '',
    examTrack: direction?.examTrack || 'unified',
    note: pending
      ? `${requestedYear} 入学统考专业目录尚未在学院招生通知中发布。当前科目沿用 ${basis?.admissionYear || '最近'} 年官方目录作历史参考，不作为当年承诺。`
      : (direction?.note || basis?.summary || ''),
    impact: Object.freeze(['计划科目', '考纲权重', '题库入口', '阶段配额', '历史统计口径']),
  };
}

export function goalChangeImpact(previousGoal, nextGoal) {
  const previous = resolveStudyGoal(previousGoal || {});
  const next = resolveStudyGoal(nextGoal || {});
  const subjectChanged = previous.subjects.map((item) => item.code).join(',') !== next.subjects.map((item) => item.code).join(',');
  return {
    changesPlan: previous.directionId !== next.directionId || previous.admissionYear !== next.admissionYear,
    changesSubjects: subjectChanged,
    preservesHistory: true,
    areas: subjectChanged
      ? ['新计划与考纲入口', '科目权重', '后续统计口径']
      : ['排程年份与提示文案'],
    preserved: ['已完成任务', '学习记录', '错题', '复盘', '模考'],
  };
}

export function normalizeGoalInput(value) {
  const source = value && typeof value === 'object' ? value : {};
  const admissionYear = [2026, 2027, 2028].includes(Number(source.admissionYear))
    ? Number(source.admissionYear)
    : DEFAULT_STUDY_GOAL.admissionYear;
  const resolved = resolveStudyGoal({
    admissionYear,
    examYear: Number(source.examYear) || admissionYear - 1,
    directionId: typeof source.directionId === 'string' ? source.directionId : DEFAULT_STUDY_GOAL.directionId,
  });
  return {
    admissionYear: resolved.admissionYear,
    examYear: resolved.examYear,
    directionId: resolved.directionId,
    college: DEFAULT_STUDY_GOAL.college,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
  };
}

export function subjectStatusLabel(status) {
  if (!SOURCE_STATUS.has(status)) return '待核实';
  return {
    official: '官方',
    historical: '历史参考',
    pending: '待官方确认',
    derived: '系统推算',
  }[status];
}

export function contentVersionEntry() {
  return {
    id: `admission-${ADMISSION_SOURCE_CHECKED_AT}`,
    verifiedAt: ADMISSION_SOURCE_CHECKED_AT,
    status: 'official',
    summary: '复核学院招生通知列表与 2026 电子信息硕士招生说明。01–04 仍为数学一+408；未见 2027 统考专业目录，故 2027 目标保持待官方确认。',
    urls: [CATALOG_2026_URL, NOTICES_URL, RETEST_2026_URL],
  };
}
