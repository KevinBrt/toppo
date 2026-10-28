import { closingChanges, planWorkflow, type WorkflowPlan } from '@toppo-tracker/core';
import { isUniqueViolation, schema, uuidv7 } from '@toppo-tracker/db';
import {
  type IssueActivityPayload,
  type PaletteColor,
  type WorkflowRequest,
  workflowRequestSchema,
} from '@toppo-tracker/shared';
import { and, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { recordActivities } from '../../../platform/activities/record-activity.ts';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { FOLLOWING_THE_INSTANCE } from '../queries/get-workflow.query.ts';

const { issues, statuses, workflowStatuses, workflowTransitions, workflows } = schema;

/** The workflow a save changes, and what it governs. */
export interface WorkflowTarget {
  workflowId: string;
  /** Null for the instance's workflow: the statuses it adds belong to the instance. */
  projectId: string | null;
  /** The issues it governs: they move when their status is taken out. */
  followers: SQL;
}

/** A status as stored before the save. */
interface StoredStatus {
  id: string;
  name: string;
  color: PaletteColor;
  closes: boolean;
  /** Null for the instance's statuses. */
  projectId: string | null;
}

/**
 * Saves the instance's workflow whole: its statuses renamed, recolored, put in another category
 * or order, added or taken out (their issues moving to the status chosen, one activity each), the
 * initial status, which may follow which, and its mode. Every project without a copy follows it.
 */
export const saveWorkflow = defineCommand({
  name: 'workflow.save',
  access: { permission: 'instance.settings.manage' },
  input: workflowRequestSchema,
  async handler({ tx, actor, log }, request): Promise<void> {
    // Locked until the transaction ends: two saves apply one after the other, and issues created
    // or moved meanwhile, which read it with a shared lock, wait for it.
    const [workflow] = await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(isNull(workflows.projectId))
      .for('update');
    if (!workflow) {
      throw new Error('The instance has no workflow');
    }
    const moved = await applyWorkflow(
      tx,
      actor.id,
      { workflowId: workflow.id, projectId: null, followers: FOLLOWING_THE_INSTANCE },
      request,
    );
    log.info({ by: actor.id, moved }, 'Workflow saved');
  },
});

/** Applies a whole workflow to `target`, in the caller's transaction; answers how many issues moved. */
export async function applyWorkflow(
  tx: Transaction,
  actorId: string,
  target: WorkflowTarget,
  request: WorkflowRequest,
): Promise<number> {
  const stored: StoredStatus[] = await tx
    .select({
      id: statuses.id,
      name: statuses.name,
      color: statuses.color,
      closes: statuses.closes,
      projectId: statuses.projectId,
    })
    .from(workflowStatuses)
    .innerJoin(statuses, eq(statuses.id, workflowStatuses.statusId))
    .where(eq(workflowStatuses.workflowId, target.workflowId));
  const plan = planWorkflow(
    stored.map(({ id }) => id),
    request,
  );
  if (!plan) {
    throw new HttpError(409, 'WORKFLOW_CHANGED', 'The workflow changed meanwhile');
  }
  const changed = changedStatuses(stored, plan);
  // A project's copy shares the instance's statuses: their name, color and category are the
  // instance's, edited in the settings.
  if (target.projectId && changed.some(({ id }) => isShared(stored, id))) {
    throw new HttpError(409, 'STATUS_SHARED', 'A status of the instance is edited in the settings');
  }

  const ids = await saveStatuses(tx, target.projectId, changed, plan);
  await followCategories(tx, stored, plan);
  const moved = await moveIssues(tx, actorId, target.followers, stored, plan, ids);
  await removeSteps(
    tx,
    target.workflowId,
    plan.removed.map(({ statusId }) => statusId),
  );
  await placeSteps(tx, target.workflowId, plan, ids);
  await tx.delete(workflowTransitions).where(eq(workflowTransitions.workflowId, target.workflowId));
  if (request.transitions.length > 0) {
    await tx.insert(workflowTransitions).values(
      request.transitions.map(({ from, to }) => ({
        workflowId: target.workflowId,
        fromStatusId: idOf(ids, from),
        toStatusId: idOf(ids, to),
      })),
    );
  }
  await tx.update(workflows).set({ mode: request.mode }).where(eq(workflows.id, target.workflowId));
  return moved;
}

/** The id of a status the request names: one it keeps, or one it added. */
function idOf(ids: ReadonlyMap<string, string>, ref: string): string {
  const id = ids.get(ref);
  if (!id) {
    throw new Error(`The request names no status ${ref}`);
  }
  return id;
}

/** The kept statuses whose name, color or closing the save changes. */
function changedStatuses(
  stored: readonly StoredStatus[],
  { kept }: WorkflowPlan,
): WorkflowPlan['kept'] {
  return kept.filter((status) => {
    const was = stored.find(({ id }) => id === status.id);
    return was?.name !== status.name || was.color !== status.color || was.closes !== status.closes;
  });
}

const isShared = (stored: readonly StoredStatus[], id: string) =>
  stored.find((status) => status.id === id)?.projectId === null;

/** Renames, recolors and changes the closing of the statuses that change, adds the new ones; answers every id. */
async function saveStatuses(
  tx: Transaction,
  projectId: string | null,
  changed: WorkflowPlan['kept'],
  { kept, added }: WorkflowPlan,
): Promise<Map<string, string>> {
  const ids = new Map(kept.map(({ id }) => [id, id]));
  try {
    // Names are unique, checked row by row: the statuses that change first give theirs up, so
    // that two of them can swap names, then take their new ones.
    await tx
      .update(statuses)
      .set({ name: sql`${statuses.id}::text` })
      .where(
        inArray(
          statuses.id,
          changed.map(({ id }) => id),
        ),
      );
    for (const { id, name, color, closes } of changed) {
      await tx.update(statuses).set({ name, color, closes }).where(eq(statuses.id, id));
    }
    for (const { ref, name, color, closes } of added) {
      const id = uuidv7();
      await tx.insert(statuses).values({ id, name, color, closes, projectId });
      ids.set(ref, id);
    }
  } catch (error) {
    // Another status of the same scope, out of this workflow, may have the name.
    if (isUniqueViolation(error, 'statuses_name_unique')) {
      throw new HttpError(409, 'STATUS_NAME_TAKEN', 'Another status has this name');
    }
    throw error;
  }
  return ids;
}

/**
 * Issues are closed while their status is a done one: those on a status that starts closing them
 * close now, those on one that stops reopen. A status's category is the same wherever it is used,
 * so all its issues follow.
 */
async function followCategories(
  tx: Transaction,
  stored: readonly StoredStatus[],
  { kept }: WorkflowPlan,
): Promise<void> {
  const { closing, reopening } = closingChanges(stored, kept);
  if (closing.length > 0) {
    await tx
      .update(issues)
      .set({ closedAt: sql`now()` })
      .where(and(inArray(issues.statusId, closing), isNull(issues.closedAt)));
  }
  if (reopening.length > 0) {
    await tx.update(issues).set({ closedAt: null }).where(inArray(issues.statusId, reopening));
  }
}

/** Moves the issues of each status taken out to the one chosen, one activity per issue. */
async function moveIssues(
  tx: Transaction,
  actorId: string,
  followers: SQL,
  stored: readonly StoredStatus[],
  { kept, added, removed }: WorkflowPlan,
  ids: ReadonlyMap<string, string>,
): Promise<number> {
  let moved = 0;
  for (const { statusId, moveTo } of removed) {
    const from = stored.find(({ id }) => id === statusId);
    const to = [...kept, ...added].find((status) =>
      'id' in status ? status.id === moveTo : status.ref === moveTo,
    );
    if (!(from && to)) {
      throw new Error(`No status to move the issues of ${statusId} to`);
    }
    moved += await moveIssuesTo(tx, actorId, followers, from, { ...to, id: idOf(ids, moveTo) });
  }
  return moved;
}

/**
 * Moves the issues `followers` selects from one status to another, closed or open as the new one
 * says, one activity per issue; answers how many moved.
 */
export async function moveIssuesTo(
  tx: Transaction,
  actorId: string,
  followers: SQL,
  from: { id: string; name: string },
  to: { id: string; name: string; closes: boolean },
): Promise<number> {
  const rows = await tx
    .update(issues)
    .set({
      statusId: to.id,
      closedAt: to.closes ? sql`coalesce(${issues.closedAt}, now())` : null,
    })
    .where(and(eq(issues.statusId, from.id), followers))
    .returning({ id: issues.id, projectId: issues.projectId });
  const payload: IssueActivityPayload<'issue.statusChanged'> = {
    from: { id: from.id, name: from.name },
    to: { id: to.id, name: to.name },
  };
  // An administrator reorganizing a workflow: recorded on each issue, told to nobody.
  await recordActivities(
    tx,
    rows.map((row) => ({
      projectId: row.projectId,
      issueId: row.id,
      actorId,
      type: 'issue.statusChanged',
      payload,
    })),
    { notify: false },
  );
  return rows.length;
}

/**
 * Takes statuses out of the workflow, their transitions with them. A status no workflow uses any
 * more and no issue has is deleted; one a project's copy still uses stays.
 */
async function removeSteps(
  tx: Transaction,
  workflowId: string,
  statusIds: string[],
): Promise<void> {
  if (statusIds.length === 0) {
    return;
  }
  await tx
    .delete(workflowStatuses)
    .where(
      and(
        eq(workflowStatuses.workflowId, workflowId),
        inArray(workflowStatuses.statusId, statusIds),
      ),
    );
  await tx
    .delete(statuses)
    .where(
      and(
        inArray(statuses.id, statusIds),
        sql`not exists (select 1 from ${workflowStatuses} where ${workflowStatuses.statusId} = ${statuses.id})`,
        sql`not exists (select 1 from ${issues} where ${issues.statusId} = ${statuses.id})`,
      ),
    );
}

/** Puts every status of the workflow in its place, the initial one marked. */
async function placeSteps(
  tx: Transaction,
  workflowId: string,
  { kept, added }: WorkflowPlan,
  ids: ReadonlyMap<string, string>,
): Promise<void> {
  // One initial status per workflow, checked row by row: none first, then the new one.
  await tx
    .update(workflowStatuses)
    .set({ isInitial: false })
    .where(eq(workflowStatuses.workflowId, workflowId));
  for (const { id, position, isInitial } of kept) {
    await tx
      .update(workflowStatuses)
      .set({ position, isInitial })
      .where(and(eq(workflowStatuses.workflowId, workflowId), eq(workflowStatuses.statusId, id)));
  }
  if (added.length > 0) {
    await tx.insert(workflowStatuses).values(
      added.map(({ ref, position, isInitial }) => ({
        workflowId,
        statusId: idOf(ids, ref),
        position,
        isInitial,
      })),
    );
  }
}
