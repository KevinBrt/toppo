import { planOptions } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import {
  hasOptions,
  type PropertyOptionDraft,
  projectPropertyParamsSchema,
  propertyAdaptationRequestSchema,
} from '@toppo-tracker/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { defineCommand, type Transaction } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { optionsOf, saveOptions } from '../../utils/property-saving.util.ts';
import {
  lockedProperty,
  moveValues,
  type PropertyRef,
  takeOptionsOff,
} from '../../utils/property-values.util.ts';

const { projectProperties, propertyOptions } = schema;

/**
 * How a project adapts a property of the instance: hidden there (its values stay, shown again
 * once it is not), and options of its own or the instance's. Its own options start from copies
 * of the instance's, its issues moved onto them, then change freely; taking the instance's again
 * takes its own off its issues, each told in its history.
 */
export const adaptProjectProperty = defineCommand({
  name: 'property.adaptInProject',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectPropertyParamsSchema.extend(propertyAdaptationRequestSchema.shape),
  async handler({ tx, actor, project, log }, { propertyId, hidden, options }): Promise<void> {
    const property = await lockedProperty(tx, propertyId, null);
    if (!property) {
      throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'This property does not exist');
    }
    if (options !== null && !hasOptions(property.type)) {
      throw new HttpError(400, 'PROPERTY_WITHOUT_OPTIONS', 'This property has no options');
    }
    const [adaptation] = await tx
      .select({ ownOptions: projectProperties.ownOptions })
      .from(projectProperties)
      .where(
        and(
          eq(projectProperties.projectId, project.id),
          eq(projectProperties.propertyId, propertyId),
        ),
      )
      .for('update');
    let takenOff = 0;
    if (options === null) {
      takenOff = await dropOwnOptions(tx, actor.id, property, project.id);
    } else if (adaptation?.ownOptions) {
      takenOff = await saveOptions(
        tx,
        actor.id,
        property,
        project.id,
        options.options,
        options.removed,
      );
    } else {
      takenOff = await copyOptions(tx, actor.id, property, project.id, options);
    }
    const ownOptions = options !== null;
    await tx
      .insert(projectProperties)
      .values({ projectId: project.id, propertyId, hidden, ownOptions })
      .onConflictDoUpdate({
        target: [projectProperties.projectId, projectProperties.propertyId],
        set: { hidden, ownOptions },
      });
    log.info(
      { propertyId, projectId: project.id, hidden, ownOptions, takenOff, by: actor.id },
      'Project property adapted',
    );
  },
});

/** Takes the project's own options off its issues, then deletes them. */
async function dropOwnOptions(
  tx: Transaction,
  actorId: string,
  property: PropertyRef,
  projectId: string,
): Promise<number> {
  const own = await tx
    .select({ id: propertyOptions.id, name: propertyOptions.name })
    .from(propertyOptions)
    .where(and(eq(propertyOptions.propertyId, property.id), optionsOf(projectId)))
    .for('update');
  const takenOff = await takeOptionsOff(tx, actorId, property, own, { projectId });
  if (own.length > 0) {
    await tx.delete(propertyOptions).where(
      inArray(
        propertyOptions.id,
        own.map(({ id }) => id),
      ),
    );
  }
  return takenOff;
}

/**
 * Gives the project its own options, from the instance's the list keeps (by their ids) and new
 * ones: copies under new ids, its issues moved onto them. The instance's it leaves out are taken
 * off its issues only.
 */
async function copyOptions(
  tx: Transaction,
  actorId: string,
  property: PropertyRef,
  projectId: string,
  { options, removed }: { options: readonly PropertyOptionDraft[]; removed: readonly string[] },
): Promise<number> {
  const instance = await tx
    .select({ id: propertyOptions.id, name: propertyOptions.name })
    .from(propertyOptions)
    .where(and(eq(propertyOptions.propertyId, property.id), optionsOf(null)))
    .orderBy(asc(propertyOptions.position))
    .for('share');
  const plan = planOptions(
    instance.map(({ id }) => id),
    options,
    removed,
  );
  if (!plan) {
    throw new HttpError(409, 'PROPERTY_CHANGED', 'The property changed meanwhile');
  }
  const takenOff = await takeOptionsOff(
    tx,
    actorId,
    property,
    instance.filter(({ id }) => plan.removed.includes(id)),
    { projectId },
  );
  const copies = new Map(plan.kept.map(({ id }) => [id, uuidv7()]));
  await tx.insert(propertyOptions).values([
    ...plan.kept.map(({ id, name, color, position }) => ({
      id: copies.get(id) ?? uuidv7(),
      propertyId: property.id,
      projectId,
      name,
      color,
      position,
    })),
    ...plan.added.map(({ name, color, position }) => ({
      id: uuidv7(),
      propertyId: property.id,
      projectId,
      name,
      color,
      position,
    })),
  ]);
  await moveValues(tx, property, projectId, copies);
  return takenOff;
}
