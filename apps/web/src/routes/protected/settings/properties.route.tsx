import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import { Alert } from '@toppo-tracker/ui';
import { useState } from 'react';
import { IssuesQueries } from '../../../features/issues/queries/issues.queries.ts';
import {
  type BuiltInProperty,
  PropertiesList,
} from '../../../features/properties/components/list/properties-list.tsx';
import { CategoryPanel } from '../../../features/properties/components/panels/category-panel.tsx';
import { LabelPanel } from '../../../features/properties/components/panels/label-panel.tsx';
import { PriorityPanel } from '../../../features/properties/components/panels/priority-panel.tsx';
import { PropertyPanel } from '../../../features/properties/components/panels/property-panel.tsx';
import { PropertiesQueries } from '../../../features/properties/queries/properties.queries.ts';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { settingsRoute } from './settings.route.tsx';

/** The fields that describe an issue, for the whole organization. */
export const propertiesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'properties',
  staticData: { titleKey: 'properties.title' },
  component: PropertiesScreen,
});

function PropertiesScreen() {
  const { t } = useI18n();
  const { data: user } = useQuery(SessionQueries.currentUser);
  const allowed = Boolean(user && can(user.permissions, 'instance.settings.manage'));
  const categories = useQuery({ ...PropertiesQueries.categories, enabled: allowed });
  const priorities = useQuery({ ...PropertiesQueries.priorities, enabled: allowed });
  const labels = useQuery({ ...PropertiesQueries.labels, enabled: allowed });
  const custom = useQuery({ ...PropertiesQueries.custom, enabled: allowed });
  const queryClient = useQueryClient();
  // A built-in field, a property by its id, or a new one (no id yet).
  const [editing, setEditing] = useState<BuiltInProperty | { id: string | null } | null>(null);

  if (!allowed) {
    return (
      <Page title={t('properties.title')}>
        <AccessDenied />
      </Page>
    );
  }
  const failure = categories.error ?? priorities.error ?? labels.error ?? custom.error;
  // The issue forms show the new names and the new default at once.
  const saved = async () => {
    setEditing(null);
    await queryClient.invalidateQueries({ queryKey: IssuesQueries.all });
  };
  const panel = (property: BuiltInProperty) => ({
    open: editing === property,
    onOpenChange: (open: boolean) => setEditing(open ? property : null),
    onSaved: saved,
  });
  const editingCustom = editing !== null && typeof editing === 'object' ? editing : null;

  return (
    <Page title={t('properties.title')} description={t('properties.description')}>
      {failure ? <Alert tone="danger">{requestErrorMessage(failure, t)}</Alert> : null}
      {categories.data && priorities.data && labels.data && custom.data ? (
        <>
          <PropertiesList
            categories={categories.data}
            priorities={priorities.data}
            labels={labels.data}
            properties={custom.data}
            onEdit={setEditing}
            onCreate={() => setEditing({ id: null })}
          />
          <PropertyPanel
            open={editingCustom !== null}
            onOpenChange={(open) => setEditing(open ? editingCustom : null)}
            property={custom.data.find(({ id }) => id === editingCustom?.id) ?? null}
            onSaved={saved}
          />
          <CategoryPanel categories={categories.data} {...panel('category')} />
          <PriorityPanel priorities={priorities.data} {...panel('priority')} />
          <LabelPanel labels={labels.data} {...panel('labels')} />
        </>
      ) : null}
      {categories.isPending || priorities.isPending || labels.isPending || custom.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t('properties.loading')}
        </p>
      ) : null}
    </Page>
  );
}
