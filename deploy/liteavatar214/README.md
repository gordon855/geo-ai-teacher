# 每次使用LiteAvatar：Ubuntu操作卡（21.4）

你的LiteAvatar在自己电脑的Ubuntu/WSL中计算，网站通过云服务器网关和SSH隧道连接它。电脑关机、休眠、网络断开后，需要检查或重新启动。只上传PPT、查看课件、学生签到不依赖本机数字人；使用LiteAvatar讲解时才需要本机运行。

## 第一次准备（只做一次）

1. 在Windows下载并解压`LiteAvatar-Classroom-21.4.zip`，得到`liteavatar214`文件夹。
2. 打开Ubuntu，运行：

```bash
cd ~
explorer.exe .
```

3. 将整个`liteavatar214`文件夹复制进弹出的Ubuntu主目录。最终路径为`/home/gordon/liteavatar214`，不是云服务器目录。
4. 若还未安装课堂扩展，先按Workbench手册“本机课堂扩展”章节安装。已经运行成功的21.3课堂扩展无需重复安装。

## 上课前：两个Ubuntu窗口

Windows开始菜单搜索“Ubuntu”即可打开；另外一个窗口可用Windows Terminal顶部下拉菜单再选Ubuntu。提示符应是`gordon@...`，不要在阿里云的`root@...`终端执行以下命令。

### 窗口A：启动数字人

先决定今天使用哪种模式。两种模式共用8282端口，只能运行一种。

| 用途 | 启动命令 |
|---|---|
| 网站教师端的随机点名、提问评价、PPT本页深度讲解 | `bash ~/liteavatar214/start-service.sh classroom` |
| 原先独立数字人网页，直接和人物自由对话 | `bash ~/liteavatar214/start-service.sh public` |

21.4课堂教学通常选择第一种：

```bash
bash ~/liteavatar214/start-service.sh classroom
```

如果提示输入百炼API Key，粘贴你的有效密钥后按回车。输入时不显示字符是正常的。不要把密钥截图或发给他人。本脚本仅设置当前进程环境，不把密钥写入新文件。

看到`Application startup complete`和`Uvicorn running on http://127.0.0.1:8282`后继续等待模型初始化完成，观察是否有红色ERROR。此窗口保持运行，不要Ctrl+C、Ctrl+Z或关闭窗口。

若脚本说“8282端口已有HTTP服务响应”，说明已有服务，不会再启动一份。如果已有的是独立问答模式而今天需要课堂模式，在原服务窗口Ctrl+C停止后，再执行课堂启动命令。已有HTTP响应不等于人物语音全部正常。

### 窗口B：启动SSH隧道

```bash
bash ~/liteavatar214/start-tunnel.sh
```

它调用你原来的`~/OpenAvatarChat/start_teacher_tunnel.sh`。没有报错、没有返回命令提示符，通常表示隧道正在保持连接。保留这个窗口。

若提示`remote port forwarding failed`，可能原隧道还在运行。先测试网页，不要删除锁、私钥或关闭主机验证。若提示Permission denied、Connection timed out等，请记录错误并排查。

## 浏览器：进入课堂

1. 同一浏览器先打开 https://localhost:8443/ui/teacher213.html ，用此前网关账号密码登录；不要在独立标签页点击连接，登录后关闭该标签页。
2. 打开 https://localhost/teacher ，登录教师账号。
3. 进入“课堂交互PPT”，选课件，点击“在讲授台展示”。翻到要讲授的一页。
4. 点击“AI教师深度讲解本页”。在全屏数字教师中选择“LiteAvatar · 本机服务”。
5. 在人物区域点击“连接课堂数字人”，等画面准备好。若首次打开时讲解已走默认语音，连接就绪后关闭该次讲解、重新发起本页讲解验证。
6. 允许网站使用麦克风；用一个简短问题测试声音、字幕与嘴型，再正式上课。

21.4沿用21.3扩展，因此`teacher213.html`和`local_liteavatar_classroom213.yaml`名称不变。课堂模式由网站发送文本；在原生独立对话网页直接说话可能没有回复，应从教师页面使用。

保持电脑联网、接电并关闭自动睡眠。当前配置单会话，不要手机和电脑同时占用；连接超过约一小时后可结束并重新连接。

## 下课后

1. 在网站结束数字人会话并关闭全屏，确认没有学生继续使用该数字人。
2. 在窗口A按`Ctrl+C`停止数字人服务，等返回命令提示符。
3. 在窗口B按`Ctrl+C`关闭本次隧道。
4. 可以关闭Ubuntu。云端网站、已上传PPT、签到与成绩仍保留。

若还要继续使用数字人，就不要关闭这两个窗口。无需每天重新下载模型、安装依赖、执行安装器或重新升级网站。

## 出现502时

在新的Ubuntu窗口执行：

```bash
bash ~/liteavatar214/check-local.sh
```

或无需脚本，直接执行：

```bash
curl --max-time 8 -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8282/
```

- `000`、Connection refused：本机数字人没有正常响应，检查窗口A。
- `200`、`302`、`307`：本机网页有响应；再检查窗口B。

仍有502时，在**云服务器Workbench**执行（此条不在Ubuntu执行）：

```bash
curl --max-time 10 -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:18282/
```

本机8282正常但云端18282无法连接，优先检查隧道；两边都正常而公网502，检查网关日志。发来错误前请遮住密钥、密码。

网页能打开但没有声音：观察本机日志。`apiKey is required`表示语音密钥缺失；`Arrearage`表示账号计费状态阻止调用。网页服务恢复并不代表语音合成已经通过。

## 不使用快捷脚本的原始命令

窗口A（课堂模式）：

```bash
cd ~/OpenAvatarChat
source .venv/bin/activate
read -rsp '请输入百炼API Key（输入不显示）：' DASHSCOPE_API_KEY
printf '\n'
export DASHSCOPE_API_KEY
python src/demo.py --config config/local_liteavatar_classroom213.yaml
```

独立问答模式只把最后一行换成：

```bash
python src/demo.py --config config/local_liteavatar_public.yaml
```

窗口B：

```bash
cd ~/OpenAvatarChat
bash ./start_teacher_tunnel.sh
```
