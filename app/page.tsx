import HomeInsights from "@/components/HomeInsights";

type IconName =
  | "math"
  | "russian"
  | "english"
  | "geography"
  | "physics"
  | "literature"
  | "biology"
  | "history";

const subjects = [
  {
    name: "Математика",
    subtitle: "Логика везде",
    image: "/images/math.png",
    href: "/subject/math",
    action1: "Разобрать тему",
    action2: "Задачи",
    icon: "math" as IconName,
    iconClass: "bg-[#dce9ff] text-[#3777db]",
  },
  {
    name: "Русский язык",
    subtitle: "Слова создают миры",
    image: "/images/russian.png",
    href: "/subject/russian",
    action1: "Разобрать тему",
    action2: "Упражнения",
    icon: "russian" as IconName,
    iconClass: "bg-[#ffe0e4] text-[#ed6d7a]",
  },
  {
    name: "Английский язык",
    subtitle: "Больше, чем просто слова",
    image: "/images/english.png",
    href: "/subject/english",
    action1: "Изучить тему",
    action2: "Практика",
    icon: "english" as IconName,
    iconClass: "bg-[#e7dcff] text-[#8061dd]",
  },
  {
    name: "География",
    subtitle: "Весь мир — твой",
    image: "/images/geography.png",
    href: "/subject/geography",
    action1: "Разобрать тему",
    action2: "Проверить себя",
    icon: "geography" as IconName,
    iconClass: "bg-[#d9f4e8] text-[#43a579]",
  },
  {
    name: "Физика",
    subtitle: "Как устроен этот удивительный мир?",
    image: "/images/physics.png",
    href: "/subject/physics",
    action1: "Разобрать тему",
    action2: "Задачи",
    icon: "physics" as IconName,
    iconClass: "bg-[#dceaff] text-[#4284e6]",
  },
  {
    name: "Литература",
    subtitle: "Истории, которые остаются",
    image: "/images/literature.png",
    href: "/subject/literature",
    action1: "Разобрать тему",
    action2: "Анализ",
    icon: "literature" as IconName,
    iconClass: "bg-[#e8dcff] text-[#7b5ad8]",
  },
  {
    name: "Биология",
    subtitle: "Жизнь во всех её формах",
    image: "/images/biology.png",
    href: "/subject/biology",
    action1: "Разобрать тему",
    action2: "Проверить себя",
    icon: "biology" as IconName,
    iconClass: "bg-[#dff4df] text-[#559f5a]",
  },
  {
    name: "История",
    subtitle: "Люди. События. Идеи.",
    image: "/images/history.png",
    href: "/subject/history",
    action1: "Разобрать тему",
    action2: "Тест",
    icon: "history" as IconName,
    iconClass: "bg-[#ffe4dc] text-[#d97856]",
  },
];

const menuItems = [
  { icon: "⌂", name: "Главная", href: "/" },
  { icon: "▣", name: "Мои предметы", href: "/section/subjects" },
  { icon: "✓", name: "Задания", href: "/section/tasks" },
  { icon: "◷", name: "План обучения", href: "/section/plan" },
  { icon: "☆", name: "Достижения", href: "/section/achievements" },
  { icon: "▤", name: "Библиотека", href: "/section/library" },
  { icon: "◌", name: "Чат с Луником", href: "/section/chat" },
];

const quickActions = [
  {
    icon: "▥",
    name: "Разобрать тему",
    href: "/section/quick-topic",
  },
  {
    icon: "ϟ",
    name: "Решить задачу",
    href: "/section/quick-problem",
  },
  {
    icon: "✓",
    name: "Домашнее задание",
    href: "/section/quick-homework",
  },
  {
    icon: "◎",
    name: "Подготовка к контрольной",
    href: "/section/quick-test",
  },
];

