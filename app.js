const state = {
  entries: [],
  queue: [],
  currentIndex: 0,
  correctCount: 0,
  currentEntry: null,
  previewUrls: [],
  canRetry: false,
  isProcessing: false,
};

const accessConfig = window.ACCESS_CONFIG || { enabled: false, codes: [] };
const localBypassHosts = new Set(["", "localhost", "127.0.0.1"]);

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
}

const appShell = document.getElementById("app-shell");
const accessGate = document.getElementById("access-gate");
const accessCodeInput = document.getElementById("access-code-input");
const accessCodeButton = document.getElementById("access-code-button");
const accessMessage = document.getElementById("access-message");

const imageInput = document.getElementById("image-input");
const pasteInput = document.getElementById("paste-input");
const processButton = document.getElementById("process-button");
const startQuizButton = document.getElementById("start-quiz-button");
const toggleWordlistButton = document.getElementById("toggle-wordlist-button");
const resultWordlistButton = document.getElementById("result-wordlist-button");
const retryButton = document.getElementById("retry-button");
const previewGrid = document.getElementById("preview-grid");
const ocrStatus = document.getElementById("ocr-status");
const uploadHelper = document.getElementById("upload-helper");
const ocrDetail = document.getElementById("ocr-detail");
const quizPanel = document.getElementById("quiz-panel");
const resultPanel = document.getElementById("result-panel");
const wordlistPanel = document.getElementById("wordlist-panel");
const wordCount = document.getElementById("word-count");
const meaningText = document.getElementById("meaning-text");
const answerForm = document.getElementById("answer-form");
const answerInput = document.getElementById("answer-input");
const submitAnswerButton = document.getElementById("submit-answer-button");
const feedbackBox = document.getElementById("feedback-box");
const quizProgress = document.getElementById("quiz-progress");
const scoreLine = document.getElementById("score-line");
const resultSummary = document.getElementById("result-summary");
const wordList = document.getElementById("word-list");

bindEvents();
initializeAccessControl();
renderWordList();
updateProcessAvailability();
syncEntryControls();

function bindEvents() {
  imageInput.addEventListener("change", handleFileSelection);
  pasteInput.addEventListener("input", handlePasteChange);
  processButton.addEventListener("click", processSelectedSources);
  startQuizButton.addEventListener("click", startQuiz);
  toggleWordlistButton.addEventListener("click", toggleWordList);
  resultWordlistButton.addEventListener("click", toggleWordList);
  retryButton.addEventListener("click", restartQuiz);
  answerForm.addEventListener("submit", submitAnswer);
  accessCodeButton.addEventListener("click", submitAccessCode);
  accessCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAccessCode();
    }
  });
}

function initializeAccessControl() {
  const bypassAccess = location.protocol === "file:" || localBypassHosts.has(location.hostname);
  const codes = Array.isArray(accessConfig.codes) ? accessConfig.codes : [];

  if (!accessConfig.enabled || bypassAccess || codes.length === 0) {
    unlockApp();
    if (bypassAccess) {
      accessMessage.textContent = "로컬 실행에서는 초대 코드 입력 없이 바로 사용할 수 있습니다.";
    }
    return;
  }

  const storedCode = localStorage.getItem("word-quiz-access-code") || "";
  const inviteCode = new URLSearchParams(window.location.search).get("invite") || "";
  const initialCode = inviteCode || storedCode;

  if (isValidAccessCode(initialCode)) {
    grantAccess(initialCode);
    return;
  }

  accessGate.classList.remove("hidden");
  appShell.classList.add("hidden");
  accessMessage.textContent = "초대받은 사용자만 입장할 수 있습니다. 전달받은 코드 또는 링크를 사용해 주세요.";
}

function submitAccessCode() {
  const code = accessCodeInput.value.trim();
  if (!isValidAccessCode(code)) {
    accessMessage.textContent = "초대 코드가 맞지 않습니다. 공유받은 코드나 링크를 다시 확인해 주세요.";
    return;
  }

  grantAccess(code);
}

