import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("lets students use a read-only interactive PPT while keeping full-screen avatars teacher-only", async () => {
  const [chat, studentDashboard, studentPage, studentWorkspace, teacherDashboard, liveAvatarApi, localAvatarApi, presentationApi, presentationFileApi, translationApi, explanationApi, localAvatarLayout, liveAvatarLayout] = await Promise.all([
    source("components/chat-workspace.tsx"),
    source("components/classroom/student-dashboard.tsx"),
    source("app/student/presentation/page.tsx"),
    source("components/presentation/student-presentation-workspace.tsx"),
    source("components/classroom/teacher-dashboard.tsx"),
    source("app/api/liveavatar/session/route.ts"),
    source("app/api/avatar/local/stream/route.ts"),
    source("app/api/presentation/route.ts"),
    source("app/api/presentation/file/route.ts"),
    source("app/api/presentation/translate/route.ts"),
    source("app/api/presentation/explain/route.ts"),
    source("app/avatar-2-5d/layout.tsx"),
    source("app/liveavatar-setup/layout.tsx"),
  ]);

  assert.doesNotMatch(chat, /FullscreenLocalDigitalTeacher|StudentPresentationWorkspace/u);
  assert.match(chat, /KeyAnalysisWorkspace/u);
  assert.match(chat, /PPT重点解析/u);
  assert.match(studentDashboard, /\/student\/presentation/u);
  assert.doesNotMatch(studentDashboard, /\?avatar=1|开启全屏AI数字教师/u);
  assert.match(studentPage, /StudentPresentationWorkspace/u);
  assert.match(studentWorkspace, /测绘原理与专业说明|右侧翻译/u);
  assert.doesNotMatch(studentWorkspace, /FullscreenLocalDigitalTeacher|presentationLecture|全屏AI教师讲解/u);
  assert.match(teacherDashboard, /FullscreenLocalDigitalTeacher/u);
  assert.match(teacherDashboard, /TeacherPresentationPanel/u);
  assert.match(liveAvatarApi, /user\.role !== "teacher"/u);
  assert.match(liveAvatarApi, /TEACHER_ONLY/u);
  for (const endpoint of [localAvatarApi, explanationApi]) {
    assert.match(endpoint, /requireRequestRole\(request, "teacher"\)/u);
  }
  assert.match(presentationApi, /currentRequestUser/u);
  assert.match(presentationApi, /requireRequestRole\(request, "teacher"\)/u);
  for (const endpoint of [presentationFileApi, translationApi]) assert.match(endpoint, /currentRequestUser/u);
  for (const layout of [localAvatarLayout, liveAvatarLayout]) {
    assert.match(layout, /user\.role !== "teacher"/u);
    assert.match(layout, /redirect\("\/student"\)/u);
  }
});

test("builds a sanitized PPT analysis catalog with underlined sentences and surveying meanings", async () => {
  const [analysisSource, detailSource, catalogApi, storeSource] = await Promise.all([
    source("lib/step14/presentation-analysis.mjs"),
    source("lib/step14/key-analysis.mjs"),
    source("app/api/key-analysis/route.ts"),
    source("lib/step11-7/presentation-store.mjs"),
  ]);

  assert.match(analysisSource, /rPr\b/u);
  assert.match(analysisSource, /defRPr\b/u);
  assert.match(analysisSource, /原始下划线格式/u);
  assert.match(detailSource, /测绘行业译法/u);
  assert.match(detailSource, /其他学术语境/u);
  assert.match(detailSource, /日常生活语境/u);
  assert.match(catalogApi, /currentRequestUser/u);
  assert.doesNotMatch(catalogApi, /objectKey/u);
  assert.match(storeSource, /listPresentationCatalog/u);
  assert.doesNotMatch(storeSource, /DELETE FROM presentations/u);
});

