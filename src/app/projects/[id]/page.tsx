'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClientsStore, useProjectsStore } from '@/lib/store';
import { compute } from '@/lib/calc';
import { formatRub, projectStatusLabel, systemStatusLabel, systemTypeLabel } from '@/lib/format';
import {
  Badge, Button, Card, EmptyState, IconArrowLeft, IconArrowRight, IconCopy, IconDroplet, IconEdit, IconFile, IconFlame, IconFolder, IconPipe, IconPlus, IconTrash, IconButton, Modal, toast,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { UploadDropzone } from '@/components/ai/UploadDropzone';
import type { SystemConfig, SystemType } from '@/lib/types';
import styles from './page.module.css';

const TYPE_INFO: Record<SystemType, { title: string; desc: string; icon: React.ReactNode }> = {
  KNS: { title: 'КНС', desc: 'Канализационная насосная станция (хоз-быт, ливневая, производственная)', icon: <IconDroplet /> },
  FIRE: { title: 'Пожаротушение', desc: 'ВПВ, АУПТ, спринклерная или дренчерная установка', icon: <IconFlame /> },
  VNS: { title: 'ВНС / спец-насос', desc: 'Бустерная подача, повышение давления, спец-насосы', icon: <IconPipe /> },
};

function defaultDataForType(type: SystemType): SystemConfig['data'] {
  if (type === 'KNS') {
    return {
      subtype: 'hozbyt',
      medium: 'hozbyt',
      Tmin: 5, Tmax: 25, density: 1000,
      exProof: false,
      Qmax: 5,
      headRequired: 15,
      installation: 'underground_vertical',
      corpusMaterial: 'fiberglass',
      diameter: 1800, depth: 5000, neckHeight: 200,
      underRoadway: false,
      supplyDepth: 3500, supplyDiameter: 200, supplyMaterial: 'PP',
      supplyCount: 1, supplyDirection: 3, supplyConnection: 'socket',
      pressureCount: 1, pressureDepth: 2400, pressureDiameter: 110, pressureMaterial: 'PE',
      pressureLength: 100, pressureGeodeticDelta: 4,
      workingPumps: 1, reservePumps: 1, warehousePumps: 0,
      pumpInstallType: 'submersible',
      preferredBrand: 'WILO',
      startType: 'direct',
      panelLocation: 'outdoor',
      avr: false, electricalCategory: 2,
      dispatch: 'none',
      dryRun: true, overheat: true, phaseControl: true,
      basket: true, baffle: false,
      wellBeforeKns: false, wellAfterKns: false,
      flowMeter: 'none',
      gasAnalyzer: false,
      alarmSignal: 'none',
      flexibleHose: false,
      elasticCouplings: false,
      bellowCompensators: false,
      liftingDevice: 'none',
      flangeKit: false,
      strappingBelts: false,
    } as any;
  }
  if (type === 'FIRE') {
    return {
      subtype: 'VPV',
      Q: 30, H: 45,
      medium: 'drinking',
      Tmin: 5, Tmax: 15, density: 1000,
      premisesCategory: 'D',
      installLocation: 'inside_premises',
      stationsCount: 1,
      workingPumps: 1, reservePumps: 1,
      driveType: 'electric',
      avr: true,
      electricalCategory: 1,
      dryRun: true, overheat: true,
      ipRating: 'IP55',
      signalToWatchpoint: true,
      signals: { pumpsRunning: true, pumpsAlarm: true, feed1: true, feed2: true, autoMode: true, manualMode: true, stopMode: true, avrMode: true, valvesPosition: true },
      algorithms: { remoteFromHydrant: true, autoFromFireDetection: true, remoteFromOperator: true, localFromStation: true, autoReserveOnFailure: true },
      collectorSuction: true, collectorPressure: true,
      checkValves: true, flangeKit: true,
      certificateTRTS: true,
    } as any;
  }
  return {
    subtype: 'booster_drinking',
    medium: 'drinking',
    Tmin: 10, Tmax: 30, density: 1000,
    Qmax: 30, H: 35,
    source: 'tank',
    workingPumps: 1, reservePumps: 1,
    regulation: 'cascade',
    pumpInstallType: 'vertical_multi',
    preferredBrand: 'Wellmix',
    startType: 'direct',
    dryRun: true,
    dispatch: 'none',
    panelLocation: 'indoor',
  } as any;
}

export default function ProjectCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const project = useProjectsStore((s) => s.findById(id));
  const removeProject = useProjectsStore((s) => s.removeProject);
  const removeSystem = useProjectsStore((s) => s.removeSystem);
  const addSystem = useProjectsStore((s) => s.addSystem);
  const client = useClientsStore((s) => (project ? s.findById(project.clientId) : undefined));

  const [typeModal, setTypeModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);

  const systems = useMemo(
    () =>
      project?.systems.map((s) => {
        const cost = s.totalCost ?? compute(s).totalCost;
        return { system: s, cost };
      }) ?? [],
    [project]
  );

  const totalCost = systems.reduce((s, x) => s + x.cost, 0);

  if (!project) {
    return (
      <Card>
        <EmptyState
          title="Проект не найден"
          description="Возможно, ссылка устарела или проект был удалён"
          action={
            <Link href="/projects" style={{ display: 'inline-flex' }}>
              <Button leftIcon={<IconArrowLeft />}>К списку проектов</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const status = projectStatusLabel(project.status);

  const handleAddSystem = (type: SystemType) => {
    const now = new Date().toISOString();
    const sys = {
      id: `sys-${Date.now()}`,
      projectId: project.id,
      type,
      name: `Новая ${systemTypeLabel(type)}`,
      status: 'draft',
      data: defaultDataForType(type),
      createdAt: now,
      updatedAt: now,
    } as SystemConfig;
    addSystem(project.id, sys);
    setTypeModal(false);
    router.push(`/projects/${project.id}/systems/${sys.id}`);
  };

  const handleDuplicate = (s: SystemConfig) => {
    const now = new Date().toISOString();
    const copy = {
      ...s,
      id: `sys-${Date.now()}`,
      name: s.name + ' (копия)',
      status: 'draft' as const,
      createdAt: now,
      updatedAt: now,
    } as SystemConfig;
    addSystem(project.id, copy);
    toast.success('Система скопирована');
  };

  return (
    <>
      <PageHeader
        title={
          <>
            {project.name}
            <Badge variant={status.variant} withDot size="lg">{status.label}</Badge>
          </>
        }
        subtitle={
          <>
            {client ? <Link href={`/clients/${client.id}`}>{client.shortName}</Link> : '—'} · {project.object.name}
          </>
        }
        actions={
          <>
            <Link href="/projects" style={{ display: 'inline-flex' }}>
              <Button variant="ghost" leftIcon={<IconArrowLeft />}>К проектам</Button>
            </Link>
            <Link href={`/projects/${project.id}/proposal`} style={{ display: 'inline-flex' }}>
              <Button variant="secondary" leftIcon={<IconFile />}>ТКП</Button>
            </Link>
            <Button variant="danger" leftIcon={<IconTrash />} onClick={() => setConfirmDeleteProject(true)}>
              Удалить
            </Button>
          </>
        }
      />

      <div className={styles.layout}>
        <div>
          <Card title="Объект" compact style={{ marginBottom: 16 }}>
            <dl className={styles.objectGrid}>
              <dt>Название</dt>
              <dd>{project.object.name}</dd>
              {project.object.region && (
                <>
                  <dt>Регион</dt>
                  <dd>{project.object.region}</dd>
                </>
              )}
              {project.object.address && (
                <>
                  <dt>Адрес</dt>
                  <dd>{project.object.address}</dd>
                </>
              )}
              {project.object.projectCode && (
                <>
                  <dt>Код проекта</dt>
                  <dd>{project.object.projectCode}</dd>
                </>
              )}
              <dt>Срок</dt>
              <dd>{project.terms.leadTimeWeeks} нед. · базис {project.terms.basis}</dd>
            </dl>
          </Card>

          <Card title="Загрузить ТЗ" subtitle="AI разберёт документ и предзаполнит wizard" style={{ marginBottom: 16 }}>
            <UploadDropzone projectId={project.id} />
          </Card>

          <h2 className={styles.sectionTitle}>
            Системы ({project.systems.length})
            <Button leftIcon={<IconPlus />} onClick={() => setTypeModal(true)}>Добавить систему</Button>
          </h2>

          {systems.length === 0 ? (
            <Card>
              <EmptyState
                icon={<IconFolder />}
                title="В проекте пока нет систем"
                description="Загрузите ТЗ или добавьте систему вручную"
                action={
                  <Button leftIcon={<IconPlus />} onClick={() => setTypeModal(true)}>
                    Добавить систему
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className={styles.systemList}>
              {systems.map(({ system, cost }) => {
                const s = systemStatusLabel(system.status);
                const tinfo = TYPE_INFO[system.type];
                let Q: number | undefined;
                let H: number | undefined;
                if (system.type === 'KNS') { Q = system.data.Qmax; H = system.data.headRequired; }
                if (system.type === 'FIRE') { Q = system.data.Q; H = system.data.H; }
                if (system.type === 'VNS') { Q = system.data.Qmax; H = system.data.H; }
                return (
                  <div key={system.id} className={styles.systemCard}>
                    <div className={styles.typeChoiceIcon}>{tinfo.icon}</div>
                    <div className={styles.systemMain}>
                      <div className={styles.systemName}>{system.name}</div>
                      <div className={styles.systemMeta}>
                        <Badge variant="info">{systemTypeLabel(system.type)}</Badge>
                        <Badge variant={s.variant} withDot>{s.label}</Badge>
                        {Q !== undefined && <span>Q={Q} м³/ч</span>}
                        {H !== undefined && <span>H={H} м</span>}
                      </div>
                    </div>
                    <div className={styles.systemRight}>
                      <div className={styles.systemSum}>{cost > 0 ? formatRub(cost, { decimals: 0 }) : '—'}</div>
                      <Link href={`/projects/${project.id}/systems/${system.id}`}>
                        <IconButton bordered title="Открыть"><IconEdit /></IconButton>
                      </Link>
                      <IconButton bordered title="Дублировать" onClick={() => handleDuplicate(system)}><IconCopy /></IconButton>
                      <IconButton bordered variant="danger" title="Удалить" onClick={() => setConfirmDelete({ id: system.id, name: system.name })}>
                        <IconTrash />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className={styles.aside}>
          <Card title="Сводка" compact>
            <div className={styles.summaryStat}>
              <span className={styles.summaryLabel}>Систем</span>
              <span className={styles.summaryValue}>{project.systems.length}</span>
            </div>
            <div className={styles.summaryStat}>
              <span className={styles.summaryLabel}>Σ закупки</span>
              <span className={styles.summaryValue}>{formatRub(totalCost, { decimals: 0 })}</span>
            </div>
            <div className={styles.summaryStat}>
              <span className={styles.summaryLabel}>НДС {project.terms.vatPct}%</span>
              <span className={styles.summaryValue}>{formatRub(totalCost * project.terms.vatPct / 100, { decimals: 0 })}</span>
            </div>
            <div className={styles.summaryStat}>
              <span className={styles.summaryLabel}>Срок поставки</span>
              <span className={styles.summaryValue}>{project.terms.leadTimeWeeks} нед.</span>
            </div>
            <div className={styles.summaryStat}>
              <span className={styles.summaryLabel}>Статус ТКП</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <Link href={`/projects/${project.id}/proposal`} style={{ display: 'block', marginTop: 12 }}>
              <Button fullWidth rightIcon={<IconArrowRight />}>Перейти к ТКП</Button>
            </Link>
          </Card>

          {client && (
            <Card title="Заказчик" compact>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{client.shortName}</div>
              <div className={styles.muted} style={{ fontSize: 13 }}>ИНН {client.inn}</div>
              <div className={styles.muted} style={{ fontSize: 12, marginTop: 8 }}>{client.legalAddress}</div>
              <Link href={`/clients/${client.id}`} style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
                Открыть карточку клиента →
              </Link>
            </Card>
          )}
        </aside>
      </div>

      <Modal open={typeModal} onClose={() => setTypeModal(false)} title="Какую систему добавим?" size="lg">
        <div className={styles.typeChoices}>
          {(['KNS', 'FIRE', 'VNS'] as SystemType[]).map((t) => {
            const ti = TYPE_INFO[t];
            return (
              <button key={t} type="button" className={styles.typeChoice} onClick={() => handleAddSystem(t)}>
                <div className={styles.typeChoiceIcon}>{ti.icon}</div>
                <div className={styles.typeChoiceTitle}>{ti.title}</div>
                <div className={styles.typeChoiceDesc}>{ti.desc}</div>
              </button>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Удалить систему?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Отмена</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  removeSystem(project.id, confirmDelete.id);
                  toast.success('Система удалена');
                  setConfirmDelete(null);
                }
              }}
            >
              Удалить
            </Button>
          </>
        }
      >
        <p>Удалить систему «{confirmDelete?.name}» из проекта? Действие нельзя отменить.</p>
      </Modal>

      <Modal
        open={confirmDeleteProject}
        onClose={() => setConfirmDeleteProject(false)}
        title="Удалить проект?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeleteProject(false)}>Отмена</Button>
            <Button
              variant="danger"
              onClick={() => {
                removeProject(project.id);
                toast.success('Проект удалён');
                router.push('/projects');
              }}
            >
              Удалить
            </Button>
          </>
        }
      >
        <p>Будут удалены все системы и расчёты. Это действие нельзя отменить.</p>
      </Modal>
    </>
  );
}
