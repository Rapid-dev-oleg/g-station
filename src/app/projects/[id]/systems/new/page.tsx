'use client';

import { Suspense, use, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useProjectsStore } from '@/lib/store';
import type { SystemConfig, SystemType } from '@/lib/types';

function defaultDataForType(type: SystemType): any {
  if (type === 'KNS') {
    return {
      subtype: 'hozbyt',
      medium: 'hozbyt',
      Tmin: 5, Tmax: 25, density: 1000,
      exProof: false,
      Qmax: 5, headRequired: 15,
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
      preferredBrand: 'WILO', startType: 'direct',
      panelLocation: 'outdoor', avr: false, electricalCategory: 2, dispatch: 'none',
      dryRun: true, overheat: true, phaseControl: true,
      basket: true, baffle: false,
      wellBeforeKns: false, wellAfterKns: false,
      flowMeter: 'none', gasAnalyzer: false, alarmSignal: 'none',
      flexibleHose: false, elasticCouplings: false, bellowCompensators: false,
      liftingDevice: 'none', flangeKit: false, strappingBelts: false,
    };
  }
  if (type === 'FIRE') {
    return {
      subtype: 'VPV',
      Q: 30, H: 45,
      medium: 'drinking',
      Tmin: 5, Tmax: 15, density: 1000,
      premisesCategory: 'D',
      installLocation: 'inside_premises',
      stationsCount: 1, workingPumps: 1, reservePumps: 1,
      driveType: 'electric', avr: true, electricalCategory: 1,
      dryRun: true, overheat: true,
      ipRating: 'IP55', signalToWatchpoint: true,
      signals: { pumpsRunning: true, pumpsAlarm: true, feed1: true, feed2: true, autoMode: true, manualMode: true, stopMode: true, avrMode: true, valvesPosition: true },
      algorithms: { remoteFromHydrant: true, autoFromFireDetection: true, remoteFromOperator: true, localFromStation: true, autoReserveOnFailure: true },
      collectorSuction: true, collectorPressure: true,
      checkValves: true, flangeKit: true, certificateTRTS: true,
    };
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
    preferredBrand: 'Wellmix', startType: 'direct',
    dryRun: true, dispatch: 'none', panelLocation: 'indoor',
  };
}

export default function NewSystemPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<><PageHeader title="Создаём систему..." /><Card>Загрузка…</Card></>}>
      <NewSystemPageInner params={params} />
    </Suspense>
  );
}

function NewSystemPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = (searchParams?.get('type') ?? 'KNS') as SystemType;
  const project = useProjectsStore((s) => s.findById(id));
  const addSystem = useProjectsStore((s) => s.addSystem);

  useEffect(() => {
    if (!project) return;
    const now = new Date().toISOString();
    const sys = {
      id: `sys-${Date.now()}`,
      projectId: id,
      type,
      name: `Новая ${type === 'KNS' ? 'КНС' : type === 'FIRE' ? 'НС пожаротушения' : 'ВНС'}`,
      status: 'draft',
      data: defaultDataForType(type),
      createdAt: now,
      updatedAt: now,
    } as SystemConfig;
    addSystem(id, sys);
    router.replace(`/projects/${id}/systems/${sys.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, id, type]);

  return (
    <>
      <PageHeader title="Создаём систему..." />
      <Card>Перенаправляем в wizard…</Card>
    </>
  );
}
