# 21.7 implementation scope

| Retained area | Source | Limits of this edition |
|---|---|---|
| Teacher/student authentication, role separation, roster and classes | lib/step8a, app/api/classroom | Fictional demo accounts; login/first change/role browser checks passed; full roster/multiclass UI trial pending |
| Classroom PPT upload, page interaction, translation and explanation | components/presentation, lib/step11-7, step21-5 | Upload your own licensed PPT; built-in catalog is demo text |
| Retrieval and context translation | lib/cloud, step19 | Small original fixture; generative services need provider keys |
| Practice, assignments, marking, history and review | lib/step20 through step21-7 | Demo content, not the original textbook exam bank |
| Attendance, classroom messages, anonymous feedback | lib/step21-3, step21-6 | Synthetic data; no production records included |
| Listening and professional language exercises | lib/step9, step10 | Original examples replace textbook extracts |
| Map/training and optional avatar integration | components/training, components/avatar, deploy | External map/provider availability and attribution require operator review |

21.7 PPT/avatar coordination, random questioning, transcript confirmation and
definition-question code are retained. Real GPU, RTC, microphone, autoplay and
voice-model behavior have not been accepted on hardware in this preparation.
See VERSION-MAPPING.md for requested 21.8 capabilities and verified boundaries.
The generic SVG images are placeholders, not a
realistic avatar or geographic imagery. Source presence is not a passed test.
