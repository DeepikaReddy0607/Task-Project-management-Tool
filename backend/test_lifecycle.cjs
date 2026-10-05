const taskSvc = require('./src/services/taskService.js');
const quackieSvc = require('./src/services/quackieService.js');
const prisma = require('./src/config/prisma.js').default;

async function run() {
  const userId = '0917e838-492a-4c1f-a75d-b295fc6869c5';
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const isOverdue = (task) =>
    task.status !== 'Completed' &&
    !task.is_archived &&
    task.due_date &&
    (task.due_date.toISOString ? task.due_date.toISOString().slice(0, 10) : String(task.due_date).slice(0, 10)) < todayStr();

  console.log('==================================================');
  console.log('TEST 1: Tasks page shows 2 overdue -> Quackie must say 2');
  console.log('==================================================');
  let tasks = await taskSvc.getMyTasks(userId);
  let tasksOverdue = tasks.filter(isOverdue).length;
  let qCtx = await quackieSvc.getProactiveContext({ page: 'tasks', userId });
  console.log('Tasks page overdue count:', tasksOverdue);
  console.log('Quackie badgeCount:', qCtx.badgeCount);
  console.log('Quackie observation:', qCtx.observation);
  const test1Pass = tasksOverdue === 2 && qCtx.badgeCount === 2 && qCtx.observation.includes('2 overdue');
  console.log('RESULT:', test1Pass ? 'PASSED' : 'FAILED');

  console.log('\n==================================================');
  console.log('TEST 2: Complete one overdue task -> both become 1');
  console.log('==================================================');
  const task1Id = '71b4c93c-1e9c-44f9-993e-62cd8f164ce6';
  await taskSvc.updateTaskStatus(task1Id, userId, 'Completed');
  tasks = await taskSvc.getMyTasks(userId);
  tasksOverdue = tasks.filter(isOverdue).length;
  qCtx = await quackieSvc.getProactiveContext({ page: 'tasks', userId });
  console.log('Tasks page overdue count:', tasksOverdue);
  console.log('Quackie badgeCount:', qCtx.badgeCount);
  console.log('Quackie observation:', qCtx.observation);
  const test2Pass = tasksOverdue === 1 && qCtx.badgeCount === 1 && qCtx.observation.includes('1 overdue');
  console.log('RESULT:', test2Pass ? 'PASSED' : 'FAILED');

  console.log('\n==================================================');
  console.log('TEST 3: Complete the second -> both become 0');
  console.log('==================================================');
  const task2Id = 'e55d769e-104c-48d3-afda-5107ce0bcb65';
  await taskSvc.updateTaskStatus(task2Id, userId, 'Completed');
  tasks = await taskSvc.getMyTasks(userId);
  tasksOverdue = tasks.filter(isOverdue).length;
  qCtx = await quackieSvc.getProactiveContext({ page: 'tasks', userId });
  console.log('Tasks page overdue count:', tasksOverdue);
  console.log('Quackie badgeCount:', qCtx.badgeCount);
  console.log('Quackie observation:', qCtx.observation);
  const test3Pass = tasksOverdue === 0 && qCtx.badgeCount === 0;
  console.log('RESULT:', test3Pass ? 'PASSED' : 'FAILED');

  console.log('\n==================================================');
  console.log('TEST 4: Create a new overdue task -> both become 1');
  console.log('==================================================');
  const accessibleProjects = await quackieSvc.getUserAccessibleProjects(userId);
  const projectId = accessibleProjects[0].id;
  const newTask = await taskSvc.createTask(
    projectId,
    userId,
    'Urgent Overdue Audit Task',
    'Created for test',
    'High',
    'To Do',
    null,
    '2026-09-28',
    2,
    userId
  );
  tasks = await taskSvc.getMyTasks(userId);
  tasksOverdue = tasks.filter(isOverdue).length;
  qCtx = await quackieSvc.getProactiveContext({ page: 'tasks', userId });
  console.log('Tasks page overdue count:', tasksOverdue);
  console.log('Quackie badgeCount:', qCtx.badgeCount);
  console.log('Quackie observation:', qCtx.observation);
  const test4Pass = tasksOverdue === 1 && qCtx.badgeCount === 1 && qCtx.observation.includes('1 overdue');
  console.log('RESULT:', test4Pass ? 'PASSED' : 'FAILED');

  console.log('\n==================================================');
  console.log('TEST 5: Navigate to Project -> project-specific actions appear');
  console.log('==================================================');
  const projectCtx = await quackieSvc.getProactiveContext({ page: 'project', projectId, userId });
  console.log('Project quick actions:', projectCtx.quickActions);
  const expectedProjectActions = [
    'Summarize this project',
    "What's delaying this project?",
    'What are the biggest risks?',
    'What should we focus on?'
  ];
  const test5Pass = expectedProjectActions.every((a) => projectCtx.quickActions.includes(a));
  console.log('RESULT:', test5Pass ? 'PASSED' : 'FAILED');

  console.log('\n==================================================');
  console.log('TEST 6: Navigate back to My Tasks -> project-specific actions disappear');
  console.log('==================================================');
  const tasksCtx = await quackieSvc.getProactiveContext({ page: 'tasks', userId });
  console.log('My Tasks quick actions:', tasksCtx.quickActions);
  const expectedTaskActions = [
    'What should I work on next?',
    'Show my overdue work',
    'What should I focus on today?',
    'Can I finish everything due this week?'
  ];
  const hasTaskActions = expectedTaskActions.every((a) => tasksCtx.quickActions.includes(a));
  const noSummarizeProject = !tasksCtx.quickActions.includes('Summarize this project');
  const test6Pass = hasTaskActions && noSummarizeProject;
  console.log('RESULT:', test6Pass ? 'PASSED' : 'FAILED');

  // CLEANUP: restore task1, task2 and delete newTask
  await taskSvc.updateTaskStatus(task1Id, userId, 'To Do');
  await taskSvc.updateTaskStatus(task2Id, userId, 'In Progress');
  await prisma.tasks.delete({ where: { id: newTask.id } });
  console.log('\n==================================================');
  console.log('CLEANUP: Database restored to original state (2 overdue).');
  console.log('==================================================');

  const allPassed = test1Pass && test2Pass && test3Pass && test4Pass && test5Pass && test6Pass;
  console.log(`\nOVERALL TEST SUITE: ${allPassed ? 'ALL 6 TESTS PASSED!' : 'SOME TESTS FAILED.'}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
