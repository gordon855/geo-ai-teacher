# 自定义3D教师模型（可选）

第11.1步不要求额外模型文件：留空 NEXT_PUBLIC_LOCAL_AVATAR_VRM_URL 时，网页直接使用内置蓝色西装3D女教师。

如果以后需要更精细的人物外观，可将你有合法使用权的 VRM 0.x/1.0 模型放在本目录，例如 teacher.vrm，并在 .env.local 中设置：

NEXT_PUBLIC_LOCAL_AVATAR_VRM_URL=/avatar/teacher.vrm

重新构建网站后，程序会优先加载该VRM。加载失败时会自动回退内置教师，不影响课程问答和语音功能。

