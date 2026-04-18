const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * 관리자 권한으로 사용자의 비밀번호를 초기화합니다.
 * 호출자는 반드시 'ADMIN' 권한을 가지고 있어야 합니다.
 */
exports.adminResetPassword = onCall(async (request) => {
  // 1. 인증 정보 확인
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "인증이 필요한 요청입니다."
    );
  }

  const { uid, password } = request.data;

  // 2. 입력 데이터 검증
  if (!uid || !password) {
    throw new HttpsError(
      "invalid-argument",
      "UID와 비밀번호가 누락되었습니다."
    );
  }

  try {
    // 3. 관리자 권한 여부 확인 (Firestore UserProfile 조회)
    const adminRef = admin.firestore('weberp').collection("UserProfile").doc(request.auth.uid);
    const adminSnap = await adminRef.get();
    
    if (!adminSnap.exists || adminSnap.data().role !== "ADMIN") {
      throw new HttpsError(
        "permission-denied",
        "관리자 권한이 없습니다."
      );
    }

    // 4. 비밀번호 강제 업데이트
    await admin.auth().updateUser(uid, { password });
    
    console.log(`[AdminReset] Password for user ${uid} reset to '${password}' by ${request.auth.uid}`);

    return { 
      success: true, 
      message: "비밀번호가 성공적으로 초기화되었습니다." 
    };
  } catch (error) {
    console.error(`[AdminResetError]`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "비밀번호 초기화 중 오류가 발생했습니다.");
  }
});
