import 'dotenv/config';
import { getDb, clearDatabase, createTask, updateTask, addAuditLog, refreshAllTaskStatuses } from '../src/db.js';

export function seedDemoData(): void {
  console.log('Seeding demo tasks into SQLite database...');
  const db = getDb();

  // Clear existing records
  clearDatabase(db);

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const demoTasks = [
    {
      id: 'task-cs301-design',
      title: 'CS 301 Capstone: Architecture & Data Pipeline Specification',
      category: 'project' as const,
      deadline: new Date(now + 10 * dayMs).toISOString(),
      depends_on: [],
      action_class: 'HUMAN_REQUIRED' as const,
      note: 'Initial requirements formulated with team mentor',
    },
    {
      id: 'task-cs301-impl',
      title: 'CS 301 Capstone: Milestone 2 Implementation & Code Submission',
      category: 'project' as const,
      deadline: new Date(now + 14 * dayMs).toISOString(),
      depends_on: ['task-cs301-design'],
      action_class: 'HUMAN_REQUIRED' as const,
      note: 'Cannot begin until architecture specification is approved',
    },
    {
      id: 'task-fee-tuition',
      title: 'Spring 2026 Tuition Installment #2',
      category: 'fee' as const,
      deadline: new Date(now + 4 * dayMs).toISOString(),
      depends_on: [],
      action_class: 'HUMAN_REQUIRED' as const,
      note: 'Bursar office reminder sent',
    },
    {
      id: 'task-fee-health',
      title: 'Campus Health Insurance Plan Waiver Surcharge',
      category: 'fee' as const,
      deadline: new Date(now - 3 * dayMs).toISOString(), // Past deadline -> stale
      depends_on: [],
      action_class: 'HUMAN_REQUIRED' as const,
      note: 'Overdue notice received from Student Accounts',
    },
    {
      id: 'task-math240-ps4',
      title: 'Math 240 Problem Set 4: Linear Systems & Vector Spaces',
      category: 'assignment' as const,
      deadline: new Date(now + 2 * dayMs).toISOString(),
      depends_on: [],
      action_class: 'AUTO' as const,
      note: 'Canvas submission portal open',
    },
    {
      id: 'task-phys-lab2',
      title: 'Physics 210 Lab Report 2: Quantum Wave Mechanics',
      category: 'assignment' as const,
      deadline: new Date(now + 6 * dayMs).toISOString(),
      depends_on: [],
      action_class: 'AUTO' as const,
      note: 'Data collection completed in laboratory session',
    },
    {
      id: 'task-lib-clrs',
      title: 'Library Return: Introduction to Algorithms (4th Edition)',
      category: 'library' as const,
      deadline: new Date(now + 1 * dayMs).toISOString(),
      depends_on: [],
      action_class: 'AUTO' as const,
      note: 'Checked out from Main Engineering Library',
    },
    {
      id: 'task-bio-quiz',
      title: 'Biology 110 Pre-Lab Safety Quiz',
      category: 'assignment' as const,
      deadline: new Date(now - 2 * dayMs).toISOString(),
      depends_on: [],
      action_class: 'AUTO' as const,
      note: 'Completed during orientation week',
    },
  ];

  // Insert tasks
  for (const t of demoTasks) {
    createTask(t, db);
  }

  // Mark the biology quiz as done
  updateTask(
    {
      id: 'task-bio-quiz',
      status: 'done',
      note: 'Scored 100% on safety guidelines quiz',
    },
    db
  );

  refreshAllTaskStatuses(db);

  console.log(`Successfully seeded ${demoTasks.length} realistic tasks!`);
}

// Execute if run directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDemoData();
}
