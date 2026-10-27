LiteAvatar 21.5 一键启动器（Windows + 既有 WSL Ubuntu）

1. 先把整个liteavatar215文件夹解压到固定位置。
2. 双击Setup.cmd，只需首次设置。选择原Ubuntu发行版和gordon用户，输入百炼Key。
3. 双击Start-Classroom.cmd：自动启动Ubuntu数字人和SSH隧道，打开教师网页。
4. 如需独立问答，先Stop.cmd，再Start-Public.cmd。
5. 下课后双击Stop.cmd；排错双击Logs.cmd。

原环境：~/OpenAvatarChat/.venv/bin/python
原隧道：~/OpenAvatarChat/start_teacher_tunnel.sh
课堂配置：config/local_liteavatar_classroom213.yaml
独立问答配置：config/local_liteavatar_public.yaml

Setup可注册网页按钮，并可选Windows登录后自启。
启动窗口可以最小化，请保持运行。电脑关机、休眠、断网时网页不能代替它运算。
未在实际Windows/GPU环境验证，请先按“操作说明.md”做一次完整验收再上课。
