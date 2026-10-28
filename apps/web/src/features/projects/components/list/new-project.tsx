import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateProjectRequest } from '@toppo-tracker/shared';
import { Button, Dialog, DialogContent, DialogTrigger } from '@toppo-tracker/ui';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Projects } from '../../api/projects.api.ts';
import { ProjectsQueries } from '../../queries/projects.queries.ts';
import { ProjectForm } from '../forms/project-form.tsx';

/** The "New project" button and its dialog. Reports the new project's key. */
export function NewProject({ onCreated }: { onCreated: (key: string) => Promise<void> | void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: (project: CreateProjectRequest) => Projects.create(project),
    onSuccess: async (key) => {
      await queryClient.invalidateQueries({ queryKey: ProjectsQueries.all });
      setOpen(false);
      await onCreated(key);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        create.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden="true" />
          {t('projects.newProject')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t('projects.createTitle')}
        description={t('projects.createDescription')}
        closeLabel={t('projectSettings.close')}
      >
        <ProjectForm
          pending={create.isPending}
          error={create.error}
          onSubmit={(project) => create.mutate(project)}
        />
      </DialogContent>
    </Dialog>
  );
}
