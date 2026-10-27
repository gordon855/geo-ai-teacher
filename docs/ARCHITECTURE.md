# Architecture

The existing App Router application uses React 19 and TypeScript. Its Next.js
dependency was updated from 16.3.0 to 16.4.2 for security fixes during preparation.
`app/` owns pages and HTTP handlers; `components/` owns teacher, student, PPT,
translation, chat, avatar and training interfaces. `proxy.ts` provides request
handling policy. `instrumentation.ts` initializes the Node runtime.

`lib/step8a` implements users, classes, enrollment, sessions, attendance, grade
weights, roster import and initial teaching data. The shared base schema is
`lib/mainland/base-schema.json`. The PostgreSQL adapter translates the legacy
prepared-statement interface. `lib/step19` through `lib/step21-6` add versioned
tables for moderation, assessments, feedback, workstations, attendance and
anonymous messages. `lib/step21-7` combines the 21.7 definition question bank.
Startup runs base initialization followed by the original ordered migrations.

`lib/cloud` provides retrieval, provider configuration, encrypted secrets and
AI services. The compressed knowledge fixture contains original demo text.
`lib/step20`, `step20-1`, `step10` and `step21` contain demo question, translation
and slide catalog fixtures. Teachers can upload independently licensed course
material to their own instance. Uploaded files stay in the configured storage.

Authentication uses hashed passwords, server-side sessions and role checks.
Assessment APIs strip answer/rubric fields from student-facing questions.
Ownership and enrollment checks must be tested independently of UI visibility.
The local Compose deployment uses PostgreSQL 17, no external data volume and no
OSS credentials. Provider adapters remain optional and need operator credentials.

Avatar frontends and launcher integration code remain in source. Media and model
weights are separate assets and have separate license and hardware requirements.
