const start = Date.now();
console.log("[Test] functions/index.js 로딩 시작...");
try {
  require('../functions/index.js');
  const end = Date.now();
  console.log(`[Success] 로딩 완료! 소요 시간: ${end - start}ms`);
} catch (error) {
  console.error("[Error] 로딩 중 오류 발생:", error);
}
