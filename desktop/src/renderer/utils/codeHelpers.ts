export const friendlyRisk = (msg?: string) => {
  if (!msg) return '';
  const m = msg.toLowerCase();
  if (m.includes('index'))
    return 'index 기반이라 화면이 조금만 바뀌어도 깨질 수 있어요. id/desc를 추가하거나 더 구체적인 조건을 권장합니다.';
  if (m.includes('dynamic') || m.includes('text may change'))
    return '텍스트가 자주 바뀌는 요소 같아요. textContains나 id/desc를 쓰면 더 안전합니다.';
  if (m.includes('bounds'))
    return 'bounds만으로 찾으면 기기 해상도/배치에 따라 실패할 수 있어요. id/desc 사용을 권장합니다.';
  return msg;
};

export const friendlyHint = (msg?: string) => {
  if (!msg) return '';
  const m = msg.toLowerCase();
  if (m.includes('resource-id') || m.includes('id/desc'))
    return '앱에 resource-id 또는 content-desc를 넣으면 더 안정적으로 찾을 수 있습니다.';
  if (m.includes('text'))
    return '텍스트 기반 로케이터는 문구가 바뀌면 실패할 수 있어요. 가능하면 id/desc를 함께 쓰세요.';
  if (m.includes('parent') || m.includes('ancestor'))
    return '부모/조상 요소에 id/desc가 있다면 childSelector로 범위를 좁히면 더 안전합니다.';
  return msg;
};

export const locatorHints = (node: any): string[] => {
  const hints: string[] = [];
  if (!node.resourceId && !node.contentDesc) {
    hints.push('resource-id나 content-desc를 개발자에게 요청하면 더 안정적인 로케이터를 만들 수 있습니다.');
  }
  if (node.text && /\d/.test(node.text)) {
    hints.push('텍스트에 숫자가 포함되어 있어 동적일 가능성이 있습니다. textContains나 id/desc 사용을 권장합니다.');
  }
  return hints;
};