function isValidAccessCode(code) {
  if (!code) {
    return false;
  }

  const codes = Array.isArray(accessConfig.codes) ? accessConfig.codes : [];
  return codes.includes(code.trim());
}

function grantAccess(code) {
  localStorage.setItem("word-quiz-access-code", code);
  accessCodeInput.value = code;
  accessMessage.textContent = "접근이 승인되었습니다. 같은 기기에서는 다시 입력하지 않아도 됩니다.";
  unlockApp();
}

function unlockApp() {
  accessGate.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function handleFileSelection() {
  renderSelectedFiles(Array.from(imageInput.files || []));
  invalidateExtractedEntries();
  ocrStatus.textContent = hasAnySource() ? "입력 준비" : "입력 대기";
  uploadHelper.textContent = hasAnySource()
    ? "파일이나 붙여넣기 내용을 확인했습니다. 단어 추출하기를 눌러 분석해 주세요."
    : "이미지, PDF, Excel, Word 파일을 선택하거나 아래에 텍스트를 붙여넣어 주세요.";
  ocrDetail.textContent = "";
  updateProcessAvailability();
}

function handlePasteChange() {
  invalidateExtractedEntries();
  ocrStatus.textContent = hasAnySource() ? "입력 준비" : "입력 대기";
  uploadHelper.textContent = hasAnySource()
    ? "파일이나 붙여넣기 내용을 확인했습니다. 단어 추출하기를 눌러 분석해 주세요."
    : "이미지, PDF, Excel, Word 파일을 선택하거나 아래에 텍스트를 붙여넣어 주세요.";
  ocrDetail.textContent = "";
  updateProcessAvailability();
}

function renderSelectedFiles(files) {
  clearPreviewUrls();
  previewGrid.innerHTML = "";

  files.forEach((file) => {
    const extension = getFileExtension(file.name).toUpperCase() || "FILE";
    const card = document.createElement("article");
    card.className = "preview-card";

    if (isImageFile(file)) {
      const url = URL.createObjectURL(file);
      state.previewUrls.push(url);
      card.innerHTML = `
        <img src="${url}" alt="${escapeHtml(file.name)}">
        <p>${escapeHtml(file.name)}</p>
      `;
    } else {
      card.innerHTML = `
        <div class="preview-file">
          <span class="preview-file-badge">${escapeHtml(extension)}</span>
        </div>
        <p>${escapeHtml(file.name)}</p>
      `;
    }

    previewGrid.appendChild(card);
  });
}

async function processSelectedSources() {
  const files = Array.from(imageInput.files || []);
  const pastedText = pasteInput.value.trim();

  if (!files.length && !pastedText) {
    return;
  }

  invalidateExtractedEntries();
  setProcessingState(true);
  ocrStatus.textContent = "추출 진행 중";
  uploadHelper.textContent = "문서 텍스트를 읽고, 필요한 경우 OCR까지 적용하고 있습니다.";
  ocrDetail.textContent = "PDF, Excel, Word는 가능한 한 원문 텍스트를 직접 읽고, 이미지와 스캔 문서는 OCR로 보완합니다.";

  try {
    const collectedEntries = [];
    const summaries = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      ocrStatus.textContent = `${index + 1} / ${files.length} 파일 처리`;
      const result = await extractEntriesFromFile(file);
      collectedEntries.push(...result.entries);
      summaries.push(`${file.name} ${result.entries.length}개`);
    }

    if (pastedText) {
      const pastedEntries = extractEntriesFromDelimitedText(pastedText);
      collectedEntries.push(...pastedEntries);
      summaries.push(`붙여넣기 ${pastedEntries.length}개`);
    }

    state.entries = dedupeEntries(collectedEntries);
    renderWordList();

    if (state.entries.length === 0) {
      ocrStatus.textContent = "추출 실패";
      uploadHelper.textContent = "단어를 찾지 못했습니다. `단어: 뜻` 줄 형식인지 확인해 주세요.";
      ocrDetail.textContent = "이미지라면 선명도를 높이고, 문서라면 실제 텍스트가 포함된 PDF/Word/Excel 파일을 사용하는 것이 가장 정확합니다.";
      feedbackBox.textContent = "추출된 단어가 없습니다.";
      feedbackBox.className = "feedback-box error";
      return;
    }

    ocrStatus.textContent = `${state.entries.length}개 단어 추출`;
    uploadHelper.textContent = "단어 추출이 완료되었습니다. 목록을 검토하거나 바로 퀴즈를 시작할 수 있습니다.";
    ocrDetail.textContent = summaries.join(" | ");
    feedbackBox.textContent = "단어 추출 완료. 필요하면 목록에서 삭제한 뒤 퀴즈를 시작해 주세요.";
    feedbackBox.className = "feedback-box";
    syncEntryControls();
  } catch (error) {
    console.error(error);
    ocrStatus.textContent = "오류 발생";
    uploadHelper.textContent = "입력 내용을 처리하는 중 문제가 생겼습니다.";
    ocrDetail.textContent = formatErrorMessage(error);
    feedbackBox.textContent = "단어 추출 중 오류가 발생했습니다.";
    feedbackBox.className = "feedback-box error";
  } finally {
    setProcessingState(false);
  }
}

