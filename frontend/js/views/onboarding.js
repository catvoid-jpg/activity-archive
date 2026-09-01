// 첫 진입 안내 화면 (Requirement 9.2, 9.3, 10.1, 17.1 / 6.2).
//
// - 서비스 설계 원칙 네 가지와 활동 내용의 외부 AI 전송 사실을 안내한다.
// - 모든 문구는 하드코딩 고정 텍스트이며 각 항목은 2문장을 넘지 않는다.
// - 닫기 버튼을 누르면 다음 화면으로 넘어가고, 안내는 다시 표시하지 않는다.
//   (서버가 온보딩 완료를 기록하므로 재진입 시 needsOnboarding=false 가 되어 재표시되지 않는다.)

// 각 항목: 2문장 이하 고정 텍스트.
const NOTICES = [
  '지원서 문장을 대신 써 드리지 않습니다. 문장은 직접 쓰시고, 저희는 소재를 찾도록 돕습니다.',
  '직접 답한 기록이 면접 답변의 근거가 됩니다. 그래서 답변은 스스로 작성하셔야 합니다.',
  '기록이 쌓일수록 활용 범위가 넓어집니다. 지금 남긴 한 줄이 나중의 소재가 됩니다.',
  '일기 본문은 서버로 전송되지 않고 이 기기에만 남습니다. 날짜와 선택한 태그만 서버에 저장됩니다.',
];

// 활동 내용의 외부 AI 전송 고지(Requirement 17.1). 2문장 이하.
const AI_TRANSMISSION_NOTICE =
  '심화 질문·태그 부여를 위해 활동 기록 내용이 외부 AI로 전송됩니다. 일기 본문은 전송되지 않습니다.';

/**
 * @param {HTMLElement} root
 * @param {() => void} onDismiss 안내를 닫았을 때 호출(다음 화면으로 이동).
 */
export function renderOnboarding(root, onDismiss) {
  const items = NOTICES.map((t) => `<li class="notice-list__item">${t}</li>`).join('');

  root.innerHTML = `
    <section class="card">
      <h1>시작하기 전에</h1>
      <ul class="notice-list">${items}</ul>
      <p class="notice">${AI_TRANSMISSION_NOTICE}</p>
      <p class="muted">예시 활동 2개를 미리 넣어 두었습니다. 필요 없으면 삭제하셔도 됩니다.</p>
      <button class="form__button" id="onboarding-dismiss" type="button">확인하고 시작</button>
    </section>
  `;

  root.querySelector('#onboarding-dismiss').addEventListener('click', () => {
    onDismiss();
  });
}
