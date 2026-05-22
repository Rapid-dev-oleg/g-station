'use client';

/**
 * Заглушка зоны загрузки ТЗ.
 * В прототипе предполагался AI-парсинг ТЗ (PDF/DOCX) для предзаполнения
 * wizard. На текущем этапе извлечение из ТЗ вне scope — карточку параметров
 * инженер заполняет в wizard вручную. Компонент оставлен как место под
 * будущую интеграцию.
 */
export function UploadDropzone({ projectId: _projectId }: { projectId: string }) {
  return (
    <div
      style={{
        border: '1px dashed #d0d7de',
        borderRadius: 8,
        padding: '20px',
        textAlign: 'center',
        color: '#8a93a0',
        fontSize: 13
      }}
    >
      Загрузка ТЗ с AI-парсингом — на следующем этапе.
      Сейчас параметры станции вводятся в wizard вручную.
    </div>
  );
}
