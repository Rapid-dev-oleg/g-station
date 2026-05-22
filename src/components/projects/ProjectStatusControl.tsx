'use client';

import { useTransition } from 'react';
import type { ProjectStatus } from '@prisma/client';
import { Select } from '@/components/ui';
import { setProjectStatus } from '@/server/actions/projects';
import { PROJECT_STATUS_OPTIONS } from '@/lib/format/labels';

export function ProjectStatusControl({
  projectId,
  status,
}: {
  projectId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={pending}
      options={PROJECT_STATUS_OPTIONS}
      onChange={(e) => {
        const next = e.target.value as ProjectStatus;
        startTransition(async () => {
          await setProjectStatus(projectId, next);
        });
      }}
    />
  );
}