test("recognizes a real PowerPoint underline and a surveying term", () => {
  const script = String.raw`
    import { strToU8, zipSync } from "fflate";
    import { analyzePresentationDeck } from "./lib/step14/presentation-analysis.mjs";
    const slide = '<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:rPr u="sng"/><a:t>The total station measures angles.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
    const pptx = zipSync({
      "ppt/presentation.xml": strToU8("<p:presentation/>") ,
      "ppt/slides/slide1.xml": strToU8(slide),
    });
    const result = analyzePresentationDeck(pptx);
    if (result.underlineCount !== 1) throw new Error("underline count: " + result.underlineCount);
    const term = result.terms.find((item) => item.term.toLowerCase() === "total station");
    if (!term || term.surveyingTranslation !== "全站仪") throw new Error("surveying term not found");
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "--eval", script], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("automatically marks recognized PPT terms in orange and orange-red for both roles", async () => {
  const [studentWorkspace, teacherWorkspace, teacherPanel, highlightApi, highlighter, globalCss] = await Promise.all([
    source("components/presentation/student-presentation-workspace.tsx"),
    source("components/presentation/teacher-presentation-workspace.tsx"),
    source("components/presentation/teacher-presentation-panel.tsx"),
    source("app/api/presentation/highlights/route.ts"),
    source("lib/step14-2/presentation-term-highlighter.ts"),
    source("app/globals.css"),
  ]);

  for (const workspace of [studentWorkspace, teacherWorkspace]) {
    assert.match(workspace, /applyProfessionalTermHighlights/u);
    assert.match(workspace, /\/api\/presentation\/highlights/u);
    assert.match(workspace, /橙色\/橙红色/u);
  }
  assert.match(teacherPanel, /正在逐份上传/u);
  assert.match(highlightApi, /currentRequestUser/u);
  assert.match(highlightApi, /readPresentationAnalysis/u);
  assert.match(highlightApi, /presentation\.isCurrent/u);
  assert.doesNotMatch(highlightApi, /objectKey/u);
  assert.match(highlighter, /CSS\.highlights/u);
  assert.match(highlighter, /new Highlight/u);
  assert.match(highlighter, /data-surveying-term-highlight/u);
  assert.match(highlighter, /::highlight\(\$\{HIGHLIGHT_ORANGE\}\)/u);
  assert.match(highlighter, /::highlight\(\$\{HIGHLIGHT_ORANGE_RED\}\)/u);
  assert.match(globalCss, /mark\[data-surveying-term-highlight\]/u);
});

test("accepts only valid docx homework and adds teacher-controlled AI grading", async () => {
  const [database, store, autoGrader, route, teacherPanel, studentPanel] = await Promise.all([
    source("lib/mainland/base-schema.json"),
    source("lib/step14/assignment-store.mjs"),
    source("lib/step14-1/docx-auto-grading.mjs"),
    source("app/api/submissions/[id]/auto-grade/route.ts"),
    source("components/assignments/teacher-assignment-panel.tsx"),
    source("components/assignments/student-assignment-panel.tsx"),
  ]);

  assert.match(database, /CREATE TABLE IF NOT EXISTS assignments/u);
  assert.match(database, /CREATE TABLE IF NOT EXISTS assignment_submissions/u);
  assert.match(database, /max_score=100/u);
  assert.match(database, /score >= 0 AND score <= 100/u);
  assert.match(store, /20 \* 1024 \* 1024/u);
  assert.match(store, /word\/document\.xml/u);
  assert.match(store, /只支持Word的\.docx格式/u);
  assert.match(store, /value < 0 \|\| value > 100/u);
  assert.match(store, /autoGradeSubmission/u);
  assert.match(autoGrader, /extractDocxText/u);
  assert.match(autoGrader, /completeMessages/u);
  assert.match(autoGrader, /专业内容与任务完成度/u);
  assert.match(autoGrader, /【AI自动批改｜请教师复核】/u);
  assert.match(route, /requireRequestRole\(request, "teacher"\)/u);
  assert.match(teacherPanel, /作业发布与AI自动批改/u);
  assert.match(teacherPanel, /AI批改全部待批/u);
  assert.match(teacherPanel, /保存教师复核/u);
  assert.match(studentPanel, /课程作业与AI批改反馈/u);
  assert.match(studentPanel, /重新提交并覆盖旧版/u);
});

test("extracts editable English and Chinese text from a Word submission", () => {
  const script = String.raw`
    import { strToU8, zipSync } from "fflate";
    import { extractDocxText } from "./lib/step14-1/docx-auto-grading.mjs";
    const document = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="w"><w:body><w:p><w:r><w:t>The total station measures horizontal angles.</w:t></w:r></w:p><w:p><w:r><w:t>全站仪用于角度与距离观测。</w:t></w:r></w:p></w:body></w:document>';
    const docx = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8(document) });
    const text = extractDocxText(docx);
    if (!text.includes("total station") || !text.includes("全站仪")) throw new Error("editable Word text not extracted: " + text);
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "--eval", script], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