function SubjectIcon({ name }: { name: IconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "math") {
    return (
      <svg {...common}>
        <path d="M12 3 20 18H4L12 3Z" />
        <path d="M12 8v10M8 14h8" />
      </svg>
    );
  }

  if (name === "russian") {
    return (
      <svg {...common}>
        <path d="M19 3c-6 1-10 5-12 11l-2 7 7-2c6-2 10-6 11-12" />
        <path d="M7 17 17 7" />
      </svg>
    );
  }

  if (name === "english") {
    return (
      <svg {...common}>
        <path d="M4 5h16v11H9l-5 4V5Z" />
        <circle cx="9" cy="10.5" r="0.8" fill="currentColor" />
        <circle cx="12" cy="10.5" r="0.8" fill="currentColor" />
        <circle cx="15" cy="10.5" r="0.8" fill="currentColor" />
      </svg>
    );
  }

  if (name === "geography") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9M12 3c-3 3-4 6-4 9s1 6 4 9" />
      </svg>
    );
  }

  if (name === "physics") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="1.7" fill="currentColor" />
        <ellipse cx="12" cy="12" rx="9" ry="4" />
        <ellipse
          cx="12"
          cy="12"
          rx="9"
          ry="4"
          transform="rotate(60 12 12)"
        />
        <ellipse
          cx="12"
          cy="12"
          rx="9"
          ry="4"
          transform="rotate(120 12 12)"
        />
      </svg>
    );
  }

  if (name === "literature") {
    return (
      <svg {...common}>
        <path d="M4 5c3-1 6 0 8 2v13c-2-2-5-3-8-2V5Z" />
        <path d="M20 5c-3-1-6 0-8 2v13c2-2 5-3 8-2V5Z" />
      </svg>
    );
  }

  if (name === "biology") {
    return (
      <svg {...common}>
        <path d="M20 4C11 4 5 9 5 16c0 2 1 4 3 5" />
        <path d="M20 4c0 9-5 14-12 14" />
        <path d="M8 18c3-3 6-6 10-9" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M3 9h18M5 9v9M9 9v9M15 9v9M19 9v9M3 18h18M12 3 3 8h18L12 3Z" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="relative min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden bg-[#f7f8ff] text-slate-900">
      {/* ДЕКОРАТИВНЫЙ ФОН */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 left-[20%] h-[420px] w-[420px] rounded-full bg-violet-200/30 blur-[100px]" />
        <div className="absolute top-[28%] right-[-120px] h-[360px] w-[360px] rounded-full bg-blue-200/25 blur-[100px]" />
        <div className="absolute bottom-[-180px] left-[35%] h-[380px] w-[380px] rounded-full bg-fuchsia-100/25 blur-[100px]" />
      </div>

      <div className="relative z-10 flex min-h-screen lg:h-screen">
        {/* ЛЕВАЯ ПАНЕЛЬ */}
        <aside className="relative z-20 hidden lg:flex w-[220px] shrink-0 bg-[#eef0ff]/90 backdrop-blur-xl border-r border-white/70 px-4 py-4 flex-col">
          <a
            href="/section/chat"
            className="relative z-30 flex items-center gap-3 mb-5 rounded-xl hover:bg-white/60 transition"
          >
            <div
              className="pointer-events-none h-11 w-11 rounded-2xl bg-cover bg-no-repeat shadow-md ring-2 ring-white"
              style={{
                backgroundImage: "url('/images/lunik-hero-final.png')",
                backgroundSize: "340%",
                backgroundPosition: "83% 42%",
              }}
            />

            <div className="pointer-events-none">
              <h2 className="text-xl font-bold leading-none text-[#21185c]">
                Луник
              </h2>

              <p className="text-[11px] text-violet-500 mt-1">
                твой AI-репетитор
              </p>
            </div>
          </a>

          <nav className="relative z-30 space-y-1">
            {menuItems.map((item, index) => (
              <a
                key={item.name}
                href={item.href}
                className={`relative z-30 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition cursor-pointer ${
                  index === 0
                    ? "bg-violet-200/80 text-violet-950 font-semibold"
                    : "text-slate-700 hover:bg-white/80"
                }`}
              >
                <span className="pointer-events-none w-5 text-center text-violet-600">
                  {item.icon}
                </span>

                <span className="pointer-events-none">
                  {item.name}
                </span>
              </a>
            ))}
          </nav>

          <a
            href="/section/achievements"
            className="relative z-30 flex-1 mt-4 min-h-0 rounded-[24px] overflow-hidden shadow-sm hover:shadow-lg transition cursor-pointer"
          >
            <div
              className="pointer-events-none absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: "url('/images/dreams-side-final.png')",
              }}
            />
          </a>
        </aside>

        {/* ОСНОВНАЯ ЧАСТЬ */}
        <section className="relative z-20 flex-1 min-w-0 p-3 lg:p-4 flex flex-col">
          {/* ВЕРХНЯЯ ПАНЕЛЬ */}
          <div className="relative z-30 h-11 shrink-0 flex items-center gap-3 mb-3">
            <a
              href="/section/chat"
              className="relative z-30 h-full flex-1 bg-white/90 border border-white rounded-2xl shadow-sm px-4 flex items-center text-sm text-slate-400 hover:shadow-md transition cursor-pointer"
            >
              <span className="pointer-events-none">
                🔎&nbsp;&nbsp; Спроси Луника объяснить что угодно...
              </span>
            </a>

            <a
              href="/parent"
              className="relative z-30 hidden sm:flex h-11 px-4 shrink-0 rounded-2xl bg-white/90 text-violet-700 font-semibold shadow-sm items-center justify-center hover:shadow-md transition cursor-pointer"
            >
              Родителю
            </a>

            <a
              href="/section/profile"
              className="relative z-30 h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white font-bold shadow flex items-center justify-center hover:scale-105 transition cursor-pointer"
            >
              <span className="pointer-events-none">
                С
              </span>
            </a>

            <a
              href="/section/profile"
              className="relative z-30 hidden md:block font-semibold pr-2 hover:text-violet-700 cursor-pointer"
            >
              Софья
            </a>
          </div>

          {/* HERO */}
          <section
            className="relative z-20 shrink-0 h-[200px] rounded-[26px] overflow-hidden shadow-lg bg-cover bg-center"
            style={{
              backgroundImage: "url('/images/lunik-hero-final.png')",
            }}
          >
            <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-[#11164d]/94 via-[#24235d]/38 to-transparent" />

            <div className="relative z-10 h-full max-w-[700px] px-6 py-4 flex flex-col">
              <div className="pointer-events-none">
                <h1 className="text-[38px] xl:text-[43px] leading-none font-bold text-white mb-2">
                  Привет, Софья! 🌙
                </h1>

                <h2 className="text-xl xl:text-[22px] font-semibold text-white mb-1.5">
                  Что будем изучать сегодня?
                </h2>

                <p className="max-w-[520px] text-[12px] xl:text-[13px] text-violet-100 leading-[1.45]">
                  Я рядом, чтобы помогать тебе узнавать новое,
                  разбираться в сложном и верить в себя.
                  Вперёд к большим мечтам ✨
                </p>
              </div>

              <div className="relative z-40 flex gap-2 mt-auto max-w-[650px]">
                {quickActions.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className="relative z-40 h-[36px] px-3 rounded-xl bg-white/95 text-violet-900 shadow-sm flex-1 flex items-center justify-center gap-1.5 text-[10px] xl:text-[11px] font-semibold hover:bg-white hover:-translate-y-0.5 transition cursor-pointer"
                  >
                    <span className="pointer-events-none text-violet-500">
                      {item.icon}
                    </span>

                    <span className="pointer-events-none">
                      {item.name}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </section>

          {/* ЗАГОЛОВОК */}
          <div className="relative z-30 shrink-0 h-10 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <a
                href="/section/subjects"
                className="relative z-30 text-xl xl:text-2xl font-bold hover:text-violet-700 cursor-pointer"
              >
                Твои предметы
              </a>

              <span className="pointer-events-none text-xs text-violet-400">
                8 предметов
              </span>
            </div>

            <a
              href="/section/order"
              className="relative z-30 text-xs text-violet-500 hover:text-violet-700 cursor-pointer"
            >
              ✨ Настроить порядок
            </a>
          </div>

          {/* КАРТОЧКИ ПРЕДМЕТОВ */}
          <section className="relative z-30 flex-1 min-h-0 grid grid-cols-2 xl:grid-cols-4 grid-rows-4 xl:grid-rows-2 gap-2.5">
            {subjects.map((subject) => (
              <a
                key={subject.name}
                href={subject.href}
                className="relative z-40 group min-h-0 bg-white rounded-[18px] overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition flex flex-col cursor-pointer"
              >
                <div className="pointer-events-none relative flex-1 min-h-[94px]">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.03]"
                    style={{
                      backgroundImage: `url('${subject.image}')`,
                    }}
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-[#11143f]/88 via-[#11143f]/10 to-transparent" />

                  <div
                    className={`absolute left-3 top-3 h-9 w-9 rounded-xl flex items-center justify-center shadow-sm ${subject.iconClass}`}
                  >
                    <SubjectIcon name={subject.icon} />
                  </div>

                  <div className="absolute inset-x-0 bottom-0 px-3 pb-2 text-white">
                    <h3 className="text-base xl:text-lg font-bold leading-tight">
                      {subject.name}
                    </h3>

                    <p className="text-[10px] text-white/85 truncate">
                      {subject.subtitle}
                    </p>
                  </div>
                </div>

                <div className="pointer-events-none shrink-0 h-[36px] p-1.5 flex gap-1.5">
                  <span className="flex-1 rounded-lg bg-violet-50 text-violet-700 text-[10px] font-medium flex items-center justify-center">
                    {subject.action1}
                  </span>

                  <span className="flex-1 rounded-lg bg-violet-50 text-violet-700 text-[10px] font-medium flex items-center justify-center">
                    {subject.action2}
                  </span>
                </div>
              </a>
            ))}
          </section>

          {/* НИЖНЯЯ ПАНЕЛЬ — реальные данные */}
          <HomeInsights />
        </section>
      </div>
    </main>
  );
}