async function extractEntriesFromFile(file) {
  const extension = getFileExtension(file.name);

  if (isImageFile(file)) {
    return extractEntriesFromImageFile(file);
  }

  switch (extension) {
    case "pdf":
      return extractEntriesFromPdfFile(file);
    case "xlsx":
    case "xls":
    case "csv":
      return extractEntriesFromSpreadsheetFile(file);
    case "docx":
      return extractEntriesFromWordFile(file);
    case "doc":
      throw new Error("DOC 형식은 브라우저에서 정확한 추출이 어려워 DOCX로 저장한 뒤 업로드하는 것을 권장합니다.");
    default:
      throw new Error(`${file.name}: 지원하지 않는 파일 형식입니다.`);
  }
}

async function extractEntriesFromImageFile(file) {
  if (!window.Tesseract) {
    throw new Error("OCR 라이브러리를 불러오지 못했습니다.");
  }

  const preparedSource = await prepareImageForOCR(file);
  const { text, label } = await recognizeTextWithFallback(file.name, preparedSource);
  return {
    entries: extractEntriesFromDelimitedText(text),
    label,
  };
}

async function extractEntriesFromPdfFile(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF 라이브러리를 불러오지 못했습니다.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const entries = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const directText = await extractTextFromPdfPage(page);
    let pageEntries = extractEntriesFromDelimitedText(directText);

    if (pageEntries.length < 2) {
      const pageImage = await renderPdfPageToImage(page);
      const preparedPageImage = await prepareImageForOCR(pageImage);
      const { text } = await recognizeTextWithFallback(`${file.name} ${pageNumber}페이지`, preparedPageImage);
      const ocrEntries = extractEntriesFromDelimitedText(text);
      pageEntries = dedupeEntries([...pageEntries, ...ocrEntries]);
    }

    entries.push(...pageEntries);
    ocrDetail.textContent = `${file.name}: ${pageNumber}/${pdf.numPages} 페이지 처리 완료`;
  }

  return {
    entries: dedupeEntries(entries),
    label: "PDF",
  };
}

async function extractEntriesFromSpreadsheetFile(file) {
  if (!window.XLSX) {
    throw new Error("Excel 라이브러리를 불러오지 못했습니다.");
  }

  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  const entries = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
      defval: "",
    });

    rows.forEach((row) => {
      const cells = row.map((cell) => String(cell).trim()).filter(Boolean);
      if (!cells.length) {
        return;
      }

      if (cells.length >= 2) {
        const entry = createEntry(cells[0], cells.slice(1).join(" "));
        if (entry) {
          entries.push(entry);
        }
        return;
      }

      entries.push(...extractEntriesFromDelimitedText(cells[0]));
    });
  });

  return {
    entries: dedupeEntries(entries),
    label: "Excel",
  };
}

