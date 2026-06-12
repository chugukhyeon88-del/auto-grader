# 배포 가이드

## 1. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. **프로젝트 추가** 클릭
3. **Firestore Database** 생성 (프로덕션 모드)
4. **프로젝트 설정 > 웹 앱 추가** 에서 Firebase 설정값 복사

## 2. Firestore 보안 규칙 적용

Firebase Console > Firestore > 규칙 탭에 아래 내용 붙여넣기:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /exams/{examId} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if false;
    }
    match /submissions/{submissionId} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if false;
    }
  }
}
```

## 3. Vercel 배포

### 방법 A: GitHub 연동 (권장)
1. GitHub에 이 프로젝트 push
2. [Vercel](https://vercel.com) 에서 **Import Project**
3. 아래 환경변수 설정:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase 설정값 |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase 설정값 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase 설정값 |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase 설정값 |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase 설정값 |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase 설정값 |

4. **Deploy** 클릭

### 방법 B: CLI
```bash
npm i -g vercel
vercel --prod
```
환경변수는 `vercel env add NEXT_PUBLIC_FIREBASE_API_KEY` 명령으로 추가
