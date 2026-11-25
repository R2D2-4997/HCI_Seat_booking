// ============================================================
// Textes traduits FR / EN / KO
// Responsable : Personne 3
// ============================================================

// Dictionnaire trilingue (FR, EN, KO)
const I18N = {
  fr: {
    langName: "Français",
    code: "fr-FR",
    analyzing: "Analyse automatique du plan...",
    ready: "Session tactile activée.",
    aisle: "Couloir",
    occupied: "Siège indisponible",
    seat: "Siège",
    selected: "sélectionné. Pour valider et passer à l'étape suivante, maintenez RP deux secondes, ou appuyez sur P.",
    selectedState: "sélectionné",
    payment: "Siège validé, passage à l'étape suivante.",
    noPayment: "Bouton de validation non trouvé.",
    errBackend: "Erreur : Moteur Python non démarré.",
    errCapture: "Erreur lors de la capture d'écran.",
    partInfo: (part, total) => `Partie ${part} sur ${total}. `,
    allTaken: "Tous les sièges de cette partie sont pris, passez à une autre partie. ",
    planeStart: "Vous êtes déjà au début de l'avion.",
    planeEnd: "Vous êtes déjà à la fin de l'avion.",
    noSelection: "Aucun siège sélectionné.",
    selectionCancelled: (id) => `Sélection du siège ${id} annulée.`
  },
  en: {
    langName: "English",
    code: "en-US",
    analyzing: "Automatic seatmap analysis...",
    ready: "Tactile session activated.",
    aisle: "Aisle",
    occupied: "Seat unavailable",
    seat: "Seat",
    selected: "selected. To confirm and continue, hold RP for two seconds, or press P.",
    selectedState: "selected",
    payment: "Seat confirmed, moving to the next step.",
    noPayment: "Continue button not found.",
    errBackend: "Error: Python engine not running.",
    errCapture: "Screenshot capture error.",
    partInfo: (part, total) => `Part ${part} of ${total}. `,
    allTaken: "All seats in this part are taken, go to another part. ",
    planeStart: "You are already at the front of the plane.",
    planeEnd: "You are already at the back of the plane.",
    noSelection: "No seat selected.",
    selectionCancelled: (id) => `Seat ${id} selection cancelled.`
  },
  ko: {
    langName: "한국어",
    code: "ko-KR",
    analyzing: "좌석 배치도 자동 분석 중...",
    ready: "터치 세션이 활성화되었습니다.",
    aisle: "통로",
    occupied: "선택 불가 좌석",
    seat: "좌석",
    selected: "선택되었습니다. 확정하고 다음 단계로 넘어가려면 RP를 2초간 누르거나 P를 누르세요.",
    selectedState: "선택됨",
    payment: "좌석이 확정되었습니다. 다음 단계로 이동합니다.",
    noPayment: "다음 단계 버튼을 찾을 수 없습니다.",
    errBackend: "오류: 파이썬 엔진이 실행되지 않았습니다.",
    errCapture: "화면 캡처 오류입니다.",
    partInfo: (part, total) => `${total}개 구역 중 ${part}번째 구역. `,
    allTaken: "이 구역의 모든 좌석이 선택 불가입니다. 다른 구역으로 이동하세요. ",
    planeStart: "이미 비행기의 맨 앞입니다.",
    planeEnd: "이미 비행기의 맨 뒤입니다.",
    noSelection: "선택된 좌석이 없습니다.",
    selectionCancelled: (id) => `${id} 좌석 선택이 취소되었습니다.`
  }
};
