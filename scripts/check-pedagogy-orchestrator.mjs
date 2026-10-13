// Local disposable PostgreSQL only; no production connection or credentials.
import { readFileSync, readdirSync } from "node:fs";
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;`);
 await db.exec(readFileSync("supabase/schema.sql","utf8").replace("create extension if not exists pgcrypto;",""));
 for(const file of ["supabase/SMART-CORE.sql","supabase/ADAPTIVE-CORE-v1.sql","supabase/migrations/202610061220_adaptive_engine_v2.sql"])
  await db.exec(readFileSync(file,"utf8"));
 for(const suffix of ["_student_curriculum_lifecycle_v1.sql","_universal_learning_core_v1.sql","_pedagogy_orchestrator_v1.sql"]){
  const file=readdirSync("supabase/migrations").find(f=>f.endsWith(suffix));if(!file)throw new Error("Migration missing");
  await db.exec(readFileSync(`supabase/migrations/${file}`,"utf8"));
 }
 await db.exec(readFileSync("supabase/tests/universal_learning_core_v1.sql","utf8"));
 await db.exec(readFileSync("supabase/tests/pedagogy_orchestrator_v1.sql","utf8"));
 console.log("PASS: Sprint 3 + Sprint 4 SQL: legacy sessions, state, targets, FKs, indexes, ownership RLS (local PostgreSQL)");
} finally { await db.close(); }
