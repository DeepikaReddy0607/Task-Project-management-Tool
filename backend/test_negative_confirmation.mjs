import { processMessage, getUserAccessibleProjects } from './src/services/quackieService.js';
import prisma from './src/config/prisma.js';

async function run() {
  const userId = '0917e838-492a-4c1f-a75d-b295fc6869c5';
  const projects = await getUserAccessibleProjects(userId);
  const targetProject = projects.find(p => p.manager_id === userId) || projects[0];

  console.log('=== TEST 1: User says "No" to task creation proposal ===');
  const input1 = "Create API Testing due October 5 with low priority";
  const res1 = await processMessage({
    message: input1,
    context: { page: 'project', projectId: targetProject.id },
    userId
  });

  console.log('Step 1 Quackie:', res1.reply);
  if (!res1.reply.includes("Create 'API Testing' with Low priority, due October 5, 2026?")) {
    throw new Error(`Step 1 failed: unexpected reply: ${res1.reply}`);
  }

  const res2 = await processMessage({
    message: "No",
    context: res1.context,
    conversationHistory: [
      { role: 'user', content: input1 },
      { role: 'assistant', content: res1.reply, suggestedAction: res1.suggestedAction, context: res1.context }
    ],
    userId
  });

  console.log('Step 2 Quackie (Negative response):', res2.reply);
  const expectedNegative = "🦆 Okay, I won't create 'API Testing'.";
  if (res2.reply !== expectedNegative) {
    throw new Error(`Step 2 failed: expected "${expectedNegative}", got "${res2.reply}"`);
  }
  if (res2.suggestedAction !== null) {
    throw new Error(`Step 2 failed: suggestedAction should be null, got ${JSON.stringify(res2.suggestedAction)}`);
  }
  if (res2.context?.pendingProposal !== null || res2.context?.pendingTaskDraft !== null) {
    throw new Error(`Step 2 failed: pendingProposal/pendingTaskDraft should be null`);
  }

  // Verify task does not exist in DB
  const dbTask1 = await prisma.tasks.findFirst({
    where: { title: 'API Testing', project_id: targetProject.id }
  });
  if (dbTask1) {
    await prisma.tasks.delete({ where: { id: dbTask1.id } });
    throw new Error(`Step 2 failed: task was created in DB!`);
  }
  console.log('Task confirmed NOT created in database.');
  console.log('TEST 1 PASSED!\n');

  console.log('=== TEST 2: Variations of negative confirmation ===');
  const variations = [
    "No, cancel it",
    "Don't create it",
    "Never mind",
    "nope",
    "cancel",
    "cancel it",
    "do not create it",
    "forget it"
  ];

  for (const variant of variations) {
    const resVariant = await processMessage({
      message: variant,
      context: res1.context,
      conversationHistory: [
        { role: 'user', content: input1 },
        { role: 'assistant', content: res1.reply, suggestedAction: res1.suggestedAction, context: res1.context }
      ],
      userId
    });
    console.log(`Variation "${variant}" -> Quackie: "${resVariant.reply}"`);
    if (resVariant.reply !== expectedNegative) {
      throw new Error(`Variation "${variant}" failed: got "${resVariant.reply}"`);
    }
    if (resVariant.suggestedAction !== null) {
      throw new Error(`Variation "${variant}" failed: suggestedAction not null`);
    }
  }
  console.log('TEST 2 PASSED!\n');

  console.log('=== TEST 3: Negative confirmation when missing project was asked ===');
  const resMissingProj = await processMessage({
    message: "Create API Testing due October 5 with low priority",
    context: { page: 'tasks' },
    userId
  });
  console.log('Missing project question:', resMissingProj.reply);
  const resCancelDraft = await processMessage({
    message: "cancel it",
    context: resMissingProj.context,
    conversationHistory: [
      { role: 'user', content: "Create API Testing due October 5 with low priority" },
      { role: 'assistant', content: resMissingProj.reply, context: resMissingProj.context }
    ],
    userId
  });
  console.log('Cancel draft response:', resCancelDraft.reply);
  if (resCancelDraft.reply !== expectedNegative) {
    throw new Error(`Draft cancel failed: expected "${expectedNegative}", got "${resCancelDraft.reply}"`);
  }
  console.log('TEST 3 PASSED!\n');

  console.log('=== TEST 4: NEW task request after cancellation behaves as a fresh request ===');
  // History now contains the cancelled turn:
  const historyWithCancel = [
    { role: 'user', content: input1 },
    { role: 'assistant', content: res1.reply, suggestedAction: res1.suggestedAction, context: res1.context },
    { role: 'user', content: "No" },
    { role: 'assistant', content: res2.reply, context: res2.context }
  ];

  // User makes a new task request
  const resNew = await processMessage({
    message: "Create API Testing due October 5 with low priority",
    context: { page: 'project', projectId: targetProject.id, ...res2.context },
    conversationHistory: historyWithCancel,
    userId
  });
  console.log('New request response:', resNew.reply);
  if (!resNew.reply.includes("Create 'API Testing' with Low priority, due October 5, 2026?")) {
    throw new Error(`Fresh request after cancellation failed: ${resNew.reply}`);
  }
  if (!resNew.suggestedAction?.readyForConfirmation) {
    throw new Error(`Fresh request readyForConfirmation is false`);
  }

  // Now confirm with YES
  console.log('\n=== TEST 5: Confirm fresh request with "yes" ===');
  const resConfirm = await processMessage({
    message: "yes",
    context: resNew.context,
    conversationHistory: [
      ...historyWithCancel,
      { role: 'user', content: "Create API Testing due October 5 with low priority" },
      { role: 'assistant', content: resNew.reply, suggestedAction: resNew.suggestedAction, context: resNew.context }
    ],
    userId
  });
  console.log('Yes response:', resConfirm.reply);
  if (!resConfirm.reply.includes("Created task") || !resConfirm.reply.includes("API Testing")) {
    throw new Error(`Confirmation after cancellation failed: ${resConfirm.reply}`);
  }

  // Verify created task exists in DB
  const createdDbTask = await prisma.tasks.findFirst({
    where: { title: 'API Testing', project_id: targetProject.id }
  });
  if (!createdDbTask) {
    throw new Error(`Task should exist in DB after confirmation!`);
  }
  console.log('Task successfully verified in DB:', createdDbTask.id);

  // Clean up DB task
  await prisma.tasks.delete({ where: { id: createdDbTask.id } });
  console.log('Cleaned up created test task.');
  console.log('TEST 5 PASSED!\n');

  console.log('=== TEST 6: Fresh non-task request after cancellation ===');
  const resFreshQuery = await processMessage({
    message: "What is overdue?",
    context: { page: 'project', projectId: targetProject.id, ...res2.context },
    conversationHistory: historyWithCancel,
    userId
  });
  console.log('Fresh query response:\n', resFreshQuery.reply);
  if (resFreshQuery.reply.includes("I don't have enough TaskFlow data")) {
    throw new Error(`Fresh query failed: fell through to generic fallback`);
  }
  console.log('TEST 6 PASSED!\n');

  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('TEST RUNNER ERROR:', err);
  process.exit(1);
});
