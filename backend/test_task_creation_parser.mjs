import { processMessage, parseTaskCreationProposal, getUserAccessibleProjects } from './src/services/quackieService.js';
import prisma from './src/config/prisma.js';

async function run() {
  const userId = '0917e838-492a-4c1f-a75d-b295fc6869c5';
  const projects = await getUserAccessibleProjects(userId);
  const targetProject = projects.find(p => p.manager_id === userId) || projects[0];

  console.log('=== TEST 1: User input without project, context has no project ===');
  const input1 = "create a api testing due 03-10-2026 with low priority";
  const res1 = await processMessage({
    message: input1,
    context: { page: 'tasks' },
    userId
  });
  console.log('Reply:\n', res1.reply);
  console.log('Emotion:', res1.emotion);
  console.log('Pending Draft Context:', res1.context?.pendingTaskDraft);
  const pass1 = res1.reply.includes("Which project should I add 'API Testing' to?") &&
                res1.context?.pendingTaskDraft?.title === 'API Testing' &&
                res1.context?.pendingTaskDraft?.priority === 'Low' &&
                res1.context?.pendingTaskDraft?.dueDate === '2026-10-03';
  console.log('TEST 1 PASS?', pass1);

  console.log('\n=== TEST 2: Multi-turn: User replies with project name ===');
  const res2 = await processMessage({
    message: targetProject.title,
    context: res1.context,
    conversationHistory: [
      { role: 'user', content: input1 },
      { role: 'assistant', content: res1.reply, context: res1.context }
    ],
    userId
  });
  console.log('Reply:\n', res2.reply);
  console.log('Ready for confirmation:', res2.suggestedAction?.readyForConfirmation);
  console.log('Extracted Task Data:', res2.suggestedAction?.taskData);
  const pass2 = res2.suggestedAction?.readyForConfirmation === true &&
                res2.suggestedAction?.taskData?.title === 'API Testing' &&
                res2.suggestedAction?.taskData?.priority === 'Low' &&
                res2.suggestedAction?.taskData?.dueDate === '2026-10-03' &&
                res2.reply.includes("Create 'API Testing' with Low priority, due October 3, 2026");
  console.log('TEST 2 PASS?', pass2);

  console.log('\n=== TEST 3: User input in active project context ===');
  const res3 = await processMessage({
    message: input1,
    context: { page: 'project', projectId: targetProject.id },
    userId
  });
  console.log('Reply:\n', res3.reply);
  console.log('Ready for confirmation:', res3.suggestedAction?.readyForConfirmation);
  console.log('Extracted Task Data:', res3.suggestedAction?.taskData);
  const pass3 = res3.suggestedAction?.readyForConfirmation === true &&
                res3.suggestedAction?.taskData?.title === 'API Testing' &&
                res3.suggestedAction?.taskData?.priority === 'Low' &&
                res3.suggestedAction?.taskData?.dueDate === '2026-10-03' &&
                res3.reply.includes("Create 'API Testing' with Low priority, due October 3, 2026");
  console.log('TEST 3 PASS?', pass3);

  console.log('\n=== TEST 4: Variation: "Create a task called API Testing due October 3 2026 with low priority" ===');
  const res4 = await processMessage({
    message: "Create a task called API Testing due October 3 2026 with low priority",
    context: { page: 'project', projectId: targetProject.id },
    userId
  });
  console.log('Reply:\n', res4.reply);
  const pass4 = res4.suggestedAction?.taskData?.title === 'API Testing' &&
                res4.suggestedAction?.taskData?.dueDate === '2026-10-03' &&
                res4.suggestedAction?.taskData?.priority === 'Low';
  console.log('TEST 4 PASS?', pass4);

  console.log('\n=== TEST 5: Variation: "Create API Testing, low priority, due Friday" ===');
  const res5 = await processMessage({
    message: "Create API Testing, low priority, due Friday",
    context: { page: 'project', projectId: targetProject.id },
    userId
  });
  console.log('Reply:\n', res5.reply);
  console.log('Extracted Task Data:', res5.suggestedAction?.taskData);
  const pass5 = res5.suggestedAction?.taskData?.title === 'API Testing' &&
                res5.suggestedAction?.taskData?.priority === 'Low' &&
                Boolean(res5.suggestedAction?.taskData?.dueDate);
  console.log('TEST 5 PASS?', pass5);

  console.log('\n=== TEST 6: Variation: "Create a low priority task called API Testing due 03/10/2026" ===');
  const res6 = await processMessage({
    message: "Create a low priority task called API Testing due 03/10/2026",
    context: { page: 'project', projectId: targetProject.id },
    userId
  });
  console.log('Reply:\n', res6.reply);
  const pass6 = res6.suggestedAction?.taskData?.title === 'API Testing' &&
                res6.suggestedAction?.taskData?.dueDate === '2026-10-03' &&
                res6.suggestedAction?.taskData?.priority === 'Low';
  console.log('TEST 6 PASS?', pass6);

  console.log('\n=== TEST 7: Confirm creation via text: "yes" ===');
  const res7 = await processMessage({
    message: "yes",
    context: res3.context,
    conversationHistory: [
      { role: 'user', content: input1 },
      { role: 'assistant', content: res3.reply, suggestedAction: res3.suggestedAction }
    ],
    userId
  });
  const pass7 = res7.reply.includes("Created task") && res7.reply.includes("API Testing");
  console.log('TEST 7 PASS?', pass7);

  // Clean up created task
  const createdTask = await prisma.tasks.findFirst({
    where: { title: 'API Testing', project_id: targetProject.id }
  });
  if (createdTask) {
    await prisma.tasks.delete({ where: { id: createdTask.id } });
    console.log('Cleaned up test task:', createdTask.id);
  }

  const allPassed = pass1 && pass2 && pass3 && pass4 && pass5 && pass6 && pass7;
  console.log('\nOVERALL RESULT:', allPassed ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED.');
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