async function extractEntriesFromWordFile(file) {
  if (!window.mammoth) {
    throw new Error("Word 라이브러리를 불러오지 못했습니다.");
  }

  const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return {
    entries: extractEntriesFromDelimitedText(result.value),
    label: "Word",
  };
}

async function recognizeTextWithFallback(sourceLabel, source) {
  const attempts = [
    {
      language: "eng+kor",
      label: "영어+한글",
      config: {
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: "6",
        user_defined_dpi: "300",
      },
    },
    {
      language: "eng",
      label: "영어",
      config: {
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: "6",
        user_defined_dpi: "300",
      },
    },
    {
      language: "eng+kor",
      label: "영어+한글 보조",
      config: {
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: "11",
        user_defined_dpi: "300",
      },
    },
  ];
  const failures = [];

  for (const attempt of attempts) {
    try {
      const result = await window.Tesseract.recognize(source, attempt.language, {
        ...attempt.config,
        logger: ({ status, progress }) => {
          if (status && typeof progress === "number") {
            const percent = Math.round(progress * 100);
            ocrDetail.textContent = `${sourceLabel}: ${attempt.label} 인식 중 (${percent}%)`;
          }
        },
      });

      return {
        text: result.data?.text || "",
        label: attempt.label,
      };
    } catch (error) {
      failures.push(`${attempt.label} 실패: ${formatErrorMessage(error)}`);
    }
  }

  throw new Error(failures.join(" | "));
}

async function extractTextFromPdfPage(page) {
  const textContent = await page.getTextContent();
  let text = "";

  textContent.items.forEach((item) => {
    const value = String(item.str || "");
    if (!value) {
      return;
    }

    text += value;
    text += item.hasEOL ? "\n" : " ";
  });

  return text;
}

