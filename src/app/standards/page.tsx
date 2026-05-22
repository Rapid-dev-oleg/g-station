'use client';

import { useMemo, useState } from 'react';
import {
  Badge, Button, Card, EmptyState, IconBook, IconExternalLink, IconPlus, IconSearch, IconTrash, Input, Modal, Select, Textarea, toast,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useStandardsStore } from '@/lib/store';
import type { StandardCard, StandardKind, StandardStatus, SystemTypeKey } from '@/lib/standards';
import { systemTypeLabel } from '@/lib/format';
import styles from './page.module.css';

const SYSTEM_OPTIONS: { value: SystemTypeKey; label: string }[] = [
  { value: 'KNS', label: 'КНС / канализация' },
  { value: 'FIRE', label: 'Пожаротушение' },
  { value: 'VNS', label: 'Водоснабжение / ВНС' },
];

const KIND_OPTIONS: { value: StandardKind; label: string }[] = [
  { value: 'SP', label: 'СП' },
  { value: 'GOST', label: 'ГОСТ' },
  { value: 'SNIP', label: 'СНиП' },
  { value: 'OTHER', label: 'Иное' },
];

const STATUS_OPTIONS: { value: StandardStatus; label: string }[] = [
  { value: 'active', label: 'Действует' },
  { value: 'recommended', label: 'Рекомендуется' },
  { value: 'cancelled', label: 'Отменён' },
];

const statusVariant = (s: StandardStatus) =>
  s === 'active' ? 'success' : s === 'recommended' ? 'warning' : 'danger';
const statusLabel = (s: StandardStatus) =>
  s === 'active' ? 'Действует' : s === 'recommended' ? 'Рекомендуется' : 'Отменён';

