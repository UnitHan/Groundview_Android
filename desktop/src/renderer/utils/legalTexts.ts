export const TERMS_OF_SERVICE = `이용약관

제1조 (목적)
본 약관은 QA Bulls(이하 "회사")가 제공하는 Appkium Inspector 소프트웨어(이하 "서비스")의 이용 조건 및 절차, 회사와 이용자 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.

제2조 (서비스의 성격)
Appkium Inspector는 Android 기기의 화면을 캡처하고 UI 요소를 분석하는 테스트 자동화 도구입니다. 본 서비스는 소프트웨어 개발자 및 QA 엔지니어를 위한 전문 도구로 제공됩니다.

제3조 (이용자의 의무)
1. 이용자는 본 서비스를 법령, 본 약관 및 공지사항에서 정한 사항을 준수하여 이용해야 합니다.
2. 이용자는 타인의 개인정보, 저작권, 기밀 정보 등이 포함된 화면을 캡처·분석할 경우 관련 법령 및 당사자의 동의를 확인할 책임이 있습니다.
3. 이용자는 서비스를 악의적인 목적 또는 불법적인 방법으로 사용해서는 안 됩니다.

제4조 (AI 기능 이용)
1. AI 화면 분석 기능은 Google Gemini API를 통해 제공됩니다.
2. AI 분석 요청 시 캡처된 화면 이미지가 Google의 서버로 전송될 수 있습니다.
3. 이용자는 민감한 정보가 포함된 화면을 AI 분석에 사용할 경우 해당 위험을 인지하고 동의한 것으로 간주됩니다.

제5조 (서비스 제공의 제한)
회사는 다음 각 호에 해당하는 경우 서비스 제공을 제한하거나 중단할 수 있습니다.
1. 서비스 시스템의 유지보수 및 업데이트가 필요한 경우
2. 이용자가 본 약관을 위반한 경우
3. 기타 회사가 서비스 제공이 불가능하다고 판단하는 경우

제6조 (면책 조항)
1. 회사는 이용자가 서비스를 이용하여 발생한 손해에 대해 회사의 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.
2. 회사는 Google Gemini API 등 제3자 서비스의 장애, 정책 변경 등으로 인한 서비스 중단에 대해 책임을 지지 않습니다.

제7조 (약관의 변경)
회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 앱 내 공지를 통해 이용자에게 안내합니다.

제8조 (준거법 및 관할)
본 약관은 대한민국 법률에 따라 해석되며, 분쟁 발생 시 회사 소재지 관할 법원을 전속 관할 법원으로 합니다.

시행일: 2025년 1월 1일
제공: QA Bulls`;

export const PRIVACY_POLICY = `개인정보처리방침

QA Bulls(이하 "회사")는 이용자의 개인정보 보호를 중요시하며, 「개인정보 보호법」을 준수합니다.

1. 수집하는 개인정보 항목
회사는 Appkium Inspector 서비스 운영을 위해 다음의 정보를 처리합니다.
- Gemini API Key: 이용자가 직접 입력한 Google Gemini API 인증 키
- 화면 캡처 이미지: AI 분석 기능 이용 시 처리되는 Android 기기 화면 이미지

2. 개인정보의 수집 및 이용 목적
- Gemini API Key: Google Gemini AI 기능 인증 및 분석 요청 목적으로만 사용
- 화면 캡처 이미지: AI 화면 분석 기능 제공 목적으로만 사용 (분석 후 즉시 파기)

3. 개인정보의 보유 및 이용 기간
- Gemini API Key: 이용자 기기 내 로컬 암호화 저장, 이용자 삭제 시까지 보존
- 화면 캡처 이미지: 이용자 기기 내 임시 저장, AI 분석 후 또는 앱 종료 시 삭제

4. 개인정보의 제3자 제공
회사는 원칙적으로 이용자의 정보를 외부에 제공하지 않습니다. 단, AI 분석 기능 이용 시 아래와 같이 제공됩니다.
- 제공 대상: Google LLC (Gemini API)
- 제공 항목: 화면 캡처 이미지
- 제공 목적: AI 기반 화면 요소 분석
- 보유 기간: Google의 개인정보처리방침에 따름 (https://policies.google.com/privacy)

5. 개인정보의 안전성 확보 조치
- Gemini API Key는 PBKDF2-HMAC-SHA256 + Fernet 알고리즘으로 이용자 기기 내 암호화 저장됩니다.
- 회사 서버로 전송되는 개인정보는 없습니다.
- 모든 서비스는 이용자 기기 내에서 로컬로 처리됩니다.

6. 이용자의 권리
이용자는 언제든지 앱 설정에서 저장된 API Key를 삭제하거나 변경할 수 있습니다.

7. 개인정보 처리방침의 변경
본 방침은 법령 변경 또는 서비스 변경에 따라 업데이트될 수 있으며, 변경 시 앱 내 공지를 통해 안내합니다.

8. 문의처
개인정보 관련 문의사항은 아래로 연락주시기 바랍니다.
- 제공: QA Bulls
- 이메일: qabulls.test@gmail.com
- Microsoft Store: GroundView (앱 리뷰 기능 활용)

시행일: 2025년 1월 1일
제공: QA Bulls`;

