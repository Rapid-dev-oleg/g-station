'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal } from '@/components/ui';
import { deleteProject } from '@/server/actions/projects';

/** Кнопка удаления проекта с окном подтверждения (удаляет проект и все системы). */
export function DeleteProjectButton({
  projectId,
  projectName,
  systemsCount,
}: {
  projectId: string;
  projectName: string;
  systemsCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, startDelete] = useTransition();
  const router = useRouter();

  function confirm() {
    startDelete(async () => {
      await deleteProject(projectId);
      setOpen(false);
      router.push('/projects');
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} style={{ color: '#dc2626' }}>
        Удалить
      </Button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Удалить проект?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Отмена
            </Button>
            <Button onClick={confirm} disabled={busy} style={{ background: '#dc2626' }}>
              {busy ? 'Удаляю…' : 'Удалить навсегда'}
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          Проект <b>«{projectName}»</b>
          {systemsCount > 0 ? <> и все его системы ({systemsCount}) </> : ' '}
          будут удалены безвозвратно. Это действие нельзя отменить.
        </div>
      </Modal>
    </>
  );
}
