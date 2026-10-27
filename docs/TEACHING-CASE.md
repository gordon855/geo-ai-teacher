# Teaching case: surveying vocabulary in a classroom presentation

This is an original demonstration lesson plan for GeoAI Teacher 21.7.0, not a
report of learning gains or a completed classroom trial. It uses fictional
accounts and operator-owned slides. The bundled demo bank is intentionally small.

## Purpose and learning objectives

Specialized language learning requires connecting English terms to measurement
tasks. Students should be able to identify a survey point, explain why repeated
measurements can differ, and distinguish precision from accuracy in their own
words. The teacher checks technical meaning as well as language.

## Suggested 15–20 minute demonstration

1. Teacher signs in to /teacher/login, completes the initial password change if
   required, and selects the demo class. Student uses a separate browser profile
   at /student/login, so the teacher's session is not replaced.
2. Teacher uploads a self-authored .pptx containing the sentences below and makes
   it the active presentation. Do not upload a publisher's deck without permission.
3. Student opens /student/presentation, identifies terms and moves between slides.
   The context panel can support explanation; real generated output requires an
   operator-configured provider. Teacher reviews every explanation before use.
4. Student practices the original demo term survey point and sentence translation
   using existing practice/assessment entry points. Exact generated questions vary.
   The original example answer is a starting point, not a universal grading rule.
5. Teacher checks the student's submitted reasoning, provides feedback and uses
   the existing grade/attendance/classroom-question tools where appropriate.
6. Student logs out and back in to inspect available practice records. Repeat
   with another fictional student to check isolation. Do not treat a temporary
   page state as saved notes or assume a separate context-translation history.

## Original slide text and discussion prompts

- A survey point identifies a location selected for measurement.
- Three repeated measurements can be close to each other while differing from
  a reference value.
- Explain how you would check the measurement procedure before accepting a result.

Prompt: Explain precision and accuracy using a fictional field example. Describe
one possible source of error and one check you would perform. No personal or
real site data is needed.

## Evidence and limits

Actual acceptance covered teacher/student login and first password changes,
student PPT display and page navigation, active-file replacement, real PostgreSQL
practice isolation and restart persistence, and teacher grade/attendance writes.
The full lesson sequence, learning outcomes, provider answer quality and every
assessment UI action have not been evaluated as an educational study.

Persistent free-form notes, browsing history and teacher batch password resets
are not completed features in this candidate. Avatar adapters remain optional;
no model weights or hardware validation is supplied. See TESTING.md and
VERSION-MAPPING.md for precise boundaries.

## 中文操作提示

使用教师和学生两个独立浏览器配置文件，避免相互覆盖登录 Cookie。
只用原创 PPT 和虚构账号演示“上传课件—学生查看—术语讨论—练习—教师反馈”。
API Key 不配置时，不承诺实时生成式翻译。案例是可执行的教学设计，不能写成
已经产生统计显著教学效果、已大规模采用或已完成所有设备验收。

