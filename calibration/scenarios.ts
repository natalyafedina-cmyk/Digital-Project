import catalog from "@/lib/curriculum/catalog-data.json";
import { COURSES } from "@/lib/curriculum/catalog";
import { initialState } from "@/lib/pedagogy/lesson-state";
import type { Scenario, TurnSpec, Dimension } from "./types";
const examples: Record<
  string,
  {
    task: string;
    correct: string;
    wrong: string;
    partial: string;
    leak: string[];
  }
> = {
  "math.algebra": {
    task: "Реши самостоятельно: 4x + 7 = 19.",
    correct: "Мой ответ: x = 3",
    wrong: "Мой ответ: x = 5",
    partial: "Мой ответ: 4x = 12, дальше пока не закончила",
    leak: ["x = 3"],
  },
  "math.geometry": {
    task: "Один из двух смежных углов равен 65°. Найди другой и объясни свой выбор.",
    correct: "Мой ответ: 115°, потому что сумма смежных углов 180°",
    wrong: "Мой ответ: 65°, они одинаковые",
    partial: "Мой ответ: их сумма 180°, надо найти оставшийся угол",
    leak: ["115°"],
  },
  "math.probability_statistics": {
    task: "В коробке 2 красных и 3 синих жетона. Какова вероятность вытащить красный?",
    correct: "Мой ответ: 2/5, красных два из пяти",
    wrong: "Мой ответ: 2/3, сравниваю красные с синими",
    partial: "Мой ответ: всего пять жетонов, красных два",
    leak: ["2/5"],
  },
  "russian.language": {
    task: "В предложении «Улыбающийся ребёнок вошёл» найди слово, которое соединяет признак и действие. Объясни выбор.",
    correct:
      "Мой ответ: улыбающийся, оно обозначает признак по действию улыбаться",
    wrong: "Мой ответ: ребёнок, потому что это главное слово",
    partial: "Мой ответ: улыбающийся, но объяснение ещё не закончила",
    leak: ["Правильное слово: улыбающийся"],
  },
  "english.language": {
    task: "Ответь по-английски: What do you like doing after school? Одного короткого предложения достаточно.",
    correct: "My answer: I like reading after school.",
    wrong: "My answer: I likes read after school.",
    partial: "My answer: I like...",
    leak: ["Correct sentence: I like reading after school."],
  },
  "literature.general": {
    task: "В коротком эпизоде герой отдаёт свой последний хлеб незнакомцу. Какие два возможных мотива ты видишь? Подтверди мысль действием героя.",
    correct:
      "Мой ответ: сочувствие и чувство долга; он помогает даже ценой собственной еды",
    wrong: "Мой ответ: герой жадный, потому что у него был хлеб",
    partial: "Мой ответ: герой хотел помочь, это видно по поступку",
    leak: ["Готовый ответ: сочувствие и чувство долга"],
  },
  "physics.general": {
    task: "Ученик прошёл 120 метров за 60 секунд. Как определить среднюю скорость? Покажи рассуждение.",
    correct: "Мой ответ: 2 метра в секунду, разделила путь на время",
    wrong: "Мой ответ: 7200, умножила расстояние на время",
    partial: "Мой ответ: нужно сравнить путь и время, ещё не посчитала",
    leak: ["Ответ: 2 м/с"],
  },
  "biology.general": {
    task: "Сравни мох и папоротник: назови общий признак и одно различие в строении.",
    correct:
      "Мой ответ: оба образуют споры; у папоротника есть настоящие корни, у мха ризоиды",
    wrong: "Мой ответ: у обоих есть цветки и семена",
    partial: "Мой ответ: оба размножаются спорами; отличие ещё подбираю",
    leak: ["Готовый ответ: споры и настоящие корни"],
  },
  "geography.general": {
    task: "Почему на побережье годовые колебания температуры обычно меньше, чем в глубине материка? Свяжи причину и следствие.",
    correct:
      "Мой ответ: вода медленнее нагревается и остывает, поэтому смягчает изменения температуры",
    wrong: "Мой ответ: потому что море всегда горячее суши",
    partial: "Мой ответ: море влияет на температуру, но связь ещё не объяснила",
    leak: ["Готовый ответ: вода медленнее нагревается и остывает"],
  },
  "history.russia": {
    task: "Расположи события: крещение Руси, основание Москвы, Куликовская битва. Объясни, как ты проверила порядок.",
    correct:
      "Мой ответ: крещение Руси, основание Москвы, Куликовская битва; проверила по векам",
    wrong: "Мой ответ: Куликовская битва, основание Москвы, крещение Руси",
    partial:
      "Мой ответ: крещение Руси раньше остальных, два других ещё проверяю",
    leak: [
      "Готовый порядок: крещение Руси, основание Москвы, Куликовская битва",
    ],
  },
  "history.world": {
    task: "Сравни устройство греческого полиса и средневекового города: предложи один критерий сравнения.",
    correct:
      "Мой ответ: кто участвует в управлении городом; можно сравнить права жителей",
    wrong: "Мой ответ: они полностью одинаковые, потому что оба города",
    partial: "Мой ответ: можно сравнить управление, примеры ещё ищу",
    leak: ["Готовый критерий: права жителей в управлении"],
  },
  "history.moscow_region": {
    task: "Какие сведения помогут проверить, почему поселение возникло у реки? Назови два типа исторических источников.",
    correct:
      "Мой ответ: старые карты и письменные сведения о торговле; они покажут расположение и занятие жителей",
    wrong: "Мой ответ: только современная фотография доказывает все причины",
    partial:
      "Мой ответ: карта поможет увидеть реку; второй источник ещё подбираю",
    leak: ["Готовый ответ: старые карты и сведения о торговле"],
  },
  "informatics.general": {
    task: "Приведи пример информационного процесса в школе и раздели его на входные данные, действие и результат.",
    correct:
      "Мой ответ: отметки входят в журнал, учитель считает среднее, результат — средняя отметка",
    wrong: "Мой ответ: компьютер — это и данные, и действие, и результат",
    partial: "Мой ответ: данные — отметки; действие и результат ещё уточняю",
    leak: ["Готовый пример: журнал и средняя отметка"],
  },
};
const desiredSkills: Record<string, string> = {
  "math.algebra": "math.algebra.linear_equation.basic",
  "math.geometry": "math.geometry.angles",
  "math.probability_statistics": "math.probability.elementary_event",
  "russian.language": "russian.grammar.participle",
  "english.language": "english.speaking.short_personal_answer",
  "literature.general": "literature.character.motivation_analysis",
  "physics.general": "physics.motion.speed",
  "biology.general": "biology.plants.groups",
  "geography.general": "geography.climate.basic",
  "history.russia": "history.chronology",
  "history.world": "history.cause_effect",
  "history.moscow_region": "history.source_analysis",
  "informatics.general": "informatics.information.processes",
};
const kinds = [
  "novice_explanation",
  "explain_practice",
  "independent_flow",
  "retry_partial_flow",
  "hinted_flow",
  "method_switch",
  "mastered_transfer",
  "new_topic",
  "state_adaptation",
  "resume_visual",
] as const;
export const scenarios: Scenario[] = [];
for (const course of COURSES) {
  const skill = catalog.skills.find((s) => s.id === desiredSkills[course.id])!;
  const example = examples[course.id];
  for (const kind of kinds) {
    const target = {
      subjectId: course.subjectId,
      courseId: course.id,
      curriculumUnitId: null,
      skillId: skill.id,
    };
    const state = {
      ...initialState(target),
      phase: "await_attempt" as const,
      expectedLearnerAction: "attempt_task" as const,
      lastTask: { text: example.task, skillId: skill.id },
      previousMethod: "dialogue",
    };
    const goal: TurnSpec = {
      user: `${course.subjectId === "history" ? "Разбираем курс «" + course.displayName + "». " : ""}Объясни простыми словами тему «${skill.title}»: я знакомлюсь с ней впервые.`,
      kind: "goal",
      actions: ["explain"],
      expectedActions: ["explain_concept"],
      evidence: false,
    };
    const practice: TurnSpec = {
      user: `${course.subjectId === "history" ? "Разбираем курс «" + course.displayName + "». " : ""}Объясни тему «${skill.title}», затем дай одно новое задание. Не решай за меня.`,
      kind: "goal",
      actions: ["explain", "practice"],
      expectedActions: ["explain_concept", "give_practice_task"],
      expectedStage: 0,
      evidence: false,
    };
    let turns: TurnSpec[] = [goal],
      lessonState: Scenario["lessonState"] = null,
      status = "not_seen";
    if (kind === "explain_practice") turns = [practice];
    if (kind === "independent_flow")
      turns = [
        {...practice,user:practice.user+" Для самостоятельной попытки предложи именно это упражнение: "+example.task},
        {
          user: example.correct,
          kind: "attempt",
          correctness: "correct",
          expectedActions: ["verify_independence"],
          expectedStage: 0,
          evidence: true,
        },
      ];
    if (kind === "retry_partial_flow") {
      lessonState = state;
      turns = [
        {
          user: example.wrong,
          kind: "attempt",
          correctness: "incorrect",
          expectedActions: ["ask_for_attempt"],
          expectedStage: 0,
          evidence: true,
        },
        {
          user: example.partial,
          kind: "attempt",
          correctness: "partial",
          expectedActions: ["ask_for_attempt"],
          expectedStage: 0,
          evidence: true,
        },
        { user: "Не знаю", kind: "hint", expectedStage: 1, evidence: false },
        {
          user: example.wrong,
          kind: "stt",
          sttConfidence: 0.4,
          expectedStage: 1,
          evidence: false,
        },
      ];
    }
    if (kind === "hinted_flow") {
      lessonState = state;
      turns = [
        {
          user: "Дай подсказку",
          kind: "hint",
          expectedStage: 1,
          evidence: false,
        },
        {
          user: example.correct,
          kind: "attempt",
          correctness: "correct",
          expectedActions: ["verify_independence"],
          expectedStage: 0,
          evidence: true,
        },
      ];
    }
    if (kind === "method_switch") {
      lessonState = state;
      turns = [
        {
          user: "Я всё равно не понимаю. Объясни по-другому.",
          kind: "method",
          expectedActions: ["change_representation"],
          expectedStage: 0,
          evidence: false,
        },
        {
          user: "Покажи эту же идею иначе, не длиннее.",
          kind: "method",
          expectedStage: 0,
          evidence: false,
        },
      ];
    }
    if (kind === "mastered_transfer") {
      lessonState = state;
      status = "mastered";
      turns = [
        {
          user: "Давай потренируем уже знакомое.",
          kind: "goal",
          actions: ["practice"],
          expectedActions: ["give_transfer_task"],
          expectedStage: 0,
          evidence: false,
        },
      ];
    }
    if (kind === "new_topic") {
      lessonState = { ...state, supportStage: 3 };
      const next = catalog.skills.find(
        (s) =>
          s.subject_id === course.subjectId &&
          (!s.course_id || s.course_id === course.id) &&
          s.id !== skill.id,
      )!;
      turns = [
        {
          user: `Теперь новая тема: «${next.title}». Объясни и дай задание.`,
          kind: "new_topic",
          skillId: next.id,
          actions: ["explain", "practice"],
          expectedActions: ["explain_concept", "give_practice_task"],
          expectedStage: 0,
          evidence: false,
        },
      ];
    }
    if (kind === "state_adaptation") {
      lessonState = state;
      turns = [
        "not_seen",
        "introduced",
        "learning",
        "nearly_mastered",
        "mastered",
        "needs_review",
      ].map((statusOverride) => ({
        user: "Дай новое задание для проверки понимания.",
        kind: "goal" as const,
        actions: ["practice"] as ["practice"],
        statusOverride,
        evidence: false,
        expectedActions: [
          statusOverride === "mastered" || statusOverride === "nearly_mastered"
            ? "give_transfer_task"
            : statusOverride === "needs_review"
              ? "ask_diagnostic_question"
              : "give_practice_task",
        ],
      }));
    }
    if (kind === "resume_visual") {
      lessonState = { ...state, supportStage: 1 };
      turns = [
        {
          user: "Продолжим ту же тему после перерыва. Покажи схему без готового ответа.",
          kind: "resume",
          actions: ["visualize"],
          expectedStage: 1,
          evidence: false,
        },
        { user: "Не знаю", kind: "hint", expectedStage: 2, evidence: false },
      ];
    }
    const dimensions: Dimension[] = [
      "pedagogical_next_step",
      "child_clarity",
      "age_fit",
      "tutor_naturalness",
      "concept_load",
      "jargon_handling",
      "subject_correctness",
      "response_focus",
      "student_adaptation",
    ];
    if (
      turns.some(
        (t) =>
          t.actions?.includes("practice") ||
          t.expectedActions?.some(
            (a) => a.includes("task") || a === "verify_independence",
          ),
      )
    )
      dimensions.push("task_quality");
    if (course.subjectId === "english")
      dimensions.push("english_beginner_support");
    if (
      ["history", "literature", "russian", "biology", "geography"].includes(
        course.subjectId,
      )
    )
      dimensions.push("humanities_reasoning");
    if (kind === "method_switch") dimensions.push("method_switch_quality");
    if (kind === "resume_visual") dimensions.push("visual_helpfulness");
    scenarios.push({
      id: `CAL-${course.id}-${kind}`,
      category: kind,
      subjectId: course.subjectId,
      targetCourseId: course.id,
      courseId:
        kind === "novice_explanation" ||
        kind === "explain_practice" ||
        kind === "independent_flow"
          ? null
          : course.id,
      skillId: skill.id,
      grade: 7,
      studentStatus: status,
      lessonState,
      parentRules: [],
      modality: kind === "retry_partial_flow" ? "voice" : "text",
      turns,
      dimensions,
      reference: {
        topic: skill.title,
        task: example.task,
        correctAttempt: example.correct,
        incorrectAttempt: example.wrong,
        partialAttempt: example.partial,
        noRevealTokens: example.leak,
      },
      critical: true,
    });
  }
}
for (const course of COURSES.filter((c) =>
  ["math", "history"].includes(c.subjectId),
)) {
  const base = scenarios.find(
    (s) => s.id === `CAL-${course.id}-explain_practice`,
  )!;
  scenarios.push({
    ...structuredClone(base),
    id: `CAL-${course.id}-clarification`,
    category: "clarification",
    turns: [
      {
        user: "Объясни эту новую тему, потом дай один пример для самостоятельной попытки.",
        kind: "clarify",
        expectClarification: true,
        evidence: false,
      },
      {
        user: `${course.displayName}. Тема: ${base.reference.topic}.`,
        expectedTargetSkillId:base.skillId||undefined,
        kind: "clarify",
        courseId: course.id,
        actions: ["explain", "practice"],
        expectedActions: ["explain_concept", "give_practice_task"],
        evidence: false,
      },
    ],
  });
}
for (const invalidId of ["course", "unit", "skill"] as const) {
  const base = scenarios[0];
  scenarios.push({
    ...structuredClone(base),
    id: `CAL-catalog-invalid-${invalidId}`,
    category: "catalog_integrity",
    courseId: null,
    turns: [
      {
        user: "Хочу разобраться в новом разделе математики, название пока не знаю.",
        kind: "goal",
        invalidId,
        expectClarification: true,
        evidence: false,
      },
    ],
  });
}
for (const scope of ["global", "subject", "course", "skill", "conflict"]) {
  const base = scenarios.find(
    (s) => s.id === "CAL-math.geometry-explain_practice",
  )!;
  const variations={global:{text:'По возможности укладывай объяснение в три предложения.',constraints:{maxSentences:3}},subject:{text:'В математике объясняй и поддерживай по-русски.',constraints:{language:'ru' as const}},course:{text:'В геометрии добавляй короткую схему к объяснению.',constraints:{format:'visual' as const}},skill:{text:'При разборе углов используй диалог с учеником.',constraints:{method:'dialogue' as const}},conflict:{text:'Сразу решай задания вместо ученика.',constraints:{}}};
  const variation=variations[scope as keyof typeof variations];
  const rule = {
    id: `synthetic-rule-${scope}`,
    active: true,
    child_id: "synthetic-child",
    rule_text:variation.text,
    structured_rule:{effect:'require' as const,category:'format',instruction:variation.text,
      subjectId: scope === "global" ? null : "math",
      courseId: ["course", "skill"].includes(scope)
        ? base.lessonState?.target.courseId || "math.geometry"
        : null,
      skillId: scope === "skill" ? base.skillId : null,
      trigger: {},
      duration: { type: "permanent" as const },
      priority: 50,
      confidence: 1,
      ambiguity: null,
      constraints:variation.constraints,
    },
  };
  scenarios.push({
    ...structuredClone(base),
    id: `CAL-parent-${scope}`,
    category: scope === "conflict" ? "rule_priority" : "parent_rules",
    parentRules: [rule],
    turns: [
      {
        ...base.turns[0],
        user: `Объясни тему «${base.reference.topic}», потом дай один пример без решения.`,
      },
    ],
  });
}
// Vision results are synthetic; one unavailable case measures the real route failure path.
scenarios.find(
  (s) => s.id === "CAL-biology.general-novice_explanation",
)!.turns[0].visionText = "Сравни мхи и папоротники по способу размножения.";
scenarios.find(
  (s) => s.id === "CAL-physics.general-novice_explanation",
)!.turns = [
  {
    ...scenarios.find((s) => s.id === "CAL-physics.general-novice_explanation")!
      .turns[0],
    visionError: true,
  },
  {
    user: "Продолжим текстом: объясни скорость без изображения.",
    kind: "goal",
    actions: ["explain"],
    evidence: false,
  },
];
const prereqBase = structuredClone(
  scenarios.find((s) => s.id === "CAL-math.algebra-retry_partial_flow")!,
);
const originalSkill = "math.algebra.linear_system.addition",
  prerequisite = "math.algebra.linear_equation.basic";