/** localStorage key for consent tracking */
export const CONSENT_KEY = 'gv_consent_v1';

export const TERMS_OF_SERVICE_EN = `Terms of Service

Article 1 (Purpose)
These Terms govern the use of Appkium Inspector software ("Service") provided by QA Bulls ("Company"), including terms of use, procedures, and the rights, obligations, and responsibilities between the Company and users.

Article 2 (Nature of Service)
Appkium Inspector is a test automation tool that captures Android device screens and analyzes UI elements. This Service is provided as a professional tool for software developers and QA engineers.

Article 3 (User Obligations)
1. Users must comply with applicable laws, these Terms, and notices when using the Service.
2. Users are responsible for obtaining consent and complying with relevant laws when capturing or analyzing screens containing others' personal information, copyrighted material, or confidential information.
3. Users must not use the Service for malicious or illegal purposes.

Article 4 (AI Features)
1. The AI screen analysis feature is provided through the Google Gemini API.
2. When using AI analysis, captured screen images may be transmitted to Google's servers.
3. Users who use AI analysis on screens containing sensitive information are deemed to have acknowledged and accepted the associated risks.

Article 5 (Service Restrictions)
The Company may restrict or suspend the Service in the following cases:
1. When maintenance or updates to the service system are required.
2. When a user violates these Terms.
3. When the Company otherwise determines that providing the Service is not possible.

Article 6 (Disclaimer)
1. The Company shall not be liable for damages arising from a user's use of the Service unless caused by the Company's intentional misconduct or gross negligence.
2. The Company shall not be liable for service interruptions caused by failures, policy changes, or other issues with third-party services such as the Google Gemini API.

Article 7 (Amendments)
The Company may amend these Terms within the scope permitted by applicable law and will notify users of any changes through in-app announcements.

Effective Date: January 1, 2025
Provided by: QA Bulls`;

export const PRIVACY_POLICY_EN = `Privacy Policy

1. Personal Information Collected
Appkium Inspector does not collect or store users' personal information on company servers. All data processed by the app is handled locally on the user's device.

2. Use of Gemini API Key
The Gemini API Key entered by the user is encrypted using PBKDF2-HMAC-SHA256 hashing and Fernet symmetric encryption, and stored only on the user's local device. The Company does not have access to API keys.

3. Screen Capture Data
Screen captures taken for UI analysis purposes are processed and stored only on the user's local device. When using the AI analysis feature, screen images are transmitted to Google's Gemini API. No captured data is transmitted to company servers.

4. Device Information
Device information collected during device connection (device ID, Android version, etc.) is used only for providing the service and is not transmitted to company servers.

5. Data Retention
All data is managed on the user's local device. Users may delete all data by uninstalling the app.

6. Third-Party Services
This Service uses the Google Gemini API. For Google's privacy practices, please refer to Google's Privacy Policy.

7. Contact
For inquiries regarding privacy, please contact: contact@qabulls.com

Effective Date: January 1, 2025
Provided by: QA Bulls`;
