# Быстрый запуск AI-блока

1. В терминале проекта:
   npm install openai

2. Скопируйте папки из архива в корень проекта.
   Файл app/subject/[subject]/[mode]/page.tsx нужно заменить текущим.

3. Скопируйте .env.local.example в корень проекта как .env.local
   и вставьте API-ключ.

4. Перезапустите:
   npm run dev

5. Проверьте:
   http://localhost:3000/subject/math/problem
   http://localhost:3000/subject/english/practice
   http://localhost:3000/parent
