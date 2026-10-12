// Optional local-only validation; no Supabase connection, credentials or application dependencies.
// PGLITE_MODULE_PATH can point at a temporary @electric-sql/pglite install.
import { readFileSync, readdirSync } from "node:fs";
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;`);
  // pgcrypto is not available in the embedded runtime; gen_random_uuid is built into Postgres.
  await db.exec(readFileSync("supabase/schema.sql", "utf8").replace("create extension if not exists pgcrypto;", ""));
  for (const file of ["supabase/SMART-CORE.sql", "supabase/ADAPTIVE-CORE-v1.sql", "supabase/migrations/202610061220_adaptive_engine_v2.sql"]) {
    await db.exec(readFileSync(file, "utf8"));
  }
  await db.exec(`insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
    insert into public.children(id,parent_id,name,grade) values
      ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Test learner A',7),
      ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Test learner B',6),
      ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','Test learner C',7);
    insert into public.topic_progress(child_id,subject,topic,mastery_score) values
      ('10000000-0000-0000-0000-000000000001','math','Unmapped legacy topic',42);`);
  const before = await db.query("select to_jsonb(t) as row from public.topic_progress t");
  const migration = readdirSync("supabase/migrations").find(file => file.endsWith("_student_curriculum_lifecycle_v1.sql"));
  if (!migration) throw new Error("Migration missing");
  await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
  const after = await db.query("select to_jsonb(t) as row from public.topic_progress t");
  if (JSON.stringify(before.rows) !== JSON.stringify(after.rows)) throw new Error("Legacy topic data changed");
  await db.exec(readFileSync("supabase/tests/student_curriculum_lifecycle_v1.sql", "utf8"));
  console.log("PASS: migration, catalog counts, RLS, FK indexes, transitions, textbook replacement and legacy preservation (local PostgreSQL WASM)");
} finally { await db.close(); }
