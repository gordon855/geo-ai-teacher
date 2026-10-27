import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("cold-call broadcast and fullscreen teacher implement a 60-second answer window", async () => {
  const [broadcast, fullscreen, route] = await Promise.all([
    readFile(new URL("lib/step11-8/cold-call-broadcast.mjs", root), "utf8"),
    readFile(new URL("components/avatar/fullscreen-local-digital-teacher.tsx", root), "utf8"),
    readFile(new URL("app/api/classroom/cold-call/route.ts", root), "utf8"),
  ]);
  assert.match(broadcast, /COLD_CALL_ANSWER_WINDOW_SECONDS\s*=\s*60/u);
  assert.match(fullscreen, /startColdCallAnswerWindow/u);
  assert.match(fullscreen, /completeColdCallAttempt/u);
  assert.match(route, /z\.literal\("evaluate"\)/u);
  assert.match(route, /z\.literal\("timeout"\)/u);
});

test("course-based correction has a deterministic fallback and timeout answer", () => {
  const program = `
    import { localColdCallEvaluation, timedOutColdCallEvaluation } from "./lib/step15/cold-call-evaluator.mjs";
    const local = localColdCallEvaluation({
      studentAnswer: "Accuracy means closeness to the true value.",
      standardAnswer: "Accuracy is the closeness of a measurement to the true value.",
      rubric: "accuracy definition",
      source: "Unit 1"
    });
    const timeout = timedOutColdCallEvaluation({ standardAnswer: "Standard answer", rubric: "rubric", source: "Unit 1" });
    console.log(JSON.stringify({ local, timeout }));
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "--eval", program], {
    cwd: new URL(".", root),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.local.teacherReviewRequired, true);
  assert.ok(payload.local.score > 0 && payload.local.score <= 10);
  assert.equal(payload.timeout.score, 0);
  assert.equal(payload.timeout.standardAnswer, "Standard answer");
  assert.match(payload.timeout.feedback, /建议回答时间/u);
});

test("anonymous barrage is role-gated, class-bound and absent from teacher payload identity", async () => {
  const [route, database, studentUi, teacherUi, chatUi] = await Promise.all([
    readFile(new URL("app/api/classroom/barrage/route.ts", root), "utf8"),
    readFile(new URL("lib/step8a/database.ts", root), "utf8"),
    readFile(new URL("components/classroom/student-dashboard.tsx", root), "utf8"),
    readFile(new URL("components/classroom/teacher-dashboard.tsx", root), "utf8"),
    readFile(new URL("components/chat-workspace.tsx", root), "utf8"),
  ]);
  assert.match(route, /user\.role !== "student"/u);
  assert.match(route, /requireRequestRole\(request, "teacher"\)/u);
  assert.match(await readFile(new URL("lib/mainland/base-schema.json",root),"utf8"), /CREATE TABLE IF NOT EXISTS classroom_barrage/u);
  assert.match(database, /当前账号不属于所选班级/u);
  assert.match(database, /anonymousLabel: "匿名学生"/u);
  assert.match(database, /发送太快，请5秒后再发下一条/u);
  assert.match(studentUi, /StudentBarragePanel/u);
  assert.match(teacherUi, /BarrageLiveDisplay/u);
  assert.match(chatUi, /BarrageLiveDisplay/u);
});

test("Chinese presentation and Word filenames use encoded metadata and RFC 5987 headers", async () => {
  const [storage, presentation, assignment] = await Promise.all([
    readFile(new URL("lib/mainland/storage.mjs", root), "utf8"),
    readFile(new URL("lib/step11-7/presentation-store.mjs", root), "utf8"),
    readFile(new URL("lib/step14/assignment-store.mjs", root), "utf8"),
  ]);
  assert.match(storage, /encodeURIComponent\(String\(metadataValue\)\)/u);
  assert.match(presentation, /filename\*=UTF-8''/u);
  assert.match(assignment, /filename\*=UTF-8''/u);
});