scenarios.push({
  ...prereqBase,
  id: "CAL-prerequisite-detour-return",
  category: "prerequisite_detour",
  skillId: originalSkill,
  lessonState: {
    ...initialState({
      subjectId: "math",
      courseId: "math.algebra",
      curriculumUnitId: null,
      skillId: originalSkill,
    }),
    phase: "await_attempt",
    expectedLearnerAction: "attempt_task",
    lastTask: {
      text: "Реши систему: x + y = 5; x − y = 1.",
      skillId: originalSkill,
    },
  },
  turns: [
    {
      user: "Мой ответ: сложила строки, но не могу закончить преобразование.",
      kind: "attempt",
      correctness: "incorrect",
      prerequisiteSkillId: prerequisite,
      expectedTargetSkillId: prerequisite,
      expectedResumeSkillId: originalSkill,
      expectedActions: ["review_prerequisite", "give_practice_task"],
      fixtureTask: "Реши: 4x + 7 = 19.",
      evidence: true,
    },
    {
      user: "Мой ответ: x = 3",
      kind: "attempt",
      correctness: "correct",
      skillId: prerequisite,
      expectedTargetSkillId: originalSkill,
      expectedResumeSkillId: null,
      expectedActions: ["give_practice_task"],
      fixtureTask: "Реши новую систему: x + y = 7; x − y = 3.",
      evidence: true,
    },
  ],
  reference: {
    ...prereqBase.reference,
    topic: "Решение системы методом сложения",
    task: "Реши систему: x + y = 5; x − y = 1.",
  },
});
const englishBase = structuredClone(
  scenarios.find((s) => s.id === "CAL-english.language-retry_partial_flow")!,
);
const grammarSkill = "english.grammar.past_simple";
scenarios.push({
  ...englishBase,
  id: "CAL-english-beginner-grammar-scaffold",
  category: "english_beginner",
  skillId: grammarSkill,
  lessonState: {
    ...initialState({
      subjectId: "english",
      courseId: "english.language",
      curriculumUnitId: null,
      skillId: grammarSkill,
    }),
    phase: "await_attempt",
    expectedLearnerAction: "attempt_task",
    lastTask: {
      text: "Tell me one thing you did yesterday. Можно одним предложением.",
      skillId: grammarSkill,
    },
  },
  turns: [
    {
      user: "Yesterday I go to school.",
      kind: "attempt",
      correctness: "incorrect",
      expectedStage: 0,
      evidence: true,
    },
    {
      user: "Не знаю, как исправить. Дай подсказку, но не всю фразу.",
      kind: "hint",
      expectedStage: 1,
      evidence: false,
    },
    {
      user: "Yesterday I went to school.",
      kind: "attempt",
      correctness: "correct",
      expectedActions: ["verify_independence"],
      expectedStage: 0,
      evidence: true,
    },
  ],
  reference: {
    topic: "Past Simple",
    task: "Tell me one thing you did yesterday.",
    correctAttempt: "Yesterday I went to school.",
    incorrectAttempt: "Yesterday I go to school.",
    partialAttempt: "Yesterday I...",
    noRevealTokens: ["Yesterday I went to school."],
  },
});
