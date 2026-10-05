import {
  calculateFocusScore,
  getFocusDailyMission,
  processMessage,
  getStartOfToday
} from './src/services/quackieService.js';
import prisma from './src/config/prisma.js';

async function runTests() {
  console.log('=== STARTING QUACKIE FOCUS MODE VERIFICATION ===\n');

  const userA = '0917e838-492a-4c1f-a75d-b295fc6869c5';
  const userB = 'a79f01c6-b70f-4c46-8e76-ba4a3f4a6c09';
  const projectId = '5d453cd8-4936-441e-b91b-ce11579fa90e'; // p1

  const startOfToday = getStartOfToday();
  const createdTestTaskIds = [];

  try {
    // 0. Test calculateFocusScore unit logic
    console.log('--- UNIT TEST: calculateFocusScore ---');
    const mockOverdueHigh = {
      title: 'Fix Critical Bug',
      priority: 'High',
      status: 'In Progress',
      due_date: new Date(startOfToday.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days overdue
      estimated_hours: 2,
      is_archived: false
    };
    const score1 = calculateFocusScore(mockOverdueHigh, { startOfToday });
    console.log('Score overdue high:', score1.score, score1.reasons);
    if (score1.score < 80 || !score1.reasons.some(r => r.includes('3 days overdue'))) {
      throw new Error('calculateFocusScore failed for overdue high task');
    }

    const mockCompleted = {
      title: 'Done item',
      priority: 'High',
      status: 'Completed',
      is_archived: false
    };
    const scoreCompleted = calculateFocusScore(mockCompleted, { startOfToday });
    if (scoreCompleted.score !== 0) {
      throw new Error('calculateFocusScore should return 0 for completed tasks');
    }
    console.log('calculateFocusScore unit test passed!\n');

    // Clean up any old test tasks with specific titles
    await prisma.tasks.deleteMany({
      where: {
        title: {
          in: [
            'FOCUS_TEST_HIGH_TODAY',
            'FOCUS_TEST_LOW_NEXTWEEK',
            'FOCUS_TEST_OVERDUE_HIGH',
            'FOCUS_TEST_USER_B_TASK'
          ]
        }
      }
    });

    // TEST 1: Create High priority task, Due today, 2 hours
    console.log('--- TEST 1: High priority task, Due today, 2h ---');
    const taskHighToday = await prisma.tasks.create({
      data: {
        project_id: projectId,
        assigned_to: userA,
        created_by: userA,
        title: 'FOCUS_TEST_HIGH_TODAY',
        priority: 'High',
        status: 'To Do',
        due_date: startOfToday,
        estimated_hours: 2
      }
    });
    createdTestTaskIds.push(taskHighToday.id);

    const mission1 = await getFocusDailyMission({ userId: userA, projectId });
    console.log('Mission 1 Top Task:', mission1.topTask?.title);
    if (!mission1.tasks.some(t => t.id === taskHighToday.id)) {
      throw new Error('TEST 1 FAILED: High priority task due today not in top tasks');
    }
    console.log('TEST 1 PASSED!\n');

    // TEST 2: Create Low priority task, Due in 7 days
    console.log('--- TEST 2: Low priority task, Due in 7 days ---');
    const taskLowNextWeek = await prisma.tasks.create({
      data: {
        project_id: projectId,
        assigned_to: userA,
        created_by: userA,
        title: 'FOCUS_TEST_LOW_NEXTWEEK',
        priority: 'Low',
        status: 'To Do',
        due_date: new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000),
        estimated_hours: 1
      }
    });
    createdTestTaskIds.push(taskLowNextWeek.id);

    const mission2 = await getFocusDailyMission({ userId: userA, projectId });
    const idxHigh = mission2.tasks.findIndex(t => t.id === taskHighToday.id);
    const idxLow = mission2.tasks.findIndex(t => t.id === taskLowNextWeek.id);
    console.log(`Task High Today rank: ${idxHigh}, Task Low Next Week rank: ${idxLow}`);
    if (idxHigh >= idxLow && idxLow !== -1) {
      throw new Error('TEST 2 FAILED: Low priority task due in 7 days ranked above High priority task due today');
    }
    console.log('TEST 2 PASSED!\n');

    // TEST 3: Create overdue High priority task
    console.log('--- TEST 3: Create overdue High priority task ---');
    const taskOverdueHigh = await prisma.tasks.create({
      data: {
        project_id: projectId,
        assigned_to: userA,
        created_by: userA,
        title: 'FOCUS_TEST_OVERDUE_HIGH',
        priority: 'High',
        status: 'In Progress',
        due_date: new Date(startOfToday.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days overdue
        estimated_hours: 2
      }
    });
    createdTestTaskIds.push(taskOverdueHigh.id);

    const mission3 = await getFocusDailyMission({ userId: userA, projectId });
    console.log('Mission 3 Top Task:', mission3.topTask?.title);
    if (mission3.topTask?.id !== taskOverdueHigh.id) {
      throw new Error(`TEST 3 FAILED: Overdue High task did not rank #1 (got ${mission3.topTask?.title})`);
    }
    console.log('TEST 3 PASSED!\n');

    // TEST 4: Complete the highest-ranked task
    console.log('--- TEST 4: Complete the highest-ranked task ---');
    await prisma.tasks.update({
      where: { id: taskOverdueHigh.id },
      data: { status: 'Completed' }
    });

    const mission4 = await getFocusDailyMission({ userId: userA, projectId });
    console.log('Mission 4 Top Task after completion:', mission4.topTask?.title);
    if (mission4.topTask?.id === taskOverdueHigh.id) {
      throw new Error('TEST 4 FAILED: Completed task still recommended as top task');
    }
    if (mission4.topTask?.id !== taskHighToday.id) {
      throw new Error(`TEST 4 FAILED: Expected taskHighToday as new top task, got ${mission4.topTask?.title}`);
    }
    console.log('TEST 4 PASSED!\n');

    // TEST 5: Archive a recommended task
    console.log('--- TEST 5: Archive a recommended task ---');
    await prisma.tasks.update({
      where: { id: taskHighToday.id },
      data: { is_archived: true }
    });

    const mission5 = await getFocusDailyMission({ userId: userA, projectId });
    console.log('Mission 5 tasks after archiving taskHighToday:');
    mission5.tasks.forEach(t => console.log(` - ${t.title}`));
    if (mission5.tasks.some(t => t.id === taskHighToday.id)) {
      throw new Error('TEST 5 FAILED: Archived task still appears in Daily Mission');
    }
    console.log('TEST 5 PASSED!\n');

    // Un-archive taskHighToday for tests 6 and 7
    await prisma.tasks.update({
      where: { id: taskHighToday.id },
      data: { is_archived: false }
    });

    // TEST 6: Change taskHighToday from High -> Low
    console.log('--- TEST 6: Change recommended task from High -> Low ---');
    const scoreBefore = calculateFocusScore(taskHighToday, { startOfToday });
    await prisma.tasks.update({
      where: { id: taskHighToday.id },
      data: { priority: 'Low' }
    });
    const updatedTaskLow = await prisma.tasks.findUnique({ where: { id: taskHighToday.id } });
    const scoreAfter = calculateFocusScore(updatedTaskLow, { startOfToday });
    console.log(`Score before: ${scoreBefore.score}, Score after: ${scoreAfter.score}`);
    if (scoreAfter.score >= scoreBefore.score) {
      throw new Error('TEST 6 FAILED: Score did not decrease after dropping priority to Low');
    }
    console.log('TEST 6 PASSED!\n');

    // TEST 7: Change due date from next week -> today
    console.log('--- TEST 7: Change due date from next week -> today ---');
    const scoreLowBefore = calculateFocusScore(taskLowNextWeek, { startOfToday });
    await prisma.tasks.update({
      where: { id: taskLowNextWeek.id },
      data: { due_date: startOfToday }
    });
    const updatedTaskToday = await prisma.tasks.findUnique({ where: { id: taskLowNextWeek.id } });
    const scoreLowAfter = calculateFocusScore(updatedTaskToday, { startOfToday });
    console.log(`TaskLow score before (due next week): ${scoreLowBefore.score}, after (due today): ${scoreLowAfter.score}`);
    if (scoreLowAfter.score <= scoreLowBefore.score) {
      throw new Error('TEST 7 FAILED: Score did not increase after moving due date to today');
    }
    console.log('TEST 7 PASSED!\n');

    // TEST 8: Two authenticated users: User A vs User B
    console.log('--- TEST 8: Two authenticated users isolation ---');
    const taskUserB = await prisma.tasks.create({
      data: {
        project_id: projectId,
        assigned_to: userB,
        created_by: userB,
        title: 'FOCUS_TEST_USER_B_TASK',
        priority: 'High',
        status: 'To Do',
        due_date: startOfToday
      }
    });
    createdTestTaskIds.push(taskUserB.id);

    // My Tasks for User A:
    const missionUserA = await getFocusDailyMission({ userId: userA, page: 'tasks' });
    const missionUserB = await getFocusDailyMission({ userId: userB, page: 'tasks' });

    console.log('User A tasks in mission:');
    missionUserA.tasks.forEach(t => console.log(` [A] ${t.title} (assigned: ${t.assigned_to})`));
    console.log('User B tasks in mission:');
    missionUserB.tasks.forEach(t => console.log(` [B] ${t.title} (assigned: ${t.assigned_to})`));

    if (missionUserA.tasks.some(t => t.assigned_to !== userA)) {
      throw new Error('TEST 8 FAILED: User A mission contains tasks not assigned to User A');
    }
    if (missionUserB.tasks.some(t => t.assigned_to !== userB)) {
      throw new Error('TEST 8 FAILED: User B mission contains tasks not assigned to User B');
    }
    console.log('TEST 8 PASSED!\n');

    // TEST 9 & 10: "What should I focus on today?" via processMessage
    console.log('--- TEST 9 & 10: "What should I focus on today?" Intent & Live Output ---');
    const chatRes = await processMessage({
      message: "What should I focus on today?",
      context: { page: 'tasks' },
      userId: userA
    });

    console.log('Quackie Reply:\n', chatRes.reply);
    console.log('Emotion:', chatRes.emotion);

    if (!chatRes.reply.includes("Today's Mission") && !chatRes.reply.includes("You're all caught up")) {
      throw new Error(`TEST 10 FAILED: Reply does not contain Today's Mission or caught up state: ${chatRes.reply}`);
    }
    if (chatRes.reply.includes("I don't have enough TaskFlow data")) {
      throw new Error('TEST 10 FAILED: Request fell through to generic fallback');
    }
    console.log('TEST 9 & 10 PASSED!\n');

    console.log('ALL 10 FOCUS MODE TESTS PASSED SUCCESSFULLY!');

  } finally {
    // Clean up created test tasks
    console.log('\n--- CLEANING UP TEST TASKS ---');
    if (createdTestTaskIds.length > 0) {
      await prisma.tasks.deleteMany({
        where: { id: { in: createdTestTaskIds } }
      });
      console.log(`Deleted ${createdTestTaskIds.length} test tasks.`);
    }
  }
}

runTests().catch((err) => {
  console.error('TEST SUITE ERROR:', err);
  process.exit(1);
});
