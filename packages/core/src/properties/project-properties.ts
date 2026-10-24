/** How a project adapts a property of the instance. */
export interface PropertyAdaptation {
  propertyId: string;
  hidden: boolean;
  /** The project's own options replace the instance's (its own versions). */
  ownOptions: boolean;
}

/**
 * The properties a project's issues take, each with its options: the instance's but those it
 * hides, with its own options where it has them, then its own properties, in the order given.
 * Options with a `projectId` are a project's own options of a property of the instance.
 */
export function effectiveProperties<
  Property extends { id: string; projectId: string | null },
  Option extends { propertyId: string; projectId: string | null },
>(
  projectId: string,
  properties: readonly Property[],
  options: readonly Option[],
  adaptations: readonly PropertyAdaptation[],
): (Property & { options: Option[] })[] {
  const adaptationOf = (propertyId: string) =>
    adaptations.find((adaptation) => adaptation.propertyId === propertyId);
  const fromInstance = properties.filter(
    (property) => property.projectId === null && !adaptationOf(property.id)?.hidden,
  );
  const own = properties.filter((property) => property.projectId === projectId);
  return [...fromInstance, ...own].map((property) => {
    const ownOptions = property.projectId === null && adaptationOf(property.id)?.ownOptions;
    const optionsOf = ownOptions ? projectId : null;
    return {
      ...property,
      options: options.filter(
        (option) => option.propertyId === property.id && option.projectId === optionsOf,
      ),
    };
  });
}
