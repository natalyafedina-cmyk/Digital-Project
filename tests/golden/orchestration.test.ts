import {expect,it} from 'vitest';
import scenarios from './orchestration-scenarios.json';
import {coursesForSubject} from '@/lib/curriculum/catalog';
import catalog from '@/lib/curriculum/catalog-data.json';
import {initialState,acceptedState,readState} from '@/lib/pedagogy/lesson-state';
import {planPedagogy} from '@/lib/pedagogy/planner';
import {unknownAnalysis,type TurnAnalysis} from '@/lib/learning-analysis';
import type {Resolution,RequestedAction} from '@/lib/learning-request/types';
import type {LessonState} from '@/lib/pedagogy/types';
for(const f of scenarios)it(`orchestration golden: ${f.id}`,()=>{
 const skill=catalog.skills.find(s=>s.subject_id===f.subject)!;
 const target={subjectId:f.subject,courseId:skill.course_id||coursesForSubject(f.subject)[0].id,curriculumUnitId:null,skillId:skill.id};
 // Persisted first exercise, followed by a semantic request or analyzed attempt.
 const s:LessonState={...initialState(target),phase:'await_attempt',expectedLearnerAction:'attempt_task',lastTask:{text:'Previous unsolved exercise',skillId:skill.id},supportStage:f.stage as LessonState['supportStage'],previousMethod:'dialogue'};
 const r:Resolution={...target,turnKind:f.correctness==='unknown'?'follow_up':'learner_attempt',requestedActions:f.requestedActions as RequestedAction[],confidence:.95,explicitConstraints:{doNotRevealSolution:true,wantsFreshTask:f.requestedActions.includes('practice'),wantsVisual:false,concise:null},needsClarification:false,clarificationQuestion:null};
 const unknown=unknownAnalysis({text:'',subjectId:f.subject,courseId:target.courseId,candidates:[]},'non_attempt');
 const a:TurnAnalysis=f.correctness==='unknown'?unknown:{...unknown,attemptKind:'answer',correctness:f.correctness as TurnAnalysis['correctness'],confidence:.95,skillIds:[skill.id],learningEvidenceEligible:true,evidenceSummary:'Observable reasoning on the previous task',uncertaintyReason:null};
 const d=planPedagogy({request:r,state:s,analysis:a,skillStatus:f.status||undefined,rules:[]});
 expect(d.actions).toEqual(f.expectedActions);expect(d.nextPhase).toBe(f.phase);expect(d.supportStage).toBe(f.nextStage);expect(d.target).toEqual(target);
 const next=acceptedState(s,d,d.shouldGenerateTask?{prompt:'Fresh unsolved exercise',skillId:skill.id}:null);
 expect(readState(next,target)).toEqual(next);if(d.shouldGenerateTask){expect(next.lastTask?.text).not.toBe(s.lastTask?.text);expect(next.supportStage).toBe(0);}else expect(next.lastTask).toEqual(s.lastTask);
 if(f.id==='change-method')expect(next.previousMethod).not.toBe(s.previousMethod);
});
