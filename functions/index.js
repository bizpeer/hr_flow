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
    // 3. 권한 및 소속 확인 (Firestore UserProfile 조회)
    const db = admin.firestore('weberp');
    const callerRef = db.collection("UserProfile").doc(request.auth.uid);
    const targetRef = db.collection("UserProfile").doc(uid);
    
    const [callerSnap, targetSnap] = await Promise.all([callerRef.get(), targetRef.get()]);
    
    if (!callerSnap.exists) {
      throw new HttpsError("permission-denied", "호출자 정보를 찾을 수 없습니다.");
    }

    const callerData = callerSnap.data();
    
    // SUPER_ADMIN은 모든 권한 허용
    if (callerData.role === "SUPER_ADMIN") {
      console.log(`[AdminReset] SUPER_ADMIN ${request.auth.uid} is resetting password for ${uid}`);
    } else if (callerData.role === "ADMIN") {
      // 일반 ADMIN인 경우 소속 회사 확인
      if (!targetSnap.exists) {
        throw new HttpsError("not-found", "대상을 찾을 수 없습니다.");
      }
      
      const targetData = targetSnap.data();
      if (callerData.companyId !== targetData.companyId) {
        throw new HttpsError(
          "permission-denied",
          "타사 직원의 정보는 관리할 수 없습니다."
        );
      }
    } else {
      throw new HttpsError(
        "permission-denied",
        "비밀번호를 초기화할 권한이 없습니다."
      );
    }

    // 4. 비밀번호 강제 업데이트
    await admin.auth().updateUser(uid, { password });
    
    console.log(`[AdminReset] Password for user ${uid} reset by ${request.auth.uid} (Company: ${callerData.companyId})`);

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
