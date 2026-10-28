const templateFieldLabels: Record<string, string> = { companyName: '회사명', address: '회사 주소', representative: '대표자 이름', logoPath: '회사 로고', logoData: '회사 로고', sealPath: '대표자 인감', sealData: '대표자 인감', sealWidthMm: '인감 가로 크기', sealHeightMm: '인감 세로 크기' };
export const missingTemplateMessage = (fields: string[]) => `회사 서류 템플릿의 ${fields.map(field => templateFieldLabels[field] || field).join(', ')} 등록이 필요합니다. 회사 관리자가 템플릿을 저장한 뒤 다시 제출해 주세요.`;
export const officialLetterErrorMessage = (error: unknown) => {
  const details = typeof error === 'object' && error !== null && 'details' in error ? error.details : null;
  if (typeof details === 'object' && details !== null && 'missingFields' in details && Array.isArray(details.missingFields)) {
    const fields = details.missingFields.filter((field): field is string => typeof field === 'string');
    if (fields.length) return missingTemplateMessage(fields);
  }
  return error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.';
};