async function renderPdfPageToImage(page) {
  const viewport = page.getViewport({ scale: 2.6 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  if (!context) {
    throw new Error("PDF 페이지를 렌더링하지 못했습니다.");
  }

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  return canvas.toDataURL("image/png");
}

function extractEntriesFromDelimitedText(rawText) {
  const normalizedText = normalizeExtractableText(rawText);
  if (!normalizedText) {
    return [];
  }

  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const entries = [];
  let currentWord = "";
  let currentMeaning = "";

  const commitEntry = () => {
    const entry = createEntry(currentWord, currentMeaning);
    if (entry) {
      entries.push(entry);
    }
    currentWord = "";
    currentMeaning = "";
  };

  lines.forEach((line) => {
    const delimiterIndex = line.indexOf(":");

    if (delimiterIndex !== -1) {
      commitEntry();
      currentWord = line.slice(0, delimiterIndex);
      currentMeaning = line.slice(delimiterIndex + 1);
      return;
    }

    if (currentWord) {
      currentMeaning = `${currentMeaning} ${line}`.trim();
    }
  });

  commitEntry();

  if (entries.length > 0) {
    return dedupeEntries(entries);
  }

  return dedupeEntries(extractEntriesFromInlineText(normalizedText));
}

function extractEntriesFromInlineText(text) {
  const compact = text.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!compact.includes(":")) {
    return [];
  }

  return compact
    .split(/ (?=[^:]{1,100}: )/g)
    .map((segment) => {
      const delimiterIndex = segment.indexOf(":");
      if (delimiterIndex === -1) {
        return null;
      }

      return createEntry(
        segment.slice(0, delimiterIndex),
        segment.slice(delimiterIndex + 1),
      );
    })
    .filter(Boolean);
}

function createEntry(rawWord, rawMeaning) {
  const word = cleanWordPart(rawWord);
  const meaning = cleanMeaningPart(rawMeaning);

  if (!word || !meaning) {
    return null;
  }

  return { word, meaning };
}

function normalizeExtractableText(rawText) {
  return String(rawText || "")
    .replace(/\r/g, "\n")
    .replace(/[：﹕]/g, ":")
    .replace(/\u00a0/g, " ")
    .replace(/[|¦]/g, " ")
    .replace(/\t+/g, " ")
    .replace(/(^|\n)\s*([^:\n]{1,160})\s*[;；]\s*/g, "$1$2: ")
    .replace(/([^\n:]{1,160})\s*\n\s*:/g, "$1: ")
    .replace(/:\s*\n\s*/g, ": ")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ ]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function cleanWordPart(rawWord) {
  return String(rawWord || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/^[\s\-*•\d.)]+/, "")
    .replace(/[;,.]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanMeaningPart(rawMeaning) {
  return String(rawMeaning || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,.·-]+/, "")
    .trim();
}

function dedupeEntries(entries) {
  const unique = new Map();

  entries.forEach((entry) => {
    if (!entry?.word || !entry?.meaning) {
      return;
    }

    const key = normalizeText(entry.word);
    if (!unique.has(key)) {
      unique.set(key, {
        word: entry.word.trim(),
        meaning: entry.meaning.trim(),
      });
    }
  });

  return [...unique.values()];
}

function startQuiz() {
  if (!state.entries.length) {
    return;
  }

  state.queue = shuffle([...state.entries]);
  state.currentIndex = 0;
  state.correctCount = 0;
  state.currentEntry = null;
  state.canRetry = false;
  resultPanel.classList.add("hidden");
  quizPanel.classList.remove("hidden");
  showWordListPanel(false);
  answerInput.disabled = false;
  submitAnswerButton.disabled = false;
  feedbackBox.textContent = "뜻을 보고 영어 단어를 입력해 주세요.";
  feedbackBox.className = "feedback-box";
  syncEntryControls();
  showCurrentQuestion();
}

function restartQuiz() {
  startQuiz();
}

function showCurrentQuestion() {
  if (state.currentIndex >= state.queue.length) {
    finishQuiz();
    return;
  }

  state.currentEntry = state.queue[state.currentIndex];
  meaningText.textContent = state.currentEntry.meaning;
  answerInput.value = "";
  answerInput.focus();
  quizProgress.textContent = `${state.currentIndex + 1} / ${state.queue.length}`;
}

function submitAnswer(event) {
  event.preventDefault();
  if (!state.currentEntry) {
    return;
  }

  const answerResult = evaluateUserAnswer(answerInput.value, state.currentEntry.word);

  if (answerResult.isCorrect) {
    state.correctCount += 1;
    feedbackBox.textContent = answerResult.note
      ? `정답입니다. ${state.currentEntry.word}\n오타: ${answerResult.note}`
      : `정답입니다. ${state.currentEntry.word}`;
    feedbackBox.className = "feedback-box success";
  } else {
    feedbackBox.textContent = `오답입니다. 정답은 ${state.currentEntry.word} 입니다.`;
    feedbackBox.className = "feedback-box error";
  }

  moveToNextQuestion();
}

function moveToNextQuestion() {
  answerInput.disabled = true;
  submitAnswerButton.disabled = true;
  state.currentIndex += 1;

  window.setTimeout(() => {
    answerInput.disabled = false;
    submitAnswerButton.disabled = false;
    showCurrentQuestion();
  }, 1000);
}

function finishQuiz() {
  state.currentEntry = null;
  state.canRetry = true;
  answerInput.disabled = true;
  submitAnswerButton.disabled = true;
  quizProgress.textContent = `${state.queue.length} / ${state.queue.length}`;
  resultPanel.classList.remove("hidden");
  scoreLine.textContent = `${state.queue.length}문제 중 ${state.correctCount}문제 정답`;
  resultSummary.textContent = `정답률 ${Math.round((state.correctCount / state.queue.length) * 100)}%입니다. 재시험 보기로 다시 반복할 수 있습니다.`;
  feedbackBox.textContent = "퀴즈가 끝났습니다. 결과를 확인하고 다시 도전해 보세요.";
  feedbackBox.className = "feedback-box";
  syncEntryControls();
}

function renderWordList() {
  wordList.innerHTML = "";
  wordCount.textContent = `${state.entries.length}개`;

  state.entries.forEach((entry, index) => {
    const item = document.createElement("article");
    item.className = "word-item";
    item.innerHTML = `
      <div class="word-text">
        <button type="button" class="word-button">${escapeHtml(entry.word)}</button>
        <span>${escapeHtml(entry.meaning)}</span>
      </div>
      <div class="word-actions">
        <button type="button" class="listen-button">단어 듣기</button>
        <button type="button" class="delete-button">삭제</button>
      </div>
    `;

    item.querySelector(".word-button").addEventListener("click", () => speakWord(entry.word));
    item.querySelector(".listen-button").addEventListener("click", () => speakWord(entry.word));
    item.querySelector(".delete-button").addEventListener("click", () => deleteEntry(index));
    wordList.appendChild(item);
  });
}

function deleteEntry(index) {
  const removedEntry = state.entries[index];
  if (!removedEntry) {
    return;
  }

  state.entries = state.entries.filter((_, entryIndex) => entryIndex !== index);
  renderWordList();

  if (state.entries.length === 0) {
    state.canRetry = false;
    showWordListPanel(false);
    quizPanel.classList.add("hidden");
    resultPanel.classList.add("hidden");
    ocrStatus.textContent = "단어 없음";
    uploadHelper.textContent = "남아 있는 단어가 없습니다. 다른 파일이나 텍스트를 다시 추출해 주세요.";
    ocrDetail.textContent = "목록에서 모든 단어가 삭제되어 퀴즈가 비활성화되었습니다.";
    feedbackBox.textContent = "모든 단어가 삭제되었습니다.";
    feedbackBox.className = "feedback-box";
    syncEntryControls();
    updateProcessAvailability();
    return;
  }

  ocrStatus.textContent = `${state.entries.length}개 단어 추출`;
  ocrDetail.textContent = `${removedEntry.word} 단어를 삭제했습니다. 남은 단어는 ${state.entries.length}개입니다.`;
  feedbackBox.textContent = `${removedEntry.word} 단어를 목록과 퀴즈에서 삭제했습니다.`;
  feedbackBox.className = "feedback-box";
  syncEntryControls();
}

function syncEntryControls() {
  const hasEntries = state.entries.length > 0;
  startQuizButton.disabled = state.isProcessing || !hasEntries;
  toggleWordlistButton.disabled = state.isProcessing || !hasEntries;
  resultWordlistButton.disabled = state.isProcessing || !hasEntries;
  retryButton.disabled = state.isProcessing || !state.canRetry || !hasEntries;
}

function updateProcessAvailability() {
  processButton.disabled = state.isProcessing || !hasAnySource();
}

function hasAnySource() {
  return Array.from(imageInput.files || []).length > 0 || pasteInput.value.trim().length > 0;
}

function setProcessingState(isProcessing) {
  state.isProcessing = isProcessing;
  imageInput.disabled = isProcessing;
  pasteInput.disabled = isProcessing;
  updateProcessAvailability();
  syncEntryControls();
}

function invalidateExtractedEntries() {
  state.entries = [];
  state.queue = [];
  state.currentIndex = 0;
  state.correctCount = 0;
  state.currentEntry = null;
  state.canRetry = false;
  renderWordList();
  quizPanel.classList.add("hidden");
  resultPanel.classList.add("hidden");
  showWordListPanel(false);
  quizProgress.textContent = "0 / 0";
  meaningText.textContent = "퀴즈를 시작하면 뜻이 여기에 표시됩니다.";
  scoreLine.textContent = "0문제 중 0문제 정답";
  resultSummary.textContent = "문제를 모두 풀면 결과가 여기에 표시됩니다.";
  syncEntryControls();
}

function toggleWordList() {
  showWordListPanel(wordlistPanel.classList.contains("hidden"));
}

function showWordListPanel(forceVisible = true) {
  if (forceVisible && state.entries.length) {
    wordlistPanel.classList.remove("hidden");
    toggleWordlistButton.textContent = "단어 목록 숨기기";
    resultWordlistButton.textContent = "단어 목록 숨기기";
    wordlistPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  wordlistPanel.classList.add("hidden");
  toggleWordlistButton.textContent = "단어 확인하기";
  resultWordlistButton.textContent = "단어 확인하기";
}

function speakWord(word) {
  if (!window.speechSynthesis) {
    feedbackBox.textContent = "이 브라우저에서는 음성 재생을 지원하지 않습니다.";
    feedbackBox.className = "feedback-box error";
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

async function prepareImageForOCR(input) {
  try {
    const source = typeof input === "string" ? input : await readFileAsDataUrl(input);
    const image = await loadImage(source);
    const targetWidth = Math.max(2200, image.width * 2);
    const scale = targetWidth / image.width;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return input;
    }

    context.filter = "grayscale(1) contrast(1.62) brightness(1.08)";
    context.drawImage(image, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    const { data } = imageData;

    for (let index = 0; index < data.length; index += 4) {
      const average = (data[index] + data[index + 1] + data[index + 2]) / 3;
      const adjusted = average > 198 ? 255 : average < 78 ? 0 : average;
      data[index] = adjusted;
      data[index + 1] = adjusted;
      data[index + 2] = adjusted;
    }

    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.warn("이미지 전처리에 실패했습니다.", error);
    return input;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = source;
  });
}

function clearPreviewUrls() {
  state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  state.previewUrls = [];
}

function getFileExtension(fileName) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function isImageFile(file) {
  return file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp"].includes(getFileExtension(file.name));
}

function normalizeText(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCompactText(text) {
  return normalizeText(text).replace(/\s+/g, "");
}

function evaluateUserAnswer(userInput, correctAnswer) {
  const normalizedUser = normalizeText(userInput);
  const normalizedCorrect = normalizeText(correctAnswer);

  if (!normalizedUser) {
    return { isCorrect: false, note: "" };
  }

  if (normalizedUser === normalizedCorrect) {
    return { isCorrect: true, note: "" };
  }

  const compactUser = normalizeCompactText(userInput);
  const compactCorrect = normalizeCompactText(correctAnswer);

  if (compactUser === compactCorrect) {
    return {
      isCorrect: true,
      note: `띄어쓰기를 "${String(userInput).trim()}" 대신 "${correctAnswer}"로 쓰는 것이 더 정확합니다.`,
    };
  }

  if (isWithinSingleEdit(compactUser, compactCorrect)) {
    return {
      isCorrect: true,
      note: `"${String(userInput).trim()}" 대신 "${correctAnswer}"로 쓰는 것이 더 정확합니다.`,
    };
  }

  return { isCorrect: false, note: "" };
}

function isWithinSingleEdit(source, target) {
  if (source === target) {
    return true;
  }

  const sourceLength = source.length;
  const targetLength = target.length;

  if (Math.abs(sourceLength - targetLength) > 1) {
    return false;
  }

  if (sourceLength === targetLength) {
    let mismatches = 0;
    for (let index = 0; index < sourceLength; index += 1) {
      if (source[index] !== target[index]) {
        mismatches += 1;
        if (mismatches > 1) {
          return false;
        }
      }
    }
    return mismatches === 1;
  }

  const shorter = sourceLength < targetLength ? source : target;
  const longer = sourceLength < targetLength ? target : source;
  let shortIndex = 0;
  let longIndex = 0;
  let mismatchUsed = false;

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }

    if (mismatchUsed) {
      return false;
    }

    mismatchUsed = true;
    longIndex += 1;
  }

  return true;
}

function shuffle(list) {
  const copiedList = [...list];
  for (let index = copiedList.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copiedList[index], copiedList[swapIndex]] = [copiedList[swapIndex], copiedList[index]];
  }
  return copiedList;
}

function formatErrorMessage(error) {
  if (!error) {
    return "알 수 없는 오류가 발생했습니다.";
  }

  const message = typeof error === "string" ? error : error.message;
  if (!message) {
    return "알 수 없는 오류가 발생했습니다.";
  }

  return message.replace(/\s+/g, " ").trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