export default function StandardsPage() {
  const items = useStandardsStore((s) => s.items);
  const addStandard = useStandardsStore((s) => s.addStandard);
  const removeStandard = useStandardsStore((s) => s.removeStandard);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'' | SystemTypeKey>('');
  const [filterStatus, setFilterStatus] = useState<'' | StandardStatus>('');
  const [showAdd, setShowAdd] = useState(false);
  const [viewItem, setViewItem] = useState<StandardCard | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filterType && !it.appliesTo.includes(filterType)) return false;
      if (filterStatus && it.status !== filterStatus) return false;
      if (!q) return true;
      return (
        it.code.toLowerCase().includes(q) ||
        it.title.toLowerCase().includes(q) ||
        it.scope.toLowerCase().includes(q) ||
        it.keyPoints.some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [items, search, filterType, filterStatus]);

  const handleDelete = (id: string, origin: 'system' | 'user') => {
    if (origin === 'system') {
      toast.error('Встроенный норматив удалить нельзя');
      return;
    }
    if (confirm('Удалить норматив?')) {
      removeStandard(id);
      toast.success('Норматив удалён');
      setViewItem(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Справочник нормативов"
        subtitle="СП, ГОСТ, СНиП — действующие документы. Добавляйте свои источники, они будут упоминаться в ТКП."
        actions={
          <Button leftIcon={<IconPlus />} onClick={() => setShowAdd(true)}>
            Добавить норматив
          </Button>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><IconSearch /></span>
          <Input
            className={styles.searchInput}
            placeholder="Поиск по коду, названию или ключевым пунктам"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className={styles.filterSelect}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          options={[
            { value: '', label: 'Все типы систем' },
            ...SYSTEM_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />
        <Select
          className={styles.filterSelect}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          options={[
            { value: '', label: 'Любой статус' },
            ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconBook />}
            title="Ничего не найдено"
            description="Измените фильтры или добавьте новый норматив со ссылкой на источник"
            action={
              <Button leftIcon={<IconPlus />} onClick={() => setShowAdd(true)}>
                Добавить норматив
              </Button>
            }
          />
        </Card>
      ) : (
        <div className={styles.grid}>
          {filtered.map((s) => (
            <button
              type="button"
              key={s.id}
              className={styles.card}
              onClick={() => setViewItem(s)}
            >
              <div className={styles.cardHead}>
                <div className={styles.code}>{s.code}</div>
                {s.origin === 'user' && <Badge variant="info" size="md">мой</Badge>}
              </div>
              <div className={styles.title}>{s.title}</div>
              <div className={styles.scope}>{s.scope}</div>
              <div className={styles.tags}>
                <Badge variant={statusVariant(s.status)} withDot>{statusLabel(s.status)}</Badge>
                {s.appliesTo.map((t) => (
                  <Badge key={t} variant="info" size="md">{systemTypeLabel(t)}</Badge>
                ))}
              </div>
              {s.keyPoints.length > 0 && (
                <ul className={styles.points}>
                  {s.keyPoints.slice(0, 3).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
              {s.sourceUrl && (
                <div className={styles.sourceHint}>
                  <IconExternalLink width={12} height={12} /> {hostFromUrl(s.sourceUrl)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {showAdd && (
        <AddStandardModal
          onCancel={() => setShowAdd(false)}
          onCreate={(card) => {
            addStandard(card);
            setShowAdd(false);
            toast.success(`Норматив «${card.code}» добавлен`);
          }}
        />
      )}

      {viewItem && (
        <ViewStandardModal
          item={viewItem}
          onClose={() => setViewItem(null)}
          onDelete={() => handleDelete(viewItem.id, viewItem.origin)}
        />
      )}
    </>
  );
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// =============== Модалка добавления ===============

function AddStandardModal({ onCancel, onCreate }: {
  onCancel: () => void;
  onCreate: (s: StandardCard) => void;
}) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [kind, setKind] = useState<StandardKind>('SP');
  const [status, setStatus] = useState<StandardStatus>('active');
  const [appliesTo, setAppliesTo] = useState<SystemTypeKey[]>([]);
  const [keyPointsRaw, setKeyPointsRaw] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleApplies = (t: SystemTypeKey) => {
    setAppliesTo((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submit = () => {
    const errs: Record<string, string> = {};
    if (code.trim().length < 3) errs.code = 'Укажите код норматива';
    if (title.trim().length < 3) errs.title = 'Укажите название';
    if (appliesTo.length === 0) errs.appliesTo = 'Выберите хотя бы один тип систем';
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) errs.sourceUrl = 'Ссылка должна начинаться с http:// или https://';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const card: StandardCard = {
      id: `usr-${Date.now()}`,
      code: code.trim(),
      title: title.trim(),
      scope: scope.trim() || title.trim(),
      kind,
      status,
      appliesTo,
      sourceUrl: sourceUrl.trim() || undefined,
      keyPoints: keyPointsRaw
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      note: note.trim() || undefined,
      origin: 'user',
      createdAt: new Date().toISOString(),
    };
    onCreate(card);
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Новый норматив"
      subtitle="Добавьте код, ссылку на документацию и теги — норматив попадёт в ТКП в раздел «Расчёт выполнен в соответствии с»"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Отмена</Button>
          <Button onClick={submit}>Добавить</Button>
        </>
      }
    >
      <div className={styles.formGrid}>
        <Input
          label="Код"
          required
          placeholder="СП 30.13330.2020"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={errors.code}
        />
        <Select
          label="Тип документа"
          value={kind}
          onChange={(e) => setKind(e.target.value as StandardKind)}
          options={KIND_OPTIONS}
        />
        <Input
          label="Полное название"
          required
          placeholder="Внутренний водопровод и канализация зданий"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          style={{ gridColumn: '1 / -1' }}
        />
        <Textarea
          label="Краткое описание области применения"
          placeholder="Что регламентирует этот документ"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={2}
          style={{ gridColumn: '1 / -1' }}
        />
        <Input
          label="Ссылка на источник"
          placeholder="https://docs.cntd.ru/document/..."
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          error={errors.sourceUrl}
          hint="docs.cntd.ru, kodeks.ru, минстрой РФ — откроется в новой вкладке из карточки"
          style={{ gridColumn: '1 / -1' }}
        />
        <Select
          label="Статус"
          value={status}
          onChange={(e) => setStatus(e.target.value as StandardStatus)}
          options={STATUS_OPTIONS}
        />
        <div>
          <div className={styles.fieldLabel}>Типы систем <span style={{ color: 'var(--danger)' }}>*</span></div>
          <div className={styles.appliesChips}>
            {SYSTEM_OPTIONS.map((o) => {
              const active = appliesTo.includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                  onClick={() => toggleApplies(o.value)}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {errors.appliesTo && <div className={styles.error}>{errors.appliesTo}</div>}
        </div>
        <Textarea
          label="Ключевые пункты (один на строку)"
          placeholder="Расходы воды на сан-приборы&#10;Минимальный свободный напор у диктующего прибора&#10;..."
          value={keyPointsRaw}
          onChange={(e) => setKeyPointsRaw(e.target.value)}
          rows={4}
          hint="Эти пункты будут видны в карточке и в ТКП"
          style={{ gridColumn: '1 / -1' }}
        />
        <Textarea
          label="Заметка (опционально)"
          placeholder="Зачем добавили, для каких проектов нужен"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          style={{ gridColumn: '1 / -1' }}
        />
      </div>
    </Modal>
  );
}

// =============== Модалка просмотра карточки ===============

function ViewStandardModal({ item, onClose, onDelete }: {
  item: StandardCard;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={item.code}
      subtitle={item.title}
      size="lg"
      footer={
        <>
          {item.origin === 'user' && (
            <Button variant="danger" leftIcon={<IconTrash />} onClick={onDelete}>
              Удалить
            </Button>
          )}
          {item.sourceUrl && (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ marginRight: 'auto' }}>
              <Button variant="secondary" leftIcon={<IconExternalLink />}>
                Открыть источник
              </Button>
            </a>
          )}
          <Button onClick={onClose}>Закрыть</Button>
        </>
      }
    >
      <div className={styles.viewBody}>
        <div className={styles.viewTags}>
          <Badge variant={statusVariant(item.status)} withDot>{statusLabel(item.status)}</Badge>
          {item.appliesTo.map((t) => (
            <Badge key={t} variant="info">{systemTypeLabel(t)}</Badge>
          ))}
          {item.year && <Badge variant="default">{item.year}</Badge>}
          {item.origin === 'user' && <Badge variant="info">Добавлен вручную</Badge>}
        </div>
        {item.scope && (
          <section>
            <div className={styles.viewSectionTitle}>Область применения</div>
            <p className={styles.viewText}>{item.scope}</p>
          </section>
        )}
        {item.keyPoints.length > 0 && (
          <section>
            <div className={styles.viewSectionTitle}>Ключевые пункты</div>
            <ul className={styles.viewPoints}>
              {item.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </section>
        )}
        {item.note && (
          <section>
            <div className={styles.viewSectionTitle}>Заметка</div>
            <p className={styles.viewText}>{item.note}</p>
          </section>
        )}
        {item.sourceUrl && (
          <section>
            <div className={styles.viewSectionTitle}>Источник</div>
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.viewLink}>
              {item.sourceUrl}
            </a>
          </section>
        )}
      </div>
    </Modal>
  );
}
